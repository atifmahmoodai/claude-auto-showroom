import { describe, expect, it } from "vitest";
import { generateDemoData } from "../data/generate";
import { calcFinance } from "./finance";
import { EMPTY_QUERY, filterInventory, paramsFromQuery, queryFromParams } from "./inventory";

const data = generateDemoData("2026-09-28");

describe("filterInventory", () => {
  it("never shows sold cars", () => {
    expect(filterInventory(data.vehicles, EMPTY_QUERY).every((v) => v.status !== "Sold")).toBe(true);
  });

  it("applies every filter together", () => {
    const res = filterInventory(data.vehicles, { ...EMPTY_QUERY, bodyType: "SUV", maxPrice: 60000, sort: "price-asc" });
    expect(res.every((v) => v.bodyType === "SUV" && v.price <= 60000)).toBe(true);
    for (let i = 1; i < res.length; i++) expect(res[i].price).toBeGreaterThanOrEqual(res[i - 1].price);
  });

  it("matches multi-word search across fields", () => {
    const target = data.vehicles.find((v) => v.status !== "Sold")!;
    const res = filterInventory(data.vehicles, { ...EMPTY_QUERY, q: `${target.make} ${target.model}`.toUpperCase() });
    expect(res.map((v) => v.id)).toContain(target.id);
    expect(filterInventory(data.vehicles, { ...EMPTY_QUERY, q: "zzzz-nothing" })).toHaveLength(0);
  });

  it("round-trips through URL params and ignores junk", () => {
    const q = { ...EMPTY_QUERY, q: "civic", make: "Honda", minPrice: 10000, maxMileage: 50000, sort: "price-desc" as const };
    expect(queryFromParams(paramsFromQuery(q))).toEqual(q);
    const junk = queryFromParams(new URLSearchParams("min=abc&sort=hack"));
    expect(junk.minPrice).toBeNull();
    expect(junk.sort).toBe("featured");
  });
});

describe("calcFinance", () => {
  it("matches the standard amortisation formula", () => {
    const r = calcFinance({ price: 30000, deposit: 6000, aprPercent: 6, termMonths: 60 });
    expect(r.principal).toBe(24000);
    expect(r.monthly).toBeCloseTo(463.99, 2);
  });
  it("handles 0% APR and oversized deposits", () => {
    expect(calcFinance({ price: 12000, deposit: 0, aprPercent: 0, termMonths: 12 }).monthly).toBe(1000);
    const big = calcFinance({ price: 10000, deposit: 15000, aprPercent: 5, termMonths: 36 });
    expect(big.monthly).toBe(0);
    expect(big.totalInterest).toBe(0);
  });
});
