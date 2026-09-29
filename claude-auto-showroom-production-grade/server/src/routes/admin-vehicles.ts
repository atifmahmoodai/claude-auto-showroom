import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { todayIn } from "../config";
import { tx, type Queryable } from "../db";
import { badRequest, conflict, HttpError, notFound, parse, requireUser } from "../http";
import { countNewLeads } from "../repo/leads";
import { audit, getSite, listBranches, listSalespeople } from "../repo/org";
import { getVehicle, insertVehicle, listVehicles, nextStockNo, redactCost, setStatus, updateVehicle } from "../repo/vehicles";
import { reserveSchema, saleSchema, vehicleSchema, type VehicleInput } from "../../../shared/schemas";
import type { Vehicle } from "../../../shared/types";

const listSchema = z.object({
  status: z.enum(["stock", "Available", "Reserved", "Sold", "all"]).default("stock"),
  branch: z.string().max(64).default("all"),
  q: z.string().max(200).default(""),
});
const updateSchema = z.object({ version: z.number().int().min(1) });

export async function adminVehicleRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser());
  const managers = requireUser("admin", "manager");
  const today = () => todayIn(app.config.TIMEZONE);
  const view = (req: FastifyRequest, v: Vehicle) => (req.session!.user.role === "sales" ? redactCost(v) : v);

  /** Everything the admin shell needs once: settings, branches, staff and badge counts. */
  app.get("/meta", async (req) => {
    const [site, branches, salespeople, newLeads, stock] = await Promise.all([
      getSite(app.db),
      listBranches(app.db),
      listSalespeople(app.db),
      countNewLeads(app.db),
      app.db.query<{ n: number }>("SELECT count(*)::int AS n FROM vehicles WHERE status <> 'Sold'"),
    ]);
    return { user: req.session!.user, site, branches, salespeople, counts: { newLeads, inStock: stock.rows[0].n }, today: today() };
  });

  app.get("/vehicles", async (req) => {
    const f = parse(listSchema, req.query);
    const items = await listVehicles(app.db, { status: f.status, branchId: f.branch, q: f.q });
    return { items: items.map((v) => view(req, v)) };
  });

  app.get<{ Params: { id: string } }>("/vehicles/:id", async (req) => {
    const v = await getVehicle(app.db, req.params.id);
    if (!v) throw notFound("Vehicle not found");
    return view(req, v);
  });

  async function checkBusinessRules(db: Queryable, v: VehicleInput) {
    const t = today();
    const errors: Record<string, string> = {};
    const maxYear = Number(t.slice(0, 4)) + 1;
    if (v.year > maxYear) errors.year = `1950–${maxYear}`;
    if (v.acquiredDate > t) errors.acquiredDate = "Can't be in the future";
    if (v.status === "Sold" && v.soldDate && v.soldDate > t) errors.soldDate = "Can't be in the future";
    if (v.status === "Sold" && v.salespersonId) {
      const staff = await listSalespeople(db);
      if (!staff.some((s) => s.id === v.salespersonId)) errors.salespersonId = "Unknown salesperson";
    }
    if (!(await listBranches(db)).some((b) => b.id === v.branchId)) errors.branchId = "Unknown branch";
    if (Object.keys(errors).length) throw badRequest("Please check the highlighted fields.", errors);
  }

  app.post("/vehicles", { preHandler: managers }, async (req, reply) => {
    const input = parse(vehicleSchema, req.body);
    await checkBusinessRules(app.db, input);
    const v = await tx(app.db, async (c) => {
      // Serialises stock-number allocation between concurrent creates.
      await c.query("SELECT pg_advisory_xact_lock(727275)");
      const created = await insertVehicle(c, `v-${randomUUID()}`, await nextStockNo(c), input);
      await audit(c, { userId: req.session!.user.id, action: "vehicle.create", entity: "vehicle", entityId: created.id, details: { stockNo: created.stockNo }, ip: req.ip });
      return created;
    });
    return reply.status(201).send(v);
  });

  app.put<{ Params: { id: string } }>("/vehicles/:id", { preHandler: managers }, async (req) => {
    const { version } = parse(updateSchema, req.body);
    const input = parse(vehicleSchema, req.body);
    await checkBusinessRules(app.db, input);
    return tx(app.db, async (c) => {
      const before = await getVehicle(c, req.params.id);
      if (!before) throw notFound("Vehicle not found");
      // Undoing a sale rewrites reported revenue, so only an admin may do it (e.g. a deal that fell through).
      if (before.status === "Sold" && input.status !== "Sold" && req.session!.user.role !== "admin") {
        throw new HttpError(403, "Only an admin can reverse a recorded sale.", "forbidden");
      }
      const after = await updateVehicle(c, req.params.id, version, input);
      if (!after) throw conflict("Someone else changed this car since you opened it. Reload to see their changes, then edit again.");
      await audit(c, { userId: req.session!.user.id, action: "vehicle.update", entity: "vehicle", entityId: after.id, details: diff(before, after), ip: req.ip });
      return after;
    });
  });

  app.post<{ Params: { id: string } }>("/vehicles/:id/sell", async (req) => {
    const sale = parse(saleSchema, req.body);
    return tx(app.db, async (c) => {
      const v = await getVehicle(c, req.params.id);
      if (!v) throw notFound("Vehicle not found");
      if (v.status === "Sold") throw conflict("This car is already sold.");
      if (sale.soldDate < v.acquiredDate) throw badRequest("Sale date can't be before the car was acquired.", { soldDate: "Before the acquired date" });
      if (sale.soldDate > today()) throw badRequest("Sale date can't be in the future.", { soldDate: "Can't be in the future" });
      const staff = await listSalespeople(c);
      if (!staff.some((s) => s.id === sale.salespersonId && s.active)) throw badRequest("Choose a current salesperson.", { salespersonId: "Unknown salesperson" });
      const after = await setStatus(c, v.id, ["Available", "Reserved"], {
        status: "Sold",
        sold_date: sale.soldDate,
        sale_price: sale.salePrice,
        salesperson_id: sale.salespersonId,
        featured: false,
      });
      if (!after) throw conflict("This car was sold by someone else a moment ago.");
      await audit(c, { userId: req.session!.user.id, action: "vehicle.sell", entity: "vehicle", entityId: v.id, details: { ...sale }, ip: req.ip });
      return view(req, after);
    });
  });

  app.post<{ Params: { id: string } }>("/vehicles/:id/reserve", async (req) => {
    const { reserved } = parse(reserveSchema, req.body);
    const after = await setStatus(app.db, req.params.id, [reserved ? "Available" : "Reserved"], { status: reserved ? "Reserved" : "Available" });
    if (!after) {
      if (!(await getVehicle(app.db, req.params.id))) throw notFound("Vehicle not found");
      throw conflict(reserved ? "Only available cars can be reserved." : "This car isn't reserved.");
    }
    await audit(app.db, { userId: req.session!.user.id, action: reserved ? "vehicle.reserve" : "vehicle.unreserve", entity: "vehicle", entityId: after.id, ip: req.ip });
    return view(req, after);
  });

  app.delete<{ Params: { id: string } }>("/vehicles/:id", { preHandler: managers }, async (req) => {
    return tx(app.db, async (c) => {
      const v = await getVehicle(c, req.params.id);
      if (!v) throw notFound("Vehicle not found");
      // Sold cars are the sales history (dashboard, Power BI); they can't be deleted.
      if (v.status === "Sold") throw conflict("Sold cars are part of your sales history and can't be deleted.");
      await c.query("DELETE FROM vehicles WHERE id = $1 AND status <> 'Sold'", [v.id]);
      await audit(c, { userId: req.session!.user.id, action: "vehicle.delete", entity: "vehicle", entityId: v.id, details: { stockNo: v.stockNo, make: v.make, model: v.model }, ip: req.ip });
      return { ok: true };
    });
  });

  /** Photo upload. The file type is checked from its bytes, not its name, and the name is ours. */
  app.post("/uploads", { preHandler: managers, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const file = await req.file();
    if (!file) throw badRequest("Choose a photo to upload.");
    const head: Buffer[] = [];
    let headLen = 0;
    const ext = await new Promise<string | null>((resolveExt, reject) => {
      const onData = (chunk: Buffer) => {
        head.push(chunk);
        headLen += chunk.length;
        if (headLen >= 12) {
          file.file.pause();
          file.file.off("data", onData);
          resolveExt(sniffImage(Buffer.concat(head)));
        }
      };
      file.file.on("data", onData);
      file.file.once("end", () => resolveExt(sniffImage(Buffer.concat(head))));
      file.file.once("error", reject);
    });
    if (!ext) {
      file.file.resume();
      throw badRequest("Only JPEG, PNG or WebP photos can be uploaded.");
    }
    const name = `${randomUUID()}.${ext}`;
    const dest = join(resolve(app.config.UPLOAD_DIR), name);
    const out = createWriteStream(dest, { flags: "wx" });
    out.write(Buffer.concat(head));
    try {
      await pipeline(file.file, out);
    } catch (e) {
      await unlink(dest).catch(() => {});
      throw e;
    }
    if (file.file.truncated) {
      await unlink(dest).catch(() => {});
      throw new HttpError(413, `Photos can be at most ${app.config.UPLOAD_MAX_MB} MB.`, "too_large");
    }
    await audit(app.db, { userId: req.session!.user.id, action: "upload.create", entity: "upload", entityId: name, ip: req.ip });
    return reply.status(201).send({ url: `/uploads/${name}` });
  });
}

export function sniffImage(b: Buffer): "jpg" | "png" | "webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function diff(a: Vehicle, b: Vehicle): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(b) as (keyof Vehicle)[]) {
    if (k === "version") continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out[k] = { from: a[k] ?? null, to: b[k] ?? null };
  }
  return out;
}
