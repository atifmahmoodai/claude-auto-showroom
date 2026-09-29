import type { Queryable } from "../db";
import type { Lead, LeadStage, StageEvent } from "../../../shared/types";

interface LeadRow {
  id: string;
  created_at: Date;
  name: string;
  phone: string;
  email: string;
  message: string;
  type: string;
  source: string;
  stage: string;
  branch_id: string;
  vehicle_id: string | null;
  salesperson_id: string | null;
  first_response_minutes: number | null;
  preferred_date: string | null;
  history: { stage: string; at: string }[] | null;
}

const SELECT = `
  SELECT l.*, (SELECT json_agg(json_build_object('stage', e.stage, 'at', e.at) ORDER BY e.at, e.id)
                 FROM lead_stage_events e WHERE e.lead_id = l.id) AS history
    FROM leads l`;

function toLead(r: LeadRow): Lead {
  return {
    id: r.id,
    createdAt: r.created_at.toISOString(),
    name: r.name,
    phone: r.phone,
    email: r.email,
    message: r.message,
    type: r.type as Lead["type"],
    source: r.source as Lead["source"],
    stage: r.stage as LeadStage,
    // json_build_object renders timestamps without the Z; normalise to ISO.
    stageHistory: (r.history ?? []).map((e) => ({ stage: e.stage as LeadStage, at: new Date(e.at).toISOString() }) satisfies StageEvent),
    branchId: r.branch_id,
    vehicleId: r.vehicle_id ?? undefined,
    salespersonId: r.salesperson_id ?? undefined,
    firstResponseMinutes: r.first_response_minutes ?? undefined,
    preferredDate: r.preferred_date ?? undefined,
  };
}

export interface LeadFilter {
  /** Only leads created on/after this ISO time. */
  since?: string;
  branchId?: string;
  source?: string;
  q?: string;
  /** Always include open leads, however old (they still need work). */
  includeOpen?: boolean;
}

export async function listLeads(db: Queryable, f: LeadFilter): Promise<Lead[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  const arg = (v: unknown) => {
    args.push(v);
    return `$${args.length}`;
  };
  if (f.since) where.push(f.includeOpen ? `(l.created_at >= ${arg(f.since)} OR l.stage NOT IN ('Won', 'Lost'))` : `l.created_at >= ${arg(f.since)}`);
  if (f.branchId && f.branchId !== "all") where.push(`l.branch_id = ${arg(f.branchId)}`);
  if (f.source && f.source !== "all") where.push(`l.source = ${arg(f.source)}`);
  for (const t of (f.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)) {
    where.push(
      `strpos(lower(l.name || ' ' || l.email || ' ' || l.phone || ' ' ||
         COALESCE((SELECT v.year || ' ' || v.make || ' ' || v.model || ' ' || v.stock_no FROM vehicles v WHERE v.id = l.vehicle_id), '')), ${arg(t)}) > 0`,
    );
  }
  const { rows } = await db.query<LeadRow>(`${SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY l.created_at DESC LIMIT 5000`, args);
  return rows.map(toLead);
}

export async function getLead(db: Queryable, id: string): Promise<Lead | null> {
  const { rows } = await db.query<LeadRow>(`${SELECT} WHERE l.id = $1`, [id]);
  return rows[0] ? toLead(rows[0]) : null;
}

export async function insertLead(
  db: Queryable,
  l: Omit<Lead, "stageHistory" | "createdAt" | "stage" | "firstResponseMinutes"> & { createdAt?: string },
  userId: string | null,
): Promise<Lead> {
  await db.query(
    `INSERT INTO leads (id, created_at, name, phone, email, message, type, source, stage, branch_id, vehicle_id, salesperson_id, preferred_date)
     VALUES ($1, COALESCE($2::timestamptz, now()), $3, $4, $5, $6, $7, $8, 'New', $9, $10, $11, $12)`,
    [l.id, l.createdAt ?? null, l.name, l.phone, l.email, l.message, l.type, l.source, l.branchId, l.vehicleId ?? null, l.salespersonId ?? null, l.preferredDate ?? null],
  );
  await db.query("INSERT INTO lead_stage_events (lead_id, stage, at, user_id) SELECT id, 'New', created_at, $2 FROM leads WHERE id = $1", [l.id, userId]);
  return (await getLead(db, l.id))!;
}

/**
 * Moves a lead to a stage. The first move away from "New" records the response time.
 * Row lock prevents two staff members' moves interleaving.
 */
export async function moveLead(db: Queryable, id: string, stage: LeadStage, userId: string): Promise<Lead | null> {
  const { rows } = await db.query<{ stage: string }>("SELECT stage FROM leads WHERE id = $1 FOR UPDATE", [id]);
  if (!rows[0]) return null;
  if (rows[0].stage !== stage) {
    await db.query(
      `UPDATE leads SET stage = $2,
         first_response_minutes = COALESCE(first_response_minutes,
           CASE WHEN $2 <> 'New' THEN GREATEST(0, round(extract(epoch FROM now() - created_at) / 60))::int END)
       WHERE id = $1`,
      [id, stage],
    );
    await db.query("INSERT INTO lead_stage_events (lead_id, stage, user_id) VALUES ($1, $2, $3)", [id, stage, userId]);
  }
  return getLead(db, id);
}

export async function assignLead(db: Queryable, id: string, salespersonId: string | null): Promise<Lead | null> {
  const r = await db.query("UPDATE leads SET salesperson_id = $2 WHERE id = $1", [id, salespersonId]);
  return r.rowCount ? getLead(db, id) : null;
}

export async function countNewLeads(db: Queryable): Promise<number> {
  return (await db.query<{ n: number }>("SELECT count(*)::int AS n FROM leads WHERE stage = 'New'")).rows[0].n;
}

export interface VehicleLabel {
  id: string;
  year: number;
  make: string;
  model: string;
  status: string;
}

export async function vehicleLabels(db: Queryable, ids: string[]): Promise<Record<string, VehicleLabel>> {
  if (!ids.length) return {};
  const { rows } = await db.query<VehicleLabel>("SELECT id, year, make, model, status FROM vehicles WHERE id = ANY($1)", [[...new Set(ids)]]);
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}
