
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, PATIENT_EMAIL_DOMAIN, DOCTOR_EMAIL_DOMAIN, ADMIN_EMAIL } from "./config.js";
import { SURVEY_SECTIONS } from "./questions.js";
import { calculateScores, generateReport, getGlobalInstructions } from "./scoring.js";
import { renderAnswerRawHTML } from "./answer-view.js";

const _store = {};
const safeStorage = {
  getItem: (k)    => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: ()       => { Object.keys(_store).forEach(k => delete _store[k]); }
};

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  user: null,
  profile: null,
  answers: {},
  currentSectionIdx: 0,
  responseId: null,
  assessmentNo: null,
  assessmentKey: null,
};

const $  = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const el = id  => document.getElementById(id);

function show(id) {
  $$(".view").forEach(v => v.classList.remove("active"));
  const target = el(id);
  if (target) { target.classList.add("active"); window.scrollTo(0, 0); }
}

function setMsg(elId, msg, type = "info") {
  const el_ = el(elId);
  if (!el_) return;
  el_.className = `status-msg show ${type}`;
  el_.textContent = msg;
  if (type === "ok") setTimeout(() => { el_.className = "status-msg"; }, 3500);
}
function clearMsg(elId) {
  const el_ = el(elId); if (el_) el_.className = "status-msg";
}

const DIAG_BRANCH = {
  diag_panic:  { parent: "d1a", children: ["d1b", "d2"] },
  diag_agora:  { parent: "e1",  children: ["e3"] },
  diag_social: { parent: "f1",  children: ["f3", "f4", "f6"] },
  diag_ocd:    { parent: "g1a", children: ["g2"], sub: { parent: "g3a", children: ["g5"] } },
  diag_gad:    { parent: "n1a", children: ["n1b", "n2", "n3a", "n3b", "n3c", "n3d", "n3e", "n3f"] }
};

function isDiagChildHidden(sectionId, qId) {
  const rule = DIAG_BRANCH[sectionId];
  if (!rule) return false;
  if (sectionId === "diag_ocd") {
    if (qId === "g2") return state.answers.g1a !== 1;
    if (qId === "g3a") return state.answers.g1a === undefined;
    if (qId === "g5") return !(state.answers.g2 === 1 || state.answers.g3a === 1);
    return false;
  }
  if (sectionId === "diag_panic") {
    if (qId === "d1b") return state.answers.d1a !== 1;
    if (qId === "d2") return !(state.answers.d1a === 1 && state.answers.d1b === 1);
  }
  if (sectionId === "diag_agora" && qId === "e3") return state.answers.e1 !== 1;
  if (sectionId === "diag_social") {
    if (qId === "f3") return state.answers.f1 !== 1;
    if (qId === "f4") return !(state.answers.f1 === 1 && state.answers.f3 === 1);
    if (qId === "f6") return !(state.answers.f1 === 1 && state.answers.f3 === 1 && state.answers.f4 === 1);
  }
  if (sectionId === "diag_gad") {
    if (qId === "n1b") return state.answers.n1a !== 1;
    if (qId === "n2") return !(state.answers.n1a === 1 && state.answers.n1b === 1);
    if (/^n3[a-f]$/.test(qId)) return !(state.answers.n1a === 1 && state.answers.n1b === 1 && state.answers.n2 === 1);
  }
  return false;
}

function isAUDITSkipActive() {
  return state.answers["au1"] === 0;
}
const cleanText  = t => t ? t.replace(/\[cite:[^\]]*\]/g, "").trim() : "";
const cleanTitle = t => t ? t.replace(/\s*\([^)]+\)/g, "").trim() : "";

function escapeHtml(str) {
  if (str == null) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  if (str == null) return "";
  return String(str).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeReportColor(value) {
  const color = String(value || "");
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "inherit";
}

function reportRankColor(rank, storedColor) {
  const value = Number(rank);
  if (!Number.isFinite(value)) return safeReportColor(storedColor);
  if (value < 50) return "#FF5C7A";
  if (value > 50) return "#2B3CFF";
  return "#5F6368";
}

function fmtDate(str) {
  if (!str) return "-";
  const d = new Date(str);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

window.addEventListener("DOMContentLoaded", () => {
  const saved = safeStorage.getItem("saved_id") || "";
  if (saved) {
    ["p_id", "d_login_id"].forEach(id => { if (el(id)) el(id).value = saved; });
    if (el("a_email") && saved.includes("@")) el("a_email").value = saved;
    if (el("saveIdCheck")) el("saveIdCheck").checked = true;
  }

  el("btnHardReset")?.addEventListener("click", async () => {
    if (!confirm("로그인 정보를 초기화하고 새로고침합니다.")) return;
    await sb.auth.signOut();
    safeStorage.clear();
    safeStorage.clear();
    location.reload();
  });
});

let authMode = "login";
let selectedRole = "patient";

$$(".auth-tab").forEach(btn => btn.addEventListener("click", () => {
  $$(".auth-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  selectedRole = btn.dataset.role;
  renderAuthForms();
}));

function renderAuthForms() {
  ["patient", "doctor", "admin"].forEach(r => {
    const f = el(`form-${r}`);
    if (f) f.style.display = selectedRole === r ? "block" : "none";
  });
  const tog = el("btnToggleSignup");
  if (tog) tog.style.display = selectedRole === "admin" ? "none" : "block";
  if (selectedRole === "admin") authMode = "login";
  renderAuthMode();
}

el("btnToggleSignup")?.addEventListener("click", () => {
  authMode = authMode === "login" ? "signup" : "login";
  renderAuthMode();
});

const CONSONANT_MAP = {
  'ㄱ':'G','ㄴ':'N','ㄷ':'D','ㄹ':'R','ㅁ':'M','ㅂ':'B','ㅅ':'S',
  'ㅇ':null,'ㅈ':'J','ㅊ':'C','ㅋ':'K','ㅌ':'T','ㅍ':'P','ㅎ':'H'
};
function extractConsonants(str) {
  let result = '';
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const idx = Math.floor((code - 0xAC00) / 28 / 21);
      const cons = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'][idx];
      const mapped = CONSONANT_MAP[cons];
      if (mapped) result += mapped;
    }
  }
  return result;
}
async function generateHospitalCode(hospitalName) {
  const consonants = extractConsonants(hospitalName || '').slice(0, 4);
  const base = consonants || 'HOSP';
  for (let attempt = 0; attempt < 10; attempt++) {
    const digits = String(Math.floor(Math.random() * 90) + 10);
    const code = base + digits;
    const { data } = await sb.from('profiles').select('id').eq('hospital_code', code).maybeSingle();
    if (!data) return code;
  }
  return base + String(Date.now()).slice(-4);
}

function renderAuthMode() {
  el("authTitle").textContent  = authMode === "login" ? "로그인" : "회원가입";
  el("btnLoginAction").textContent = authMode === "login" ? "로그인" : "가입하기";
  $$(".signup-only").forEach(e => e.style.display = authMode === "signup" ? "block" : "none");
  const loginOnly = $(".login-only");
  if (selectedRole === "doctor" && loginOnly)
    loginOnly.style.display = authMode === "signup" ? "none" : "block";
  clearMsg("authMsg");
}

el("btnLoginAction")?.addEventListener("click", async () => {
  clearMsg("authMsg");
  setMsg("authMsg", "처리 중...", "info");

  try {
    let email, pw, rawId;

    if (selectedRole === "patient") {
      rawId = el("p_id").value.trim();
      if (!rawId) throw "아이디를 입력하세요.";
      email = `${rawId}@${PATIENT_EMAIL_DOMAIN}`;
      pw    = el("p_pw").value;

    } else if (selectedRole === "doctor") {
      if (authMode === "signup") {
        const realEmail = el("d_real_email").value.trim();
        rawId = el("d_signup_id").value.trim();
        if (!realEmail.includes("@")) throw "올바른 이메일을 입력하세요.";
        if (!rawId) throw "아이디를 입력하세요.";
        if (realEmail.toLowerCase() === ADMIN_EMAIL) throw "관리자 이메일은 사용 불가합니다.";
        email = realEmail;
      } else {
        const val = el("d_login_id").value.trim();
        if (!val) throw "아이디를 입력하세요.";
        email = val.includes("@") ? val : `${val}@${DOCTOR_EMAIL_DOMAIN}`;
        rawId = email.split("@")[0];
      }
      pw = el("d_pw").value;

    } else {

      rawId = el("a_email").value.trim();
      email = rawId; pw = el("a_pw").value;
      if (email.toLowerCase() !== ADMIN_EMAIL) throw "관리자 계정이 아닙니다.";
    }

    if (!pw) throw "비밀번호를 입력하세요.";

    const saveCheck = el("saveIdCheck");
    if (saveCheck?.checked) safeStorage.setItem("saved_id", selectedRole === "admin" ? email : rawId);
    else safeStorage.removeItem("saved_id");

    if (authMode === "signup") {
      if (selectedRole === "admin") throw "관리자는 가입 불가합니다.";
      if (pw.length < 12) throw "비밀번호는 12자리 이상이어야 합니다.";

      if (selectedRole === "patient") {
        const hCode = el("p_hcode").value.trim();
        if (!hCode) throw "병원코드를 입력하세요.";
      }

      let signUpMeta;
      if (selectedRole === "patient") {
        const patientNumber = el("p_pnum").value.trim();
        if (!/^\d{8}$/.test(patientNumber)) throw "의사에게 받은 번호는 8자리 숫자로 입력하세요.";
        signUpMeta = {
          role: "patient",
          username: rawId,
          dob: el("p_dob").value,
          hospital_code: el("p_hcode").value.trim(),
          patient_number: patientNumber
        };
      } else {
        const hospitalName = el("d_hname").value.trim();
        if (!hospitalName) throw "병원닉네임을 입력해주세요.";
        const hcode = await generateHospitalCode(hospitalName);
        signUpMeta = {
          role: "doctor_pending",
          username: rawId,
          doctor_name: el("d_name").value.trim(),
          hospital_name: hospitalName,
          hospital_code: hcode
        };
      }

      const { data, error } = await sb.auth.signUp({
        email, password: pw,
        options: { data: signUpMeta }
      });
      if (error) throw error.message;
      if (!data.user) throw "가입 요청 실패.";

      setMsg("authMsg", "가입 성공! 잠시 후 이동합니다...", "ok");
      setTimeout(() => location.reload(), 1500);

    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: pw });
      if (error) throw "로그인 실패. 정보를 확인하세요.";
      setMsg("authMsg", "인증 성공!", "ok");
    }

  } catch (e) {
    setMsg("authMsg", typeof e === "string" ? e : (e.message || "오류 발생"), "error");
  }
});

async function handleAuthUser(user) {
  const logoutBtn = el("btnLogout");
  const userBadge = el("userBadge");
  if (logoutBtn) logoutBtn.style.display = "block";

  if (user.email?.toLowerCase() === ADMIN_EMAIL) {
    state.profile = { id: user.id, role: "admin", username: "admin",
      doctor_name: "총괄관리자", hospital_name: "서울대학교" };
    if (userBadge) { userBadge.textContent = "관리자"; userBadge.style.display = "block"; }
    initAdmin();
    return;
  }

  let prof = null;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await sb.from("profiles")
      .select("id, role, email, username, full_name, doctor_name, hospital_name, hospital_code, patient_number, dob, approved_at")
      .eq("id", user.id).maybeSingle();
    if (data) { prof = data; break; }
    if (error) console.warn("프로필 조회 오류:", error.message);
    if (i < 4) await new Promise(r => setTimeout(r, 500));
  }

  if (!prof) {
    show("view-auth");
    setMsg("authMsg", "프로필 정보를 찾을 수 없습니다. 새로고침해 주세요.", "error");
    return;
  }

  state.profile = prof;
  const roleLabel = { patient: "응답자", doctor: "의사", admin: "관리자", doctor_pending: "승인대기", doctor_revoked: "승인취소" };
  if (userBadge) { userBadge.textContent = roleLabel[prof.role] || prof.role; userBadge.style.display = "block"; }

  if (prof.role === "admin")               initAdmin();
  else if (prof.role === "patient")        initPatient();
  else if (prof.role === "doctor")         initDoctor();
  else if (prof.role === "doctor_pending") showPendingScreen();
  else if (prof.role === "doctor_revoked") showPendingScreen("revoked");
}

sb.auth.onAuthStateChange((event, session) => {

  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    state.user = session?.user || null;
    if (state.user) {
      handleAuthUser(state.user);
    } else {

      el("btnLogout") && (el("btnLogout").style.display = "none");
      el("userBadge") && (el("userBadge").style.display = "none");
      show("view-auth");
      renderAuthForms();
    }
  } else if (event === "SIGNED_OUT") {
    state.user = null;
    state.profile = null;
    el("btnLogout") && (el("btnLogout").style.display = "none");
    el("userBadge") && (el("userBadge").style.display = "none");
    show("view-auth");
    renderAuthForms();
  } else if (event === "TOKEN_REFRESHED") {
    state.user = session?.user || null;

  }
});

el("btnLogout")?.addEventListener("click", async () => {
  await sb.auth.signOut();
  safeStorage.removeItem("supabase.auth.token");
  location.reload();
});

function showPendingScreen(mode = "pending") {
  show("view-pending");
  const name = state.profile?.doctor_name || state.profile?.username || "선생님";
  const pendName = el("pendingName"); if (pendName) pendName.textContent = name;
  if (mode === "revoked") {
    const title = document.querySelector("#view-pending h2, #view-pending h3");
    if (title) title.textContent = "승인취소 상태";
  }
}
el("btnPendingRefresh")?.addEventListener("click", () => location.reload());

async function initAdmin() {
  show("view-admin");
  await loadAdminPending();
  await loadAdminDoctors();
}

async function loadAdminPending() {
  const list = el("adminPendingList");
  if (!list) return;
  list.innerHTML = `<p class="text-sub mt-8">로딩 중...</p>`;
  const { data } = await sb.from("profiles").select("*").eq("role", "doctor_pending").order("created_at");
  if (!data || !data.length) {
    list.innerHTML = `<p class="text-sub mt-8" style="padding:20px 0;">대기 중인 의사가 없습니다.</p>`;
    return;
  }
  list.innerHTML = data.map(d => `
    <div class="list-row">
      <div class="list-info">
        <div class="name">${d.doctor_name || "-"}</div>
        <div class="sub">${d.hospital_name || "-"} &nbsp;|&nbsp; ${d.email || "-"}</div>
      </div>
      <div class="list-actions">
        <button class="btn primary sm approve-btn" data-id="${d.id}" data-name="${d.doctor_name}">승인</button>
      </div>
    </div>`).join("");
}

async function loadAdminDoctors() {
  const list = el("adminDoctorList");
  if (!list) return;
  list.innerHTML = `<p class="text-sub mt-8">로딩 중...</p>`;
  const { data } = await sb.from("profiles").select("*").in("role", ["doctor", "doctor_pending"]).order("doctor_name");
  if (!data || !data.length) {
    list.innerHTML = `<p class="text-sub mt-8" style="padding:20px 0;">등록된 의사가 없습니다.</p>`;
    return;
  }
  list.innerHTML = data.map(d => `
    <div class="list-row">
      <div class="list-info">
        <div class="name" style="display:flex;gap:8px;align-items:center;">
          ${d.doctor_name || "-"}
          <span class="badge ${d.role==='doctor'?'green':'yellow'}">${d.role==='doctor'?'승인됨':'대기'}</span>
          <span class="badge">${d.hospital_code || "코드없음"}</span>
        </div>
        <div class="sub">${d.hospital_name || "-"}</div>
      </div>
      <div class="list-actions">
        <button class="btn secondary sm reset-btn" data-id="${d.id}">비밀번호 초기화</button>
      </div>
    </div>`).join("");
}

document.addEventListener("click", async (e) => {
  if (e.target.matches(".approve-btn")) {
    const { id, name } = e.target.dataset;
    if (!confirm(`${name} 의사를 승인하시겠습니까?`)) return;
    const { error } = await sb.rpc("approve_doctor", { p_doctor_id: id });
    if (error) return alert("승인 오류: " + error.message);
    alert("승인 완료!");
    await loadAdminPending();
    await loadAdminDoctors();
  }
  if (e.target.matches(".reset-btn")) {
    const { id } = e.target.dataset;
    const newPw = generateTemporaryPassword();
    if (!confirm("이 의사의 비밀번호를 안전한 임시 비밀번호로 초기화하시겠습니까?")) return;
    const { error } = await sb.rpc("admin_reset_password", { target_user_id: id, new_password: newPw });
    if (error) alert("오류: " + error.message);
    else alert(`비밀번호 초기화 완료\n\n임시 비밀번호: ${newPw}\n\n이 값은 다시 표시되지 않습니다. 의사에게 안전한 경로로 전달하고 로그인 후 변경하도록 안내하세요.`);
  }
});

el("btnAdminRefresh")?.addEventListener("click", async () => {
  const btn = el("btnAdminRefresh");
  btn.textContent = "로딩 중...";
  btn.disabled = true;
  await loadAdminPending();
  await loadAdminDoctors();
  btn.textContent = "새로고침";
  btn.disabled = false;
});

el("btnExportAll")?.addEventListener("click", async () => {
  const { data } = await sb.from("survey_responses").select("*").or("status.eq.completed,completed.eq.true");
  if (!data?.length) return alert("데이터가 없습니다.");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `survey_export_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
});

function initDoctor() {
  show("view-doctor");
  const p = state.profile;
  const info = el("doctorInfo");
  if (info) info.innerHTML = `
    <span style="font-weight:800;">${p.doctor_name || "-"} 선생님</span>
    &nbsp;<span class="text-sub">${p.hospital_name || ""}</span>
    &nbsp;<span class="badge">병원코드: ${p.hospital_code || "없음"}</span>`;

  loadDoctorPatientList();
}

$$(".doctor-tab").forEach(btn => btn.addEventListener("click", () => {
  $$(".doctor-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const tab = btn.dataset.tab;
  el("doctorTabSearch").style.display = tab === "search" ? "block" : "none";
  el("doctorTabList").style.display   = tab === "list"   ? "block" : "none";
}));

el("btnSearchPatient")?.addEventListener("click", searchPatient);
el("searchPNum")?.addEventListener("keydown", e => { if (e.key === "Enter") searchPatient(); });

async function searchPatient() {
  const pNum = el("searchPNum").value.trim();
  if (!pNum) return alert("번호를 입력하세요.");
  setMsg("doctorSearchMsg", "검색 중...", "info");
  el("doctorResultArea").innerHTML = "";

  const { data, error } = await sb.rpc("doctor_get_patient_results", { p_patient_number: pNum });
  if (error) { setMsg("doctorSearchMsg", "오류: " + error.message, "error"); return; }

  if (!data || !data.length) {
    setMsg("doctorSearchMsg", `'${pNum}' 에 해당하는 완료된 결과가 없습니다.`, "warn");
    return;
  }

  clearMsg("doctorSearchMsg");
  const row = data[0];
  renderDoctorResult(row, el("doctorResultArea"));
}

function renderDoctorResult(row, container) {
  let report = row.report;

  if (row.answers) {
    try {
      const scores = calculateScores(row.answers);
      report = generateReport(scores, row.answers);
    } catch (e) { console.error("재계산 실패:", e); }
  }
  if (!report) {
    container.innerHTML = `<p class="text-sub" style="padding:20px 0;">결과 데이터가 없습니다.</p>`;
    return;
  }

  const instructions = (report && report.instructions) ? report.instructions : getGlobalInstructions();
  const dateStr = fmtDate(row.completed_at);
  const patNum = row.patient_number || "-";

  container.innerHTML = `
    <div class="patient-result-card">
      <div class="divider" style="margin-top:0;"></div>
      <div class="result-header-block">
        <h2 class="report-main-title">기분장애 임상평가 결과지</h2>
        <p class="report-date-line">${escapeHtml(dateStr)}&nbsp;&nbsp;번호: ${escapeHtml(patNum)}</p>
      </div>
      <div class="result-instructions">${escapeHtml(instructions)}</div>
      <div id="drReportContent"></div>
      <div class="print-btn-wrap">
        <button class="btn secondary" onclick="window.print()">인쇄</button>
      </div>
    </div>`;

  const content = el("drReportContent");
  renderReportHTML(report, content);
  content.insertAdjacentHTML("beforeend", renderAnswerRawHTML(row.answers || {}));
}

async function loadDoctorPatientList() {
  const list = el("doctorPatientList");
  if (!list) return;
  list.innerHTML = `<p class="text-sub mt-8">로딩 중...</p>`;

  const { data, error } = await sb.rpc("doctor_list_patients");

  if (error || !data?.length) {
    list.innerHTML = `<p class="text-sub mt-8" style="padding:20px 0;">완료된 설문이 없습니다.</p>`;
    return;
  }

  list.innerHTML = data.map(r => `
    <div class="history-item" data-response-id="${escapeAttr(r.id)}" style="cursor:pointer;">
      <div class="history-dot"></div>
      <div class="history-info">
        <div class="history-date">번호: ${escapeHtml(r.patient_number || "미입력")}</div>
        <div class="history-sub">완료: ${escapeHtml(fmtDate(r.completed_at))}</div>
      </div>
      <button class="btn secondary sm" onclick="viewResponseById('${escapeAttr(r.id)}')">결과보기</button>
    </div>`).join("");
}

window.viewResponseById = async (responseId) => {
  const { data } = await sb.from("survey_responses").select("*").eq("id", responseId).single();

  if (data?.answers) {
    try {
      const scores = calculateScores(data.answers);
      data.report = generateReport(scores, data.answers);
    } catch (e) { console.error("재계산 실패:", e); }
  }
  if (!data?.report) return alert("결과를 찾을 수 없습니다.");

  const area = el("doctorResultArea");
  area.innerHTML = "";
  renderDoctorResult(data, area);

  $$(".doctor-tab").forEach(b => b.classList.remove("active"));
  el("doctorTabSearchBtn")?.classList.add("active");
  el("doctorTabSearch").style.display = "block";
  el("doctorTabList").style.display   = "none";

  el("searchPNum").value = data.patient_number || "";
  area.scrollIntoView({ behavior: "smooth", block: "start" });
};

async function initPatient() {
  show("view-patient");
  const p = state.profile;
  el("patientHeroName").textContent = `${p?.username || "환자"}님`;
  el("patientHeroSub").textContent  = ``;

  await refreshPatientStatus();
}

async function refreshPatientStatus() {
  const { data: row } = await sb.from("survey_responses")
    .select("*")
    .or(`patient_id.eq.${state.user.id},patient_user_id.eq.${state.user.id}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const statusEl   = el("patientStatusArea");
  const startBtn   = el("btnStartSurvey");
  const resumeBtn  = el("btnResumeSurvey");
  const resultBtn  = el("btnViewMyResult");

  if (startBtn)  startBtn.style.display  = "block";
  if (resumeBtn) resumeBtn.style.display = "none";
  if (resultBtn) resultBtn.disabled      = true;

  if (row) {
    state.assessmentNo = row.assessment_no;
    state.assessmentKey = row.assessment_key;
  }

  if (row?.status === "completed") {
    statusEl.innerHTML  = `<div class="status-msg show ok">최근 설문이 완료되었습니다 (${fmtDate(row.completed_at)})</div>`;
    if (startBtn)  startBtn.textContent   = "새 설문 시작하기";
    if (resultBtn) resultBtn.disabled     = false;
    state.responseId = row.id;
  } else if (row?.status === "in_progress") {
    statusEl.innerHTML  = `<div class="status-msg show warn">진행 중인 설문이 있습니다</div>`;
    if (startBtn)  startBtn.style.display = "none";
    if (resumeBtn) resumeBtn.style.display = "block";
    state.responseId    = row.id;
    state.answers       = row.answers  || {};
    state.currentSectionIdx = row.progress?.sectionIndex || 0;
  } else {
    statusEl.innerHTML  = `<div class="status-msg show info">아직 작성한 설문이 없습니다</div>`;
    if (startBtn) startBtn.textContent = "설문 시작하기";
  }

  await loadPatientHistory();
}

async function loadPatientHistory() {
  const list = el("patientHistoryList");
  if (!list) return;
  const { data } = await sb.from("survey_responses")
    .select("id, completed_at, status, completed, assessment_no, assessment_key")
    .or(`patient_id.eq.${state.user.id},patient_user_id.eq.${state.user.id}`)
    .or("status.eq.completed,completed.eq.true")
    .order("completed_at", { ascending: false });

  if (!data?.length) {
    list.innerHTML = `<p class="text-sub" style="padding:16px 0;">완료된 설문 이력이 없습니다.</p>`;
    return;
  }

  list.innerHTML = data.map((r, i) => `
    <div class="history-item" onclick="viewMyResult('${r.id}')">
      <div class="history-dot"></div>
      <div class="history-info">
        <div class="history-date">${i === 0 ? "최근 " : ""}${fmtDate(r.completed_at)}</div>
        <div class="history-sub">${escapeHtml(r.assessment_key || `회차 ${r.assessment_no || "-"}`)}</div>
      </div>
    </div>`).join("");
}

el("btnStartSurvey")?.addEventListener("click", async () => {
  if (!confirm("새 설문을 시작하시겠습니까?")) return;
  state.answers = {}; state.currentSectionIdx = 0;
  const { data, error } = await sb.from("survey_responses").insert({
    patient_id:      state.user.id,
    patient_user_id: state.user.id,
    hospital_code:   state.profile.hospital_code,
    patient_number:  state.profile.patient_number,
    status: "in_progress",
    completed: false,
    answers: {}, progress: { sectionIndex: 0 }
  }).select().single();
  if (error) return alert("오류: " + error.message);
  state.responseId = data.id;
  state.assessmentNo = data.assessment_no;
  state.assessmentKey = data.assessment_key;
  renderSurvey();
});

el("btnResumeSurvey")?.addEventListener("click", () => renderSurvey());

el("btnViewMyResult")?.addEventListener("click", () => viewMyResult(state.responseId));

window.viewMyResult = async (rid) => {
  const { data } = await sb.from("survey_responses").select("report, scores, answers, completed_at, patient_number, assessment_no, assessment_key").eq("id", rid).single();
  let report = data?.report;
  if (data?.answers) state.answers = data.answers;

  if (data?.answers) {
    try {
      const scores = calculateScores(data.answers);
      report = generateReport(scores, data.answers);
      await sb.from("survey_responses").update({ scores, report }).eq("id", rid);
    } catch (e) { console.error("재계산 실패:", e); }
  }
  if (!report) return alert("결과를 찾을 수 없습니다.");
  state.assessmentNo = data.assessment_no;
  state.assessmentKey = data.assessment_key;
  renderResultView(report, data.completed_at, data.patient_number, data.assessment_key);
  show("view-result");
  el("btnBack").onclick = () => { show("view-patient"); refreshPatientStatus(); };
};

let autoSaveTimer = null;
function clearHighlight(key) {

  const base = key.replace(/_(yn|freq|sev|r\d+_m\d+|\d+)$/g, '');
  const row = document.getElementById(`q_${base}`) || document.getElementById(`q_${key}`);
  if (row) row.classList.remove("unanswered");
}
function triggerAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    if (!state.responseId) return;
    await sb.from("survey_responses").update({
      answers:  state.answers,
      progress: { sectionIndex: state.currentSectionIdx }
    }).eq("id", state.responseId);
  }, 1200);
}

window.saveAns    = (k, v)   => { state.answers[k] = Number(v); clearHighlight(k); triggerAutoSave(); };
window.clearAns   = (k)      => { delete state.answers[k]; triggerAutoSave(); };
window.saveChk    = (k, v)   => { state.answers[k] = v ? 1 : 0; clearHighlight(k); triggerAutoSave(); };
window.savePmsApplicability = (value) => {
  const shouldSkip = value !== "pre_menopause";
  const shouldComplete = shouldSkip && state.currentSectionIdx === SURVEY_SECTIONS.length - 1;
  state.answers.pms_applicability = value;
  state.answers.pms_skip = shouldSkip ? 1 : 0;
  triggerAutoSave();
  renderSurvey();
  if (shouldComplete) void submitSurvey({ skipConfirmation: true });
};
window.handleComplexChange = (qid, val) => {
  state.answers[`${qid}_yn`] = parseInt(val);
  clearHighlight(qid);
  triggerAutoSave();
  const sub = el(`sub_${qid}`);
  if (sub) sub.className = `mssi-sub ${val == 1 ? "open" : ""}`;
  if (val == 0) { state.answers[`${qid}_freq`] = 0; state.answers[`${qid}_sev`] = 0; }
};

function getUnanswered() {
  const section = SURVEY_SECTIONS[state.currentSectionIdx];
  if (!section) return [];

  const isPmsSection = section.title.includes("PMS") || section.title.includes("생리주기");
  if (isPmsSection && state.answers.pms_applicability && state.answers.pms_skip === 1) return [];
  if (isPmsSection && !state.answers.pms_applicability) return ["pms_applicability"];

  const missing = [];
  for (const q of section.questions) {
    if (q.type === "info") continue;

    if (isDiagChildHidden(section.id, q.id)) continue;

    if (section.id === "audit_k" && q.id !== "au1" && isAUDITSkipActive()) continue;

    if (section.type === "matrix_complex" && q.id !== "mssi21") {
      if (state.answers[`${q.id}_yn`] === undefined) { missing.push(q.id); continue; }
      if (state.answers[`${q.id}_yn`] === 1) {
        if (state.answers[`${q.id}_freq`] === undefined || state.answers[`${q.id}_sev`] === undefined) missing.push(q.id);
      }
    } else if (q.type === "matrix_months") {
      for (let r = 0; r < q.rows.length; r++) {
        let hasAnyMonth = false;
        for (let c = 0; c < 13; c++) {
          if (state.answers[`${q.id}_r${r}_m${c}`] === 1) { hasAnyMonth = true; break; }
        }
        if (!hasAnyMonth) { missing.push(q.id); break; }
      }
    } else if (q.type === "scale_matrix") {
      for (let r = 0; r < q.rows.length; r++) {
        if (state.answers[`${q.id}_${r}`] === undefined) { missing.push(q.id); break; }
      }
    } else if (q.type === "matrix_season_sleep") {
      for (let r = 0; r < q.rows.length; r++) {
        if (!state.answers[`${q.id}_${r}`] && state.answers[`${q.id}_${r}`] !== 0) { missing.push(q.id); break; }
      }
    } else if (q.type === "custom_mdq") {
      for (const sq of q.questions) {
        if (state.answers[sq.id] === undefined) { missing.push(q.id); break; }
      }
    } else if (q.type === "yesno_with_sub") {
      if (state.answers[q.id] === undefined) { missing.push(q.id); continue; }
      if (state.answers[q.id] === 1 && state.answers[q.subQuestion.id] === undefined) missing.push(q.id);
    } else {
      if (state.answers[q.id] === undefined) missing.push(q.id);
    }
  }
  return missing;
}

function validateSection() { return getUnanswered().length === 0; }

function highlightUnanswered(ids) {

  document.querySelectorAll(".q-row.unanswered").forEach(el => el.classList.remove("unanswered"));

  ids.forEach(id => {
    const row = document.getElementById(`q_${id}`);
    if (row) row.classList.add("unanswered");
  });

  if (ids.length > 0) {
    const first = document.getElementById(`q_${ids[0]}`);
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function renderSurvey() {
  show("view-survey");

  const nextBtn = el("btnNext");
  if (nextBtn) {
    nextBtn.disabled = false;
    nextBtn.textContent = state.currentSectionIdx === SURVEY_SECTIONS.length - 1
      ? "검사 완료 및 결과 보기"
      : "다음 →";
  }

  let section = SURVEY_SECTIONS[state.currentSectionIdx];

  if (!section) { submitSurvey(); return; }

  const pct = Math.round(((state.currentSectionIdx + 1) / SURVEY_SECTIONS.length) * 100);
  el("surveyBar").style.width = pct + "%";
  el("surveyProgressLabel").textContent = `${state.currentSectionIdx + 1} / ${SURVEY_SECTIONS.length} 섹션 (${pct}%)`;

  el("surveyTitle").textContent = cleanTitle(section.title);
  let desc = cleanText(section.description || "");
  if (section.type === "matrix_complex") {
    desc = `당신의 최근 2주 동안의 모습을 알아보는 검사입니다.\n최근 2주 동안 각 질문의 증상이 있었으면 "예"를 선택하고, 빈도와 심각도를 표시해 주십시오.\n증상이 없었다면 "아니오"를 선택하고 다음 문항으로 넘어가세요.`;
  }
  el("surveyDesc").textContent = desc;

  const container = el("surveyContainer");
  container.innerHTML = "";

  const isPmsSection = section.title.includes("PMS") || section.title.includes("생리주기");
  if (isPmsSection) {
    if (!state.answers.pms_applicability && state.answers.pms_skip === 0) {
      state.answers.pms_applicability = "pre_menopause";
    } else if (!state.answers.pms_applicability && state.answers.pms_skip === 1) {
      delete state.answers.pms_skip;
    }
    const banner = document.createElement("div");
    banner.className = "pms-skip-banner";
    banner.innerHTML = `
      <div class="pms-skip-title">PMS 문항 적용을 위해 해당하는 항목을 선택해 주세요.</div>
      <div class="opts-list">
        <label class="opt-list-item ${state.answers.pms_applicability==='pre_menopause'?'checked':''}">
          <input type="radio" name="pms_applicability" value="pre_menopause" ${state.answers.pms_applicability==='pre_menopause'?"checked":""} onchange="window.savePmsApplicability(this.value)"> 초경 이후이며 폐경 전인 여성
        </label>
        <label class="opt-list-item ${state.answers.pms_applicability==='not_menstruating'?'checked':''}">
          <input type="radio" name="pms_applicability" value="not_menstruating" ${state.answers.pms_applicability==='not_menstruating'?"checked":""} onchange="window.savePmsApplicability(this.value)"> 초경 전이거나 폐경 후인 여성
        </label>
        <label class="opt-list-item ${state.answers.pms_applicability==='male'?'checked':''}">
          <input type="radio" name="pms_applicability" value="male" ${state.answers.pms_applicability==='male'?"checked":""} onchange="window.savePmsApplicability(this.value)"> 남성
        </label>
      </div>`;
    container.appendChild(banner);
    if (state.answers.pms_applicability && state.answers.pms_skip === 1) {
      banner.insertAdjacentHTML("beforeend", '<div class="pms-skip-complete">PMS 문항을 건너뛰고 결과를 생성하고 있습니다. 잠시만 기다려 주세요.</div>');
      if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.textContent = "결과 생성 중...";
      }
      return;
    }
    if (!state.answers.pms_applicability) return;
  }

  section.questions.forEach((q, qIdx) => {
    if (q.type === "info") {

      const infoDiv = document.createElement("div");
      infoDiv.className = "survey-desc mt-8 mb-20";
      infoDiv.style.marginBottom = "16px";
      infoDiv.textContent = cleanText(q.text);
      container.appendChild(infoDiv);
      return;
    }

    if (section.id === "audit_k" && q.id !== "au1" && isAUDITSkipActive()) {
      state.answers[q.id] = state.answers[q.id] || 0;
      const input = document.querySelector(`input[name="${q.id}"]`);
      if (input) { input.checked = true; input.dispatchEvent(new Event('change')); }
      return;
    }

    if (isDiagChildHidden(section.id, q.id)) {
      delete state.answers[q.id];
      return;
    }

    const qRow = document.createElement("div");
    qRow.className = "q-row";
    qRow.id = `q_${q.id}`;

    if (section.type === "matrix_complex" && q.id !== "mssi21") {
      renderMSSI(q, section, qRow);
    } else if (q.type === "matrix_months") {
      renderMatrixMonths(q, qRow);
    } else if (q.type === "scale_matrix") {
      renderScaleMatrix(q, qRow);
    } else if (q.type === "matrix_season_sleep") {
      renderSeasonSleep(q, qRow);
    } else if (q.type === "custom_mdq") {
      renderCustomMDQ(q, qRow);
    } else if (q.type === "yesno_with_sub") {
      renderYesNoWithSub(q, qRow);
    } else {
      renderStandard(q, section, qRow, qIdx);
    }

    container.appendChild(qRow);
  });
}
window.renderSurvey = renderSurvey;

function renderStandard(q, section, qRow, qIdx) {
  const isMulti = q.type === "checkbox";
  let options = (section.type === "matrix_complex" && q.id === "mssi21")
    ? [{ v: 1, l: "예" }, { v: 0, l: "아니오" }]
    : (q.options || section.options || []);
  if (!options.length) options = [{ v: 1, l: "예" }, { v: 0, l: "아니오" }];

  const longOpt = options.some(o => (o.l || "").length > 12);
  const isCompact = !longOpt && options.length >= 5;
  const countClass = options.length <= 6 ? ` choice-count-${options.length}` : " choice-count-many";

  qRow.innerHTML = `
    <div class="q-text">${cleanText(q.text)}</div>
    <div class="${longOpt ? "opts-list" : "opts-row choice-grid"}${isCompact ? " compact" : ""}${longOpt ? "" : countClass}" id="opts_${q.id}"></div>`;

  const optsEl = qRow.querySelector(`#opts_${q.id}`);

  options.forEach(opt => {
    const val  = opt.v !== undefined ? opt.v : opt;
    const text = opt.l !== undefined ? cleanText(opt.l) : opt;
    const isChecked = isMulti
      ? (Array.isArray(state.answers[q.id]) && state.answers[q.id].includes(val))
      : state.answers[q.id] == val;

    if (longOpt) {
      const label = document.createElement("label");
      label.className = `opt-list-item ${isChecked ? "checked" : ""}`;
      label.innerHTML = `<input type="${isMulti ? "checkbox" : "radio"}" name="${q.id}" value="${val}" ${isChecked ? "checked" : ""}> ${text}`;
      label.querySelector("input").addEventListener("change", (e) => {
        if (isMulti) {
          let cur = state.answers[q.id] || [];
          if (!Array.isArray(cur)) cur = [];
          if (e.target.checked) cur.push(val);
          else cur = cur.filter(v => v != val);
          state.answers[q.id] = cur;
        } else {
          state.answers[q.id] = val;
          optsEl.querySelectorAll(".opt-list-item").forEach(l => l.classList.remove("checked"));
        }
        label.classList.toggle("checked", isMulti ? e.target.checked : true);
        clearHighlight(q.id);
        triggerAutoSave();
        if (section.id?.startsWith("diag_")) window.renderSurvey();
      });
      optsEl.appendChild(label);
    } else {
      const chip = document.createElement("div");
      chip.className = "opt-chip";
      chip.innerHTML = `
        <input type="${isMulti ? "checkbox" : "radio"}" id="${q.id}_${val}" name="${q.id}" value="${val}" ${isChecked ? "checked" : ""}>
        <label for="${q.id}_${val}">${text}</label>`;
      chip.querySelector("input").addEventListener("change", () => {
        state.answers[q.id] = isMulti ? undefined : val;
        if (!isMulti) state.answers[q.id] = val;
        clearHighlight(q.id);
        triggerAutoSave();
        if (section.id?.startsWith("diag_")) window.renderSurvey();
      });
      optsEl.appendChild(chip);
    }
  });
}

function renderMSSI(q, section, qRow) {
  const yn = state.answers[`${q.id}_yn`];
  qRow.innerHTML = `
    <div class="q-text">${cleanText(q.text)}</div>
    <div class="mssi-yn-wrap">
      ${["예", "아니오"].map((l, i) => {
        const v = i === 0 ? 1 : 0;
        return `<label class="opt-list-item ${yn==v?"checked":""}" style="flex:1;">
          <input type="radio" name="${q.id}_yn" value="${v}" ${yn==v?"checked":""} onchange="window.handleComplexChange('${q.id}', this.value)"> ${l}
        </label>`;
      }).join("")}
    </div>
    <div id="sub_${q.id}" class="mssi-sub ${yn==1?"open":""}">
      <div class="mssi-sub-title">빈도 (얼마나 자주?)</div>
      <div class="opts-list" id="freq_${q.id}">
        ${section.options[0].opts.map(o =>
          `<label class="opt-list-item ${state.answers[`${q.id}_freq`]==o.v?"checked":""}">
            <input type="radio" name="${q.id}_freq" value="${o.v}" ${state.answers[`${q.id}_freq`]==o.v?"checked":""}
              onchange="window.saveAns('${q.id}_freq', this.value); this.closest('.opts-list').querySelectorAll('.opt-list-item').forEach(l=>l.classList.remove('checked')); this.closest('.opt-list-item').classList.add('checked');">
            ${cleanText(o.l)}
          </label>`).join("")}
      </div>
      <div class="mssi-sub-title" style="margin-top:16px;">심각도 (얼마나 심했나요?)</div>
      <div class="opts-list" id="sev_${q.id}">
        ${section.options[1].opts.map(o =>
          `<label class="opt-list-item ${state.answers[`${q.id}_sev`]==o.v?"checked":""}">
            <input type="radio" name="${q.id}_sev" value="${o.v}" ${state.answers[`${q.id}_sev`]==o.v?"checked":""}
              onchange="window.saveAns('${q.id}_sev', this.value); this.closest('.opts-list').querySelectorAll('.opt-list-item').forEach(l=>l.classList.remove('checked')); this.closest('.opt-list-item').classList.add('checked');">
            ${cleanText(o.l)}
          </label>`).join("")}
      </div>
    </div>`;
}

function renderYesNoWithSub(q, qRow) {
  const main = state.answers[q.id];
  const sub = q.subQuestion;
  qRow.style.flexDirection = "column";
  qRow.innerHTML = `
    <div class="q-text">${cleanText(q.text)}</div>
    <div class="opts-list">
      ${(q.options || []).map(o => `
        <label class="opt-list-item ${main==o.v?"checked":""}">
          <input type="radio" name="${q.id}" value="${o.v}" ${main==o.v?"checked":""}
            onchange="window.saveAns('${q.id}', this.value); if(Number(this.value)===0){window.clearAns('${sub.id}');} window.renderSurvey();">
          ${cleanText(o.l)}
        </label>`).join("")}
    </div>
    <div class="months-section" style="${main==1 ? "" : "display:none;"}">
      <div class="months-section-title">${cleanText(sub.text)}</div>
      <div class="opts-list">
        ${(sub.options || []).map(o => `
          <label class="opt-list-item ${state.answers[sub.id]==o.v?"checked":""}">
            <input type="radio" name="${sub.id}" value="${o.v}" ${state.answers[sub.id]==o.v?"checked":""}
              onchange="window.saveAns('${sub.id}', this.value); this.closest('.opts-list').querySelectorAll('.opt-list-item').forEach(l=>l.classList.remove('checked')); this.closest('.opt-list-item').classList.add('checked');">
            ${cleanText(o.l)}
          </label>`).join("")}
      </div>
    </div>`;
}

function renderMatrixMonths(q, qRow) {
  const months = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월","차이없음"];
  qRow.style.flexDirection = "column";
  qRow.innerHTML = `<div class="q-text">${cleanText(q.text)}</div>`;
  q.rows.forEach((r, ridx) => {
    const div = document.createElement("div");
    div.className = "months-section";
    div.innerHTML = `<div class="months-section-title">${cleanText(r)}</div>
      <div class="months-grid">
        ${months.map((m, cidx) => {
          const k = `${q.id}_r${ridx}_m${cidx}`;
          const onChangeLogic = cidx === 12
            ? `window.saveChk('${k}', this.checked); if(this.checked){for(let ci=0;ci<12;ci++){window.saveChk('${q.id}_r${ridx}_m'+ci,false);document.querySelectorAll('input[name^=\"${q.id}_r${ridx}_m\"]')[ci].checked=false;}}`
            : `window.saveChk('${k}', this.checked); if(this.checked){var nc=document.querySelector('input[name=\"${q.id}_r${ridx}_m12\"]');if(nc){nc.checked=false;window.saveChk('${q.id}_r${ridx}_m12',false);}}`;
          return `<label class="month-chip"><input type="checkbox" name="${k}" ${state.answers[k]?"checked":""} onchange="${onChangeLogic}"> ${m}</label>`;
        }).join("")}
      </div>`;
    qRow.appendChild(div);
  });
}

function renderScaleMatrix(q, qRow) {
  qRow.style.flexDirection = "column";
  let html = `
    <div class="q-text">${cleanText(q.text)}</div>
    <div class="scale-matrix-wrap">
      <table class="scale-matrix">
        <thead><tr>
          <th>항목</th>${q.options.map(o => `<th>${cleanText(o.l)}</th>`).join("")}
        </tr></thead>
        <tbody>`;
  q.rows.forEach((r, ridx) => {
    html += `<tr><td>${cleanText(r)}</td>`;
    q.options.forEach(o => {
      const k = `${q.id}_${ridx}`;
      html += `<td><input type="radio" name="${k}" value="${o.v}" ${state.answers[k]==o.v?"checked":""} onchange="window.saveAns('${k}', this.value)"></td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;
  qRow.innerHTML = html;
}

function renderSeasonSleep(q, qRow) {
  qRow.style.flexDirection = "column";
  qRow.innerHTML = `
    <div class="q-text">${cleanText(q.text)}</div>
    <div class="season-grid">
      ${q.rows.map((r, ridx) => {
        const k = `${q.id}_${ridx}`;
        return `<div class="season-item"><b>${cleanText(r)}</b>
          <input type="number" min="0" max="24" step="1" value="${state.answers[k]||""}" onchange="window.saveAns('${k}', this.value)">
          <span>시간</span></div>`;
      }).join("")}
    </div>`;
}

function renderCustomMDQ(q, qRow) {
  qRow.style.flexDirection = "column";
  qRow.innerHTML = `<div class="q-text">${cleanText(q.text)}</div>`;
  q.questions.forEach(sq => {
    const opts = (sq.options?.length ? sq.options : [{ v: 1, l: "예" }, { v: 0, l: "아니오" }]);
    const div = document.createElement("div");
    div.className = "months-section";
    div.innerHTML = `
      <div class="months-section-title">${cleanText(sq.text)}</div>
      <div class="opts-list">
        ${opts.map(o => `
          <label class="opt-list-item ${state.answers[sq.id]==o.v?"checked":""}">
            <input type="radio" name="${sq.id}" value="${o.v}" ${state.answers[sq.id]==o.v?"checked":""}
              onchange="window.saveAns('${sq.id}', this.value); this.closest('.opts-list').querySelectorAll('.opt-list-item').forEach(l=>l.classList.remove('checked')); this.closest('.opt-list-item').classList.add('checked');">
            ${cleanText(o.l)}
          </label>`).join("")}
      </div>`;
    qRow.appendChild(div);
  });
}

el("btnNext")?.addEventListener("click", async () => {
  const missing = getUnanswered();
  if (missing.length > 0) {
    alert(`응답하지 않은 문항이 ${missing.length}개 있습니다.\n해당 항목으로 이동합니다.`);
    highlightUnanswered(missing);
    return;
  }
  await sb.from("survey_responses").update({
    answers: state.answers,
    progress: { sectionIndex: state.currentSectionIdx }
  }).eq("id", state.responseId);

  if (state.currentSectionIdx < SURVEY_SECTIONS.length - 1) {
    state.currentSectionIdx++;
    renderSurvey();
    window.scrollTo(0, 0);
  } else {
    submitSurvey();
  }
});

el("btnPrev")?.addEventListener("click", () => {
  if (state.currentSectionIdx > 0) {
    state.currentSectionIdx--;
    renderSurvey();
    window.scrollTo(0, 0);
  }
});

el("btnSaveQuit")?.addEventListener("click", async () => {
  await sb.from("survey_responses").update({
    answers: state.answers,
    progress: { sectionIndex: state.currentSectionIdx }
  }).eq("id", state.responseId);
  alert("저장 완료! 나중에 이어서 할 수 있습니다.");
  show("view-patient");
  refreshPatientStatus();
});

async function submitSurvey({ skipConfirmation = false } = {}) {
  if (!skipConfirmation && !confirm("모든 설문이 완료되었습니다. 제출하시겠습니까?")) return;

  try {
    const { data, error } = await sb.functions.invoke("submit-survey", {
      body: { responseId: state.responseId, answers: state.answers }
    });
    if (error || data?.status !== "ok" || !data.report) {
      throw error || new Error(data?.error || "제출 처리에 실패했습니다.");
    }

    alert("설문이 성공적으로 제출되었습니다.");
    renderResultView(data.report, data.completedAt, state.profile?.patient_number, state.assessmentKey);
    show("view-result");
    el("btnBack").onclick = () => { show("view-patient"); refreshPatientStatus(); };

  } catch (err) {
    console.error(err);
    alert("제출을 완료하지 못했습니다. 응답은 임시 저장되었으니 잠시 후 다시 제출해 주세요.");
  }
}
window.submitSurvey = submitSurvey;

function renderResultView(report, completedAt, patientNumber, assessmentKey) {
  el("resultDate").textContent    = fmtDate(completedAt);
  el("resultPatNum").textContent  = patientNumber ? `번호: ${assessmentKey || patientNumber}` : "";

  const instructions = (report && report.instructions) ? report.instructions : getGlobalInstructions();
  el("resultInstructions").textContent = instructions;

  const infoEl = el("resultPatientInfo");
  if (infoEl && state.profile) {
    const p = state.profile;
    const dobYear = p.dob ? escapeHtml(p.dob.slice(0, 4)) : "-";
    infoEl.innerHTML = `
      <span class="meta-label">출생연도:</span><span class="meta-value">${dobYear}</span>
      &nbsp;&nbsp;<span class="meta-label">병원코드:</span><span class="meta-value">${escapeHtml(p.hospital_code || "-")}</span>
      &nbsp;&nbsp;<span class="meta-label">번호:</span><span class="meta-value">${escapeHtml(assessmentKey || p.patient_number || "-")}</span>`;
  }

  const content = el("resultTableContent");
  renderReportHTML(report, content);
  content.insertAdjacentHTML("beforeend", renderAnswerRawHTML(state.answers || {}));
}

function renderReportHTML(report, container) {
  if (!container || !report) return;

  function fmtScore(val) {
    if (val === undefined || val === null) return "-";
    if (typeof val === 'number') return Number.isInteger(val) ? String(val) : parseFloat(val.toFixed(2)).toString();
    return String(val);
  }

  function fmtRank(r) {
    return typeof r === "number" ? r + "등" : (r || "-");
  }

  const sections = report.sections || [];

  container.innerHTML = sections.map(section => {
    const groups = section.groups || [];

    let groupsHTML = groups.map(group => {
      let html = "";

      if (group.label && group.type !== "comorbidity") {
        html += `<div class="group-label">${escapeHtml(group.label)}</div>`;
      }

      if (group.description) {
        html += `<div class="section-desc-block">${escapeHtml(group.description)}</div>`;
      }

      if (group.type === "comorbidity") {
        const items = group.items || [];
        html += `<div class="group-label">${escapeHtml(group.label)}</div>`;
        html += `<table class="result-table comorbidity-table"><tbody>`;
        items.forEach(item => {
          const cls = item.value === 'O' ? 'comorbid-positive' : 'comorbid-negative';
          html += `<tr><td class="comorbid-name">${escapeHtml(item.name)}</td><td class="comorbid-val ${cls}">${escapeHtml(item.value)}</td></tr>`;
        });
        html += `</tbody></table>`;
        return html;
      }

      const rows = group.rows || [];
      if (rows.length === 0) return html;

      const hasSpecial = rows.some(r => r.specialCols);

      if (hasSpecial) {

        html += `<div class="result-table-wrap" role="region" tabindex="0" aria-label="결과표. 좌우로 밀어 전체 항목을 확인할 수 있습니다."><table class="result-table">
          <thead><tr>
            <th class="col-name">검사명</th>
            <th class="col-score">결과</th>
            <th class="col-score">점수</th>
            <th class="col-rank">환자비교백분위</th>
            <th class="col-rank">정상군비교백분위</th>
          </tr></thead>
          <tbody>`;
        rows.forEach(r => {
          const name = escapeHtml(r.name);
          const subCls = r.sub ? " sub-item" : "";
          if (r.textOnly) {
            html += `<tr><td class="name-cell${subCls}">${name}</td><td class="score-cell" colspan="4">${escapeHtml(fmtScore(r.score))}</td></tr>`;
          } else if (r.specialCols) {
            const pRank = fmtRank(r.pat_rank);
            const nRank = fmtRank(r.nor_rank);
            html += `<tr>
              <td class="name-cell${subCls}">${name}</td>
              <td class="score-cell">${escapeHtml(r.extra)}</td>
              <td class="score-cell">${escapeHtml(fmtScore(r.score))}</td>
              <td class="rank-cell" style="color:${reportRankColor(r.pat_rank, r.pat_color)}">${escapeHtml(pRank)}</td>
              <td class="rank-cell" style="color:${reportRankColor(r.nor_rank, r.nor_color)}">${escapeHtml(nRank)}</td>
            </tr>`;
            if (r.description) {
              html += `<tr class="desc-row"><td colspan="5" class="desc-cell-block">${escapeHtml(r.description)}</td></tr>`;
            }
          } else {
            const pRank = fmtRank(r.pat_rank);
            const nRank = fmtRank(r.nor_rank);
            html += `<tr>
              <td class="name-cell${subCls}">${name}</td>
              <td class="score-cell" colspan="2">${escapeHtml(fmtScore(r.score))}</td>
              <td class="rank-cell" style="color:${reportRankColor(r.pat_rank, r.pat_color)}">${escapeHtml(pRank)}</td>
              <td class="rank-cell" style="color:${reportRankColor(r.nor_rank, r.nor_color)}">${escapeHtml(nRank)}</td>
            </tr>`;
            if (!r.sub && r.description) {
              html += `<tr class="desc-row"><td colspan="5" class="desc-cell-block">${escapeHtml(r.description)}</td></tr>`;
            }
          }
        });
        html += `</tbody></table></div>`;
      } else {

        html += `<div class="result-table-wrap" role="region" tabindex="0" aria-label="결과표. 좌우로 밀어 전체 항목을 확인할 수 있습니다."><table class="result-table">
          <thead><tr>
            <th class="col-name">검사명</th>
            <th class="col-score">응답결과</th>
            <th class="col-rank">환자비교백분위</th>
            <th class="col-rank">정상군비교백분위</th>
          </tr></thead>
          <tbody>`;
        rows.forEach(r => {
          const name = escapeHtml(r.name);
          const subCls = r.sub ? " sub-item" : "";
          if (r.textOnly) {
            html += `<tr><td class="name-cell${subCls}">${name}</td><td class="score-cell" colspan="3">${escapeHtml(fmtScore(r.score))}</td></tr>`;
          } else {
            const pRank = fmtRank(r.pat_rank);
            const nRank = fmtRank(r.nor_rank);
            html += `<tr>
              <td class="name-cell${subCls}">${name}</td>
              <td class="score-cell">${escapeHtml(fmtScore(r.score))}</td>
              <td class="rank-cell" style="color:${reportRankColor(r.pat_rank, r.pat_color)}">${escapeHtml(pRank)}</td>
              <td class="rank-cell" style="color:${reportRankColor(r.nor_rank, r.nor_color)}">${escapeHtml(nRank)}</td>
            </tr>`;
            if (!r.sub && r.description) {
              html += `<tr class="desc-row"><td colspan="4" class="desc-cell-block">${escapeHtml(r.description)}</td></tr>`;
            }
          }
        });
        html += `</tbody></table></div>`;
      }

      return html;
    }).join("");

    return `
      <div class="result-category">
        <div class="result-section-title">${escapeHtml(section.title)}</div>
        ${groupsHTML}
      </div>`;
  }).join("");
}

el("btnPrintResult")?.addEventListener("click", () => window.print());
el("btnBack")?.addEventListener("click", () => { show("view-patient"); refreshPatientStatus(); });

function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}
