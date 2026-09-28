import { BRANCHES, SALESPEOPLE } from "../config";
import { FUNNEL_STAGES, LEAD_SOURCES, type Lead, type LeadSource, type ShowroomData, type Vehicle } from "../types";
import { daysBetween, monthKey, monthLabel, monthRange, parseDay } from "./dates";

export interface AnalyticsFilter {
  /** Inclusive YYYY-MM-DD. */
  from: string;
  /** Inclusive YYYY-MM-DD. */
  to: string;
  branchId: string; // "all" or a branch id
}

export interface MonthPoint {
  month: string;
  label: string;
  units: number;
  revenue: number;
  gross: number;
  target: number;
  leads: number;
}

export interface Dashboard {
  kpis: {
    unitsSold: number;
    revenue: number;
    grossProfit: number;
    avgGrossPerUnit: number;
    grossMargin: number;
    avgDaysToSell: number;
    leads: number;
    wonLeads: number;
    conversionRate: number;
    avgResponseMinutes: number;
    /** Leads in the period that are still "New" with no reply. */
    unansweredLeads: number;
    targetUnits: number;
    targetAttainment: number;
  };
  stock: { count: number; value: number; retailValue: number; avgDaysInStock: number; over90: number };
  monthly: MonthPoint[];
  aging: { bucket: string; count: number; value: number }[];
  funnel: { stage: string; count: number; pctOfLeads: number }[];
  byMake: { name: string; units: number; gross: number }[];
  byBody: { name: string; units: number; revenue: number }[];
  sources: { source: LeadSource; leads: number; won: number; conversion: number; avgResponseMinutes: number }[];
  salespeople: { id: string; name: string; units: number; revenue: number; gross: number; avgGross: number }[];
  oldestStock: (Vehicle & { daysInStock: number })[];
}

const inRange = (day: string, f: AnalyticsFilter) => day >= f.from && day <= f.to;
const branchOk = (branchId: string, f: AnalyticsFilter) => f.branchId === "all" || branchId === f.branchId;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

export function grossOf(v: Vehicle): number {
  return (v.salePrice ?? v.price) - v.cost;
}

export function soldInPeriod(vehicles: Vehicle[], f: AnalyticsFilter): Vehicle[] {
  return vehicles.filter((v) => v.status === "Sold" && v.soldDate && inRange(v.soldDate, f) && branchOk(v.branchId, f));
}

export function leadsInPeriod(leads: Lead[], f: AnalyticsFilter): Lead[] {
  return leads.filter((l) => inRange(l.createdAt.slice(0, 10), f) && branchOk(l.branchId, f));
}

export function reachedStage(lead: Lead, stage: string): boolean {
  return lead.stageHistory.some((e) => e.stage === stage);
}

function monthlyTarget(f: AnalyticsFilter): number {
  return BRANCHES.filter((b) => branchOk(b.id, f)).reduce((s, b) => s + b.monthlyTarget, 0);
}

function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Target units for the filter period, pro-rated for partial months. */
export function periodTarget(f: AnalyticsFilter): number {
  const perMonth = monthlyTarget(f);
  let total = 0;
  for (const key of monthRange(f.from, f.to)) {
    const dim = daysInMonth(key);
    const monthStart = `${key}-01`;
    const monthEnd = `${key}-${String(dim).padStart(2, "0")}`;
    const start = f.from > monthStart ? f.from : monthStart;
    const end = f.to < monthEnd ? f.to : monthEnd;
    const covered = daysBetween(start, end) + 1;
    total += (perMonth * Math.max(0, covered)) / dim;
  }
  return total;
}

export function agingBucket(days: number): string {
  if (days <= 30) return "0–30 days";
  if (days <= 60) return "31–60 days";
  if (days <= 90) return "61–90 days";
  return "90+ days";
}

export function computeDashboard(data: ShowroomData, f: AnalyticsFilter, today: string): Dashboard {
  const sold = soldInPeriod(data.vehicles, f);
  const leads = leadsInPeriod(data.leads, f);
  const revenue = sold.reduce((s, v) => s + (v.salePrice ?? v.price), 0);
  const gross = sold.reduce((s, v) => s + grossOf(v), 0);
  const won = leads.filter((l) => l.stage === "Won");
  const responseTimes = leads.map((l) => l.firstResponseMinutes).filter((m): m is number => m !== undefined);
  const targetUnits = periodTarget(f);

  // Current stock is a point-in-time view: it ignores the date filter but respects the branch.
  const stockNow = data.vehicles
    .filter((v) => v.status !== "Sold" && branchOk(v.branchId, f))
    .map((v) => ({ ...v, daysInStock: Math.max(0, daysBetween(v.acquiredDate, today)) }));

  const buckets = ["0–30 days", "31–60 days", "61–90 days", "90+ days"];
  const aging = buckets.map((bucket) => {
    const inBucket = stockNow.filter((v) => agingBucket(v.daysInStock) === bucket);
    return { bucket, count: inBucket.length, value: inBucket.reduce((s, v) => s + v.cost, 0) };
  });

  const perMonth = monthlyTarget(f);
  const monthly: MonthPoint[] = monthRange(f.from, f.to).map((month) => {
    const ms = sold.filter((v) => monthKey(v.soldDate!) === month);
    return {
      month,
      label: monthLabel(month),
      units: ms.length,
      revenue: ms.reduce((s, v) => s + (v.salePrice ?? v.price), 0),
      gross: ms.reduce((s, v) => s + grossOf(v), 0),
      target: perMonth,
      leads: leads.filter((l) => monthKey(l.createdAt) === month).length,
    };
  });

  const funnel = FUNNEL_STAGES.map((stage) => {
    const count = leads.filter((l) => reachedStage(l, stage)).length;
    return { stage, count, pctOfLeads: ratio(count, leads.length) };
  });

  const group = <K extends string>(items: Vehicle[], key: (v: Vehicle) => K) => {
    const m = new Map<K, Vehicle[]>();
    for (const v of items) m.set(key(v), [...(m.get(key(v)) ?? []), v]);
    return m;
  };

  const byMake = [...group(sold, (v) => v.make)]
    .map(([name, vs]) => ({ name, units: vs.length, gross: vs.reduce((s, v) => s + grossOf(v), 0) }))
    .sort((a, b) => b.units - a.units || b.gross - a.gross)
    .slice(0, 8);

  const byBody = [...group(sold, (v) => v.bodyType)]
    .map(([name, vs]) => ({ name, units: vs.length, revenue: vs.reduce((s, v) => s + (v.salePrice ?? v.price), 0) }))
    .sort((a, b) => b.units - a.units);

  const sources = LEAD_SOURCES.map((source) => {
    const ls = leads.filter((l) => l.source === source);
    const wonCount = ls.filter((l) => l.stage === "Won").length;
    const rt = ls.map((l) => l.firstResponseMinutes).filter((m): m is number => m !== undefined);
    return { source, leads: ls.length, won: wonCount, conversion: ratio(wonCount, ls.length), avgResponseMinutes: avg(rt) };
  }).sort((a, b) => b.leads - a.leads);

  const salespeople = SALESPEOPLE.filter((s) => branchOk(s.branchId, f))
    .map((s) => {
      const vs = sold.filter((v) => v.salespersonId === s.id);
      const g = vs.reduce((sum, v) => sum + grossOf(v), 0);
      return {
        id: s.id,
        name: s.name,
        units: vs.length,
        revenue: vs.reduce((sum, v) => sum + (v.salePrice ?? v.price), 0),
        gross: g,
        avgGross: ratio(g, vs.length),
      };
    })
    .sort((a, b) => b.units - a.units || b.gross - a.gross);

  return {
    kpis: {
      unitsSold: sold.length,
      revenue,
      grossProfit: gross,
      avgGrossPerUnit: ratio(gross, sold.length),
      grossMargin: ratio(gross, revenue),
      avgDaysToSell: avg(sold.map((v) => daysBetween(v.acquiredDate, v.soldDate!))),
      leads: leads.length,
      wonLeads: won.length,
      conversionRate: ratio(won.length, leads.length),
      avgResponseMinutes: avg(responseTimes),
      unansweredLeads: leads.filter((l) => l.stage === "New" && l.firstResponseMinutes === undefined).length,
      targetUnits,
      targetAttainment: ratio(sold.length, targetUnits),
    },
    stock: {
      count: stockNow.length,
      value: stockNow.reduce((s, v) => s + v.cost, 0),
      retailValue: stockNow.reduce((s, v) => s + v.price, 0),
      avgDaysInStock: avg(stockNow.map((v) => v.daysInStock)),
      over90: stockNow.filter((v) => v.daysInStock > 90).length,
    },
    monthly,
    aging,
    funnel,
    byMake,
    byBody,
    sources,
    salespeople,
    oldestStock: [...stockNow].sort((a, b) => b.daysInStock - a.daysInStock).slice(0, 8),
  };
}

/** Sanity helper used by tests and the UI to keep a filter's dates ordered. */
export function normaliseFilter(f: AnalyticsFilter): AnalyticsFilter {
  return parseDay(f.from) <= parseDay(f.to) ? f : { ...f, from: f.to, to: f.from };
}
