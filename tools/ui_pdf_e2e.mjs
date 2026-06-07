import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const report = JSON.parse(fs.readFileSync(new URL("../mssi_operational_e2e_report.json", import.meta.url), "utf8"));
const appUrl = (process.env.MSSI_APP_URL || report.app_url || "http://127.0.0.1:4173/").replace(/\/$/, "");
const adminPassword = process.env.MSSI_ADMIN_PASSWORD;
const outDir = path.resolve("e2e-artifacts", `ui-pdf-${Date.now()}`);
fs.mkdirSync(outDir, { recursive: true });

if (!adminPassword) {
  throw new Error("MSSI_ADMIN_PASSWORD 환경변수가 필요합니다.");
}

const firstPatient = report.patients[0];
const checks = [];

function check(name, ok, detail = {}) {
  checks.push({ name, ok, ...detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail).slice(0, 500)}`);
  if (!ok) process.exitCode = 1;
}

async function waitText(page, text, timeout = 15000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}

async function downloadFromButton(page, locator, label) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    locator.click(),
  ]);
  const suggested = download.suggestedFilename();
  const target = path.join(outDir, `${label}-${suggested}`.replace(/[^\w가-힣.-]+/g, "_"));
  await download.saveAs(target);
  const stat = fs.statSync(target);
  check(`${label}_pdf_downloaded`, stat.size > 20_000, { path: target, bytes: stat.size });
  return target;
}

const browser = await chromium.launch({ headless: true });

async function newPage() {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  return { context, page };
}

try {
  {
  const { context, page } = await newPage();
  await page.goto(`${appUrl}/login.html?role=doctor`, { waitUntil: "domcontentloaded" });
  await page.fill("#d_id", report.doctor.username);
  await page.fill("#d_pw", report.doctor.password);
  await page.click("#btnLogin");
  await page.waitForURL(/doctor\.html/, { timeout: 30000 });
  await page.fill("#searchPNum", firstPatient.patient_number);
  await page.click("#btnSearchPatient");
  await waitText(page, "기분장애 임상평가 결과지");
  await waitText(page, firstPatient.patient_number);
  await page.screenshot({ path: path.join(outDir, "doctor-result.png"), fullPage: true });
  check("doctor_ui_result_visible", true, { patient_number: firstPatient.patient_number });
  await downloadFromButton(page, page.locator(".btn-dr-pdf").first(), "doctor");
  await context.close();
  }

  {
  const { context, page } = await newPage();
  await page.goto(`${appUrl}/login.html?role=patient`, { waitUntil: "domcontentloaded" });
  await page.fill("#p_id", firstPatient.username);
  await page.fill("#p_pw", firstPatient.password);
  await page.click("#btnLogin");
  await page.waitForURL(/respondent\.html/, { timeout: 30000 });
  await page.click("#btnViewMyResult");
  await waitText(page, "기분장애 임상평가 결과지");
  await page.screenshot({ path: path.join(outDir, "patient-result.png"), fullPage: true });
  check("patient_ui_result_visible", true, { patient_number: firstPatient.patient_number });
  await downloadFromButton(page, page.locator("#btnDownloadPdf"), "patient");
  await context.close();
  }

  {
  const { context, page } = await newPage();
  await page.goto(`${appUrl}/admin.html`, { waitUntil: "domcontentloaded" });
  if (await page.locator("#a_email").isVisible().catch(() => false)) {
    await page.fill("#a_email", "snumood@gmail.com");
    await page.fill("#a_pw", adminPassword);
    await page.click("#btnLogin");
  }
  await page.waitForSelector("#view-admin", { state: "visible", timeout: 30000 });
  await page.fill("#adminSearchHCode", report.doctor.hospital_code);
  await page.fill("#adminSearchPNum", firstPatient.patient_number);
  await page.click("#btnAdminSearchResult");
  await waitText(page, "기분장애 임상평가 결과지");
  await waitText(page, firstPatient.patient_number);
  await page.screenshot({ path: path.join(outDir, "admin-result.png"), fullPage: true });
  check("admin_ui_result_visible", true, { patient_number: firstPatient.patient_number });
  await downloadFromButton(page, page.locator(".btn-admin-pdf").first(), "admin");
  await context.close();
  }
} catch (error) {
  check("ui_pdf_flow", false, { error: String(error) });
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(outDir, "ui_pdf_checks.json"), JSON.stringify({ appUrl, outDir, checks }, null, 2));
console.log("ARTIFACT_DIR", outDir);
