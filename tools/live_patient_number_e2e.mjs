import fs from "node:fs";
import { randomBytes } from "node:crypto";

const config = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
const supabaseUrl = config.match(/SUPABASE_URL = ENV\.VITE_SUPABASE_URL \|\| "([^"]+)"/)?.[1];
const anonKey = config.match(/SUPABASE_ANON_KEY = ENV\.VITE_SUPABASE_ANON_KEY \|\| "([^"]+)"/)?.[1];
const secretLines = fs.readFileSync(new URL("../../supabase_token.txt", import.meta.url), "utf8").split(/\r?\n/).map(line => line.trim());
const secretKey = secretLines.find(line => line.startsWith("sb_secret_"));
if (!supabaseUrl || !anonKey || !secretKey) throw new Error("Supabase test credentials are unavailable");

const tag = Date.now().toString().slice(-7);
const patientNumber = `8${tag}`;
const immediateNumber = `7${tag}`;
const approvedNumber = `6${tag}`;
const patientEmail = `number-e2e-${tag}@patient.local`;
const duplicateEmail = `number-duplicate-${tag}@patient.local`;
const doctorEmail = `number-doctor-${tag}@doctor.local`;
const foreignDoctorEmail = `number-foreign-${tag}@doctor.local`;
const password = `MssiNumber!${randomBytes(12).toString("base64url")}`;
const createdUserIds = [];

async function request(path, { method = "GET", body, token = secretKey, key = secretKey } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Prefer: "return=representation"
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { response, data };
}

async function createUser(email, metadata) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    body: { email, password, email_confirm: true, user_metadata: metadata }
  });
  if (!result.response.ok) throw new Error(`create user failed (${result.response.status})`);
  createdUserIds.push(result.data.id);
  return result.data;
}

async function login(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST", key: anonKey, token: anonKey, body: { email, password }
  });
  if (!result.response.ok) throw new Error(`login failed (${result.response.status})`);
  return result.data.access_token;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

try {
  const patient = await createUser(patientEmail, {
    role: "patient", username: `number${tag}`, dob: "1990-06",
    hospital_code: "SNUBH01", patient_number: patientNumber
  });
  const duplicate = await request("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email: duplicateEmail, password, email_confirm: true,
      user_metadata: { role: "patient", username: `duplicate${tag}`, dob: "1990-06", hospital_code: "SNUBH01", patient_number: patientNumber }
    }
  });
  assert(!duplicate.response.ok, "duplicate patient number is rejected at sign-up");

  const patientToken = await login(patientEmail);
  const immediate = await request("/rest/v1/rpc/request_patient_number_change", {
    method: "POST", key: anonKey, token: patientToken, body: { p_new_patient_number: immediateNumber }
  });
  assert(immediate.response.ok && immediate.data?.status === "applied", "patient number changes immediately before completion");

  const completed = await request("/rest/v1/survey_responses", {
    method: "POST",
    body: {
      patient_id: patient.id, patient_user_id: patient.id, hospital_code: "SNUBH01",
      patient_number: immediateNumber, answers: { test_only: 1 }, status: "completed",
      completed: true, completed_at: new Date().toISOString()
    }
  });
  assert(completed.response.ok && completed.data?.[0]?.assessment_key, "completed assessment is created with an occurrence key");

  const pending = await request("/rest/v1/rpc/request_patient_number_change", {
    method: "POST", key: anonKey, token: patientToken, body: { p_new_patient_number: approvedNumber }
  });
  assert(pending.response.ok && pending.data?.status === "pending", "completed patient number change requires approval");

  const foreignDoctor = await createUser(foreignDoctorEmail, {
    role: "doctor_pending", username: `foreign${tag}`, doctor_name: "타병원검증의사",
    hospital_name: "타병원", hospital_code: `OTHER${tag.slice(-4)}`
  });
  const foreignPromote = await request(`/rest/v1/profiles?id=eq.${foreignDoctor.id}`, {
    method: "PATCH", body: { role: "doctor", approved_at: new Date().toISOString() }
  });
  assert(foreignPromote.response.ok, "temporary other-hospital doctor is activated");
  const foreignToken = await login(foreignDoctorEmail);
  const foreignList = await request("/rest/v1/rpc/list_patient_number_change_requests", {
    method: "POST", key: anonKey, token: foreignToken, body: {}
  });
  assert(foreignList.response.ok && !foreignList.data.some(row => row.patient_id === patient.id), "other-hospital doctor cannot see the request");
  const foreignReview = await request("/rest/v1/rpc/review_patient_number_change", {
    method: "POST", key: anonKey, token: foreignToken,
    body: { p_request_id: pending.data.request_id, p_approve: true, p_note: "must fail" }
  });
  assert(!foreignReview.response.ok, "other-hospital doctor cannot approve the request");

  const doctor = await createUser(doctorEmail, {
    role: "doctor_pending", username: `doctor${tag}`, doctor_name: "번호검증의사",
    hospital_name: "번호검증병원", hospital_code: "SNUBH01"
  });
  const promote = await request(`/rest/v1/profiles?id=eq.${doctor.id}`, {
    method: "PATCH", body: { role: "doctor", approved_at: new Date().toISOString() }
  });
  assert(promote.response.ok, "temporary same-hospital doctor is activated");
  const doctorToken = await login(doctorEmail);
  const listed = await request("/rest/v1/rpc/list_patient_number_change_requests", {
    method: "POST", key: anonKey, token: doctorToken, body: {}
  });
  const requestRow = Array.isArray(listed.data) && listed.data.find(row => row.patient_id === patient.id);
  assert(listed.response.ok && requestRow, "same-hospital doctor can see the pending request");

  const reviewed = await request("/rest/v1/rpc/review_patient_number_change", {
    method: "POST", key: anonKey, token: doctorToken,
    body: { p_request_id: requestRow.request_id, p_approve: true, p_note: "automated integrity test" }
  });
  assert(reviewed.response.ok && reviewed.data?.status === "approved", "same-hospital doctor can approve the request");

  const profile = await request(`/rest/v1/profiles?id=eq.${patient.id}&select=patient_number`);
  const responseRow = await request(`/rest/v1/survey_responses?patient_id=eq.${patient.id}&select=patient_number,assessment_key`);
  assert(profile.data?.[0]?.patient_number === approvedNumber, "approved number is applied to the patient profile");
  assert(responseRow.data?.[0]?.patient_number === approvedNumber && responseRow.data?.[0]?.assessment_key?.startsWith(`${approvedNumber}-`), "approved number is applied to all assessment keys");
} finally {
  for (const id of createdUserIds.reverse()) {
    await request(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => {});
  }
}
