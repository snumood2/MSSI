import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const report = JSON.parse(fs.readFileSync(new URL("../mssi_operational_e2e_report.json", import.meta.url), "utf8"));
const appUrl = (process.env.MSSI_APP_URL || report.app_url || "http://127.0.0.1:4173/").replace(/\/$/, "");
const adminEmail = process.env.MSSI_ADMIN_EMAIL || "snumood@gmail.com";
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

function visualCheckPng(pngPath) {
  const out = execFileSync("/usr/bin/sips", ["-g", "pixelWidth", "-g", "pixelHeight", pngPath], { encoding: "utf8" });
  const width = Number(out.match(/pixelWidth:\s*(\d+)/)?.[1] || 0);
  const height = Number(out.match(/pixelHeight:\s*(\d+)/)?.[1] || 0);
  const bytes = fs.statSync(pngPath).size;
  const bounds = JSON.parse(execFileSync("python3", ["-c", `
import json, sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGB")
w, h = img.size
min_x, min_y, max_x, max_y = w, h, -1, -1
sample_step = 2
for y in range(0, h, sample_step):
    for x in range(0, w, sample_step):
        r, g, b = img.getpixel((x, y))
        if abs(r - 255) + abs(g - 255) + abs(b - 255) > 45:
            min_x = min(min_x, x)
            min_y = min(min_y, y)
            max_x = max(max_x, x)
            max_y = max(max_y, y)
if max_x < 0:
    print(json.dumps({"hasContent": False}))
else:
    print(json.dumps({
        "hasContent": True,
        "minX": min_x,
        "minY": min_y,
        "maxX": max_x,
        "maxY": max_y,
        "contentWidth": max_x - min_x + 1,
        "contentHeight": max_y - min_y + 1,
    }))
`, pngPath], { encoding: "utf8" }));
  const layoutOk = bounds.hasContent && bounds.minX <= 180 && bounds.maxX >= width - 260 && bounds.contentWidth >= 500;
  return { width, height, bytes, ...bounds, ok: width >= 700 && height >= 900 && bytes > 50_000 && layoutOk };
}

async function waitText(page, text, timeout = 15000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}

async function debugShot(page, label) {
  await page.screenshot({ path: path.join(outDir, `${label}-debug.png`), fullPage: true }).catch(() => {});
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
  try {
    const pngPrefix = path.join(outDir, `${label}-pdf-page1`);
    execFileSync("/opt/homebrew/bin/pdftoppm", ["-png", "-f", "1", "-singlefile", target, pngPrefix]);
    const pngPath = `${pngPrefix}.png`;
    const visual = visualCheckPng(pngPath);
    check(`${label}_pdf_visual_rendered`, visual.ok, { path: pngPath, ...visual });
  } catch (error) {
    check(`${label}_pdf_visual_rendered`, false, { error: String(error).slice(0, 300) });
  }
  return target;
}

const browser = await chromium.launch({ headless: true });

async function newPage() {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1100 } });
  await context.addInitScript((email) => {
    window.__ENV__ = { ...(window.__ENV__ || {}), ADMIN_EMAIL: email };
  }, adminEmail);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  return { context, page };
}

try {
  {
  const { context, page } = await newPage();
  await page.goto(`${appUrl}/login.html?role=doctor`, { waitUntil: "domcontentloaded" });
  await page.locator("#form-doctor").waitFor({ state: "visible", timeout: 30000 }).catch(async (error) => {
    await debugShot(page, "doctor-login");
    throw error;
  });
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
  await page.locator("#form-patient").waitFor({ state: "visible", timeout: 30000 }).catch(async (error) => {
    await debugShot(page, "patient-login");
    throw error;
  });
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
    await page.fill("#a_email", adminEmail);
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
