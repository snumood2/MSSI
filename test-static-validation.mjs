import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const signup = readFileSync('./signup-patient.html', 'utf8');
assert.match(signup, /<input type="month" id="s_dob"[^>]*min="1900-01"[^>]*required/);
assert.match(signup, /dobInput\.max = currentMonth/);
assert.match(signup, /function validateBirthMonth\(value\)/);
assert.match(signup, /if \(!value\) throw "생년월을 선택하세요\."/);
assert.match(signup, /if \(year < 1900 \|\| year > now\.getFullYear\(\)\)/);
assert.match(signup, /if \(value > currentMonth\) throw "미래 생년월은 선택할 수 없습니다\."/);
assert.match(signup, /const dob = validateBirthMonth\(\$\("s_dob"\)\.value\);/);

const cfg = readFileSync('./config.js', 'utf8');
assert.match(cfg, /export const SUPABASE_URL = ENV\.VITE_SUPABASE_URL \|\| "https:\/\//);
assert.match(cfg, /export const SUPABASE_ANON_KEY = ENV\.VITE_SUPABASE_ANON_KEY \|\| "[^"]{20,}"/);
assert.doesNotMatch(cfg, /YOUR_|REPLACE_ME/);
assert.match(cfg, /export const GOOGLE_SHEETS_WEBHOOK_URL = ENV\.GOOGLE_SHEETS_WEBHOOK_URL \|\| "https:\/\/script\.google\.com\/macros\/s\//);

const respondent = readFileSync('./respondent.html', 'utf8');
assert.match(respondent, /GOOGLE_SHEETS_WEBHOOK_URL/);
assert.match(respondent, /Content-Type": "text\/plain;charset=utf-8"/);
assert.match(respondent, /mode: "no-cors"/);
assert.doesNotMatch(respondent, /<script>[\s\S]*<\/script>[\s\S]*el\("btnPrintResult"\)/);
assert.match(respondent, /let submitInProgress = false;/);
assert.match(respondent, /await submitSurvey\(\);/);
assert.match(respondent, /patient_can_use_hospital/);
assert.match(respondent, /state\.hospitalActive/);
assert.doesNotMatch(respondent, /onchange="\$\{onChangeLogic\}"/);
assert.doesNotMatch(respondent, /input\[name\^=\\\\"/);
assert.match(respondent, /input\.dataset\.monthKey = k;/);
assert.match(respondent, /q\.type === "matrix_months"[\s\S]*q\.rows\.length[\s\S]*missing\.push\(q\.id\)/);

const styles = readFileSync('./styles.css', 'utf8');
assert.match(styles, /@media \(max-width: 640px\)[\s\S]*#mainHeader \{[\s\S]*flex-wrap: wrap/);
assert.match(styles, /@media \(max-width: 640px\)[\s\S]*\.header-nav \{[\s\S]*flex-wrap: wrap/);

const doctor = readFileSync('./doctor.html', 'utf8');
assert.match(doctor, /id="userBadge"/);
assert.match(doctor, /login\.html\?role=doctor/);
assert.match(doctor, /btn-dr-pdf/);

const admin = readFileSync('./admin.html', 'utf8');
assert.match(admin, /id="userBadge"/);
assert.match(admin, /id="adminSearchHCode"/);
assert.match(admin, /\.eq\("hospital_code", hCode\)/);
assert.match(admin, /doctor_revoked/);
assert.match(admin, /revoke_doctor_approval/);

const migration = readFileSync('./supabase/migration.sql', 'utf8');
assert.match(migration, /patient_can_use_hospital/);
assert.match(migration, /can_patient_write_survey/);
assert.match(migration, /public\.can_patient_write_survey\(patient_id, hospital_code\)/);

const codeGs = readFileSync('./supabase/Code.gs', 'utf8');
assert.match(codeGs, /mode: 'legacy_raw_with_hospital_code_lookup'/);
assert.match(codeGs, /const RAW_HEADERS = \[[\s\S]*'hospital_code'[\s\S]*'patient_number'[\s\S]*'dob'[\s\S]*'sex'/);
assert.match(codeGs, /const LEGACY_WIDTH = 878/);
assert.match(codeGs, /row\[1\] = params\.dob \? "'" \+ String\(params\.dob\) : '';/);

const workflowExists = existsSync('./.github/workflows/deploy-pages.yml');
if (workflowExists) {
  const workflow = readFileSync('./.github/workflows/deploy-pages.yml', 'utf8');
  assert.match(workflow, /name: Inject runtime config/);
  assert.doesNotMatch(workflow, /VITE_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY: \$\{\{ secrets\.SUPABASE_ANON_KEY \}\}/);
  assert.match(workflow, /ADMIN_EMAIL: \$\{\{ secrets\.ADMIN_EMAIL \}\}/);
}

console.log('static validation tests passed');
