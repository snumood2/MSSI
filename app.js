/**
 * app.js  ─  기분장애 설문 웹앱 (완성판)
 * ─────────────────────────────────────
 * 역할 분리
 *   patient  : 설문 작성 / 결과 조회
 *   doctor   : 환자 검색 + 결과 열람 + 환자 목록
 *   admin    : 의사 승인 / 전체 관리
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, PATIENT_EMAIL_DOMAIN, DOCTOR_EMAIL_DOMAIN, ADMIN_EMAIL } from "./config.js";
import { SURVEY_SECTIONS } from "./questions.js";
import { calculateScores, generateReport, getGlobalInstructions } from "./scoring.js";

// ─── 인메모리 스토리지 (localStorage 대체) ───
const _store = {};
const safeStorage = {
  getItem: (k)    => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; },
  clear: ()       => { Object.keys(_store).forEach(k => delete _store[k]); }
};

// ══════════════════════════════════════════════════════════════
// 1. 초기화
// ══════════════════════════════════════════════════════════════
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  user: null,
  profile: null,
  answers: {},
  currentSectionIdx: 0,
  responseId: null,
};

// ── DOM 유틸 ──
const $  = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const el = id  => document.getElementById(id);

// ── 뷰 전환 ──
function show(id) {
  $$(".view").forEach(v => v.classList.remove("active"));
  const target = el(id);
  if (target) { target.classList.add("active"); window.scrollTo(0, 0); }
}

// ── 상태 메시지 ──
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

// ── 텍스트 정제 ──
const cleanText  = t => t ? t.replace(/\[cite:[^\]]*\]/g, "").trim() : "";
const cleanTitle = t => t ? t.replace(/\s*\([^)]+\)/g, "").trim() : "";

// ── 날짜 포맷 ──
function fmtDate(str) {
  if (!str) return "-";
  const d = new Date(str);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

// ══════════════════════════════════════════════════════════════
// 2. 앱 시작 / 인증
// ══════════════════════════════════════════════════════════════

// 아이디 자동완성
window.addEventListener("DOMContentLoaded", () => {
  const saved = safeStorage.getItem("saved_id") || "";
  if (saved) {
    ["p_id", "d_login_id"].forEach(id => { if (el(id)) el(id).value = saved; });
    if (el("a_email") && saved.includes("@")) el("a_email").value = saved;
    if (el("saveIdCheck")) el("saveIdCheck").checked = true;
  }
  // 앱 초기화 버튼
  el("btnHardReset")?.addEventListener("click", async () => {
    if (!confirm("로그인 정보를 초기화하고 새로고침합니다.")) return;
    await sb.auth.signOut();
    safeStorage.clear();
    safeStorage.clear();
    location.reload();
  });
});

// 탭 전환 (응답자 / 의사 / 관리자)
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

function renderAuthMode() {
  el("authTitle").textContent  = authMode === "login" ? "로그인" : "회원가입";
  el("btnLoginAction").textContent = authMode === "login" ? "로그인" : "가입하기";
  $$(".signup-only").forEach(e => e.style.display = authMode === "signup" ? "block" : "none");
  const loginOnly = $(".login-only");
  if (selectedRole === "doctor" && loginOnly)
    loginOnly.style.display = authMode === "signup" ? "none" : "block";
  clearMsg("authMsg");
}

// ── 로그인 / 가입 처리 ──
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
      // admin
      rawId = el("a_email").value.trim();
      email = rawId; pw = el("a_pw").value;
      if (email.toLowerCase() !== ADMIN_EMAIL) throw "관리자 계정이 아닙니다.";
    }

    if (!pw) throw "비밀번호를 입력하세요.";

    // 아이디 저장
    const saveCheck = el("saveIdCheck");
    if (saveCheck?.checked) safeStorage.setItem("saved_id", selectedRole === "admin" ? email : rawId);
    else safeStorage.removeItem("saved_id");

    if (authMode === "signup") {
      if (selectedRole === "admin") throw "관리자는 가입 불가합니다.";

      // 환자는 병원코드 검증
      if (selectedRole === "patient") {
        const hCode = el("p_hcode").value.trim();
        if (!hCode) throw "병원코드를 입력하세요.";
        const { data: docProf } = await sb.from("profiles").select("id").eq("hospital_code", hCode).eq("role", "doctor").maybeSingle();
        if (!docProf) throw "존재하지 않거나 미승인된 병원코드입니다.";
      }

      // signUp metadata에 모든 정보를 담아 전송 → handle_new_user 트리거가 profiles 자동 생성
      let signUpMeta;
      if (selectedRole === "patient") {
        signUpMeta = {
          role: "patient",
          username: rawId,
          dob: el("p_dob").value,
          gender: el("p_gender").value,
          hospital_code: el("p_hcode").value.trim(),
          patient_number: el("p_pnum").value.trim()
        };
      } else {
        signUpMeta = {
          role: "doctor_pending",
          username: rawId,
          contact_email: email,
          doctor_name: el("d_name").value.trim(),
          hospital_name: el("d_hname").value.trim(),
          dob: el("d_dob").value,
          hospital_code: Math.random().toString(36).substring(2, 8).toUpperCase()
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

// ── 인증 상태 변경 감지 ──
sb.auth.onAuthStateChange(async (event, session) => {
  state.user = session?.user || null;

  const logoutBtn = el("btnLogout");
  const userBadge = el("userBadge");

  if (!state.user) {
    if (logoutBtn) logoutBtn.style.display = "none";
    if (userBadge) userBadge.style.display = "none";
    show("view-auth");
    renderAuthForms();
    return;
  }

  // 설문 진행 중이면 화면 유지
  const surveyView = el("view-survey");
  if (surveyView?.classList.contains("active") && event === "TOKEN_REFRESHED") return;

  if (logoutBtn) logoutBtn.style.display = "block";

  // 관리자 패스트트랙
  if (state.user.email?.toLowerCase() === ADMIN_EMAIL) {
    const adminMeta = { id: state.user.id, role: "admin", username: "admin", doctor_name: "총괄관리자", hospital_name: "서울대학교" };
    state.profile = adminMeta;
    await sb.from("profiles").upsert(adminMeta);
    if (userBadge) { userBadge.textContent = "관리자"; userBadge.style.display = "block"; }
    initAdmin(); return;
  }

  // 프로필 로드 (최대 5회 재시도)
  let prof = null;
  for (let i = 0; i < 5; i++) {
    const { data } = await sb.from("profiles").select("*").eq("id", state.user.id).maybeSingle();
    if (data) { prof = data; break; }
    await new Promise(r => setTimeout(r, 600));
  }

  if (!prof) {
    show("view-auth");
    setMsg("authMsg", "프로필 정보를 찾을 수 없습니다. 새로고침해 주세요.", "error");
    return;
  }

  state.profile = prof;
  const roleLabel = { patient: "응답자", doctor: "의사", admin: "관리자", doctor_pending: "승인대기" };
  if (userBadge) { userBadge.textContent = roleLabel[prof.role] || prof.role; userBadge.style.display = "block"; }

  if (prof.role === "admin")          initAdmin();
  else if (prof.role === "patient")   initPatient();
  else if (prof.role === "doctor")    initDoctor();
  else if (prof.role === "doctor_pending") showPendingScreen();
});

// 로그아웃
el("btnLogout")?.addEventListener("click", async () => {
  await sb.auth.signOut();
  safeStorage.removeItem("supabase.auth.token");
  location.reload();
});

// ══════════════════════════════════════════════════════════════
// 3. 승인 대기 화면
// ══════════════════════════════════════════════════════════════
function showPendingScreen() {
  show("view-pending");
  const name = state.profile?.doctor_name || state.profile?.username || "선생님";
  const pendName = el("pendingName"); if (pendName) pendName.textContent = name;
}
el("btnPendingRefresh")?.addEventListener("click", () => location.reload());

// ══════════════════════════════════════════════════════════════
// 4. 관리자
// ══════════════════════════════════════════════════════════════
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
        <div class="sub">${d.hospital_name || "-"} &nbsp;|&nbsp; ${d.contact_email || "-"}</div>
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
        <button class="btn secondary sm reset-btn" data-id="${d.id}" data-dob="${d.dob||''}">비밀번호 초기화</button>
      </div>
    </div>`).join("");
}

// 관리자 버튼 이벤트 위임
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
    const { id, dob } = e.target.dataset;
    const newPw = dob ? dob.replace(/-/g, "") : "000000";
    if (!confirm(`비밀번호를 '${newPw}'(으)로 초기화하시겠습니까?`)) return;
    const { error } = await sb.rpc("admin_reset_password", { target_user_id: id, new_password: newPw });
    if (error) alert("오류: " + error.message);
    else alert("비밀번호 초기화 완료");
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
  const { data } = await sb.from("survey_responses").select("*").eq("status", "completed");
  if (!data?.length) return alert("데이터가 없습니다.");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `survey_export_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
});

// ══════════════════════════════════════════════════════════════
// 5. 의사 대시보드
// ══════════════════════════════════════════════════════════════
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

// 탭 전환
$$(".doctor-tab").forEach(btn => btn.addEventListener("click", () => {
  $$(".doctor-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const tab = btn.dataset.tab;
  el("doctorTabSearch").style.display = tab === "search" ? "block" : "none";
  el("doctorTabList").style.display   = tab === "list"   ? "block" : "none";
}));

// 환자 검색
el("btnSearchPatient")?.addEventListener("click", searchPatient);
el("searchPNum")?.addEventListener("keydown", e => { if (e.key === "Enter") searchPatient(); });

async function searchPatient() {
  const pNum = el("searchPNum").value.trim();
  if (!pNum) return alert("환자번호를 입력하세요.");
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
  const meta = `
    <div class="patient-result-meta">
      <div class="meta-item"><span class="meta-label">환자번호</span><span class="meta-value">${row.patient_number || "-"}</span></div>
      <div class="meta-item"><span class="meta-label">완료일</span><span class="meta-value">${fmtDate(row.completed_at)}</span></div>
    </div>`;

  container.innerHTML = `
    <div class="patient-result-card">
      <div class="divider" style="margin-top:0;"></div>
      <h3 style="font-size:18px;font-weight:800;margin-bottom:16px;">검사 결과</h3>
      ${meta}
      <div id="drReportContent"></div>
      <div class="print-btn-wrap">
        <button class="btn secondary" onclick="window.print()">인쇄</button>
      </div>
    </div>`;

  renderReportHTML(row.report, el("drReportContent"));
}

// 환자 목록 (의사 병원코드 기준)
async function loadDoctorPatientList() {
  const list = el("doctorPatientList");
  if (!list) return;
  list.innerHTML = `<p class="text-sub mt-8">로딩 중...</p>`;
  const hCode = state.profile?.hospital_code;
  if (!hCode) { list.innerHTML = `<p class="text-sub mt-8">병원코드가 없습니다.</p>`; return; }

  const { data, error } = await sb.from("survey_responses")
    .select("id, patient_number, status, completed_at, created_at")
    .eq("hospital_code", hCode)
    .eq("status", "completed")
    .order("completed_at", { ascending: false });

  if (error || !data?.length) {
    list.innerHTML = `<p class="text-sub mt-8" style="padding:20px 0;">완료된 설문이 없습니다.</p>`;
    return;
  }

  list.innerHTML = data.map(r => `
    <div class="history-item" data-response-id="${r.id}" style="cursor:pointer;">
      <div class="history-dot"></div>
      <div class="history-info">
        <div class="history-date">환자번호: ${r.patient_number || "미입력"}</div>
        <div class="history-sub">완료: ${fmtDate(r.completed_at)}</div>
      </div>
      <button class="btn secondary sm" onclick="viewResponseById('${r.id}')">결과보기</button>
    </div>`).join("");
}

window.viewResponseById = async (responseId) => {
  const { data } = await sb.from("survey_responses").select("*").eq("id", responseId).single();
  if (!data?.report) return alert("결과를 찾을 수 없습니다.");
  
  // 결과 화면으로 이동
  const area = el("doctorResultArea");
  area.innerHTML = "";
  renderDoctorResult(data, area);

  // 검색 탭으로 전환
  $$(".doctor-tab").forEach(b => b.classList.remove("active"));
  el("doctorTabSearchBtn")?.classList.add("active");
  el("doctorTabSearch").style.display = "block";
  el("doctorTabList").style.display   = "none";

  el("searchPNum").value = data.patient_number || "";
  area.scrollIntoView({ behavior: "smooth", block: "start" });
};

// ══════════════════════════════════════════════════════════════
// 6. 환자 대시보드
// ══════════════════════════════════════════════════════════════
async function initPatient() {
  show("view-patient");
  const p = state.profile;
  const genderStr = p?.gender === "male" ? "남성" : (p?.gender === "female" ? "여성" : "-");

  el("patientHeroName").textContent = `${p?.username || "환자"}님`;
  el("patientHeroSub").textContent  = `${genderStr}`;

  await refreshPatientStatus();
}

async function refreshPatientStatus() {
  const { data: row } = await sb.from("survey_responses")
    .select("*")
    .eq("patient_user_id", state.user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const statusEl   = el("patientStatusArea");
  const startBtn   = el("btnStartSurvey");
  const resumeBtn  = el("btnResumeSurvey");
  const resultBtn  = el("btnViewMyResult");

  // 상태 초기화
  if (startBtn)  startBtn.style.display  = "block";
  if (resumeBtn) resumeBtn.style.display = "none";
  if (resultBtn) resultBtn.disabled      = true;

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

  // 이전 결과 목록 로드
  await loadPatientHistory();
}

async function loadPatientHistory() {
  const list = el("patientHistoryList");
  if (!list) return;
  const { data } = await sb.from("survey_responses")
    .select("id, completed_at, status")
    .eq("patient_user_id", state.user.id)
    .eq("status", "completed")
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
        <div class="history-sub">완료된 검사</div>
      </div>
    </div>`).join("");
}

// 설문 시작
el("btnStartSurvey")?.addEventListener("click", async () => {
  if (!confirm("새 설문을 시작하시겠습니까?")) return;
  state.answers = {}; state.currentSectionIdx = 0;
  const { data, error } = await sb.from("survey_responses").insert({
    patient_user_id: state.user.id,
    hospital_code:   state.profile.hospital_code,
    patient_number:  state.profile.patient_number,
    status: "in_progress",
    answers: {}, progress: { sectionIndex: 0 }
  }).select().single();
  if (error) return alert("오류: " + error.message);
  state.responseId = data.id;
  renderSurvey();
});

// 이어하기
el("btnResumeSurvey")?.addEventListener("click", () => renderSurvey());

// 내 결과 보기
el("btnViewMyResult")?.addEventListener("click", () => viewMyResult(state.responseId));

window.viewMyResult = async (rid) => {
  const { data } = await sb.from("survey_responses").select("report, completed_at, patient_number").eq("id", rid).single();
  if (!data?.report) return alert("결과를 찾을 수 없습니다.");
  renderResultView(data.report, data.completed_at, data.patient_number);
  show("view-result");
  el("btnBack").onclick = () => { show("view-patient"); refreshPatientStatus(); };
};

// ══════════════════════════════════════════════════════════════
// 7. 설문 엔진
// ══════════════════════════════════════════════════════════════

// 자동 저장
let autoSaveTimer = null;
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

// 전역 답변 저장 함수 (인라인 onchange에서 호출)
window.saveAns    = (k, v)   => { state.answers[k] = Number(v); triggerAutoSave(); };
window.saveChk    = (k, v)   => { state.answers[k] = v ? 1 : 0; triggerAutoSave(); };
window.savePmsSkip = (v)     => { state.answers["pms_skip"] = Number(v); triggerAutoSave(); renderSurvey(); };
window.handleComplexChange = (qid, val) => {
  state.answers[`${qid}_yn`] = parseInt(val);
  triggerAutoSave();
  const sub = el(`sub_${qid}`);
  if (sub) sub.className = `mssi-sub ${val == 1 ? "open" : ""}`;
  if (val == 0) { state.answers[`${qid}_freq`] = 0; state.answers[`${qid}_sev`] = 0; }
};

// 유효성 검사
function validateSection() {
  const section = SURVEY_SECTIONS[state.currentSectionIdx];
  if (!section) return true;

  const isPmsSection = section.title.includes("PMS") || section.title.includes("생리주기");
  if (isPmsSection && state.profile?.gender === "male") return true;
  if (isPmsSection && state.answers["pms_skip"] === 1)  return true;
  if (isPmsSection && state.answers["pms_skip"] === undefined) return false; // 반드시 선택

  for (const q of section.questions) {
    if (q.type === "info") continue;

    if (section.type === "matrix_complex" && q.id !== "mssi21") {
      if (state.answers[`${q.id}_yn`] === undefined) return false;
      if (state.answers[`${q.id}_yn`] === 1) {
        if (state.answers[`${q.id}_freq`] === undefined || state.answers[`${q.id}_sev`] === undefined) return false;
      }
    } else if (q.type === "matrix_months") {
      // optional – 체크 없어도 허용
    } else if (q.type === "scale_matrix") {
      for (let r = 0; r < q.rows.length; r++) {
        if (state.answers[`${q.id}_${r}`] === undefined) return false;
      }
    } else if (q.type === "matrix_season_sleep") {
      for (let r = 0; r < q.rows.length; r++) {
        if (!state.answers[`${q.id}_${r}`] && state.answers[`${q.id}_${r}`] !== 0) return false;
      }
    } else if (q.type === "custom_mdq") {
      for (const sq of q.questions) {
        if (state.answers[sq.id] === undefined) return false;
      }
    } else {
      if (state.answers[q.id] === undefined) return false;
    }
  }
  return true;
}

// ─── 설문 렌더링 ───
function renderSurvey() {
  show("view-survey");

  let section = SURVEY_SECTIONS[state.currentSectionIdx];

  // 남성이면 PMS 건너뛰기
  while (section && (section.title.includes("PMS") || section.title.includes("생리주기")) && state.profile?.gender === "male") {
    if (state.currentSectionIdx < SURVEY_SECTIONS.length - 1) {
      state.currentSectionIdx++;
      section = SURVEY_SECTIONS[state.currentSectionIdx];
    } else {
      submitSurvey(); return;
    }
  }
  if (!section) { submitSurvey(); return; }

  // 프로그레스
  const pct = Math.round(((state.currentSectionIdx + 1) / SURVEY_SECTIONS.length) * 100);
  el("surveyBar").style.width = pct + "%";
  el("surveyProgressLabel").textContent = `${state.currentSectionIdx + 1} / ${SURVEY_SECTIONS.length} 섹션 (${pct}%)`;

  // 타이틀 / 설명
  el("surveyTitle").textContent = cleanTitle(section.title);
  let desc = cleanText(section.description || "");
  if (section.type === "matrix_complex") {
    desc = `당신의 최근 2주 동안의 모습을 알아보는 검사입니다.\n최근 2주 동안 각 질문의 증상이 있었으면 "예"를 선택하고, 빈도와 심각도를 표시해 주십시오.\n증상이 없었다면 "아니오"를 선택하고 다음 문항으로 넘어가세요.`;
  }
  el("surveyDesc").textContent = desc;

  const container = el("surveyContainer");
  container.innerHTML = "";

  // PMS 사전 선택 배너
  const isPmsSection = section.title.includes("PMS") || section.title.includes("생리주기");
  if (isPmsSection) {
    const banner = document.createElement("div");
    banner.className = "pms-skip-banner";
    banner.innerHTML = `
      <div class="pms-skip-title">📋 사전 확인: 폐경이 되었거나 아직 생리를 시작하지 않으셨나요?</div>
      <div class="opts-list">
        <label class="opt-list-item ${state.answers["pms_skip"]==1?'checked':''}">
          <input type="radio" name="pms_skip" value="1" ${state.answers["pms_skip"]==1?"checked":""} onchange="window.savePmsSkip(1)"> 예 (해당함 – 이 섹션 건너뜁니다)
        </label>
        <label class="opt-list-item ${state.answers["pms_skip"]==0?'checked':''}">
          <input type="radio" name="pms_skip" value="0" ${state.answers["pms_skip"]==0?"checked":""} onchange="window.savePmsSkip(0)"> 아니오 (해당 없음 – 질문에 응답합니다)
        </label>
      </div>`;
    container.appendChild(banner);
    if (state.answers["pms_skip"] == 1) return; // 나머지 질문 렌더 안 함
    if (state.answers["pms_skip"] === undefined) return; // 선택 전이면 질문 안 보여줌
  }

  // 각 질문 렌더
  section.questions.forEach((q, qIdx) => {
    if (q.type === "info") {
      // 안내 텍스트
      const infoDiv = document.createElement("div");
      infoDiv.className = "survey-desc mt-8 mb-20";
      infoDiv.style.marginBottom = "16px";
      infoDiv.textContent = cleanText(q.text);
      container.appendChild(infoDiv);
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
    } else {
      renderStandard(q, section, qRow, qIdx);
    }

    container.appendChild(qRow);
  });
}

// ─── 표준 라디오/체크박스 ───
function renderStandard(q, section, qRow, qIdx) {
  const isMulti = q.type === "checkbox";
  let options = q.options || section.options || [];
  if (!options.length) options = [{ v: 1, l: "예" }, { v: 0, l: "아니오" }];

  const longOpt = options.some(o => (o.l || "").length > 12);

  qRow.innerHTML = `
    <div class="q-text">${cleanText(q.text)}</div>
    <div class="${longOpt ? "opts-list" : "opts-row"}" id="opts_${q.id}"></div>`;

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
        triggerAutoSave();
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
        triggerAutoSave();
      });
      optsEl.appendChild(chip);
    }
  });
}

// ─── MSSI (복합 빈도×심각도) ───
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

// ─── 월별 체크박스 ───
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
          return `<label class="month-chip"><input type="checkbox" ${state.answers[k]?"checked":""} onchange="window.saveChk('${k}', this.checked)"> ${m}</label>`;
        }).join("")}
      </div>`;
    qRow.appendChild(div);
  });
}

// ─── Scale Matrix (표) ───
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

// ─── 계절/수면 (숫자 입력) ───
function renderSeasonSleep(q, qRow) {
  qRow.style.flexDirection = "column";
  qRow.innerHTML = `
    <div class="q-text">${cleanText(q.text)}</div>
    <div class="season-grid">
      ${q.rows.map((r, ridx) => {
        const k = `${q.id}_${ridx}`;
        return `<div class="season-item"><b>${cleanText(r)}</b>
          <input type="number" min="0" max="24" step="0.5" value="${state.answers[k]||""}" onchange="window.saveAns('${k}', this.value)">
          <span>시간</span></div>`;
      }).join("")}
    </div>`;
}

// ─── K-MDQ 커스텀 ───
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

// ─── 다음 버튼 ───
el("btnNext")?.addEventListener("click", async () => {
  if (!validateSection()) {
    alert("응답하지 않은 문항이 있습니다.\n화면을 위로 올려 모든 항목에 응답해 주세요.");
    window.scrollTo({ top: 0, behavior: "smooth" });
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

// ─── 이전 버튼 ───
el("btnPrev")?.addEventListener("click", () => {
  if (state.currentSectionIdx > 0) {
    state.currentSectionIdx--;
    renderSurvey();
    window.scrollTo(0, 0);
  }
});

// ─── 임시저장 ───
el("btnSaveQuit")?.addEventListener("click", async () => {
  await sb.from("survey_responses").update({
    answers: state.answers,
    progress: { sectionIndex: state.currentSectionIdx }
  }).eq("id", state.responseId);
  alert("저장 완료! 나중에 이어서 할 수 있습니다.");
  show("view-patient");
  refreshPatientStatus();
});

// ─── 최종 제출 ───
async function submitSurvey() {
  if (!confirm("모든 설문이 완료되었습니다. 제출하시겠습니까?")) return;

  try {
    const scores = calculateScores(state.answers);
    const report = generateReport(scores, state.answers);

    await sb.from("survey_responses").update({
      answers: state.answers, scores, report,
      status: "completed",
      completed_at: new Date().toISOString()
    }).eq("id", state.responseId);

    alert("설문이 성공적으로 제출되었습니다.");
    renderResultView(report, new Date().toISOString(), state.profile?.patient_number);
    show("view-result");
    el("btnBack").onclick = () => { show("view-patient"); refreshPatientStatus(); };

  } catch (err) {
    console.error(err);
    // 채점 실패해도 저장은 시도
    await sb.from("survey_responses").update({
      answers: state.answers, status: "completed",
      completed_at: new Date().toISOString()
    }).eq("id", state.responseId);
    alert("제출 완료 (결과 계산 오류 발생 – 의사에게 문의하세요).");
    show("view-patient");
    refreshPatientStatus();
  }
}
window.submitSurvey = submitSurvey;

// ══════════════════════════════════════════════════════════════
// 8. 결과 리포트 렌더링
// ══════════════════════════════════════════════════════════════
function renderResultView(report, completedAt, patientNumber) {
  el("resultDate").textContent    = fmtDate(completedAt);
  el("resultPatNum").textContent  = patientNumber ? `환자번호: ${patientNumber}` : "";
  el("resultInstructions").textContent = getGlobalInstructions();

  const content = el("resultTableContent");
  renderReportHTML(report, content);
}

function renderReportHTML(report, container) {
  if (!container || !report) return;

  // 카테고리별 그룹핑
  const grouped = {};
  const catOrder = [];
  report.forEach(r => {
    if (!grouped[r.category]) { grouped[r.category] = []; catOrder.push(r.category); }
    grouped[r.category].push(r);
  });

  const catNames = {
    "선별": "선별 검사", "상태": "현재 기분 상태", "공존": "공존 장애 선별",
    "기질": "정서 기질 (TEMPS-A)", "특성": "기분변동성 기질 (MIQ-T)",
    "외상": "아동기 외상 (CTQ)", "대인": "대인관계 민감도 (IPSM)",
    "자원": "회복 자원", "패턴": "행동 패턴 (BIS/BAS)",
    "중독": "음주 경향 (AUDIT)", "수면": "수면/일주기 유형",
    "계절": "계절성 우울", "주의": "주의집중 (ADHD)",
    "성격": "성격 특성", "신체": "생리 주기 관련 (PMS)"
  };

  container.innerHTML = catOrder.map(cat => {
    const rows = grouped[cat];
    return `
      <div class="result-category">
        <div class="result-category-title">${catNames[cat] || cat}</div>
        <div class="result-table-wrap">
          <table class="result-table">
            <thead>
              <tr>
                <th>검사명</th>
                <th>결과</th>
                <th>환자군 백분위</th>
                <th>정상군 백분위</th>
                <th>설명</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => {
                const pRank = typeof r.pat_rank === "number" ? r.pat_rank + "등" : r.pat_rank;
                const nRank = typeof r.nor_rank === "number" ? r.nor_rank + "등" : r.nor_rank;
                return `
                  <tr>
                    <td>${r.name}</td>
                    <td class="score-cell">${r.score}</td>
                    <td class="rank-cell" style="color:${r.pat_color||'inherit'}">${pRank}</td>
                    <td class="rank-cell" style="color:${r.nor_color||'inherit'}">${nRank}</td>
                    <td class="desc-cell">${r.description || ""}</td>
                  </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }).join("");
}

el("btnPrintResult")?.addEventListener("click", () => window.print());
el("btnBack")?.addEventListener("click", () => { show("view-patient"); refreshPatientStatus(); });
