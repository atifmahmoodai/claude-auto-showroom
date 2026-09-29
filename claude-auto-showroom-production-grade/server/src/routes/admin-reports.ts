import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { todayIn } from "../config";
import { notFound, parse, requireUser } from "../http";
import { listLeads } from "../repo/leads";
import { loadOrg } from "../repo/org";
import { allVehicles, toVehicle, type VehicleRow } from "../repo/vehicles";
import { computeDashboard, normaliseFilter } from "../../../shared/analytics";
import { addDays } from "../../../shared/dates";
import { buildPowerBiTables, toCsv } from "../../../shared/powerbi";
import { dashboardQuerySchema } from "../../../shared/schemas";

export async function adminReportRoutes(app: FastifyInstance) {
  // Revenue, cost and margin are for managers; sales staff don't see them.
  app.addHook("preHandler", requireUser("admin", "manager"));

  app.get("/dashboard", async (req) => {
    const q = parse(dashboardQuerySchema, req.query);
    const f = normaliseFilter({ from: q.from, to: q.to, branchId: q.branch });
    const today = todayIn(app.config.TIMEZONE);
    // Only what the period needs: current stock, cars sold in the period and the period's leads.
    const [vehicles, leads, org] = await Promise.all([
      app.db.query<VehicleRow>("SELECT * FROM vehicles WHERE status <> 'Sold' OR sold_date BETWEEN $1 AND $2", [f.from, f.to]),
      listLeads(app.db, { since: `${addDays(f.from, -1)}T00:00:00Z` }),
      loadOrg(app.db),
    ]);
    return computeDashboard({ vehicles: vehicles.rows.map(toVehicle), leads }, f, today, org);
  });

  async function tables() {
    const [vehicles, leads, org] = await Promise.all([allVehicles(app.db), listLeads(app.db, {}), loadOrg(app.db)]);
    return buildPowerBiTables({ vehicles, leads }, todayIn(app.config.TIMEZONE), org);
  }

  app.get("/export", async () => {
    return { tables: (await tables()).map((t) => ({ name: t.name, description: t.description, rows: t.rows.length })) };
  });

  app.get<{ Params: { file: string } }>("/export/:file", async (req, reply) => {
    const name = req.params.file.replace(/\.csv$/, "");
    const t = (await tables()).find((x) => x.name === name);
    if (!t) throw notFound("Unknown table");
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${t.name}.csv"`)
      .send(toCsv(t));
  });

  app.get("/audit", { preHandler: requireUser("admin") }, async (req) => {
    const { limit, entityId } = parse(z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), entityId: z.string().max(100).optional() }), req.query);
    const { rows } = await app.db.query(
      `SELECT a.id, a.at, a.action, a.entity, a.entity_id AS "entityId", a.details, a.ip, u.name AS "userName"
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        WHERE ($2::text IS NULL OR a.entity_id = $2)
        ORDER BY a.at DESC, a.id DESC LIMIT $1`,
      [limit, entityId ?? null],
    );
    return { items: rows };
  });
}
