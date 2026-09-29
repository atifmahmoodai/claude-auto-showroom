import type { PoolClient } from "pg";
import { hashPassword } from "./security/password";
import { DEFAULT_SITE } from "../../shared/schemas";
import { DEMO_ORG } from "../../shared/demo-org";
import { generateDemoData } from "../../shared/generate";

export const DEMO_ADMIN_EMAIL = "admin@demo.local";
export const DEMO_MANAGER_EMAIL = "manager@demo.local";

/** Demo login for a salesperson: "maya@demo.local" for Maya Chen. */
export const demoEmail = (name: string) => `${name.split(" ")[0].toLowerCase()}@demo.local`;

export async function seedDemo(c: PoolClient, opts: { today: string; force: boolean; password: string }) {
  const existing = (await c.query<{ n: number }>("SELECT count(*)::int AS n FROM vehicles")).rows[0].n;
  if (existing && !opts.force) throw new Error(`The database already has ${existing} vehicles. Re-run with --force to replace them with demo data.`);
  if (opts.force) {
    await c.query("DELETE FROM leads");
    await c.query("DELETE FROM vehicles");
  }

  for (const b of DEMO_ORG.branches) {
    await c.query(
      `INSERT INTO branches (id, name, city, phone, address, monthly_target) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, monthly_target = EXCLUDED.monthly_target`,
      [b.id, b.name, b.city, b.phone, b.address, b.monthlyTarget],
    );
  }
  const hash = await hashPassword(opts.password);
  const staff = [
    { id: "u-demo-admin", email: DEMO_ADMIN_EMAIL, name: "Demo Admin", role: "admin", branchId: null },
    { id: "u-demo-manager", email: DEMO_MANAGER_EMAIL, name: "Demo Manager", role: "manager", branchId: null },
    ...DEMO_ORG.salespeople.map((s) => ({ id: s.id, email: demoEmail(s.name), name: s.name, role: "sales", branchId: s.branchId })),
  ];
  for (const u of staff) {
    await c.query(
      `INSERT INTO users (id, email, name, role, branch_id, password_hash) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role, branch_id = EXCLUDED.branch_id,
         password_hash = EXCLUDED.password_hash, active = true, failed_logins = 0, locked_until = NULL`,
      [u.id, u.email, u.name, u.role, u.branchId, hash],
    );
  }
  await c.query("INSERT INTO settings (key, value) VALUES ('site', $1) ON CONFLICT (key) DO NOTHING", [JSON.stringify(DEFAULT_SITE)]);

  const data = generateDemoData(opts.today, 20260928, DEMO_ORG);
  // json_populate_recordset turns one JSON array into rows: a single round trip for hundreds of cars.
  const vehicles = data.vehicles.map((v) => ({
    id: v.id,
    stock_no: v.stockNo,
    vin: v.vin,
    make: v.make,
    model: v.model,
    trim: v.trim,
    year: v.year,
    body_type: v.bodyType,
    fuel: v.fuel,
    transmission: v.transmission,
    condition: v.condition,
    mileage: v.mileage,
    color: v.color,
    color_hex: v.colorHex,
    engine: v.engine,
    seats: v.seats,
    price: v.price,
    cost: v.cost,
    branch_id: v.branchId,
    status: v.status,
    acquired_date: v.acquiredDate,
    sold_date: v.soldDate ?? null,
    sale_price: v.salePrice ?? null,
    salesperson_id: v.salespersonId ?? null,
    features: v.features,
    description: v.description,
    featured: v.featured,
    image_url: v.imageUrl ?? "",
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  await c.query("INSERT INTO vehicles SELECT * FROM json_populate_recordset(NULL::vehicles, $1)", [JSON.stringify(vehicles)]);

  const leads = data.leads.map((l) => ({
    id: l.id,
    created_at: l.createdAt,
    name: l.name,
    phone: l.phone,
    email: l.email,
    message: l.message,
    type: l.type,
    source: l.source,
    stage: l.stage,
    branch_id: l.branchId,
    vehicle_id: l.vehicleId ?? null,
    salesperson_id: l.salespersonId ?? null,
    first_response_minutes: l.firstResponseMinutes ?? null,
    preferred_date: l.preferredDate ?? null,
  }));
  await c.query("INSERT INTO leads SELECT * FROM json_populate_recordset(NULL::leads, $1)", [JSON.stringify(leads)]);
  const events = data.leads.flatMap((l) => l.stageHistory.map((e) => ({ lead_id: l.id, stage: e.stage, at: e.at })));
  await c.query("INSERT INTO lead_stage_events (lead_id, stage, at) SELECT lead_id, stage, at FROM json_populate_recordset(NULL::lead_stage_events, $1)", [JSON.stringify(events)]);

  return { branches: DEMO_ORG.branches.length, staff: staff.length, vehicles: vehicles.length, leads: leads.length, stageEvents: events.length, logins: staff.map((s) => s.email) };
}
