import { SITE } from "../config";

const money = new Intl.NumberFormat(SITE.locale, {
  style: "currency",
  currency: SITE.currency,
  maximumFractionDigits: 0,
});

const compactMoney = new Intl.NumberFormat(SITE.locale, {
  style: "currency",
  currency: SITE.currency,
  notation: "compact",
  maximumFractionDigits: 1,
});

const num = new Intl.NumberFormat(SITE.locale, { maximumFractionDigits: 0 });

export const fmtMoney = (n: number) => money.format(Number.isFinite(n) ? n : 0);
export const fmtMoneyCompact = (n: number) => compactMoney.format(Number.isFinite(n) ? n : 0);
export const fmtNumber = (n: number) => num.format(Number.isFinite(n) ? n : 0);
export const fmtPercent = (ratio: number, digits = 1) =>
  `${(Number.isFinite(ratio) ? ratio * 100 : 0).toFixed(digits)}%`;

export function fmtDate(isoDay: string): string {
  const d = new Date(isoDay.length === 10 ? `${isoDay}T00:00:00Z` : isoDay);
  return d.toLocaleDateString(SITE.locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: isoDay.length === 10 ? "UTC" : undefined,
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
