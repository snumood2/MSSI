import fs from "node:fs";
import { randomBytes } from "node:crypto";

const config = fs.readFileSync(new URL("../config.js", import.meta.url), "utf8");
const supabaseUrl = config.match(/SUPABASE_URL = ENV\.VITE_SUPABASE_URL \|\| "([^"]+)"/)?.[1];
const anonKey = config.match(/SUPABASE_ANON_KEY = ENV\.VITE_SUPABASE_ANON_KEY \|\| "([^"]+)"/)?.[1];
const secretKey = fs.readFileSync(new URL("../../supabase_token.txt", import.meta.url), "utf8")
  .split(/\r?\n/).map(line => line.trim()).find(line => line.startsWith("sb_secret_"));
if (!supabaseUrl || !anonKey || !secretKey) throw new Error("Supabase test credentials are unavailable");

const tag = Date.now().toString().slice(-7);
const adminEmail = `reset-admin-${tag}@doctor.local`;
const doctorEmail = `reset-doctor-${tag}@doctor.local`;
const oldPassword = `MssiOld!${randomBytes(12).toString("base64url")}`;
const newPassword = `MssiNew!${randomBytes(12).toString("base64url")}`;
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

async function createDoctorPending(email, hospitalCode) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email, password: oldPassword, email_confirm: true,
      user_metadata: {
        role: "doctor_pending", username: `reset${tag}`,
        doctor_name: "비밀번호검증", hospital_name: "자동검증병원", hospital_code: hospitalCode
      }
    }
  });
  if (!result.response.ok) throw new Error(`temporary account creation failed (${result.response.status})`);
  createdUserIds.push(result.data.id);
  return result.data;
}

async function login(email, password) {
  return request("/auth/v1/token?grant_type=password", {
    method: "POST", key: anonKey, token: anonKey, body: { email, password }
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`PASS ${message}`);
}

try {
  const admin = await createDoctorPending(adminEmail, `ADMIN${tag.slice(-4)}`);
  const doctor = await createDoctorPending(doctorEmail, `DOCTOR${tag.slice(-4)}`);
  const promoteAdmin = await request(`/rest/v1/profiles?id=eq.${admin.id}`, {
    method: "PATCH", body: { role: "admin", approved_at: new Date().toISOString() }
  });
  const promoteDoctor = await request(`/rest/v1/profiles?id=eq.${doctor.id}`, {
    method: "PATCH", body: { role: "doctor", approved_at: new Date().toISOString() }
  });
  assert(promoteAdmin.response.ok && promoteDoctor.response.ok, "temporary reset-test roles are prepared");

  const adminLogin = await login(adminEmail, oldPassword);
  const doctorLogin = await login(doctorEmail, oldPassword);
  assert(adminLogin.response.ok && doctorLogin.response.ok, "temporary administrator and doctor can authenticate");

  const unauthorized = await request("/rest/v1/rpc/admin_reset_password", {
    method: "POST", key: anonKey, token: doctorLogin.data.access_token,
    body: { target_user_id: admin.id, new_password: newPassword }
  });
  assert(!unauthorized.response.ok, "doctor cannot invoke administrator password reset");

  const reset = await request("/rest/v1/rpc/admin_reset_password", {
    method: "POST", key: anonKey, token: adminLogin.data.access_token,
    body: { target_user_id: doctor.id, new_password: newPassword }
  });
  assert(reset.response.ok, "administrator password reset RPC succeeds");

  const oldLogin = await login(doctorEmail, oldPassword);
  const newLogin = await login(doctorEmail, newPassword);
  assert(!oldLogin.response.ok, "old doctor password is invalidated");
  assert(newLogin.response.ok, "doctor can authenticate with the reset password");
} finally {
  for (const id of createdUserIds.reverse()) {
    await request(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => {});
  }
}
