import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260717160000_patient_number_integrity.sql", "utf8");
const respondent = fs.readFileSync("respondent.html", "utf8");
const staff = fs.readFileSync("patient-number-requests.html", "utf8");

assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /patient_number_is_available/);
assert.match(migration, /request_patient_number_change/);
assert.match(migration, /review_patient_number_change/);
assert.match(migration, /COALESCE\(patient_user_id, patient_id\)/);
assert.match(migration, /assessment_key = CASE/);
assert.match(migration, /role = 'doctor'/);
assert.match(migration, /v_role = 'admin'/);
assert.match(respondent, /id="newPatientNumberConfirm"/);
assert.match(respondent, /signInWithPassword/);
assert.match(respondent, /request_patient_number_change/);
assert.match(staff, /list_patient_number_change_requests/);
assert.match(staff, /review_patient_number_change/);

console.log("PASS patient number integrity guards");
