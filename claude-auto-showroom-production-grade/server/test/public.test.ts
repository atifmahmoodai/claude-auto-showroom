import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allVehicles } from "../src/repo/vehicles";
import { EMPTY_QUERY, filterInventory, paramsFromQuery, type InventoryQuery } from "../../shared/inventory";
import { makeApp, type TestCtx } from "./helpers";

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeApp();
});
afterAll(() => ctx.close());

const FORBIDDEN_KEYS = ["cost", "salePrice", "salespersonId", "soldDate"];

describe("health", () => {
  it("reports live and ready", async () => {
    expect((await ctx.app.inject("/healthz")).json()).toEqual({ ok: true });
    expect((await ctx.app.inject("/readyz")).statusCode).toBe(200);
  });
  it("sends security headers and a request id", async () => {
    const r = await ctx.app.inject("/api/public/summary");
    expect(r.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-frame-options"]).toBeTruthy();
    expect(r.headers["x-request-id"]).toBeTruthy();
  });
});

describe("public inventory", () => {
  it("never exposes cost or sale details", async () => {
    const summary = await ctx.app.inject("/api/public/summary");
    const list = await ctx.app.inject("/api/public/vehicles?limit=60");
    const first = list.json().items[0];
    const detail = await ctx.app.inject(`/api/public/vehicles/${first.id}`);
    for (const body of [summary.body, list.body, detail.body]) {
      for (const k of FORBIDDEN_KEYS) expect(body).not.toContain(`"${k}"`);
    }
    expect(detail.json().similar.length).toBeGreaterThan(0);
  });

  it("filters and sorts exactly like the shared browser logic", async () => {
    const all = await allVehicles(ctx.app.db);
    const makes = [...new Set(all.map((v) => v.make))];
    const queries: Partial<InventoryQuery>[] = [
      {},
      { make: makes[0], sort: "price-asc" },
      { bodyType: "SUV", maxPrice: 40000, sort: "price-desc" },
      { q: "hybrid", sort: "mileage-asc" },
      { q: "toyota 20", minYear: 2020, sort: "year-desc" },
      { condition: "New", branchId: "b-northside", sort: "newest" },
      { fuel: "Electric", transmission: "Automatic", minPrice: 30000 },
      { q: "%_", sort: "featured" },
    ];
    for (const partial of queries) {
      const q = { ...EMPTY_QUERY, ...partial };
      const expected = filterInventory(all, q);
      const res = await ctx.app.inject(`/api/public/vehicles?${paramsFromQuery(q)}&limit=60`);
      const body = res.json();
      expect(body.total, JSON.stringify(partial)).toBe(expected.length);
      const key = (v: { price: number; mileage: number; year: number }) =>
        q.sort === "price-asc" || q.sort === "price-desc" ? v.price : q.sort === "mileage-asc" ? v.mileage : q.sort === "year-desc" ? v.year : 0;
      expect(body.items.map(key)).toEqual(expected.slice(0, 60).map(key));
      if (expected.length <= 60) expect(new Set(body.items.map((v: { id: string }) => v.id))).toEqual(new Set(expected.map((v) => v.id)));
    }
  });

  it("pages through results", async () => {
    const a = (await ctx.app.inject("/api/public/vehicles?limit=5&offset=0")).json();
    const b = (await ctx.app.inject("/api/public/vehicles?limit=5&offset=5")).json();
    expect(a.items).toHaveLength(5);
    expect(a.items.map((v: { id: string }) => v.id)).not.toContain(b.items[0].id);
    expect((await ctx.app.inject("/api/public/vehicles?limit=1000")).statusCode).toBe(400);
  });

  it("returns 404 for unknown cars and unknown API routes", async () => {
    expect((await ctx.app.inject("/api/public/vehicles/nope")).statusCode).toBe(404);
    expect((await ctx.app.inject("/api/nope")).statusCode).toBe(404);
  });

  it("publishes robots.txt and a sitemap of cars in stock", async () => {
    expect((await ctx.app.inject("/robots.txt")).body).toContain("Disallow: /admin");
    const map = await ctx.app.inject("/sitemap.xml");
    expect(map.headers["content-type"]).toContain("application/xml");
    const stock = (await ctx.app.inject("/api/public/summary")).json().stockCount;
    expect((map.body.match(/\/vehicle\//g) ?? []).length).toBe(stock);
  });
});

describe("public leads", () => {
  const lead = (extra: Record<string, unknown> = {}) => ({ name: "Ann Lee", email: "ann@example.com", phone: "", type: "Enquiry", branchId: "b-downtown", message: "Hi", ...extra });
  const post = (payload: object, ip = "203.0.113.1") => ctx.app.inject({ method: "POST", url: "/api/public/leads", payload, remoteAddress: ip });

  it("stores a lead, routes it to the car's own branch and notifies staff", async () => {
    const car = (await ctx.app.inject("/api/public/vehicles?branch=b-northside&limit=1")).json().items[0];
    const res = await post(lead({ vehicleId: car.id, branchId: "b-downtown" }), "203.0.113.10");
    expect(res.statusCode).toBe(201);
    const { rows } = await ctx.app.db.query("SELECT branch_id, stage, source FROM leads WHERE vehicle_id = $1 AND name = 'Ann Lee' ORDER BY created_at DESC LIMIT 1", [car.id]);
    expect(rows[0]).toEqual({ branch_id: "b-northside", stage: "New", source: "Website" });
    await new Promise((r) => setTimeout(r, 20));
    expect(ctx.sent.at(-1)?.vehicleId).toBe(car.id);
  });

  it("validates input with field messages", async () => {
    const res = await post(lead({ name: "A", email: "bad", phone: "" }), "203.0.113.11");
    expect(res.statusCode).toBe(400);
    expect(Object.keys(res.json().details)).toEqual(expect.arrayContaining(["name", "email"]));
    const past = await post(lead({ type: "Test Drive", preferredDate: "2020-01-01" }), "203.0.113.11");
    expect(past.statusCode).toBe(400);
    expect(past.json().details.preferredDate).toBeTruthy();
    const noContact = await post(lead({ email: "", phone: "12" }), "203.0.113.11");
    expect(noContact.json().details.contact).toBeTruthy();
  });

  it("silently drops honeypot submissions", async () => {
    const before = (await ctx.app.db.query("SELECT count(*)::int AS n FROM leads")).rows[0].n;
    expect((await post(lead({ website: "http://spam" }), "203.0.113.12")).statusCode).toBe(201);
    expect((await ctx.app.db.query("SELECT count(*)::int AS n FROM leads")).rows[0].n).toBe(before);
  });

  it("rate-limits lead spam per address", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await post(lead(), "203.0.113.99")).statusCode);
    expect(codes.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(codes[6]).toBe(429);
  });

  it("refuses cross-site posts", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/api/public/leads", payload: lead(), headers: { origin: "https://evil.example" }, remoteAddress: "203.0.113.13" });
    expect(res.statusCode).toBe(403);
  });
});
