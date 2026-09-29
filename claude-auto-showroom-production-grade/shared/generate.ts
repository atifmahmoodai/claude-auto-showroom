import { addDays, daysBetween, parseDay, startOfMonthsAgo } from "./dates";
import { DEMO_ORG } from "./demo-org";
import { createRng, type Rng } from "./random";
import type { Branch, Lead, LeadSource, LeadStage, LeadType, Org, Salesperson, ShowroomData, StageEvent, Transmission, Vehicle } from "./types";
import { CATALOG, COLORS, FEATURE_POOL, FIRST_NAMES, LAST_NAMES } from "./catalog";

/**
 * Builds a realistic, reproducible dataset: ~24 months of stock purchases,
 * sales and customer leads, ending on `today`. The same function feeds both
 * the web app and the Power BI CSV export, so the numbers always match.
 */
export function generateDemoData(today: string, seed = 20260928, org: Org = DEMO_ORG): ShowroomData {
  BRANCHES = org.branches;
  SALESPEOPLE = org.salespeople;
  const rng = createRng(seed);
  const windowStart = startOfMonthsAgo(today, 23);
  const vehicles = generateVehicles(rng, today, windowStart);
  const leads = generateLeads(rng, today, windowStart, vehicles);
  return { vehicles, leads };
}

// Set per call by generateDemoData (the generator is synchronous, so this is safe).
let BRANCHES: Branch[] = DEMO_ORG.branches;
let SALESPEOPLE: Salesperson[] = DEMO_ORG.salespeople;

const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";

function makeVin(rng: Rng): string {
  let s = "";
  for (let i = 0; i < 17; i++) s += VIN_CHARS[rng.int(0, VIN_CHARS.length - 1)];
  return s;
}

function pickFeatures(rng: Rng, isNew: boolean): string[] {
  const pool = FEATURE_POOL.filter((f) => !(isNew && f === "Full service history"));
  const count = rng.int(5, 9);
  const chosen = new Set<string>();
  while (chosen.size < count) chosen.add(rng.pick(pool));
  return [...chosen];
}

function daysToSell(rng: Rng): number {
  const bucket = rng.weighted(["fast", "normal", "slow"], [60, 28, 12]);
  if (bucket === "fast") return rng.int(7, 45);
  if (bucket === "normal") return rng.int(46, 90);
  return rng.int(91, 220);
}

const round100 = (n: number) => Math.round(n / 100) * 100;
const round50 = (n: number) => Math.round(n / 50) * 50;

function generateVehicles(rng: Rng, today: string, windowStart: string): Vehicle[] {
  const vehicles: Vehicle[] = [];
  // Start buying stock 200 days before the window so the first months already have sales.
  const buyFrom = addDays(windowStart, -200);
  const span = daysBetween(buyFrom, today);
  const branchIds = BRANCHES.map((b) => b.id);
  const branchWeights = BRANCHES.map((b) => b.monthlyTarget);

  const acquisitions: string[] = [];
  for (let d = 0; d <= span; d++) {
    // ~0.52 cars/day, slightly rising over time to give the charts a growth trend.
    const rate = 0.44 + 0.16 * (d / span);
    if (rng.chance(rate)) acquisitions.push(addDays(buyFrom, d));
    if (rng.chance(rate * 0.12)) acquisitions.push(addDays(buyFrom, d));
  }
  // A fresh delivery of stock in the last three weeks keeps the lot full.
  for (let i = 0; i < 12; i++) acquisitions.push(addDays(today, -rng.int(0, 20)));
  acquisitions.sort();

  let seq = 1;
  for (const acquiredDate of acquisitions) {
    const spec = rng.pick(CATALOG);
    const isNew = rng.chance(0.3);
    const acqYear = Number(acquiredDate.slice(0, 4));
    const age = isNew ? 0 : rng.int(1, 8);
    const year = acqYear - age;
    const mileage = isNew ? rng.int(5, 60) : Math.max(3000, age * rng.int(9000, 16000) + rng.int(-4000, 4000));
    const trimIdx = rng.int(0, spec.trims.length - 1);
    const fuel = rng.pick(spec.fuels);
    const trimFactor = 1 + trimIdx * 0.08;
    const price = isNew
      ? round100(spec.basePrice * trimFactor * rng.float(0.97, 1.05))
      : round100(spec.basePrice * trimFactor * Math.pow(0.86, age) * (1 - Math.min(0.2, mileage / 600000)));
    const cost = round100(price * (isNew ? rng.float(0.89, 0.94) : rng.float(0.8, 0.9)));
    const manualChance = fuel === "Electric" ? 0 : spec.bodyType === "Pickup" || spec.bodyType === "Van" ? 0.3 : 0.1;
    const transmission: Transmission = rng.chance(manualChance) ? "Manual" : "Automatic";
    const color = rng.weighted(COLORS, COLORS.map((c) => c.weight));
    const branchId = rng.weighted(branchIds, branchWeights);

    const soldDate = addDays(acquiredDate, daysToSell(rng));
    const isSold = parseDay(soldDate) <= parseDay(today);
    // Cars sold before the reporting window are irrelevant history; drop them.
    if (isSold && parseDay(soldDate) < parseDay(windowStart)) continue;

    const sellers = SALESPEOPLE.filter((s) => s.branchId === branchId);
    const trim = spec.trims[trimIdx];
    const v: Vehicle = {
      id: `v-${String(seq).padStart(4, "0")}`,
      stockNo: `AX${String(1000 + seq)}`,
      vin: makeVin(rng),
      make: spec.make,
      model: spec.model,
      trim,
      year,
      bodyType: spec.bodyType,
      fuel,
      transmission,
      condition: isNew ? "New" : "Used",
      mileage,
      color: color.name,
      colorHex: color.hex,
      engine: spec.engines[fuel] ?? "—",
      seats: spec.seats,
      price,
      cost,
      branchId,
      status: isSold ? "Sold" : rng.chance(0.12) ? "Reserved" : "Available",
      acquiredDate,
      features: pickFeatures(rng, isNew),
      description: isNew
        ? `Brand-new ${spec.make} ${spec.model} ${trim} in ${color.name}. Full manufacturer warranty and first service included.`
        : `${age}-year-old ${spec.make} ${spec.model} ${trim} in ${color.name} with ${mileage.toLocaleString("en-US")} miles. Inspected, detailed and ready to drive away.`,
      featured: false,
    };
    if (isSold) {
      v.soldDate = soldDate;
      v.salePrice = round50(price * rng.float(0.94, 1.0));
      v.salespersonId = rng.pick(sellers).id;
    }
    vehicles.push(v);
    seq++;
  }

  // Feature a handful of in-stock cars across different price points.
  const inStock = vehicles.filter((v) => v.status !== "Sold").sort((a, b) => b.price - a.price);
  const step = Math.max(1, Math.floor(inStock.length / 6));
  for (let i = 0; i < inStock.length && i / step < 6; i += step) inStock[i].featured = true;
  return vehicles;
}

const SOURCES: LeadSource[] = ["Website", "Walk-in", "Phone", "Facebook", "Marketplace", "Referral"];
const SOURCE_WEIGHTS = [34, 14, 12, 20, 14, 6];
const TYPES: LeadType[] = ["Enquiry", "Test Drive", "Finance"];
const TYPE_WEIGHTS = [60, 25, 15];

function responseMinutes(rng: Rng, source: LeadSource): number {
  if (source === "Walk-in") return rng.int(0, 5);
  if (source === "Phone") return rng.int(1, 30);
  if (source === "Referral") return rng.int(10, 180);
  const bucket = rng.weighted(["fast", "slow", "very slow"], [60, 30, 10]);
  if (bucket === "fast") return rng.int(5, 60);
  if (bucket === "slow") return rng.int(61, 240);
  return rng.int(241, 1440);
}

function isoAt(day: string, minutesIntoDay: number): string {
  return new Date(parseDay(day) + minutesIntoDay * 60_000).toISOString();
}

function person(rng: Rng) {
  const first = rng.pick(FIRST_NAMES);
  const last = rng.pick(LAST_NAMES);
  return {
    name: `${first} ${last}`,
    email: `${first}.${last}${rng.int(1, 99)}@example.com`.toLowerCase(),
    phone: `+1 (555) ${rng.int(100, 999)}-${String(rng.int(0, 9999)).padStart(4, "0")}`,
  };
}

function message(type: LeadType, v: Vehicle | undefined): string {
  const car = v ? `the ${v.year} ${v.make} ${v.model}` : "your stock";
  if (type === "Test Drive") return `I'd like to book a test drive of ${car}.`;
  if (type === "Finance") return `What would monthly payments look like on ${car}?`;
  return `Is ${car} still available? Any room on the price?`;
}

/** Builds stage history up to `furthest`, spacing events by a few hours/days, never past `latestMs`. */
function buildHistory(rng: Rng, createdAt: string, path: LeadStage[], responseMins: number | undefined, latestMs: number): StageEvent[] {
  const events: StageEvent[] = [{ stage: "New", at: createdAt }];
  let t = Date.parse(createdAt);
  for (const stage of path) {
    if (stage === "New") continue;
    const gap = stage === "Contacted" && responseMins !== undefined ? responseMins : rng.int(4 * 60, 5 * 24 * 60);
    t = Math.min(latestMs, t + gap * 60_000);
    events.push({ stage, at: new Date(t).toISOString() });
  }
  return events;
}

function generateLeads(rng: Rng, today: string, windowStart: string, vehicles: Vehicle[]): Lead[] {
  const leads: Lead[] = [];
  const span = daysBetween(windowStart, today);
  const nowMs = parseDay(today) + 20 * 3_600_000;
  let seq = 1;
  const nextId = () => `l-${String(seq++).padStart(5, "0")}`;

  // 1) Leads that turned into a sale.
  for (const v of vehicles) {
    if (v.status !== "Sold" || !v.soldDate || !rng.chance(0.65)) continue;
    let day = addDays(v.soldDate, -rng.int(3, 25));
    if (parseDay(day) < parseDay(v.acquiredDate)) day = v.acquiredDate;
    const source = rng.weighted(SOURCES, SOURCE_WEIGHTS);
    const type = rng.weighted(TYPES, TYPE_WEIGHTS);
    const createdAt = isoAt(day, rng.int(8 * 60, 19 * 60));
    const mins = responseMinutes(rng, source);
    const path: LeadStage[] = rng.chance(0.8)
      ? ["New", "Contacted", "Test Drive", "Negotiation"]
      : ["New", "Contacted", "Negotiation"];
    const history = buildHistory(rng, createdAt, path, mins, parseDay(v.soldDate) + 10 * 3_600_000);
    history.push({ stage: "Won", at: isoAt(v.soldDate, 16 * 60) });
    leads.push({
      id: nextId(),
      createdAt,
      ...person(rng),
      message: message(type, v),
      type,
      source,
      stage: "Won",
      stageHistory: history,
      branchId: v.branchId,
      vehicleId: v.id,
      salespersonId: v.salespersonId,
      firstResponseMinutes: mins,
      preferredDate: type === "Test Drive" ? addDays(day, rng.int(1, 4)) : undefined,
    });
  }

  // 2) Leads that were lost or are still open.
  const target = Math.round(leads.length * 4.6);
  const byAcquired = [...vehicles].sort((a, b) => a.acquiredDate.localeCompare(b.acquiredDate));
  let made = 0;
  while (made < target) {
    const x = rng.next();
    // Rejection sampling for a gently rising lead volume over time.
    if (!rng.chance((1 + 0.6 * x) / 1.6)) continue;
    const day = addDays(windowStart, Math.min(span, Math.floor(x * (span + 1))));
    const dayMs = parseDay(day);
    let vehicle: Vehicle | undefined;
    if (rng.chance(0.85)) {
      for (let tries = 0; tries < 25 && !vehicle; tries++) {
        const c = rng.pick(byAcquired);
        const inStockThen = parseDay(c.acquiredDate) <= dayMs && (!c.soldDate || parseDay(c.soldDate) > dayMs);
        if (inStockThen) vehicle = c;
      }
    }
    const source = rng.weighted(SOURCES, SOURCE_WEIGHTS);
    const type = rng.weighted(TYPES, TYPE_WEIGHTS);
    const branchId = vehicle?.branchId ?? rng.weighted(BRANCHES.map((b) => b.id), BRANCHES.map((b) => b.monthlyTarget));
    const createdAt = isoAt(day, rng.int(8 * 60, 19 * 60));
    const age = daysBetween(day, today);

    let furthest: LeadStage;
    let lost: boolean;
    if (age > 30) {
      lost = true;
      furthest = rng.weighted<LeadStage>(["New", "Contacted", "Test Drive", "Negotiation"], [22, 42, 23, 13]);
    } else if (age < 3) {
      lost = false;
      furthest = rng.weighted<LeadStage>(["New", "Contacted", "Test Drive", "Negotiation"], [50, 35, 10, 5]);
    } else {
      const s = rng.weighted<LeadStage | "Lost">(["New", "Contacted", "Test Drive", "Negotiation", "Lost"], [6, 34, 25, 15, 20]);
      lost = s === "Lost";
      furthest = s === "Lost" ? rng.pick<LeadStage>(["Contacted", "Test Drive"]) : s;
    }
    const order: LeadStage[] = ["New", "Contacted", "Test Drive", "Negotiation"];
    const path = order.slice(0, order.indexOf(furthest) + 1);
    // Leads lost at "New" were never followed up: the classic leak a dashboard should expose.
    const responded = furthest !== "New";
    const mins = responded ? responseMinutes(rng, source) : undefined;
    const history = buildHistory(rng, createdAt, path, mins, nowMs);
    if (lost) {
      const last = Date.parse(history[history.length - 1].at);
      history.push({ stage: "Lost", at: new Date(Math.min(nowMs, last + rng.int(1, 14) * 86_400_000)).toISOString() });
    }
    const sellers = SALESPEOPLE.filter((s) => s.branchId === branchId);
    leads.push({
      id: nextId(),
      createdAt,
      ...person(rng),
      message: message(type, vehicle),
      type,
      source,
      stage: lost ? "Lost" : furthest,
      stageHistory: history,
      branchId,
      vehicleId: vehicle?.id,
      salespersonId: responded ? rng.pick(sellers).id : undefined,
      firstResponseMinutes: mins,
      preferredDate: type === "Test Drive" ? addDays(day, rng.int(1, 4)) : undefined,
    });
    made++;
  }

  leads.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return leads;
}
