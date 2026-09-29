import type { Queryable } from "../db";
import type { InventoryQuery } from "../../../shared/inventory";
import type { PublicVehicle, VehicleInput } from "../../../shared/schemas";
import type { Vehicle } from "../../../shared/types";

export interface VehicleRow {
  id: string;
  stock_no: string;
  vin: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  body_type: string;
  fuel: string;
  transmission: string;
  condition: string;
  mileage: number;
  color: string;
  color_hex: string;
  engine: string;
  seats: number;
  price: number;
  cost: number;
  branch_id: string;
  status: string;
  acquired_date: string;
  sold_date: string | null;
  sale_price: number | null;
  salesperson_id: string | null;
  features: string[];
  description: string;
  featured: boolean;
  image_url: string;
  version: number;
}

export function toVehicle(r: VehicleRow): Vehicle {
  return {
    id: r.id,
    stockNo: r.stock_no,
    vin: r.vin,
    make: r.make,
    model: r.model,
    trim: r.trim,
    year: r.year,
    bodyType: r.body_type as Vehicle["bodyType"],
    fuel: r.fuel as Vehicle["fuel"],
    transmission: r.transmission as Vehicle["transmission"],
    condition: r.condition as Vehicle["condition"],
    mileage: r.mileage,
    color: r.color,
    colorHex: r.color_hex,
    engine: r.engine,
    seats: r.seats,
    price: r.price,
    cost: r.cost,
    branchId: r.branch_id,
    status: r.status as Vehicle["status"],
    acquiredDate: r.acquired_date,
    soldDate: r.sold_date ?? undefined,
    salePrice: r.sale_price ?? undefined,
    salespersonId: r.salesperson_id ?? undefined,
    features: r.features,
    description: r.description,
    featured: r.featured,
    imageUrl: r.image_url || undefined,
    version: r.version,
  };
}

export function toPublic(v: Vehicle): PublicVehicle {
  const { cost: _c, salePrice: _s, salespersonId: _p, soldDate: _d, version: _v, ...pub } = v;
  return pub;
}

/** Sales staff don't see acquisition cost (and so can't work out the margin). */
export function redactCost(v: Vehicle): Vehicle {
  return { ...v, cost: 0 };
}

const SORTS: Record<InventoryQuery["sort"], string> = {
  featured: "featured DESC, (status = 'Reserved') ASC, acquired_date DESC, id",
  newest: "acquired_date DESC, id",
  "price-asc": "price ASC, id",
  "price-desc": "price DESC, id",
  "year-desc": "year DESC, mileage ASC, id",
  "mileage-asc": "mileage ASC, id",
};

/** Same rules as shared/inventory.ts filterInventory, done in SQL (a test checks they agree). */
export async function searchPublic(db: Queryable, q: InventoryQuery, limit: number, offset: number) {
  const where = ["status <> 'Sold'"];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replace("?", `$${args.length}`));
  };
  if (q.make) add("make = ?", q.make);
  if (q.bodyType) add("body_type = ?", q.bodyType);
  if (q.fuel) add("fuel = ?", q.fuel);
  if (q.transmission) add("transmission = ?", q.transmission);
  if (q.condition) add("condition = ?", q.condition);
  if (q.branchId) add("branch_id = ?", q.branchId);
  if (q.minPrice !== null) add("price >= ?", q.minPrice);
  if (q.maxPrice !== null) add("price <= ?", q.maxPrice);
  if (q.minYear !== null) add("year >= ?", q.minYear);
  if (q.maxMileage !== null) add("mileage <= ?", q.maxMileage);
  for (const token of q.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)) {
    // strpos, not LIKE, so % and _ typed by a visitor are matched literally.
    add("strpos(lower(year || ' ' || make || ' ' || model || ' ' || trim || ' ' || body_type || ' ' || fuel || ' ' || color || ' ' || stock_no), ?) > 0", token);
  }
  const whereSql = where.join(" AND ");
  const total = (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM vehicles WHERE ${whereSql}`, args)).rows[0].n;
  const { rows } = await db.query<VehicleRow>(
    `SELECT * FROM vehicles WHERE ${whereSql} ORDER BY ${SORTS[q.sort]} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
    args,
  );
  return { total, items: rows.map((r) => toPublic(toVehicle(r))) };
}

export async function publicSummary(db: Queryable) {
  const { rows } = await db.query<{ make: string; year: number; body_type: string; price: number }>(
    "SELECT make, year, body_type, price FROM vehicles WHERE status <> 'Sold'",
  );
  const featured = await db.query<VehicleRow>(`SELECT * FROM vehicles WHERE status = 'Available' ORDER BY ${SORTS.featured} LIMIT 6`);
  const bodyCounts: Record<string, number> = {};
  for (const r of rows) bodyCounts[r.body_type] = (bodyCounts[r.body_type] ?? 0) + 1;
  return {
    stockCount: rows.length,
    makes: [...new Set(rows.map((r) => r.make))].sort(),
    years: [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a),
    lowestPrice: rows.length ? Math.min(...rows.map((r) => r.price)) : 0,
    bodyCounts,
    featured: featured.rows.map((r) => toPublic(toVehicle(r))),
  };
}

export async function getVehicle(db: Queryable, id: string): Promise<Vehicle | null> {
  const { rows } = await db.query<VehicleRow>("SELECT * FROM vehicles WHERE id = $1", [id]);
  return rows[0] ? toVehicle(rows[0]) : null;
}

export async function similarVehicles(db: Queryable, v: Vehicle): Promise<PublicVehicle[]> {
  const { rows } = await db.query<VehicleRow>(
    `SELECT * FROM vehicles WHERE id <> $1 AND status <> 'Sold' AND (body_type = $2 OR make = $3)
     ORDER BY abs(price - $4), id LIMIT 3`,
    [v.id, v.bodyType, v.make, v.price],
  );
  return rows.map((r) => toPublic(toVehicle(r)));
}

export interface AdminVehicleFilter {
  status: "stock" | "Available" | "Reserved" | "Sold" | "all";
  branchId: string;
  q: string;
}

export async function listVehicles(db: Queryable, f: AdminVehicleFilter): Promise<Vehicle[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.status === "stock") where.push("status <> 'Sold'");
  else if (f.status !== "all") {
    args.push(f.status);
    where.push(`status = $${args.length}`);
  }
  if (f.branchId && f.branchId !== "all") {
    args.push(f.branchId);
    where.push(`branch_id = $${args.length}`);
  }
  for (const token of f.q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8)) {
    args.push(token);
    where.push(`strpos(lower(year || ' ' || make || ' ' || model || ' ' || trim || ' ' || stock_no || ' ' || vin), $${args.length}) > 0`);
  }
  const { rows } = await db.query<VehicleRow>(
    `SELECT * FROM vehicles ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY (status = 'Sold'), COALESCE(sold_date, acquired_date) DESC, id LIMIT 2000`,
    args,
  );
  return rows.map(toVehicle);
}

export async function nextStockNo(db: Queryable): Promise<string> {
  const { rows } = await db.query<{ n: number | null }>(
    "SELECT max(NULLIF(regexp_replace(stock_no, '\\D', '', 'g'), '')::int) AS n FROM vehicles",
  );
  return `AX${Math.max(rows[0].n ?? 1000, 1000) + 1}`;
}

const COLUMNS = [
  "vin", "make", "model", "trim", "year", "body_type", "fuel", "transmission", "condition", "mileage", "color", "color_hex",
  "engine", "seats", "price", "cost", "branch_id", "status", "acquired_date", "sold_date", "sale_price", "salesperson_id",
  "features", "description", "featured", "image_url",
] as const;

function values(v: VehicleInput): unknown[] {
  const sold = v.status === "Sold";
  return [
    v.vin, v.make, v.model, v.trim, v.year, v.bodyType, v.fuel, v.transmission, v.condition, v.mileage, v.color, v.colorHex,
    v.engine, v.seats, v.price, v.cost, v.branchId, v.status, v.acquiredDate,
    sold ? v.soldDate : null, sold ? v.salePrice : null, sold ? v.salespersonId : null,
    v.features, v.description, sold ? false : v.featured, v.imageUrl,
  ];
}

export async function insertVehicle(db: Queryable, id: string, stockNo: string, v: VehicleInput): Promise<Vehicle> {
  const cols = ["id", "stock_no", ...COLUMNS];
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await db.query<VehicleRow>(`INSERT INTO vehicles (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`, [id, stockNo, ...values(v)]);
  return toVehicle(rows[0]);
}

/** Optimistic locking: returns null when someone else saved the car since `version` was read. */
export async function updateVehicle(db: Queryable, id: string, version: number, v: VehicleInput): Promise<Vehicle | null> {
  const sets = COLUMNS.map((c, i) => `${c} = $${i + 3}`).join(", ");
  const { rows } = await db.query<VehicleRow>(
    `UPDATE vehicles SET ${sets}, version = version + 1, updated_at = now() WHERE id = $1 AND version = $2 RETURNING *`,
    [id, version, ...values(v)],
  );
  return rows[0] ? toVehicle(rows[0]) : null;
}

export async function setStatus(db: Queryable, id: string, from: string[], patch: Partial<Record<"status" | "sold_date" | "sale_price" | "salesperson_id" | "featured", unknown>>) {
  const keys = Object.keys(patch);
  const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(", ");
  const { rows } = await db.query<VehicleRow>(
    `UPDATE vehicles SET ${sets}, version = version + 1, updated_at = now() WHERE id = $1 AND status = ANY($2) RETURNING *`,
    [id, from, ...keys.map((k) => patch[k as keyof typeof patch])],
  );
  return rows[0] ? toVehicle(rows[0]) : null;
}

export async function allVehicles(db: Queryable): Promise<Vehicle[]> {
  return (await db.query<VehicleRow>("SELECT * FROM vehicles ORDER BY id")).rows.map(toVehicle);
}
