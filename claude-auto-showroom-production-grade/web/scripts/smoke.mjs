// End-to-end smoke test of the whole production stack: a fresh PostgreSQL database with
// demo data, the built API server serving the built web app, driven in Chromium.
//   npm run build && npm run smoke        (from the project root)
// Uses SMOKE_DATABASE_URL (default postgres://postgres:postgres@localhost:5432/showroom_smoke).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { chromium } from "playwright-core";

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = "test-results/screenshots";
const DB_URL = process.env.SMOKE_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/showroom_smoke";
const executablePath = process.env.CHROMIUM_PATH || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

mkdirSync(SHOTS, { recursive: true });
if (!existsSync("../server/dist/server.js") || !existsSync("dist/index.html")) throw new Error("Build first: npm run build (from the project root)");

// Fresh database with demo data.
{
  const name = new URL(DB_URL).pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name) || !name.includes("smoke")) throw new Error("SMOKE_DATABASE_URL must name a database containing 'smoke'");
  const adminUrl = new URL(DB_URL);
  adminUrl.pathname = "/postgres";
  const c = new pg.Client({ connectionString: adminUrl.toString() });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await c.query(`CREATE DATABASE ${name}`);
  await c.end();
}
const env = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: DB_URL,
  PORT: String(PORT),
  PUBLIC_URL: BASE,
  COOKIE_SECURE: "false",
  WEB_DIST: join(process.cwd(), "dist"),
  UPLOAD_DIR: mkdtempSync(join(tmpdir(), "smoke-uploads-")),
  LOG_LEVEL: "warn",
  ALLOW_DEMO_SEED: "1",
};
const seeded = spawnSync("node", ["../server/dist/cli/seed-demo.js"], { env, encoding: "utf8" });
if (seeded.status !== 0) throw new Error(`demo seed failed: ${seeded.stderr}`);
const server = spawn("node", ["../server/dist/server.js"], { env, stdio: ["ignore", "inherit", "inherit"] });
const stop = () => server.kill("SIGTERM");

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${BASE}readyz`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("server did not start");
}

// Newer Chromium returns a Promise from scrollTo(); emulate that on older builds so a
// regression (a React effect accidentally returning it) is caught on every browser.
async function emulatePromiseScroll(context) {
  await context.addInitScript(() => {
    const original = window.scrollTo.bind(window);
    window.scrollTo = (...args) => {
      const r = original(...args);
      return r instanceof Promise ? r : Promise.resolve();
    };
  });
}

async function signIn(page, email) {
  await page.goto(`${BASE}admin`);
  await page.waitForURL(/\/admin\/login/);
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", "demo-password-1");
  await page.click("button:has-text('Sign in')");
  await page.waitForSelector(".admin-side");
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
  await emulatePromiseScroll(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(`pageerror: ${e.message}`);
    console.log(`  ! page error: ${e.stack || e.message}`);
  });
  page.on("console", (m) => {
    // A deliberate wrong-password attempt logs a 401 resource error; that's expected.
    if (m.type() === "error" && !/status of 401/.test(m.text())) {
      errors.push(`console: ${m.text()}`);
      console.log(`  ! console error: ${m.text()}`);
    }
  });
  activePage = page;

  console.log("Home");
  await page.goto(BASE);
  await page.waitForSelector(".vcard");
  check((await page.locator(".vcard").count()) >= 3, "featured cars render from the API");
  await page.screenshot({ path: `${SHOTS}/home.png` });

  console.log("Inventory");
  await page.getByRole("link", { name: /View all \d+ cars/ }).click();
  await page.waitForURL(/\/inventory/);
  await page.waitForSelector(".filters");
  // Wait for the server's first page rather than counting whatever is on screen mid-load.
  await page.waitForFunction(() => document.querySelectorAll(".inventory-layout .vcard").length > 0);
  const total = await page.locator(".inventory-layout .vcard").count();
  check(total === 12, `inventory shows the first page (${total} cars)`);
  await page.click("button:has-text('Show more')");
  await page.waitForFunction(() => document.querySelectorAll(".vcard").length > 12);
  check(true, "Show more loads the next page from the server");
  await page.selectOption("label:has-text('Body type') select", "SUV");
  await page.waitForTimeout(400);
  check(page.url().includes("body=SUV"), "filter is reflected in the URL");
  const search = page.locator("input[type=search]");
  await search.pressSequentially("toyota ", { delay: 15 });
  check((await search.inputValue()) === "toyota ", "fast typing keeps every keystroke (incl. trailing space)");
  await search.fill("");
  await page.selectOption("label:has-text('Body type') select", "");
  await page.waitForTimeout(400);
  await page.fill("label:has-text('Max price') input", "1");
  await page.waitForSelector("text=No cars match those filters");
  check(true, "empty state appears for impossible filters");
  await page.click("text=Clear all filters");
  await page.waitForSelector(".vcard");
  check((await page.locator("label:has-text('Max price') input").inputValue()) === "", "clear resets the price box");

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
  check(true, "test-drive request is saved on the server");
  const monthly = await page.locator(".calc-result strong").textContent();
  await page.selectOption("label:has-text('Term') select", "24");
  const monthly24 = await page.locator(".calc-result strong").textContent();
  check(monthly !== monthly24, `finance calculator updates (${monthly} → ${monthly24})`);

  console.log("Sign in");
  await page.goto(`${BASE}admin`);
  await page.waitForURL(/\/admin\/login/);
  check(true, "admin redirects to the login page");
  await page.fill("input[type=email]", "manager@demo.local");
  await page.fill("input[type=password]", "wrong-password");
  await page.click("button:has-text('Sign in')");
  await page.waitForSelector("text=Email or password is incorrect");
  check(true, "wrong password is refused");
  await page.fill("input[type=password]", "demo-password-1");
  await page.click("button:has-text('Sign in')");
  await page.waitForSelector(".admin-side");

  console.log("Admin dashboard");
  await page.waitForSelector(".recharts-surface");
  check((await page.locator(".kpi").count()) === 8, "8 KPI tiles");
  check((await page.locator(".recharts-surface").count()) >= 5, "charts render");
  const kpiText = (await page.locator(".kpi-value").allTextContents()).join(" ");
  check(!/NaN|undefined|Infinity/.test(kpiText), `KPI values are clean: ${kpiText}`);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${SHOTS}/dashboard.png`, fullPage: true });
  await page.selectOption("label:has-text('Period') select", "month");
  await page.selectOption("label:has-text('Branch') select", { index: 2 });
  await page.waitForTimeout(1000);
  const kpiText2 = (await page.locator(".kpi-value").allTextContents()).join(" ");
  check(kpiText2 !== kpiText && !/NaN|undefined/.test(kpiText2), "filters change the numbers");
  await page.locator(".chart-card button:has-text('Table')").first().click();
  check((await page.locator(".chart-card table").count()) >= 4, "chart table view toggles");

  console.log("Leads");
  await page.goto(`${BASE}admin/leads`);
  await page.waitForSelector(".board");
  const card = page.locator(".lead-card", { hasText: "Smoke Tester" });
  await card.waitFor();
  check((await card.count()) === 1, "website lead appears in the pipeline");
  check(await card.locator("text=waiting").isVisible(), "new lead shows waiting badge");
  await card.locator("select[aria-label=Stage]").selectOption("Contacted");
  const moved = page.locator(".board-col[aria-label='Contacted leads'] .lead-card", { hasText: "Smoke Tester" });
  await moved.locator("text=Replied in").waitFor({ timeout: 5000 });
  check((await moved.count()) === 1, "lead moves to Contacted");
  check(await moved.locator("text=Replied in").isVisible(), "first-response time recorded by the server");
  await page.screenshot({ path: `${SHOTS}/leads.png` });

  console.log("Admin inventory");
  await page.goto(`${BASE}admin/inventory`);
  await page.waitForSelector("tbody tr");
  const before = await page.locator("tbody tr").count();
  const soldStock = await page.locator("tbody tr").first().locator("td").first().textContent();
  await page.locator("button:has-text('Mark sold')").first().click();
  await page.waitForSelector("text=Record sale");
  await page.click("button:has-text('Save sale')");
  await page.waitForSelector("text=Record sale", { state: "detached" });
  await page.waitForTimeout(800);
  const stockNos = await page.locator("tbody tr td:first-child").allTextContents();
  check(!stockNos.includes(soldStock) && stockNos.length === before - 1, "sold car leaves the in-stock list");
  await page.selectOption("select:has(option[value=Sold])", "Sold");
  await page.waitForTimeout(800);
  check((await page.locator("tbody tr").count()) > 0 && (await page.locator("tbody button:has-text('Delete')").count()) === 0, "sold cars (sales history) can't be deleted");
  await page.selectOption("select:has(option[value=Sold])", "stock");

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
  await page.fill("label:has-text('Advertised price') input", "21490");
  await page.click("button:has-text('Save changes')");
  await page.waitForSelector("text=Saved.");
  check(true, "an existing vehicle can be edited and saved again");
  await page.goto(`${BASE}inventory?q=civic%20smoke`);
  await page.waitForSelector(".vcard");
  check((await page.locator(".vcard").count()) === 1, "new vehicle is live on the public inventory");
  check((await page.locator(".vcard-price").textContent()).includes("21,490"), "edited price is live");

  console.log("Persistence");
  await page.reload();
  await page.waitForSelector(".vcard");
  check((await page.locator(".vcard").count()) === 1, "data survives a reload (stored in PostgreSQL)");
  const deep = await fetch(`${BASE}inventory?q=x`, { headers: { accept: "text/html" } });
  check(deep.ok && (await deep.text()).includes('id="root"'), "deep links load the app shell from the server");

  console.log("Export");
  await page.goto(`${BASE}admin/export`);
  await page.waitForSelector("a:has-text('Download CSV')");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("a:has-text('Download CSV')").nth(4).click()]);
  check(dl.suggestedFilename() === "FactSales.csv", `CSV download (${dl.suggestedFilename()})`);
  const csvHead = (await readFile(await dl.path(), "utf8")).split("\r\n")[0];
  check(csvHead.startsWith("VehicleID,SoldDate"), "CSV has the expected header");

  console.log("Roles");
  await page.goto(`${BASE}admin`);
  await page.click("button:has-text('Sign out')");
  await page.waitForURL(/\/admin\/login/);
  check(true, "sign out returns to the login page");
  await page.fill("input[type=email]", "maya@demo.local");
  await page.fill("input[type=password]", "demo-password-1");
  await page.click("button:has-text('Sign in')");
  await page.waitForURL(/\/admin\/leads/);
  check((await page.locator(".side-link:has-text('Dashboard')").count()) === 0, "sales staff don't get the dashboard");
  await page.goto(`${BASE}admin/inventory`);
  await page.waitForSelector("tbody tr");
  check((await page.locator("th:has-text('Cost')").count()) === 0, "sales staff don't see cost");

  console.log("Mobile + dark mode");
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await emulatePromiseScroll(mobile);
  const m = await mobile.newPage();
  m.on("pageerror", (e) => errors.push(`mobile pageerror: ${e.message}`));
  await signIn(m, "manager@demo.local");
  for (const route of ["", "inventory", "admin"]) {
    await m.goto(`${BASE}${route}`);
    await m.waitForTimeout(800);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (route === "inventory") {
      const left = await m.evaluate(() => document.querySelector(".vcard")?.getBoundingClientRect().left ?? -1);
      check(left >= 12, `content keeps a side margin on phone (${left}px)`);
    }
    check(overflow <= 0, `no horizontal scroll on phone at "/${route}" (overflow ${overflow}px)`);
    if (route !== "admin") {
      const navH = await m.evaluate(() => document.querySelector(".nav")?.getBoundingClientRect().height ?? 0);
      check(navH <= 44, `header nav fits on one line on phone (${Math.round(navH)}px)`);
    }
  }
  await m.goto(BASE);
  await m.waitForSelector(".vcard");
  await m.screenshot({ path: `${SHOTS}/mobile-home-dark.png` });
  await m.goto(`${BASE}admin`);
  await m.waitForSelector(".recharts-surface");
  await m.waitForTimeout(1600);
  await m.screenshot({ path: `${SHOTS}/mobile-dashboard-dark.png` });

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
