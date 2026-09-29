import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { tx } from "../db";
import { badRequest, conflict, HttpError, notFound, parse, requireUser } from "../http";
import { audit, getSite, listBranches, saveSite } from "../repo/org";
import { hashPassword } from "../security/password";
import { deleteUserSessions } from "../security/sessions";
import { branchSchema, resetPasswordSchema, siteSettingsSchema, userCreateSchema, userUpdateSchema, type Role } from "../../../shared/schemas";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  branch_id: string | null;
  active: boolean;
  locked: boolean;
  created_at: Date;
}

const toUser = (r: UserRow) => ({ id: r.id, email: r.email, name: r.name, role: r.role, branchId: r.branch_id, active: r.active, locked: r.locked, createdAt: r.created_at.toISOString() });
const USER_SELECT = "SELECT id, email, name, role, branch_id, active, (locked_until IS NOT NULL AND locked_until > now()) AS locked, created_at FROM users";

export async function adminSettingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser("admin"));

  app.get("/settings", async () => ({ site: await getSite(app.db), branches: await listBranches(app.db) }));

  app.put("/settings/site", async (req) => {
    const site = parse(siteSettingsSchema, req.body);
    await saveSite(app.db, site);
    await audit(app.db, { userId: req.session!.user.id, action: "settings.site", entity: "settings", entityId: "site", ip: req.ip });
    return site;
  });

  app.post("/branches", async (req, reply) => {
    const b = parse(branchSchema, req.body);
    const id = `b-${randomUUID().slice(0, 8)}`;
    await app.db.query("INSERT INTO branches (id, name, city, phone, address, monthly_target) VALUES ($1, $2, $3, $4, $5, $6)", [id, b.name, b.city, b.phone, b.address, b.monthlyTarget]);
    await audit(app.db, { userId: req.session!.user.id, action: "branch.create", entity: "branch", entityId: id, ip: req.ip });
    return reply.status(201).send({ id, ...b });
  });

  app.put<{ Params: { id: string } }>("/branches/:id", async (req) => {
    const b = parse(branchSchema, req.body);
    const r = await app.db.query("UPDATE branches SET name = $2, city = $3, phone = $4, address = $5, monthly_target = $6 WHERE id = $1", [req.params.id, b.name, b.city, b.phone, b.address, b.monthlyTarget]);
    if (!r.rowCount) throw notFound("Branch not found");
    await audit(app.db, { userId: req.session!.user.id, action: "branch.update", entity: "branch", entityId: req.params.id, details: b, ip: req.ip });
    return { id: req.params.id, ...b };
  });

  app.get("/users", async () => ({ items: (await app.db.query<UserRow>(`${USER_SELECT} ORDER BY active DESC, name`)).rows.map(toUser) }));

  app.post("/users", async (req, reply) => {
    const u = parse(userCreateSchema, req.body);
    if (u.branchId && !(await listBranches(app.db)).some((b) => b.id === u.branchId)) throw badRequest("Unknown branch.", { branchId: "Unknown branch" });
    const id = `u-${randomUUID()}`;
    try {
      await app.db.query("INSERT INTO users (id, email, name, role, branch_id, password_hash) VALUES ($1, $2, $3, $4, $5, $6)", [
        id,
        u.email,
        u.name,
        u.role,
        u.branchId,
        await hashPassword(u.password),
      ]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw conflict("A user with that email already exists.");
      throw e;
    }
    await audit(app.db, { userId: req.session!.user.id, action: "user.create", entity: "user", entityId: id, details: { email: u.email, role: u.role }, ip: req.ip });
    return reply.status(201).send(toUser((await app.db.query<UserRow>(`${USER_SELECT} WHERE id = $1`, [id])).rows[0]));
  });

  app.put<{ Params: { id: string } }>("/users/:id", async (req) => {
    const u = parse(userUpdateSchema, req.body);
    const me = req.session!.user;
    // An admin can't lock themselves out by demoting or disabling their own account.
    if (req.params.id === me.id && (u.role !== "admin" || !u.active)) throw new HttpError(400, "You can't remove your own admin access.", "validation");
    if (u.branchId && !(await listBranches(app.db)).some((b) => b.id === u.branchId)) throw badRequest("Unknown branch.", { branchId: "Unknown branch" });
    return tx(app.db, async (c) => {
      const r = await c.query("UPDATE users SET name = $2, role = $3, branch_id = $4, active = $5, updated_at = now() WHERE id = $1", [req.params.id, u.name, u.role, u.branchId, u.active]);
      if (!r.rowCount) throw notFound("User not found");
      const admins = await c.query<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active");
      if (admins.rows[0].n === 0) throw new HttpError(400, "There must be at least one active admin.", "validation");
      if (!u.active) await deleteUserSessions(c, req.params.id);
      await audit(c, { userId: me.id, action: "user.update", entity: "user", entityId: req.params.id, details: u, ip: req.ip });
      return toUser((await c.query<UserRow>(`${USER_SELECT} WHERE id = $1`, [req.params.id])).rows[0]);
    });
  });

  app.post<{ Params: { id: string } }>("/users/:id/password", async (req) => {
    const { password } = parse(resetPasswordSchema, req.body);
    const r = await app.db.query("UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $1", [req.params.id, await hashPassword(password)]);
    if (!r.rowCount) throw notFound("User not found");
    await deleteUserSessions(app.db, req.params.id);
    await audit(app.db, { userId: req.session!.user.id, action: "user.password_reset", entity: "user", entityId: req.params.id, ip: req.ip });
    return { ok: true };
  });
}
