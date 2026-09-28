import { BRANCHES, SALESPEOPLE } from "../config";
import type { ShowroomData } from "../types";
import { addDays, daysBetween, monthRange } from "./dates";

type Cell = string | number | boolean | null | undefined;

export interface Table {
  name: string;
  description: string;
  columns: string[];
  rows: Cell[][];
}

/**
 * Quotes a CSV cell. Text that starts with = + - @ is prefixed with ' so
 * spreadsheet apps don't execute it as a formula (CSV injection).
 */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "1" : "0";
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(t: Table): string {
  return [t.columns.join(","), ...t.rows.map((r) => r.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Star-schema tables for Power BI (or Excel / Tableau / Looker Studio).
 * Customer names, emails and phone numbers are deliberately left out.
 */
export function buildPowerBiTables(data: ShowroomData, asOf: string): Table[] {
  const { vehicles, leads } = data;
  const allDates = [
    ...vehicles.map((v) => v.acquiredDate),
    ...leads.map((l) => l.createdAt.slice(0, 10)),
    asOf,
  ].sort();
  const firstDay = `${allDates[0].slice(0, 4)}-01-01`;
  const lastDay = `${asOf.slice(0, 4)}-12-31`;

  const dateRows: Cell[][] = [];
  for (let d = firstDay; d <= lastDay; d = addDays(d, 1)) {
    const [y, m] = d.split("-").map(Number);
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    dateRows.push([d, y, `Q${Math.ceil(m / 3)}`, m, MONTHS[m - 1], `${y}-${String(m).padStart(2, "0")}`, dow === 0 ? 7 : dow, DAYS[dow], dow === 0 || dow === 6]);
  }

  const targetRows: Cell[][] = [];
  for (const month of monthRange(firstDay, asOf)) {
    for (const b of BRANCHES) targetRows.push([`${month}-01`, b.id, b.monthlyTarget]);
  }

  const reached = (stages: string[], s: string) => stages.includes(s);

  return [
    {
      name: "DimDate",
      description: "One row per calendar day. Mark as the date table in Power BI.",
      columns: ["Date", "Year", "Quarter", "MonthNumber", "MonthName", "YearMonth", "DayOfWeekNumber", "DayOfWeekName", "IsWeekend"],
      rows: dateRows,
    },
    {
      name: "DimBranch",
      description: "Showrooms / rooftops.",
      columns: ["BranchID", "BranchName", "City", "MonthlyTargetUnits"],
      rows: BRANCHES.map((b) => [b.id, b.name, b.city, b.monthlyTarget]),
    },
    {
      name: "DimSalesperson",
      description: "Sales staff and their home branch.",
      columns: ["SalespersonID", "SalespersonName", "BranchID"],
      rows: SALESPEOPLE.map((s) => [s.id, s.name, s.branchId]),
    },
    {
      name: "DimVehicle",
      description: "Every vehicle that has been in stock, sold or not.",
      columns: [
        "VehicleID", "StockNo", "VIN", "Make", "Model", "Trim", "ModelYear", "BodyType", "Fuel", "Transmission",
        "Condition", "Mileage", "Colour", "ListPrice", "Cost", "BranchID", "Status", "AcquiredDate", "SoldDate", "DaysInStock",
      ],
      rows: vehicles.map((v) => [
        v.id, v.stockNo, v.vin, v.make, v.model, v.trim, v.year, v.bodyType, v.fuel, v.transmission,
        v.condition, v.mileage, v.color, v.price, v.cost, v.branchId, v.status, v.acquiredDate, v.soldDate,
        daysBetween(v.acquiredDate, v.soldDate ?? asOf),
      ]),
    },
    {
      name: "FactSales",
      description: "One row per retail sale.",
      columns: ["VehicleID", "SoldDate", "BranchID", "SalespersonID", "SalePrice", "Cost", "GrossProfit", "DaysToSell"],
      rows: vehicles
        .filter((v) => v.status === "Sold" && v.soldDate)
        .map((v) => {
          const sale = v.salePrice ?? v.price;
          return [v.id, v.soldDate, v.branchId, v.salespersonId, sale, v.cost, sale - v.cost, daysBetween(v.acquiredDate, v.soldDate!)];
        }),
    },
    {
      name: "FactLeads",
      description: "One row per customer lead with funnel flags (no personal data).",
      columns: [
        "LeadID", "CreatedDate", "CreatedAt", "Source", "LeadType", "CurrentStage", "BranchID", "SalespersonID", "VehicleID",
        "FirstResponseMinutes", "ReachedContacted", "ReachedTestDrive", "ReachedNegotiation", "IsWon", "IsLost", "IsOpen", "ClosedDate",
      ],
      rows: leads.map((l) => {
        const stages = l.stageHistory.map((e) => e.stage);
        const closed = l.stage === "Won" || l.stage === "Lost";
        return [
          l.id, l.createdAt.slice(0, 10), l.createdAt, l.source, l.type, l.stage, l.branchId, l.salespersonId, l.vehicleId,
          l.firstResponseMinutes, reached(stages, "Contacted"), reached(stages, "Test Drive"), reached(stages, "Negotiation"),
          l.stage === "Won", l.stage === "Lost", !closed, closed ? l.stageHistory[l.stageHistory.length - 1].at.slice(0, 10) : null,
        ];
      }),
    },
    {
      name: "FactLeadStageHistory",
      description: "Every stage change, for time-in-stage analysis.",
      columns: ["LeadID", "Stage", "ChangedAt", "ChangedDate"],
      rows: leads.flatMap((l) => l.stageHistory.map((e) => [l.id, e.stage, e.at, e.at.slice(0, 10)])),
    },
    {
      name: "FactTargets",
      description: "Monthly unit targets per branch.",
      columns: ["MonthStart", "BranchID", "TargetUnits"],
      rows: targetRows,
    },
  ];
}
