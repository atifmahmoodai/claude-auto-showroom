import type { SiteSettings } from "../../shared/schemas";
import { DEFAULT_SITE } from "../../shared/site-defaults";
import type { Branch, Salesperson } from "./types";

/**
 * Business settings, branches and staff come from the server. They are loaded
 * once at start-up (main.tsx) and when an admin page opens, then read
 * synchronously everywhere, like the constants they replace.
 */
export const SITE: SiteSettings = structuredClone(DEFAULT_SITE);
export const BRANCHES: Branch[] = [];
export const SALESPEOPLE: Salesperson[] = [];

export function applySite(site: SiteSettings, branches: Branch[]) {
  Object.assign(SITE, site);
  BRANCHES.splice(0, BRANCHES.length, ...branches);
  document.title = `${site.name} · New & used cars`;
}

export function applyStaff(salespeople: Salesperson[]) {
  SALESPEOPLE.splice(0, SALESPEOPLE.length, ...salespeople);
}

/** Staff who can be picked for new work (people who left stay only for history). */
export const activeSalespeople = (branchId?: string) => SALESPEOPLE.filter((s) => s.active !== false && (!branchId || s.branchId === branchId));

export function branchName(id: string | undefined): string {
  return BRANCHES.find((b) => b.id === id)?.name ?? "—";
}

export function salespersonName(id: string | undefined): string {
  return SALESPEOPLE.find((s) => s.id === id)?.name ?? "Unassigned";
}
