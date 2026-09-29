import type { Queryable } from "../db";
import { DEFAULT_SITE, siteSettingsSchema, type SiteSettings } from "../../../shared/schemas";
import type { Branch, Org, Salesperson } from "../../../shared/types";

interface BranchRow {
  id: string;
  name: string;
  city: string;
  phone: string;
  address: string;
  monthly_target: number;
}

const toBranch = (r: BranchRow): Branch => ({ id: r.id, name: r.name, city: r.city, phone: r.phone, address: r.address, monthlyTarget: r.monthly_target });

export async function listBranches(db: Queryable): Promise<Branch[]> {
  return (await db.query<BranchRow>("SELECT * FROM branches ORDER BY created_at, id")).rows.map(toBranch);
}

/** Everyone attached to a branch can be credited with a sale (inactive staff kept for history). */
export async function listSalespeople(db: Queryable): Promise<Salesperson[]> {
  const { rows } = await db.query<{ id: string; name: string; branch_id: string; active: boolean }>(
    "SELECT id, name, branch_id, active FROM users WHERE branch_id IS NOT NULL ORDER BY name",
  );
  return rows.map((r) => ({ id: r.id, name: r.name, branchId: r.branch_id, active: r.active }));
}

export async function loadOrg(db: Queryable): Promise<Org> {
  const [branches, salespeople] = await Promise.all([listBranches(db), listSalespeople(db)]);
  return { branches, salespeople };
}

export async function getSite(db: Queryable): Promise<SiteSettings> {
  const { rows } = await db.query<{ value: unknown }>("SELECT value FROM settings WHERE key = 'site'");
  const parsed = siteSettingsSchema.safeParse(rows[0]?.value);
  return parsed.success ? parsed.data : DEFAULT_SITE;
}

export async function saveSite(db: Queryable, s: SiteSettings) {
  await db.query(
    "INSERT INTO settings (key, value) VALUES ('site', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [JSON.stringify(s)],
  );
}

export async function audit(
  db: Queryable,
  e: { userId: string | null; action: string; entity: string; entityId?: string | null; details?: Record<string, unknown>; ip?: string },
) {
  await db.query("INSERT INTO audit_log (user_id, action, entity, entity_id, details, ip) VALUES ($1, $2, $3, $4, $5, $6)", [
    e.userId,
    e.action,
    e.entity,
    e.entityId ?? null,
    JSON.stringify(e.details ?? {}),
    e.ip ?? null,
  ]);
}
