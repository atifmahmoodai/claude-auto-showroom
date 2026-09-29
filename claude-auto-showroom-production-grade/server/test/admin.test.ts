import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayIn } from "../src/config";
import { listLeads } from "../src/repo/leads";
import { loadOrg } from "../src/repo/org";
import { allVehicles } from "../src/repo/vehicles";
import { DEMO_ADMIN_EMAIL, DEMO_MANAGER_EMAIL } from "../src/seed";
import { computeDashboard } from "../../shared/analytics";
import { startOfMonthsAgo } from "../../shared/dates";
import { login, makeApp, type Agent, type TestCtx } from "./helpers";

let ctx: TestCtx;
let admin: Agent;
let manager: Agent;
let sales: Agent;
beforeAll(async () => {
  ctx = await makeApp();
  admin = await login(ctx.app, DEMO_ADMIN_EMAIL);
  manager = await login(ctx.app, DEMO_MANAGER_EMAIL);
  sales = await login(ctx.app, "maya@demo.local");
});
afterAll(() => ctx.close());

const TODAY = todayIn("UTC");
const newCar = (extra: Record<string, unknown> = {}) => ({
  vin: "", make: "Honda", model: "Civic", trim: "EX", year: 2023, bodyType: "Sedan", fuel: "Petrol", transmission: "Automatic",
  condition: "Used", mileage: 12000, color: "Blue", colorHex: "#1e40af", engine: "1.5T", seats: 5, price: 24000, cost: 20000,
  branchId: "b-downtown", status: "Available", acquiredDate: TODAY, features: ["Bluetooth"], description: "Test car", featured: false, imageUrl: "",
  ...extra,
});

describe("authentication", () => {
  it("rejects bad passwords without saying which part was wrong", async () => {
    const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: DEMO_ADMIN_EMAIL, password: "nope" }, remoteAddress: "198.51.100.1" });
    expect(r.statusCode).toBe(401);
    const unknown = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "ghost@demo.local", password: "nope" }, remoteAddress: "198.51.100.1" });
    expect(unknown.json().message).toBe(r.json().message);
  });

  it("sets an httpOnly SameSite session cookie", async () => {
    const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: DEMO_MANAGER_EMAIL, password: "demo-password-1" }, remoteAddress: "198.51.100.2" });
    const c = r.cookies.find((x) => x.name === "sid")!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("Lax");
    expect(r.json().user.role).toBe("manager");
  });

  it("locks an account after repeated failures, even for the right password", async () => {
    await admin.send("POST", "/api/admin/users", { email: "lockme@demo.local", name: "Lock Me", role: "sales", branchId: "b-downtown", password: "correct-horse-1" });
    for (let i = 0; i < 5; i++) {
      await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "lockme@demo.local", password: "wrong" }, remoteAddress: `198.51.101.${i}` });
    }
    const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "lockme@demo.local", password: "correct-horse-1" }, remoteAddress: "198.51.101.9" });
    expect(r.statusCode).toBe(423);
  });

  it("requires a session for admin routes and the CSRF token for changes", async () => {
    expect((await ctx.app.inject("/api/admin/meta")).statusCode).toBe(401);
    const noCsrf = await ctx.app.inject({ method: "POST", url: "/api/admin/vehicles", headers: { cookie: `sid=${manager.cookie}` }, payload: newCar() });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json().error).toBe("csrf");
  });

  it("logs out and invalidates the session", async () => {
    const a = await login(ctx.app, DEMO_MANAGER_EMAIL);
    expect((await a.get("/api/auth/me")).statusCode).toBe(200);
    await a.send("POST", "/api/auth/logout");
    expect((await a.get("/api/auth/me")).statusCode).toBe(401);
  });

  it("changing a password signs out other devices", async () => {
    await admin.send("POST", "/api/admin/users", { email: "pw@demo.local", name: "Pass Word", role: "sales", branchId: "b-downtown", password: "first-pass-1" });
    const laptop = await login(ctx.app, "pw@demo.local", "first-pass-1");
    const phone = await login(ctx.app, "pw@demo.local", "first-pass-1");
    const r = await laptop.send("POST", "/api/auth/password", { currentPassword: "first-pass-1", newPassword: "second-pass-2" });
    expect(r.statusCode).toBe(200);
    expect((await laptop.get("/api/auth/me")).statusCode).toBe(200);
    expect((await phone.get("/api/auth/me")).statusCode).toBe(401);
    const weak = await laptop.send("POST", "/api/auth/password", { currentPassword: "second-pass-2", newPassword: "short" });
    expect(weak.statusCode).toBe(400);
  });
});

describe("roles", () => {
  it("hides cost from sales staff and keeps reports for managers", async () => {
    const list = (await sales.get("/api/admin/vehicles?status=all")).json().items;
    expect(list.every((v: { cost: number }) => v.cost === 0)).toBe(true);
    expect((await manager.get("/api/admin/vehicles")).json().items.some((v: { cost: number }) => v.cost > 0)).toBe(true);
    expect((await sales.get(`/api/admin/dashboard?from=${TODAY}&to=${TODAY}`)).statusCode).toBe(403);
    expect((await sales.get("/api/admin/export")).statusCode).toBe(403);
    expect((await sales.send("POST", "/api/admin/vehicles", newCar())).statusCode).toBe(403);
    expect((await manager.get("/api/admin/users")).statusCode).toBe(403);
  });
});

describe("vehicles", () => {
  it("creates with the next stock number and validates business rules", async () => {
    const r = await manager.send("POST", "/api/admin/vehicles", newCar({ vin: "1hgcm82633a004352" }));
    expect(r.statusCode).toBe(201);
    expect(r.json().stockNo).toMatch(/^AX\d+$/);
    expect(r.json().vin).toBe("1HGCM82633A004352");
    const bad = await manager.send("POST", "/api/admin/vehicles", newCar({ acquiredDate: "2999-01-01", imageUrl: "javascript:alert(1)", price: 0 }));
    expect(bad.statusCode).toBe(400);
    expect(Object.keys(bad.json().details)).toEqual(expect.arrayContaining(["imageUrl", "price"]));
    const future = await manager.send("POST", "/api/admin/vehicles", newCar({ acquiredDate: "2999-01-01" }));
    expect(future.json().details.acquiredDate).toBeTruthy();
    const dupVin = await manager.send("POST", "/api/admin/vehicles", newCar({ vin: "1HGCM82633A004352" }));
    expect(dupVin.statusCode).toBe(409);
  });

  it("detects conflicting edits (optimistic locking)", async () => {
    const car = (await manager.send("POST", "/api/admin/vehicles", newCar())).json();
    const first = await manager.send("PUT", `/api/admin/vehicles/${car.id}`, { ...newCar({ price: 23500 }), version: car.version });
    expect(first.statusCode).toBe(200);
    const stale = await admin.send("PUT", `/api/admin/vehicles/${car.id}`, { ...newCar({ price: 22000 }), version: car.version });
    expect(stale.statusCode).toBe(409);
  });

  it("sells once, keeps sold cars and audits it", async () => {
    const car = (await manager.send("POST", "/api/admin/vehicles", newCar())).json();
    const sale = { salePrice: 23800, soldDate: TODAY, salespersonId: "s-maya" };
    const r = await sales.send("POST", `/api/admin/vehicles/${car.id}/sell`, sale);
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe("Sold");
    expect((await sales.send("POST", `/api/admin/vehicles/${car.id}/sell`, sale)).statusCode).toBe(409);
    expect((await manager.send("DELETE", `/api/admin/vehicles/${car.id}`)).statusCode).toBe(409);
    // Only an admin may reverse a sale.
    const sold = (await manager.get(`/api/admin/vehicles/${car.id}`)).json();
    expect((await manager.send("PUT", `/api/admin/vehicles/${car.id}`, { ...newCar(), version: sold.version })).statusCode).toBe(403);
    const audit = (await admin.get(`/api/admin/audit?entityId=${car.id}`)).json().items.map((a: { action: string }) => a.action);
    expect(audit).toEqual(expect.arrayContaining(["vehicle.create", "vehicle.sell"]));
  });

  it("rejects sales before acquisition or credited to unknown staff", async () => {
    const car = (await manager.send("POST", "/api/admin/vehicles", newCar({ acquiredDate: TODAY }))).json();
    expect((await manager.send("POST", `/api/admin/vehicles/${car.id}/sell`, { salePrice: 1, soldDate: "2020-01-01", salespersonId: "s-maya" })).statusCode).toBe(400);
    expect((await manager.send("POST", `/api/admin/vehicles/${car.id}/sell`, { salePrice: 1, soldDate: TODAY, salespersonId: "nobody" })).statusCode).toBe(400);
  });

  it("reserves and deletes unsold cars", async () => {
    const car = (await manager.send("POST", "/api/admin/vehicles", newCar())).json();
    expect((await sales.send("POST", `/api/admin/vehicles/${car.id}/reserve`, { reserved: true })).json().status).toBe("Reserved");
    expect((await sales.send("POST", `/api/admin/vehicles/${car.id}/reserve`, { reserved: true })).statusCode).toBe(409);
    expect((await manager.send("DELETE", `/api/admin/vehicles/${car.id}`)).statusCode).toBe(200);
    expect((await manager.get(`/api/admin/vehicles/${car.id}`)).statusCode).toBe(404);
  });
});

describe("photo uploads", () => {
  const upload = (a: Agent, name: string, bytes: Buffer, type: string) => {
    const boundary = "----testboundary";
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return ctx.app.inject({ method: "POST", url: "/api/admin/uploads", payload: body, headers: { cookie: `sid=${a.cookie}`, "x-csrf-token": a.csrf, "content-type": `multipart/form-data; boundary=${boundary}` } });
  };
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);

  it("stores real images under a server-chosen name and serves them", async () => {
    const r = await upload(manager, "../../evil.php", PNG, "image/png");
    expect(r.statusCode).toBe(201);
    const url = r.json().url as string;
    expect(url).toMatch(/^\/uploads\/[0-9a-f-]+\.png$/);
    const got = await ctx.app.inject(url);
    expect(got.statusCode).toBe(200);
    expect(got.rawPayload.equals(PNG)).toBe(true);
  });

  it("rejects files that aren't images, whatever they're called", async () => {
    const r = await upload(manager, "photo.jpg", Buffer.from("<?php system($_GET['c']); ?>"), "image/jpeg");
    expect(r.statusCode).toBe(400);
  });

  it("rejects oversize files", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]);
    expect((await upload(manager, "big.png", big, "image/png")).statusCode).toBe(413);
  });
});

describe("leads", () => {
  it("moves through stages, records the first response once and assigns", async () => {
    const created = await sales.send("POST", "/api/admin/leads", { name: "Walk In", phone: "5551234567", type: "Enquiry", source: "Walk-in", branchId: "b-downtown" });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;
    const moved = (await sales.send("PATCH", `/api/admin/leads/${id}/stage`, { stage: "Contacted" })).json();
    expect(moved.firstResponseMinutes).toBe(0);
    const again = (await sales.send("PATCH", `/api/admin/leads/${id}/stage`, { stage: "Test Drive" })).json();
    expect(again.firstResponseMinutes).toBe(0);
    expect(again.stageHistory.map((e: { stage: string }) => e.stage)).toEqual(["New", "Contacted", "Test Drive"]);
    expect((await sales.send("PATCH", `/api/admin/leads/${id}/assign`, { salespersonId: "s-omar" })).json().salespersonId).toBe("s-omar");
    expect((await sales.send("PATCH", `/api/admin/leads/${id}/assign`, { salespersonId: "ghost" })).statusCode).toBe(400);
    expect((await sales.send("PATCH", `/api/admin/leads/${id}/stage`, { stage: "Bogus" })).statusCode).toBe(400);
  });

  it("filters by period and search text", async () => {
    const all = (await manager.get("/api/admin/leads?days=0")).json();
    const recent = (await manager.get("/api/admin/leads?days=7")).json();
    expect(all.items.length).toBeGreaterThan(recent.items.length);
    const hit = (await manager.get("/api/admin/leads?days=0&q=walk%20in")).json();
    expect(hit.items.every((l: { name: string }) => l.name.toLowerCase().includes("walk"))).toBe(true);
  });
});

describe("reports", () => {
  it("dashboard equals the shared analytics over the whole database", async () => {
    const from = startOfMonthsAgo(TODAY, 11);
    const res = await manager.get(`/api/admin/dashboard?from=${from}&to=${TODAY}&branch=all`);
    expect(res.statusCode).toBe(200);
    const [vehicles, leads, org] = await Promise.all([allVehicles(ctx.app.db), listLeads(ctx.app.db, {}), loadOrg(ctx.app.db)]);
    const expected = computeDashboard({ vehicles, leads }, { from, to: TODAY, branchId: "all" }, TODAY, org);
    expect(res.json()).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it("exports Power BI tables as CSV without personal data", async () => {
    const list = (await manager.get("/api/admin/export")).json().tables;
    expect(list.map((t: { name: string }) => t.name)).toContain("FactSales");
    const csv = await manager.get("/api/admin/export/FactLeads.csv");
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).not.toContain("@");
    expect((await manager.get("/api/admin/export/Nope.csv")).statusCode).toBe(404);
  });
});

describe("users and settings", () => {
  it("prevents duplicate emails and admin self-lockout", async () => {
    const dup = await admin.send("POST", "/api/admin/users", { email: DEMO_MANAGER_EMAIL.toUpperCase(), name: "Dup", role: "sales", branchId: null, password: "whatever-pass-1" });
    expect(dup.statusCode).toBe(409);
    const me = (await admin.get("/api/auth/me")).json().user;
    const r = await admin.send("PUT", `/api/admin/users/${me.id}`, { name: me.name, role: "sales", branchId: null, active: true });
    expect(r.statusCode).toBe(400);
  });

  it("disabling a user ends their sessions", async () => {
    await admin.send("POST", "/api/admin/users", { email: "leaver@demo.local", name: "Lea Ver", role: "sales", branchId: "b-downtown", password: "leaving-soon-1" });
    const leaver = await login(ctx.app, "leaver@demo.local", "leaving-soon-1");
    const id = (await leaver.get("/api/auth/me")).json().user.id;
    await admin.send("PUT", `/api/admin/users/${id}`, { name: "Lea Ver", role: "sales", branchId: "b-downtown", active: false });
    expect((await leaver.get("/api/admin/meta")).statusCode).toBe(401);
  });

  it("updates site settings used by the public site", async () => {
    const site = { name: "Test Motors", tagline: "Hi", email: "hi@test.example", currency: "PKR", locale: "en-PK", finance: { aprPercent: 12, termMonths: 48, depositPercent: 25 } };
    expect((await admin.send("PUT", "/api/admin/settings/site", site)).statusCode).toBe(200);
    expect((await ctx.app.inject("/api/public/site")).json().site).toEqual(site);
    expect((await admin.send("PUT", "/api/admin/settings/site", { ...site, currency: "rupees" })).statusCode).toBe(400);
  });
});
