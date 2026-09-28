import type { Branch, Salesperson } from "./types";

/**
 * Business settings. Change these to rebrand the showroom for a client
 * (e.g. currency "PKR" with locale "en-PK", or "AED" with "en-AE").
 */
export const SITE = {
  name: "Apex Auto",
  tagline: "Quality new & used cars, honest prices.",
  email: "sales@apexauto.example",
  currency: "USD",
  locale: "en-US",
  /** Defaults for the finance calculator. */
  finance: { aprPercent: 7.9, termMonths: 60, depositPercent: 20 },
};

export const BRANCHES: Branch[] = [
  {
    id: "b-downtown",
    name: "Downtown",
    city: "Springfield",
    phone: "+1 (555) 010-2000",
    address: "120 Main Street, Springfield",
    monthlyTarget: 11,
  },
  {
    id: "b-northside",
    name: "Northside",
    city: "Springfield",
    phone: "+1 (555) 010-3000",
    address: "48 Ridge Road, Springfield",
    monthlyTarget: 8,
  },
];

export const SALESPEOPLE: Salesperson[] = [
  { id: "s-maya", name: "Maya Chen", branchId: "b-downtown" },
  { id: "s-omar", name: "Omar Haddad", branchId: "b-downtown" },
  { id: "s-lucas", name: "Lucas Rivera", branchId: "b-downtown" },
  { id: "s-sara", name: "Sara Ahmed", branchId: "b-northside" },
  { id: "s-james", name: "James Okafor", branchId: "b-northside" },
];

export function branchName(id: string | undefined): string {
  return BRANCHES.find((b) => b.id === id)?.name ?? "—";
}

export function salespersonName(id: string | undefined): string {
  return SALESPEOPLE.find((s) => s.id === id)?.name ?? "Unassigned";
}
