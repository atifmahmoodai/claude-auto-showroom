// Writes the Power BI star-schema CSVs to powerbi/data/.
//   npm run export:powerbi                    -> demo data ending today
//   npm run export:powerbi -- --date 2026-09-28
//   npm run export:powerbi -- --from backup.json   (a backup downloaded from the app)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateDemoData } from "../src/data/generate";
import { todayLocal } from "../src/lib/dates";
import { buildPowerBiTables, toCsv } from "../src/lib/powerbi";
import type { ShowroomData } from "../src/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const date = arg("date") ?? todayLocal();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(`--date must be YYYY-MM-DD, got "${date}"`);
  process.exit(1);
}

let data: ShowroomData;
const from = arg("from");
if (from) {
  const parsed = JSON.parse(readFileSync(from, "utf8")) as ShowroomData;
  if (!Array.isArray(parsed.vehicles) || !Array.isArray(parsed.leads)) {
    console.error(`${from} is not a showroom backup (expected { vehicles: [], leads: [] })`);
    process.exit(1);
  }
  data = parsed;
} else {
  data = generateDemoData(date);
}

const outDir = join(process.cwd(), "powerbi", "data");
mkdirSync(outDir, { recursive: true });
for (const t of buildPowerBiTables(data, date)) {
  writeFileSync(join(outDir, `${t.name}.csv`), toCsv(t), "utf8");
  console.log(`${t.name.padEnd(22)} ${String(t.rows.length).padStart(6)} rows`);
}
console.log(`\nWrote CSVs to ${outDir} (as of ${date})`);
