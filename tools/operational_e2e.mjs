import fs from "node:fs";
import { SURVEY_SECTIONS } from "../questions.js";
import { calculateScores, generateReport } from "../scoring.js";

const cfg = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
const SUPABASE_URL = cfg.match(/SUPABASE_URL = ENV\.VITE_SUPABASE_URL \|\| "([^"]+)"/)[1];
const SUPABASE_ANON_KEY = cfg.match(/SUPABASE_ANON_KEY = ENV\.VITE_SUPABASE_ANON_KEY \|\| "([^"]+)"/)[1];
const WEBHOOK_URL = cfg.match(/GOOGLE_SHEETS_WEBHOOK_URL = ENV\.GOOGLE_SHEETS_WEBHOOK_URL \|\| "([^"]+)"/)[1];

const ADMIN_EMAIL = "snumood@gmail.com";
const ADMIN_PASSWORD = process.env.MSSI_ADMIN_PASSWORD;
const HDR = { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" };
const tag = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const doctorUsername = `e2edoc${tag}`.toLowerCase();
const doctorPassword = "MssiDoc!2026";
const patientPassword = "MssiPat!2026";
const hospitalCode = `E2E${tag.slice(-6)}`;
const hospitalName = `E2E병원${tag.slice(-4)}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const out = {
  started_at: new Date().toISOString(),
  app_url: process.env.MSSI_APP_URL || "http://127.0.0.1:4173/",
  doctor: {
    username: doctorUsername,
    email: `${doctorUsername}@doctor.local`,
    password: doctorPassword,
    hospital_code: hospitalCode,
    hospital_name: hospitalName,
  },
  patients: [],
  checks: [],
};

if (!ADMIN_PASSWORD) {
  throw new Error("MSSI_ADMIN_PASSWORD 환경변수가 필요합니다.");
}

function check(name, ok, detail = {}) {
  out.checks.push({ name, ok, ...detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail).slice(0, 500)}`);
  if (!ok) process.exitCode = 1;
}

async function sfetch(path, opts = {}) {
  return fetch(SUPABASE_URL + path, opts);
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

async function rest(path, token, opts = {}) {
  const headers = { ...HDR, Authorization: `Bearer ${token}`, ...(opts.headers || {}) };
  const r = await sfetch(`/rest/v1/${path}`, { ...opts, headers });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json, text };
}

async function rpc(name, token, body) {
  const r = await sfetch(`/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...HDR, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json, text };
}

function chooseVal(opts, mode = "mid") {
  if (!opts || !opts.length) return 1;
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
        const opts = q.options || section.options || [{ v: 1 }, { v: 0 }];
        a[q.id] = chooseVal(opts, mode);
      }
    }
  }
  return a;
}

function lightlyMutate(answers, caseIndex) {
  const a = { ...answers };
  const keys = Object.keys(a).filter((key) => typeof a[key] === "number");
  for (let i = caseIndex; i < keys.length; i += 37 + caseIndex) {
    const key = keys[i];
    const value = Number(a[key]);
    if (Number.isFinite(value)) a[key] = Math.max(0, Math.min(4, value + (caseIndex % 2 ? 1 : -1)));
  }
  return a;
}

function findRows(report, names) {
  const rows = {};
  for (const section of report.sections || []) {
    for (const row of section.rows || []) {
      if (names.includes(row.name)) rows[row.name] = row;
    }
  }
  return rows;
}

async function postWebhook(payload) {
  let last = { status: 0, text: "" };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      last = { status: r.status, text: (await r.text()).slice(0, 300), attempt };
      if (r.status >= 200 && r.status < 400) return last;
    } catch (error) {
      last = { status: 0, text: String(error).slice(0, 300), attempt };
    }
    await sleep(1500 * attempt);
  }
  return last;
}

const admin = await auth(ADMIN_EMAIL, ADMIN_PASSWORD);
check("admin_login", admin.ok, { status: admin.status });

const doctorSignup = await signup(out.doctor.email, doctorPassword, {
  role: "doctor_pending",
  username: doctorUsername,
  doctor_name: "운영검증의",
  hospital_name: hospitalName,
  hospital_code: hospitalCode,
});
check("doctor_signup_pending", doctorSignup.ok, { status: doctorSignup.status });

const doctorProfile = await rest(
  `profiles?select=id,email,role,hospital_code&email=eq.${encodeURIComponent(out.doctor.email)}`,
  admin.json.access_token,
);
const doctorId = Array.isArray(doctorProfile.json) ? doctorProfile.json[0]?.id : null;
check("doctor_profile_created", Boolean(doctorId), { status: doctorProfile.status, role: doctorProfile.json?.[0]?.role });

const approve = await rpc("approve_doctor", admin.json.access_token, { p_doctor_id: doctorId });
check("doctor_approved", approve.ok, { status: approve.status });

const doctorLogin = await auth(out.doctor.email, doctorPassword);
check("doctor_login_after_approval", doctorLogin.ok, { status: doctorLogin.status });

const modes = ["mid", "max", "low"];
for (let i = 0; i < 3; i++) {
  const patientNumber = `E2E-${tag}-${i + 1}`;
  const username = `e2epat${tag}${i + 1}`.toLowerCase();
  const email = `${username}@patient.local`;
  const dob = `199${i}-0${i + 1}`;
  const answers = lightlyMutate(genAnswers(modes[i]), i + 1);
  const scores = calculateScores(answers);
  const report = generateReport(scores, answers);
  const patient = { index: i + 1, username, email, password: patientPassword, patient_number: patientNumber, dob, mode: modes[i] };

  const ps = await signup(email, patientPassword, {
    role: "patient",
    username,
    patient_number: patientNumber,
    hospital_code: hospitalCode,
    dob,
  });
  const pauth = ps.json?.access_token ? { ok: true, status: 200, json: ps.json } : await auth(email, patientPassword);
  const userId = pauth.json?.user?.id || ps.json?.user?.id;
  check(`patient_${i + 1}_signup`, ps.ok && pauth.ok && Boolean(userId), { signup: ps.status, login: pauth.status });

  const insert = await rest("survey_responses", pauth.json.access_token, {
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
  const responseId = Array.isArray(insert.json) ? insert.json[0]?.id : null;
  check(`patient_${i + 1}_survey_insert_completed`, insert.ok && Boolean(responseId), { status: insert.status, response_id: responseId });

  const webhook = await postWebhook({
    timestamp: new Date().toISOString(),
    responseId,
    patientId: userId,
    dob,
    hospitalCode: hospitalCode,
    patientNumber,
    doctorNickname: "운영검증의",
    hospitalNickname: hospitalName,
    answers,
    scores,
    report,
    scoresJson: JSON.stringify(scores),
    reportJson: JSON.stringify(report),
  });
  check(`patient_${i + 1}_webhook_sent`, webhook.status >= 200 && webhook.status < 400, webhook);

  const doctorView = await rpc("doctor_get_patient_results", doctorLogin.json.access_token, { p_patient_number: patientNumber });
  check(`doctor_can_view_patient_${i + 1}`, doctorView.ok && Array.isArray(doctorView.json) && doctorView.json.length > 0, { status: doctorView.status, rows: doctorView.json?.length });

  const adminView = await rpc("doctor_get_patient_results", admin.json.access_token, { p_patient_number: patientNumber });
  check(`admin_can_view_patient_${i + 1}`, adminView.ok && Array.isArray(adminView.json) && adminView.json.length > 0, { status: adminView.status, rows: adminView.json?.length });

  const patientRead = await rest(`survey_responses?select=id,patient_number,status&patient_number=eq.${encodeURIComponent(patientNumber)}`, pauth.json.access_token);
  check(`patient_can_read_result_${i + 1}`, patientRead.ok && Array.isArray(patientRead.json) && patientRead.json.length > 0, { status: patientRead.status, rows: patientRead.json?.length });

  patient.user_id = userId;
  patient.response_id = responseId;
  patient.answers = answers;
  patient.scores = scores;
  patient.report = report;
  patient.expected_rows = findRows(report, [
    "우울점수",
    "불안점수",
    "기분불안정성상태",
    "경조증 선별",
    "기분불안정상태검사",
    "기분변동성 기질 총점",
    "기분설문지 총점",
  ]);
  out.patients.push(patient);
}

fs.writeFileSync(new URL("../mssi_operational_e2e_report.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("REPORT mssi_operational_e2e_report.json");
