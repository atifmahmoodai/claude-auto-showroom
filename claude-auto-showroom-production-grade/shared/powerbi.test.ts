import { describe, expect, it } from "vitest";
import { DEMO_ORG } from "./demo-org";
import { generateDemoData } from "./generate";
import { buildPowerBiTables, csvCell, toCsv } from "./powerbi";

describe("csvCell", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('He said "hi", then left')).toBe('"He said ""hi"", then left"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("plain")).toBe("plain");
  });
  it("neutralises spreadsheet formulas but keeps numbers numeric", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell("+123")).toBe("'+123");
    expect(csvCell(-500)).toBe("-500");
  });
  it("writes blanks for missing values and 1/0 for booleans", () => {
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(null)).toBe("");
    expect(csvCell(NaN)).toBe("");
    expect(csvCell(true)).toBe("1");
    expect(csvCell(false)).toBe("0");
  });
});

describe("buildPowerBiTables", () => {
  const today = "2026-09-28";
  const data = generateDemoData(today);
  const tables = Object.fromEntries(buildPowerBiTables(data, today, DEMO_ORG).map((t) => [t.name, t]));

  it("keeps every row the same width as its header", () => {
    for (const t of Object.values(tables)) {
      for (const r of t.rows) expect(r.length, t.name).toBe(t.columns.length);
      expect(toCsv(t).split("\r\n")[0]).toBe(t.columns.join(","));
    }
  });

  it("has referential integrity for the model relationships", () => {
    const vehicleIds = new Set(tables.DimVehicle.rows.map((r) => r[0]));
    const dates = new Set(tables.DimDate.rows.map((r) => r[0]));
    for (const r of tables.FactSales.rows) {
      expect(vehicleIds.has(r[0])).toBe(true);
      expect(dates.has(r[1])).toBe(true);
    }
    for (const r of tables.FactLeads.rows) expect(dates.has(r[1])).toBe(true);
    for (const r of tables.FactTargets.rows) expect(dates.has(r[0])).toBe(true);
    expect(new Set(tables.DimDate.rows.map((r) => r[0])).size).toBe(tables.DimDate.rows.length);
  });

  it("never exports customer contact details", () => {
    const csv = toCsv(tables.FactLeads);
    expect(csv).not.toMatch(/@example\.com/);
    expect(tables.FactLeads.columns).not.toContain("Email");
  });
});
