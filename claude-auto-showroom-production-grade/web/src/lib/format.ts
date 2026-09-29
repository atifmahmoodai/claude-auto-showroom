import { SITE } from "../config";

// Formatters follow the dealership's currency and locale, which load from the server;
// they're rebuilt only when those settings change.
let cacheKey = "";
let money: Intl.NumberFormat;
let compactMoney: Intl.NumberFormat;
let num: Intl.NumberFormat;

function fmts() {
  const key = `${SITE.locale}|${SITE.currency}`;
  if (key !== cacheKey) {
    cacheKey = key;
    money = new Intl.NumberFormat(SITE.locale, { style: "currency", currency: SITE.currency, maximumFractionDigits: 0 });
    compactMoney = new Intl.NumberFormat(SITE.locale, { style: "currency", currency: SITE.currency, notation: "compact", maximumFractionDigits: 1 });
    num = new Intl.NumberFormat(SITE.locale, { maximumFractionDigits: 0 });
  }
  return { money, compactMoney, num };
}

export const fmtMoney = (n: number) => fmts().money.format(Number.isFinite(n) ? n : 0);
export const fmtMoneyCompact = (n: number) => fmts().compactMoney.format(Number.isFinite(n) ? n : 0);
export const fmtNumber = (n: number) => fmts().num.format(Number.isFinite(n) ? n : 0);
export const fmtPercent = (ratio: number, digits = 1) => `${(Number.isFinite(ratio) ? ratio * 100 : 0).toFixed(digits)}%`;

export function fmtDate(isoDay: string, withTime = false): string {
  const day = isoDay.length === 10;
  const d = new Date(day ? `${isoDay}T00:00:00Z` : isoDay);
  return d.toLocaleString(SITE.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime && !day ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: day ? "UTC" : undefined,
  });
}

export function fmtMinutes(mins: number): string {
  if (!Number.isFinite(mins)) return "—";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = mins / 60;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

export function vehicleTitle(v: { year: number; make: string; model: string }): string {
  return `${v.year} ${v.make} ${v.model}`;
}
