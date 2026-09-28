// End-to-end smoke test: builds nothing, expects `npm run build` first.
// Serves dist/ with `vite preview`, drives it in Chromium and saves screenshots.
//   npm run build && npm run smoke
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = "test-results/screenshots";
const executablePath =
  process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

mkdirSync(SHOTS, { recursive: true });
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "pipe" });
const stop = () => server.kill("SIGTERM");

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("preview server did not start");
}

let failures = 0;
let activePage = null;
function check(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.log(`  ✗ ${msg}`);
  }
}

try {
  await waitForServer();
  const browser = await chromium.launch({ executablePath });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(`pageerror: ${e.message}`);
    console.log(`  ! page error: ${e.message}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(`console: ${m.text()}`);
      console.log(`  ! console error: ${m.text()}`);
    }
  });
  activePage = page;

  console.log("Home");
  await page.goto(BASE);
  await page.waitForSelector(".vcard");
  check((await page.locator(".vcard").count()) >= 3, "featured cars render");
  await page.screenshot({ path: `${SHOTS}/home.png`, fullPage: false });

  console.log("Inventory");
  await page.getByRole("link", { name: /View all \d+ cars/ }).click();
  await page.waitForURL(/#\/inventory/);
  await page.waitForSelector(".filters");
  const total = await page.locator(".vcard").count();
  check(total > 0, `inventory shows cars (${total} on first page)`);
  await page.selectOption("label:has-text('Body type') select", "SUV");
  await page.waitForTimeout(150);
  const bodyBadges = await page.locator(".vcard .vcard-title").allTextContents();
  check(page.url().includes("body=SUV"), "filter is reflected in the URL");
  const search = page.locator("input[type=search]");
  await search.pressSequentially("toyota ", { delay: 15 });
  check((await search.inputValue()) === "toyota ", "fast typing keeps every keystroke (incl. trailing space)");
  await search.fill("");
  await page.selectOption("label:has-text('Body type') select", "");
  await page.fill("label:has-text('Max price') input", "1");
  await page.waitForSelector("text=No cars match those filters");
  check(true, "empty state appears for impossible filters");
  await page.click("text=Clear all filters");
  await page.waitForSelector(".vcard");
  check((await page.locator("label:has-text('Max price') input").inputValue()) === "", "clear resets the price box");
  void bodyBadges;

  console.log("Vehicle detail + enquiry");
  await page.locator(".vcard").first().click();
  await page.waitForSelector(".price-box");
  await page.screenshot({ path: `${SHOTS}/vehicle.png` });
  await page.click("button:has-text('Send enquiry')");
  check(await page.locator(".field-error").first().isVisible(), "empty enquiry shows validation errors");
  await page.click("role=tab[name='Book test drive']");
  await page.fill("label:has-text('Full name') input", "Smoke Tester");
  await page.fill("label:has-text('Email') input", "smoke@example.com");
  await page.click("button:has-text('Request test drive')");
  await page.waitForSelector("text=has been sent");
  check(true, "test-drive request submits");
  const monthly = await page.locator(".calc-result strong").textContent();
  await page.selectOption("label:has-text('Term') select", "24");
  const monthly24 = await page.locator(".calc-result strong").textContent();
  check(monthly !== monthly24, `finance calculator updates (${monthly} → ${monthly24})`);

  console.log("Admin dashboard");
  await page.goto(`${BASE}#/admin`);
  await page.waitForSelector(".recharts-surface");
  check((await page.locator(".kpi").count()) === 8, "8 KPI tiles");
  check((await page.locator(".recharts-surface").count()) >= 5, "charts render");
  const kpiText = (await page.locator(".kpi-value").allTextContents()).join(" ");
  check(!/NaN|undefined|Infinity/.test(kpiText), `KPI values are clean: ${kpiText}`);
  await page.waitForTimeout(1600); // let bar animations finish before the screenshot
  await page.screenshot({ path: `${SHOTS}/dashboard.png`, fullPage: true });
  await page.selectOption("label:has-text('Period') select", "month");
  await page.selectOption("label:has-text('Branch') select", { index: 2 });
  await page.waitForTimeout(200);
  const kpiText2 = (await page.locator(".kpi-value").allTextContents()).join(" ");
  check(kpiText2 !== kpiText && !/NaN|undefined/.test(kpiText2), "filters change the numbers");
  await page.locator(".chart-card button:has-text('Table')").first().click();
  check((await page.locator(".chart-card table").count()) >= 4, "chart table view toggles");

  console.log("Leads");
  await page.goto(`${BASE}#/admin/leads`);
  await page.waitForSelector(".board");
  const card = page.locator(".lead-card", { hasText: "Smoke Tester" });
  check((await card.count()) === 1, "website lead appears in the pipeline");
  check(await card.locator("text=waiting").isVisible(), "new lead shows waiting badge");
  await card.locator("select[aria-label=Stage]").selectOption("Contacted");
  await page.waitForTimeout(100);
  const moved = page.locator(".board-col[aria-label='Contacted leads'] .lead-card", { hasText: "Smoke Tester" });
  check((await moved.count()) === 1, "lead moves to Contacted");
  check(await moved.locator("text=Replied in").isVisible(), "first-response time recorded");
  await page.screenshot({ path: `${SHOTS}/leads.png` });

  console.log("Admin inventory");
  await page.goto(`${BASE}#/admin/inventory`);
  await page.waitForSelector("table");
  const before = await page.locator("tbody tr").count();
  await page.locator("button:has-text('Mark sold')").first().click();
  await page.waitForSelector("text=Record sale");
  await page.click("button:has-text('Save sale')");
  await page.waitForTimeout(100);
  check((await page.locator("tbody tr").count()) === before - 1, "sold car leaves the in-stock list");

  await page.click("text=+ Add vehicle");
  await page.click("button:has-text('Add to inventory')");
  check(await page.locator("text=Please fix the highlighted fields").isVisible(), "vehicle form validates");
  await page.fill("label:has-text('Make') input", "Honda");
  await page.fill("label:has-text('Model') input", "Civic Smoke");
  await page.fill("label:has-text('Mileage') input", "12000");
  await page.fill("label:has-text('Advertised price') input", "21990");
  await page.fill("label:has-text('Acquisition cost') input", "19000");
  await page.click("button:has-text('Add to inventory')");
  await page.waitForSelector("text=Saved.");
  check(page.url().includes("/admin/inventory/v-"), "new vehicle saved and opened for editing");
  await page.goto(`${BASE}#/inventory?q=civic%20smoke`);
  await page.waitForSelector(".vcard");
  check((await page.locator(".vcard").count()) === 1, "new vehicle is live on the public inventory");

  console.log("Persistence");
  await page.reload();
  await page.waitForSelector(".vcard");
  check((await page.locator(".vcard").count()) === 1, "data survives a reload (localStorage)");

  console.log("Export");
  await page.goto(`${BASE}#/admin/export`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("button:has-text('Download CSV')").nth(4).click()]);
  check(dl.suggestedFilename() === "FactSales.csv", `CSV download (${dl.suggestedFilename()})`);
  const csvHead = (await (await import("node:fs/promises")).readFile(await dl.path(), "utf8")).split("\r\n")[0];
  check(csvHead.startsWith("VehicleID,SoldDate"), "CSV has the expected header");
  const [backup] = await Promise.all([page.waitForEvent("download"), page.click("button:has-text('Download backup')")]);
  const backupPath = `${SHOTS}/backup.json`;
  await backup.saveAs(backupPath);
  await page.locator("input[type=file]").setInputFiles(backupPath);
  await page.waitForSelector("text=Restored");
  check(true, "backup downloads and restores");
  await page.locator("input[type=file]").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"vehicles":[{}],"leads":[]}') });
  await page.waitForSelector("text=isn't a showroom backup");
  check(true, "invalid backup is rejected");

  console.log("Mobile + dark mode");
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const m = await mobile.newPage();
  m.on("pageerror", (e) => errors.push(`mobile pageerror: ${e.message}`));
  for (const route of ["", "#/inventory", "#/admin"]) {
    await m.goto(`${BASE}${route}`);
    await m.waitForTimeout(400);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `no horizontal scroll on phone at "${route || "/"}" (overflow ${overflow}px)`);
    if (route !== "#/admin") {
      const navH = await m.evaluate(() => document.querySelector(".nav")?.getBoundingClientRect().height ?? 0);
      check(navH <= 44, `header nav fits on one line on phone (${Math.round(navH)}px)`);
    }
  }
  await m.goto(BASE);
  await m.waitForSelector(".vcard");
  await m.screenshot({ path: `${SHOTS}/mobile-home-dark.png` });
  await m.goto(`${BASE}#/admin`);
  await m.waitForSelector(".recharts-surface");
  await m.waitForTimeout(1600);
  await m.screenshot({ path: `${SHOTS}/mobile-dashboard-dark.png` });

  const dark = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: "dark" });
  const dp = await dark.newPage();
  await dp.goto(`${BASE}#/admin`);
  await dp.waitForSelector(".recharts-surface");
  await dp.waitForTimeout(1600);
  await dp.screenshot({ path: `${SHOTS}/dashboard-dark.png` });

  check(errors.length === 0, `no console/page errors${errors.length ? `:\n    ${errors.join("\n    ")}` : ""}`);
  await browser.close();
} catch (e) {
  failures++;
  console.error(e);
  if (activePage) {
    console.error(`URL at failure: ${activePage.url()}`);
    const text = await activePage.evaluate(() => document.body.innerText.slice(0, 600)).catch(() => "(unavailable)");
    console.error(`Page text at failure:\n${text}`);
    await activePage.screenshot({ path: `${SHOTS}/failure.png`, fullPage: true }).catch(() => {});
  }
} finally {
  stop();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
process.exit(failures ? 1 : 0);
