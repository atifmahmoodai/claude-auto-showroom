import { describe, expect, it } from "vitest";
import { DEMO_ORG } from "./demo-org";
import { generateDemoData } from "./generate";
import type { Lead, ShowroomData, Vehicle } from "./types";
import { agingBucket, computeDashboard, periodTarget } from "./analytics";
import { daysBetween, monthRange, startOfMonthsAgo } from "./dates";

const TODAY = "2026-09-28";

function vehicle(over: Partial<Vehicle>): Vehicle {
  return {
    id: "v1",
    stockNo: "AX1",
    vin: "X",
    make: "Toyota",
    model: "Corolla",
    trim: "LE",
    year: 2024,
    bodyType: "Sedan",
    fuel: "Petrol",
    transmission: "Automatic",
    condition: "Used",
    mileage: 10000,
    color: "White",
    colorHex: "#ffffff",
    engine: "2.0",
    seats: 5,
    price: 20000,
    cost: 17000,
    branchId: "b-downtown",
    status: "Available",
    acquiredDate: "2026-09-01",
    features: [],
    description: "",
    featured: false,
    ...over,
  };
}

function lead(over: Partial<Lead>): Lead {
  return {
    id: "l1",
    createdAt: "2026-09-10T10:00:00.000Z",
    name: "A",
    phone: "",
    email: "",
    message: "",
    type: "Enquiry",
    source: "Website",
    stage: "New",
    stageHistory: [{ stage: "New", at: "2026-09-10T10:00:00.000Z" }],
    branchId: "b-downtown",
    ...over,
  };
}

describe("computeDashboard on hand-built data", () => {
  const data: ShowroomData = {
    vehicles: [
      vehicle({ id: "a", status: "Sold", acquiredDate: "2026-08-01", soldDate: "2026-09-05", salePrice: 21000, cost: 18000, salespersonId: "s-maya" }),
      vehicle({ id: "b", status: "Sold", acquiredDate: "2026-09-01", soldDate: "2026-09-11", salePrice: 30000, cost: 26000, branchId: "b-northside", salespersonId: "s-sara" }),
      vehicle({ id: "c", status: "Sold", acquiredDate: "2026-06-01", soldDate: "2026-07-15", salePrice: 10000, cost: 9000 }), // outside period
      vehicle({ id: "d", status: "Available", acquiredDate: "2026-05-01", cost: 15000 }), // 150 days old
      vehicle({ id: "e", status: "Reserved", acquiredDate: "2026-09-20", cost: 12000 }),
    ],
    leads: [
      lead({ id: "1", stage: "Won", firstResponseMinutes: 10, stageHistory: [
        { stage: "New", at: "2026-09-10T10:00:00.000Z" },
        { stage: "Contacted", at: "2026-09-10T10:10:00.000Z" },
        { stage: "Test Drive", at: "2026-09-12T10:00:00.000Z" },
        { stage: "Won", at: "2026-09-15T10:00:00.000Z" },
      ] }),
      lead({ id: "2", stage: "Lost", firstResponseMinutes: 30, stageHistory: [
        { stage: "New", at: "2026-09-10T10:00:00.000Z" },
        { stage: "Contacted", at: "2026-09-10T10:30:00.000Z" },
        { stage: "Lost", at: "2026-09-20T10:00:00.000Z" },
      ] }),
      lead({ id: "3" }), // untouched
      lead({ id: "4", createdAt: "2026-08-01T10:00:00.000Z" }), // outside period
    ],
  };
  const d = computeDashboard(data, { from: "2026-09-01", to: "2026-09-30", branchId: "all" }, TODAY, DEMO_ORG);

  it("counts sales, revenue and gross in the period only", () => {
    expect(d.kpis.unitsSold).toBe(2);
    expect(d.kpis.revenue).toBe(51000);
    expect(d.kpis.grossProfit).toBe(3000 + 4000);
    expect(d.kpis.avgGrossPerUnit).toBe(3500);
    expect(d.kpis.avgDaysToSell).toBe((35 + 10) / 2);
  });

  it("computes lead conversion, response time and unanswered leads", () => {
    expect(d.kpis.leads).toBe(3);
    expect(d.kpis.wonLeads).toBe(1);
    expect(d.kpis.conversionRate).toBeCloseTo(1 / 3);
    expect(d.kpis.avgResponseMinutes).toBe(20);
    expect(d.kpis.unansweredLeads).toBe(1);
  });

  it("builds a monotonic funnel from stage history", () => {
    const counts = d.funnel.map((f) => f.count);
    expect(counts).toEqual([3, 2, 1, 0, 1]);
  });

  it("ages current stock regardless of the date filter", () => {
    expect(d.stock.count).toBe(2);
    expect(d.stock.value).toBe(27000);
    expect(d.stock.over90).toBe(1);
    expect(d.aging.find((a) => a.bucket === "90+ days")?.count).toBe(1);
    expect(d.aging.find((a) => a.bucket === "0–30 days")?.count).toBe(1);
  });

  it("filters by branch", () => {
    const north = computeDashboard(data, { from: "2026-09-01", to: "2026-09-30", branchId: "b-northside" }, TODAY, DEMO_ORG);
    expect(north.kpis.unitsSold).toBe(1);
    expect(north.kpis.revenue).toBe(30000);
    expect(north.salespeople.every((s) => s.id === "s-sara" || s.id === "s-james")).toBe(true);
  });

  it("returns zeros (not NaN) for an empty period", () => {
    const empty = computeDashboard(data, { from: "2020-01-01", to: "2020-01-31", branchId: "all" }, TODAY, DEMO_ORG);
    for (const [k, v] of Object.entries(empty.kpis)) {
      expect(Number.isFinite(v), k).toBe(true);
    }
  });
});

describe("periodTarget", () => {
  it("is the full monthly target for a whole month", () => {
    expect(periodTarget({ from: "2026-09-01", to: "2026-09-30", branchId: "all" }, DEMO_ORG.branches)).toBeCloseTo(19);
    expect(periodTarget({ from: "2026-09-01", to: "2026-09-30", branchId: "b-northside" }, DEMO_ORG.branches)).toBeCloseTo(8);
  });
  it("pro-rates partial months", () => {
    expect(periodTarget({ from: "2026-09-01", to: "2026-09-15", branchId: "all" }, DEMO_ORG.branches)).toBeCloseTo(9.5);
    expect(periodTarget({ from: "2026-08-17", to: "2026-09-15", branchId: "b-downtown" }, DEMO_ORG.branches)).toBeCloseTo(11 * (15 / 31) + 11 * (15 / 30));
  });
});

describe("dates", () => {
  it("handles month and year boundaries", () => {
    expect(monthRange("2025-11-20", "2026-02-03")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(startOfMonthsAgo("2026-02-15", 3)).toBe("2025-11-01");
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // leap year
  });
  it("buckets stock age", () => {
    expect(agingBucket(0)).toBe("0–30 days");
    expect(agingBucket(30)).toBe("0–30 days");
    expect(agingBucket(31)).toBe("31–60 days");
    expect(agingBucket(91)).toBe("90+ days");
  });
});

describe("generated demo data", () => {
  const data = generateDemoData(TODAY);

  it("is deterministic", () => {
    expect(generateDemoData(TODAY)).toEqual(data);
  });

  it("has a realistic shape", () => {
    const sold = data.vehicles.filter((v) => v.status === "Sold");
    const stock = data.vehicles.filter((v) => v.status !== "Sold");
    expect(sold.length).toBeGreaterThan(200);
    expect(stock.length).toBeGreaterThan(20);
    expect(data.leads.length).toBeGreaterThan(sold.length);
    expect(stock.some((v) => v.featured)).toBe(true);
  });

  it("keeps every record internally consistent", () => {
    const ids = new Set(data.vehicles.map((v) => v.id));
    expect(ids.size).toBe(data.vehicles.length);
    for (const v of data.vehicles) {
      expect(v.price).toBeGreaterThan(0);
      expect(v.cost).toBeLessThan(v.price);
      expect(v.acquiredDate <= TODAY).toBe(true);
      if (v.status === "Sold") {
        expect(v.soldDate && v.soldDate >= v.acquiredDate && v.soldDate <= TODAY).toBe(true);
        expect(v.salePrice).toBeGreaterThan(v.cost);
        expect(v.salespersonId).toBeTruthy();
      } else {
        expect(v.soldDate).toBeUndefined();
      }
    }
    for (const l of data.leads) {
      expect(l.stageHistory[0].stage).toBe("New");
      expect(l.stageHistory[l.stageHistory.length - 1].stage).toBe(l.stage);
      const times = l.stageHistory.map((e) => Date.parse(e.at));
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      if (l.vehicleId) expect(ids.has(l.vehicleId)).toBe(true);
      if (l.stage === "New") expect(l.firstResponseMinutes).toBeUndefined();
    }
  });

  it("produces sensible headline numbers for the last 12 months", () => {
    const d = computeDashboard(data, { from: startOfMonthsAgo(TODAY, 11), to: TODAY, branchId: "all" }, TODAY, DEMO_ORG);
    expect(d.kpis.conversionRate).toBeGreaterThan(0.08);
    expect(d.kpis.conversionRate).toBeLessThan(0.25);
    expect(d.kpis.grossMargin).toBeGreaterThan(0.04);
    expect(d.kpis.grossMargin).toBeLessThan(0.25);
    expect(d.kpis.targetAttainment).toBeGreaterThan(0.8);
    expect(d.kpis.targetAttainment).toBeLessThan(1.25);
  });
});
