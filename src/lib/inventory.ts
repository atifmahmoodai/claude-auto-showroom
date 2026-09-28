import type { Vehicle } from "../types";

export type SortKey = "featured" | "price-asc" | "price-desc" | "year-desc" | "mileage-asc" | "newest";

export interface InventoryQuery {
  q: string;
  make: string;
  bodyType: string;
  fuel: string;
  transmission: string;
  condition: string;
  branchId: string;
  minPrice: number | null;
  maxPrice: number | null;
  minYear: number | null;
  maxMileage: number | null;
  sort: SortKey;
}

export const EMPTY_QUERY: InventoryQuery = {
  q: "",
  make: "",
  bodyType: "",
  fuel: "",
  transmission: "",
  condition: "",
  branchId: "",
  minPrice: null,
  maxPrice: null,
  minYear: null,
  maxMileage: null,
  sort: "featured",
};

function haystack(v: Vehicle): string {
  return `${v.year} ${v.make} ${v.model} ${v.trim} ${v.bodyType} ${v.fuel} ${v.color} ${v.stockNo}`.toLowerCase();
}

/** Vehicles a customer can see (not sold) that match every active filter. */
export function filterInventory(vehicles: Vehicle[], q: InventoryQuery): Vehicle[] {
  const tokens = q.q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = vehicles.filter((v) => {
    if (v.status === "Sold") return false;
    if (q.make && v.make !== q.make) return false;
    if (q.bodyType && v.bodyType !== q.bodyType) return false;
    if (q.fuel && v.fuel !== q.fuel) return false;
    if (q.transmission && v.transmission !== q.transmission) return false;
    if (q.condition && v.condition !== q.condition) return false;
    if (q.branchId && v.branchId !== q.branchId) return false;
    if (q.minPrice !== null && v.price < q.minPrice) return false;
    if (q.maxPrice !== null && v.price > q.maxPrice) return false;
    if (q.minYear !== null && v.year < q.minYear) return false;
    if (q.maxMileage !== null && v.mileage > q.maxMileage) return false;
    if (tokens.length) {
      const h = haystack(v);
      if (!tokens.every((t) => h.includes(t))) return false;
    }
    return true;
  });
  return sortInventory(out, q.sort);
}

export function sortInventory(vs: Vehicle[], sort: SortKey): Vehicle[] {
  const copy = [...vs];
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => a.price - b.price);
    case "price-desc":
      return copy.sort((a, b) => b.price - a.price);
    case "year-desc":
      return copy.sort((a, b) => b.year - a.year || a.mileage - b.mileage);
    case "mileage-asc":
      return copy.sort((a, b) => a.mileage - b.mileage);
    case "newest":
      return copy.sort((a, b) => b.acquiredDate.localeCompare(a.acquiredDate));
    case "featured":
    default:
      return copy.sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) ||
          Number(a.status === "Reserved") - Number(b.status === "Reserved") ||
          b.acquiredDate.localeCompare(a.acquiredDate),
      );
  }
}

/** Reads/writes the query from URL search params so filtered views are shareable. */
export function queryFromParams(p: URLSearchParams): InventoryQuery {
  const n = (k: string) => {
    const raw = p.get(k);
    if (raw === null || raw.trim() === "") return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };
  const sort = p.get("sort") as SortKey | null;
  const validSorts: SortKey[] = ["featured", "price-asc", "price-desc", "year-desc", "mileage-asc", "newest"];
  return {
    q: p.get("q") ?? "",
    make: p.get("make") ?? "",
    bodyType: p.get("body") ?? "",
    fuel: p.get("fuel") ?? "",
    transmission: p.get("trans") ?? "",
    condition: p.get("cond") ?? "",
    branchId: p.get("branch") ?? "",
    minPrice: n("min"),
    maxPrice: n("max"),
    minYear: n("year"),
    maxMileage: n("miles"),
    sort: sort && validSorts.includes(sort) ? sort : "featured",
  };
}

export function paramsFromQuery(q: InventoryQuery): URLSearchParams {
  const p = new URLSearchParams();
  const set = (k: string, v: string | number | null) => {
    if (v !== null && v !== "") p.set(k, String(v));
  };
  set("q", q.q.trim());
  set("make", q.make);
  set("body", q.bodyType);
  set("fuel", q.fuel);
  set("trans", q.transmission);
  set("cond", q.condition);
  set("branch", q.branchId);
  set("min", q.minPrice);
  set("max", q.maxPrice);
  set("year", q.minYear);
  set("miles", q.maxMileage);
  if (q.sort !== "featured") p.set("sort", q.sort);
  return p;
}
