import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync('./index.html', 'utf8');
assert.match(index, /login\.html\?role=patient/);
assert.match(index, /patient: "respondent\.html"/);
assert.match(index, /doctor: "doctor\.html"/);
assert.match(index, /admin: "admin\.html"/);
assert.match(index, /doctor_pending: "signup-doctor\.html\?pending=1"/);
assert.match(index, /doctor_revoked: "signup-doctor\.html\?revoked=1"/);

const login = readFileSync('./login.html', 'utf8');
const doctorPage = readFileSync('./doctor.html', 'utf8');
const signupPatient = readFileSync('./signup-patient.html', 'utf8');
assert.match(login, /urlRole\s*=\s*new URLSearchParams\(location\.search\)\.get\("role"\)/s);
assert.match(login, /urlRole === "doctor"[\s\S]*selectedRole = "doctor"[\s\S]*form-doctor[\s\S]*signup-doctor\.html/);
assert.match(login, /urlRole === "admin"[\s\S]*selectedRole = "admin"[\s\S]*form-admin[\s\S]*signupLink/);
assert.match(login, /signInAdminWithGoogle/);
assert.doesNotMatch(login, /id="a_pw"/);
assert.match(login, /patient: "respondent\.html"/);
assert.match(login, /doctor: "doctor\.html"/);
assert.match(login, /admin: "admin\.html"/);
assert.match(login, /doctor_revoked: "signup-doctor\.html\?revoked=1"/);
assert.match(login, /let target = redirectMap\[prof\.role\]/);
assert.match(login, /doctor_pending[\s\S]*signup-doctor\.html\?pending=1/);
assert.match(login, /const \{ data, error \} = await sb\.auth\.signInWithPassword[\s\S]*sb\.auth\.setSession[\s\S]*await redirectSignedInUser\(data\.user, data\.session\.access_token\)/);
assert.match(login, /Authorization: `Bearer \$\{accessToken\}`/);
assert.match(login, /if \(selectedRole === "admin"\)[\s\S]*sb\.auth\.onAuthStateChange/);
assert.match(doctorPage, /async function initializeDoctorSession\(\)[\s\S]*sb\.auth\.getSession\(\)/);
assert.match(doctorPage, /Authorization: `Bearer \$\{session\.access_token\}`/);
assert.match(doctorPage, /sb\.auth\.onAuthStateChange\(event =>[\s\S]*event === "SIGNED_OUT"/);
assert.doesNotMatch(doctorPage, /event === "SIGNED_IN" \|\| event === "INITIAL_SESSION"/);

assert.match(signupPatient, /id="s_pnum"[^>]*required/);
assert.match(signupPatient, /if \(!\/\^\\d\{8\}\$\/\.test\(patientNumber\)\) throw "의사에게 받은 번호는 8자리 숫자로 입력하세요\."/);
assert.match(signupPatient, /patient_number: patientNumber/);
assert.doesNotMatch(signupPatient, /의사에게 받은 번호 <span class="optional">/);

const snubhLogin = readFileSync('./login-snubh01.html', 'utf8');
assert.match(snubhLogin, /signup-patient-snubh01\.html/);
assert.match(snubhLogin, /respondent\.html/);
assert.doesNotMatch(snubhLogin, /form-doctor/);
assert.doesNotMatch(snubhLogin, /form-admin/);
assert.match(snubhLogin, /const \{ data, error \} = await sb\.auth\.signInWithPassword[\s\S]*sb\.auth\.setSession[\s\S]*window\.location\.href = "respondent\.html"/);
assert.doesNotMatch(snubhLogin, /sb\.auth\.onAuthStateChange/);

const snubhSignup = readFileSync('./signup-patient-snubh01.html', 'utf8');
assert.match(snubhSignup, /FIXED_HOSPITAL_CODE = "SNUBH01"/);
assert.match(snubhSignup, /hospital_code: FIXED_HOSPITAL_CODE/);
assert.match(snubhSignup, /id="s_pnum"[^>]*required/);
assert.match(snubhSignup, /if \(!\/\^\\d\{8\}\$\/\.test\(patientNumber\)\) throw "의사에게 받은 번호는 8자리 숫자로 입력하세요\."/);
assert.match(snubhSignup, /patient_number: patientNumber/);
assert.match(snubhSignup, /login-snubh01\.html/);
assert.doesNotMatch(snubhSignup, /id="s_hcode"/);
assert.doesNotMatch(snubhSignup, /병원코드 <span/);
assert.doesNotMatch(snubhSignup, /의사에게 받은 번호 <span class="optional">/);

console.log('entrypoint tests passed');
