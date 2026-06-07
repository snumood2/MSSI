import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { SURVEY_SECTIONS } from "../questions.js";
import { calculateScores, generateReport } from "../scoring.js";

const cfg = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
const SUPABASE_URL = cfg.match(/SUPABASE_URL = ENV\.VITE_SUPABASE_URL \|\| "([^"]+)"/)[1];
const SUPABASE_ANON_KEY = cfg.match(/SUPABASE_ANON_KEY = ENV\.VITE_SUPABASE_ANON_KEY \|\| "([^"]+)"/)[1];
const WEBHOOK_URL = cfg.match(/GOOGLE_SHEETS_WEBHOOK_URL = ENV\.GOOGLE_SHEETS_WEBHOOK_URL \|\| "([^"]+)"/)[1];
const SHEET_ID = "1mHaUquO0qdv7bpj9T7LIPVfyUsUlX87uyHiAS_dyG78";
const PYTHON = "/Users/wm/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3";
const XLSX_PATH = "/Users/wm/Library/CloudStorage/OneDrive-개인/9. Temporal Work/2026 설문웹앱개밸/테스트데이터.xlsx";
const GOOGLE_TOKEN_PATH = "/Users/wm/Documents/Codex/2026-06-07/files-mentioned-by-the-user-docx/.secrets/google_token_script.json";
const HDR = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chooseVal(opts, mode = "mid") {
  if (!opts?.length) return 1;
  if (mode === "min") return opts[0].v ?? opts[0];
  if (mode === "max") return opts[opts.length - 1].v ?? opts[opts.length - 1];
  return opts[Math.floor(opts.length / 2)].v ?? opts[Math.floor(opts.length / 2)];
}

function genAnswers(mode = "mid") {
  const a = {};
  for (const section of SURVEY_SECTIONS) {
    const isPms = section.title.includes("PMS") || section.title.includes("생리주기");
    if (isPms) a.pms_skip = 0;
    for (const q of section.questions) {
      if (q.type === "info") continue;
      if (section.type === "matrix_complex" && q.id !== "mssi21") {
        const yes = mode === "low" ? 0 : 1;
        a[`${q.id}_yn`] = yes;
        a[`${q.id}_freq`] = yes ? chooseVal(section.options?.[0]?.opts, mode) : 0;
        a[`${q.id}_sev`] = yes ? chooseVal(section.options?.[1]?.opts, mode) : 0;
      } else if (q.type === "matrix_months") {
        for (let r = 0; r < q.rows.length; r++) a[`${q.id}_r${r}_m12`] = mode === "low" ? 0 : 1;
      } else if (q.type === "scale_matrix") {
        for (let r = 0; r < q.rows.length; r++) a[`${q.id}_${r}`] = chooseVal(q.options, mode);
      } else if (q.type === "matrix_season_sleep") {
        for (let r = 0; r < q.rows.length; r++) a[`${q.id}_${r}`] = mode === "max" ? 9 : 7;
      } else if (q.type === "custom_mdq") {
        for (const sq of q.questions) a[sq.id] = chooseVal(sq.options?.length ? sq.options : [{ v: 1 }, { v: 0 }], mode);
      } else {
        a[q.id] = chooseVal(q.options || section.options || [{ v: 1 }, { v: 0 }], mode);
      }
    }
  }
  return a;
}

function readAsrsRowsFromXlsx() {
  const code = `
import json
from openpyxl import load_workbook
wb = load_workbook(${JSON.stringify(XLSX_PATH)}, data_only=True, read_only=True)
ws = wb["Sheet1"]
rows = []
for r in range(4, 7):
    rows.append([ws.cell(r, c).value for c in range(706, 724)])
print(json.dumps(rows, ensure_ascii=False))
`;
  return JSON.parse(execFileSync(PYTHON, ["-c", code], { encoding: "utf8" }));
}

function setAsrsTarget(answers, sourceValues, targetScreen, caseIndex) {
  for (let i = 1; i <= 18; i++) {
    const raw = Number(sourceValues[i - 1]);
    answers[`adhd${i}`] = Number.isFinite(raw) ? Math.max(1, Math.min(5, raw)) : 1;
  }
  const positiveItems = [1, 2, 3, 4, 5, 6].slice(0, targetScreen);
  for (let i = 1; i <= 6; i++) {
    const threshold = i <= 3 ? 3 : 4;
    answers[`adhd${i}`] = positiveItems.includes(i) ? threshold : threshold - 1;
  }
  for (let i = 7; i <= 18; i++) {
    const delta = ((caseIndex + i) % 3) - 1;
    answers[`adhd${i}`] = Math.max(1, Math.min(5, answers[`adhd${i}`] + delta));
  }
}

async function sfetch(path, opts = {}) {
  return fetch(SUPABASE_URL + path, opts);
}

async function signup(email, password, data) {
  const r = await sfetch("/auth/v1/signup", {
    method: "POST",
    headers: HDR,
    body: JSON.stringify({ email, password, data }),
  });
  const text = await r.text();
  let json = {};
  try { json = JSON.parse(text); } catch {}
  return { ok: [200, 201].includes(r.status), status: r.status, json, text };
}

async function auth(email, password) {
  const r = await sfetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: HDR,
    body: JSON.stringify({ email, password }),
  });
  const text = await r.text();
  let json = {};
  try { json = JSON.parse(text); } catch {}
  return { ok: r.status === 200, status: r.status, json, text };
}

async function rest(path, token, opts = {}) {
  const headers = { ...HDR, Authorization: `Bearer ${token}`, ...(opts.headers || {}) };
  const r = await sfetch(`/rest/v1/${path}`, { ...opts, headers });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json, text };
}

async function webhook(payload) {
  const r = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  return { ok: r.status >= 200 && r.status < 400, status: r.status, text: (await r.text()).slice(0, 300) };
}

async function googleToken() {
  const info = JSON.parse(fs.readFileSync(GOOGLE_TOKEN_PATH, "utf8"));
  const body = new URLSearchParams({
    client_id: info.client_id,
    client_secret: info.client_secret,
    refresh_token: info.refresh_token,
    grant_type: "refresh_token",
  });
  return (await (await fetch(info.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })).json()).access_token;
}

async function sheetGet(token, range, valueRenderOption = "FORMATTED_VALUE") {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`);
  url.searchParams.set("valueRenderOption", valueRenderOption);
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${range} ${r.status} ${await r.text()}`);
  return (await r.json()).values || [];
}

async function sheetPut(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const r = await fetch(url, {
    method: "PUT",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
  if (!r.ok) throw new Error(`${range} ${r.status} ${await r.text()}`);
}

function normalCDF(x, mean, std) {
  const z = (x - mean) / std;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function rank(score, mean, std) {
  return Math.max(1, Math.min(100, Math.round((1 - normalCDF(Number(score), mean, std)) * 100)));
}

const sourceAsrsRows = readAsrsRowsFromXlsx();
const tag = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const hospitalCode = process.env.MSSI_E2E_HOSPITAL_CODE || "JWEY6A";
const password = "MssiPat!2026";
const sheetToken = await googleToken();
const cases = [];
const targets = [0, 1, 2, 3, 4, 6];

const scoringSource = fs.readFileSync(new URL("../scoring.js", import.meta.url), "utf8");
const statsBody = scoringSource.match(/const STATS = (\{[\s\S]*?\n\});/)?.[1];
const STATS = Function(`return (${statsBody});`)();

function scoreByKey(scores) {
  return {
    ZUNG: scores.ZUNG,
    BAI: scores.BAI,
    MIQS: scores.MIQS,
    MDQ: scores.MDQ.score,
    TEMPS_Cyc: scores.TEMPS.cyc,
    TEMPS_Dep: scores.TEMPS.dep,
    TEMPS_Irr: scores.TEMPS.irr,
    TEMPS_Hyp: scores.TEMPS.hyp,
    TEMPS_Anx: scores.TEMPS.anx,
    MIQT_Total: scores.MIQT.total,
    MIQT_Labil: scores.MIQT.labil,
    MIQT_Down: scores.MIQT.down,
    MIQT_Up: scores.MIQT.up,
    MIQT_Season: scores.MIQT.season,
    MIQT_Child: scores.MIQT.child,
    CTQ_Total: scores.CTQ.total,
    CTQ_EA: scores.CTQ.ea,
    CTQ_PA: scores.CTQ.pa,
    CTQ_SA: scores.CTQ.sa,
    CTQ_EN: scores.CTQ.en,
    CTQ_PN: scores.CTQ.pn,
    IPSM_Total: scores.IPSM.total,
    IPSM_IA: scores.IPSM.ia,
    IPSM_NA: scores.IPSM.na,
    IPSM_SA: scores.IPSM.sa,
    IPSM_TIM: scores.IPSM.tim,
    IPSM_FIS: scores.IPSM.fis,
    CD_Total: scores.CD.total,
    CD_Hard: scores.CD.hard,
    CD_Persist: scores.CD.persist,
    CD_Optimism: scores.CD.optimism,
    CD_Support: scores.CD.support,
    CD_Spirit: scores.CD.spirit,
    ERSQ_Total: scores.ERSQ.total,
    ERSQ_Aware: scores.ERSQ.aware,
    ERSQ_Body: scores.ERSQ.body,
    ERSQ_Clarity: scores.ERSQ.clarity,
    ERSQ_Under: scores.ERSQ.under,
    ERSQ_Accept: scores.ERSQ.accept,
    ERSQ_Resil: scores.ERSQ.resil,
    ERSQ_Support: scores.ERSQ.support,
    ERSQ_Tolerate: scores.ERSQ.tolerate,
    ERSQ_Modify: scores.ERSQ.modify,
    BIS: scores.BIS,
    BAS: scores.BAS,
    BAS_Reward: scores.BAS_Sub.reward,
    BAS_Drive: scores.BAS_Sub.drive,
    BAS_Fun: scores.BAS_Sub.fun,
    AUDIT: scores.AUDIT,
    CMS: scores.CMS.score,
    SPAQ: scores.SPAQ.score,
    ASRS: scores.ASRS.total,
    WURS: scores.WURS,
    BAPQ_Total: scores.BAPQ.total,
    BAPQ_Aloof: scores.BAPQ.aloof,
    BAPQ_Pragma: scores.BAPQ.pragma,
    BAPQ_Rigid: scores.BAPQ.rigid,
    BOR: scores.BOR,
    PMS_Sym: scores.PMS.sym,
    PMS_Func: scores.PMS.func,
  };
}

function firstNumber(value) {
  const match = String(value ?? "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function numberClose(sheetValue, expectedValue) {
  if (expectedValue === "") return String(sheetValue ?? "") === "";
  const got = firstNumber(sheetValue);
  const expected = Number(expectedValue);
  return Number.isFinite(got) && Number.isFinite(expected) && Math.abs(got - expected) <= 0.51;
}

function compareAllSheetRows(sheetRows, scores, expectedScreen) {
  const expectedScores = scoreByKey(scores);
  const mismatches = [];
  for (const row of sheetRows) {
    const [, name, , display, patientRank, normalRank, , statKey] = row;
    if (!statKey || statKey === "stat_key") continue;
    if (statKey === "ASRS_Screen") {
      if (display !== expectedScreen) mismatches.push({ name, statKey, issue: "screen", sheet: display, expected: expectedScreen });
      continue;
    }
    const expectedScore = expectedScores[statKey];
    if (expectedScore === undefined) {
      mismatches.push({ name, statKey, issue: "missing_expected" });
      continue;
    }
    if (!numberClose(display, expectedScore)) mismatches.push({ name, statKey, issue: "score", sheet: display, expected: expectedScore });
    const stat = STATS[statKey];
    if (stat && expectedScore !== "") {
      const expectedPatientRank = rank(expectedScore, stat.pat_m, stat.pat_sd);
      const expectedNormalRank = rank(expectedScore, stat.nor_m, stat.nor_sd);
      if (!numberClose(patientRank, expectedPatientRank)) mismatches.push({ name, statKey, issue: "patient_rank", sheet: patientRank, expected: expectedPatientRank });
      if (!numberClose(normalRank, expectedNormalRank)) mismatches.push({ name, statKey, issue: "normal_rank", sheet: normalRank, expected: expectedNormalRank });
    }
  }
  return mismatches;
}

for (let i = 0; i < targets.length; i++) {
  const patientNumber = `ASRS-${tag}-${i + 1}`;
  const email = `asrs${tag}${i + 1}@patient.local`.toLowerCase();
  const mode = i % 3 === 0 ? "low" : (i % 3 === 1 ? "mid" : "max");
  const answers = genAnswers(mode);
  setAsrsTarget(answers, sourceAsrsRows[i % sourceAsrsRows.length], targets[i], i);

  const scores = calculateScores(answers);
  const report = generateReport(scores, answers);
  const expectedScreen = `6개 중 ${scores.ASRS.screen}개 (${scores.ASRS.screen >= 4 ? "성인ADHD의심됨" : "성인ADHD의심되지않음"})`;
  const expectedPatientRank = rank(scores.ASRS.total, 46.8, 12.68);
  const expectedNormalRank = rank(scores.ASRS.total, 39.9, 7.75);

  const signupResult = await signup(email, password, {
    role: "patient",
    username: `asrs${tag}${i + 1}`.toLowerCase(),
    patient_number: patientNumber,
    hospital_code: hospitalCode,
    dob: `199${i}-01`,
  });
  const login = signupResult.json?.access_token ? { ok: true, status: 200, json: signupResult.json } : await auth(email, password);
  if (!signupResult.ok || !login.ok) throw new Error(`signup/login failed case ${i + 1}: ${signupResult.status}/${login.status}`);
  const userId = login.json.user?.id || signupResult.json.user?.id;

  const insert = await rest("survey_responses", login.json.access_token, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      patient_id: userId,
      patient_user_id: userId,
      hospital_code: hospitalCode,
      patient_number: patientNumber,
      status: "completed",
      completed: true,
      answers,
      scores,
      report,
      completed_at: new Date().toISOString(),
    }),
  });
  if (!insert.ok) throw new Error(`insert failed case ${i + 1}: ${insert.status} ${insert.text.slice(0, 300)}`);
  const responseId = Array.isArray(insert.json) ? insert.json[0]?.id : null;

  const wh = await webhook({
    timestamp: new Date().toISOString(),
    responseId,
    patientId: userId,
    dob: `199${i}-01`,
    hospitalCode,
    patientNumber,
    doctorNickname: "ASRS검증의",
    hospitalNickname: "ASRS검증병원",
    answers,
    scores,
    report,
    scoresJson: JSON.stringify(scores),
    reportJson: JSON.stringify(report),
  });
  if (!wh.ok) throw new Error(`webhook failed case ${i + 1}: ${wh.status} ${wh.text}`);

  await sleep(2200);
  await sheetPut(sheetToken, "검사결과지!H4:J4", [[hospitalCode, "번호", patientNumber]]);
  await sleep(1400);
  const reportRows = await sheetGet(sheetToken, "검사결과지!B82:E83", "FORMATTED_VALUE");
  const sheetRows = await sheetGet(sheetToken, "SHEET2REPORT!A21:H90", "FORMATTED_VALUE");
  const reportAll = await sheetGet(sheetToken, "검사결과지!A1:K110", "FORMATTED_VALUE");
  const sheetScreen = reportRows[0]?.[1] || "";
  const sheetTotal = Number(reportRows[1]?.[1]);
  const sheetPatientRank = Number(reportRows[1]?.[2]);
  const sheetNormalRank = Number(reportRows[1]?.[3]);
  const mismatches = compareAllSheetRows(sheetRows, scores, expectedScreen);
  const reportErrors = reportAll.flat().filter((cell) => /^#/.test(String(cell || "")));
  const ok = sheetScreen === expectedScreen
    && sheetTotal === scores.ASRS.total
    && sheetPatientRank === expectedPatientRank
    && sheetNormalRank === expectedNormalRank
    && mismatches.length === 0
    && reportErrors.length === 0;

  cases.push({
    case: i + 1,
    patient_number: patientNumber,
    hospital_code: hospitalCode,
    target_screen: targets[i],
    screen: scores.ASRS.screen,
    total: scores.ASRS.total,
    expected: {
      screen: expectedScreen,
      patient_rank: expectedPatientRank,
      normal_rank: expectedNormalRank,
    },
    sheet: {
      screen: sheetScreen,
      total: sheetTotal,
      patient_rank: sheetPatientRank,
      normal_rank: sheetNormalRank,
    },
    mismatches,
    report_errors: reportErrors,
    ok,
  });
  console.log(`${ok ? "PASS" : "FAIL"} case_${i + 1} ${patientNumber} screen=${scores.ASRS.screen} total=${scores.ASRS.total} mismatches=${mismatches.length} reportErrors=${reportErrors.length}`);
}

const out = {
  started_at: new Date().toISOString(),
  hospital_code: hospitalCode,
  cases,
  ok: cases.every((item) => item.ok),
};
fs.writeFileSync(new URL("../mssi_full_six_case_e2e_report.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("REPORT mssi_full_six_case_e2e_report.json");
if (!out.ok) process.exitCode = 1;
