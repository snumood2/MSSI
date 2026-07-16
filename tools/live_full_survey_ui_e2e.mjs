import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const appUrl = (process.env.MSSI_APP_URL || "https://snumood2.github.io/MSSI").replace(/\/$/, "");
const tag = Date.now().toString().slice(-8);
const username = `research${tag}`;
const password = "MssiE2E!2026";
const patientNumber = `9${tag.slice(-7)}`;
const hospitalCode = "SNUBH01";
const outDir = path.resolve("e2e-artifacts", `researcher-ui-${Date.now()}`);
fs.mkdirSync(outDir, { recursive: true });

const config = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
const supabaseUrl = config.match(/SUPABASE_URL = ENV\.VITE_SUPABASE_URL \|\| "([^"]+)"/)?.[1];
const anonKey = config.match(/SUPABASE_ANON_KEY = ENV\.VITE_SUPABASE_ANON_KEY \|\| "([^"]+)"/)?.[1];
if (!supabaseUrl || !anonKey) throw new Error("Supabase configuration not found");

const checks = [];
const dialogs = [];
function check(name, ok, detail = {}) {
  checks.push({ name, ok, ...detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail)}`);
  if (!ok) process.exitCode = 1;
}

function radioChoice(name, values) {
  if (name === "pms_skip") return "0";
  if (name === "g1a" || name === "g2" || name === "g5") return "1";
  if (name === "g3a") return "0";
  if (/^ba\d+$/.test(name)) {
    const number = Number(name.slice(2));
    return values[(number * 5 + 1) % values.length];
  }
  if (/^spaq2_[0-5]$/.test(name)) {
    return ["2", "2", "2", "2", "2", "1"][Number(name.slice(-1))];
  }
  if (name === "spaq3") return "0";
  if (/^mssi\d+_yn$/.test(name)) return "1";
  if (/^mssi\d+_(freq|sev)$/.test(name)) return values[Math.floor(values.length / 2)];
  if (/^(d1a|e1|f1|n1a)$/.test(name)) return values.includes("0") ? "0" : values[0];
  if (name === "au1") return values.find((value) => value !== "0") || values[0];
  return values[Math.floor(values.length / 2)];
}

async function answerCurrentSection(page) {
  for (let pass = 0; pass < 1000; pass++) {
    const pms = page.locator('input[name="pms_skip"][value="0"]');
    if (await pms.count() && !(await pms.isChecked())) {
      await pms.dispatchEvent("click");
      await page.waitForTimeout(40);
      continue;
    }

    const numbers = page.locator('#surveyContainer input[type="number"]:visible');
    let filledNumber = false;
    for (let i = 0; i < await numbers.count(); i++) {
      const input = numbers.nth(i);
      if (!(await input.inputValue())) {
        await input.fill("7");
        await input.dispatchEvent("change");
        filledNumber = true;
      }
    }
    if (filledNumber) continue;

    const checkboxes = page.locator('#surveyContainer input[type="checkbox"]');
    const seenCheckboxNames = new Set();
    let clickedCheckbox = false;
    for (let i = 0; i < await checkboxes.count(); i++) {
      const input = checkboxes.nth(i);
      const name = await input.getAttribute("name");
      if (!name || seenCheckboxNames.has(name) || await input.isChecked()) continue;
      if (/_m\d+$/.test(name) && !name.endsWith("_m12")) continue;
      seenCheckboxNames.add(name);
      await input.dispatchEvent("click");
      clickedCheckbox = true;
    }
    if (clickedCheckbox) continue;

    const radios = page.locator('#surveyContainer input[type="radio"]');
    const names = await radios.evaluateAll((items) => [...new Set(items
      .filter((item) => item.closest("label")?.offsetParent !== null)
      .map((item) => item.name)
      .filter(Boolean))]);
    let clickedRadio = false;
    for (const name of names) {
      const group = page.locator(`#surveyContainer input[type="radio"][name="${name}"]`);
      if (await group.evaluateAll((items) => items.some((item) => item.checked))) continue;
      const values = await group.evaluateAll((items) => items.map((item) => item.value));
      const selected = radioChoice(name, values);
      const target = page.locator(`#surveyContainer input[type="radio"][name="${name}"][value="${selected}"]`).first();
      if (await target.count()) await target.dispatchEvent("click");
      else await group.nth(Math.floor(values.length / 2)).dispatchEvent("click");
      clickedRadio = true;
      await page.waitForTimeout(40);
      break;
    }
    if (!clickedRadio) return;
  }
  throw new Error("Section input loop exceeded safety limit");
}

async function loginToken() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${username}@patient.local`, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Supabase login failed: ${response.status}`);
  return data.access_token;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.on("dialog", async (dialog) => {
  dialogs.push({ type: dialog.type(), message: dialog.message() });
  await dialog.accept();
});

let sectionsCompleted = 0;
let totalSections = 0;
try {
  await page.goto(`${appUrl}/signup-patient-snubh01.html`, { waitUntil: "networkidle" });
  await page.fill("#s_id", username);
  await page.fill("#s_pw", password);
  await page.fill("#s_pw2", password);
  await page.fill("#s_dob", "1990-06");
  await page.fill("#s_pnum", patientNumber);
  await page.click("#btnSignup");
  await page.waitForURL(/(login-snubh01|respondent)\.html/, { timeout: 30000 });
  check("snubh_signup_ui", true, { username, patientNumber, hospitalCode });

  if (/login-snubh01\.html/.test(page.url())) {
    await page.fill("#p_id", username);
    await page.fill("#p_pw", password);
    await page.click("#btnLogin");
    await page.waitForURL(/respondent\.html/, { timeout: 30000 });
  }
  await page.locator("#btnStartSurvey").waitFor({ state: "visible" });
  await page.click("#btnStartSurvey");
  await page.locator("#view-survey.active").waitFor();

  for (let guard = 0; guard < 100; guard++) {
    const label = (await page.textContent("#surveyProgressLabel")) || "";
    const match = label.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) throw new Error(`Invalid progress label: ${label}`);
    const current = Number(match[1]);
    totalSections = Number(match[2]);
    await answerCurrentSection(page);
    const validationDialogsBefore = dialogs.filter((item) => item.message.includes("응답하지 않은 문항")).length;
    await page.click("#btnNext");
    if (current === totalSections) {
      await page.locator("#view-result.active").waitFor({ timeout: 60000 });
      sectionsCompleted = current;
      break;
    }
    await page.waitForFunction((previous) => {
      const text = document.querySelector("#surveyProgressLabel")?.textContent || "";
      return Number(text.match(/^(\d+)/)?.[1] || 0) > previous;
    }, current, { timeout: 30000 });
    const validationDialogsAfter = dialogs.filter((item) => item.message.includes("응답하지 않은 문항")).length;
    if (validationDialogsAfter !== validationDialogsBefore) throw new Error(`Validation failed at section ${current}`);
    sectionsCompleted = current;
  }

  check("all_sections_answered_via_ui", sectionsCompleted === totalSections && totalSections > 20, { sectionsCompleted, totalSections });
  await page.screenshot({ path: path.join(outDir, "patient-result.png"), fullPage: true });
  check("patient_result_ui", (await page.textContent("body")).includes("기분장애 임상평가 결과지"));
  check("mixed_agitated_report_section", (await page.textContent("body")).includes("혼합/초조 우울증 및 양극성장애 선별"));

  const webPdfPath = path.join(outDir, `Self_Report_Survey_Results_${patientNumber}.pdf`);
  const [webPdfDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#btnDownloadPdf"),
  ]);
  await webPdfDownload.saveAs(webPdfPath);
  check("web_result_pdf_download", fs.existsSync(webPdfPath) && fs.statSync(webPdfPath).size > 10000, { webPdfPath, bytes: fs.statSync(webPdfPath).size });

  const token = await loginToken();
  const response = await fetch(`${supabaseUrl}/rest/v1/survey_responses?select=id,status,completed,completed_at,hospital_code,patient_number,answers,scores,report&patient_number=eq.${patientNumber}&hospital_code=eq.${hospitalCode}&order=completed_at.desc&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  const rows = await response.json();
  const row = rows[0];
  check("supabase_completed_response", response.ok && row?.completed === true && row?.status === "completed", { http: response.status, responseId: row?.id });
  check("all_answer_keys_persisted", Object.keys(row?.answers || {}).length > 300, { answerKeys: Object.keys(row?.answers || {}).length });
  check("ocd_branch_scored", row?.scores?.DIAG?.ocdObsession === "O" && row?.scores?.DIAG?.ocdCompulsion === "X", row?.scores?.DIAG || {});
  check("bapq_varied_scored", Number.isFinite(row?.scores?.BAPQ?.total) && new Set([row?.scores?.BAPQ?.aloof, row?.scores?.BAPQ?.pragma, row?.scores?.BAPQ?.rigid]).size > 1, row?.scores?.BAPQ || {});
  check("spaq_kasper_boundary", row?.scores?.SPAQ?.score === 11 && row?.scores?.SPAQ?.global === 0 && row?.scores?.SPAQ?.class === "subsyndromal SAD", row?.scores?.SPAQ || {});
  check("spaq_hidden_impairment_blank", row?.answers?.spaq3 === 0 && row?.answers?.spaq3_2 === undefined, { spaq3: row?.answers?.spaq3, spaq3_2: row?.answers?.spaq3_2 });

  fs.writeFileSync(path.join(outDir, "e2e.json"), JSON.stringify({
    appUrl, username, password, patientNumber, hospitalCode, sectionsCompleted, totalSections,
    dialogs, responseId: row?.id, completedAt: row?.completed_at, scores: row?.scores,
    report: row?.report, checks,
  }, null, 2));
} catch (error) {
  check("ui_e2e_flow", false, { error: String(error), sectionsCompleted, totalSections });
  await page.screenshot({ path: path.join(outDir, "failure.png"), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(outDir, "e2e.json"), JSON.stringify({ appUrl, username, password, patientNumber, hospitalCode, sectionsCompleted, totalSections, dialogs, checks }, null, 2));
} finally {
  await browser.close();
}

console.log("ARTIFACT_DIR", outDir);
console.log("PATIENT", JSON.stringify({ username, password, patientNumber, hospitalCode }));
