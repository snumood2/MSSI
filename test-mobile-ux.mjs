import assert from "node:assert/strict";
import fs from "node:fs";

const styles = fs.readFileSync("styles.css", "utf8");
const respondent = fs.readFileSync("respondent.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const doctor = fs.readFileSync("doctor.html", "utf8");
const admin = fs.readFileSync("admin.html", "utf8");

assert.match(styles, /choice-count-5[\s\S]*nth-child\(4\)[\s\S]*nth-child\(5\)/);
assert.match(styles, /좌우로 밀어 전체 결과를 확인하세요/);
assert.match(styles, /-webkit-text-size-adjust:\s*100%/);
assert.match(styles, /\.save-quit-btn[\s\S]*min-height:\s*50px/);
assert.match(styles, /\.result-instructions[\s\S]*text-align:\s*justify/);
assert.match(styles, /\.section-desc-block[\s\S]*text-align:\s*justify/);
assert.match(styles, /desc-cell-block[\s\S]*text-align:\s*justify/);
assert.match(respondent, /class="btn save-quit-btn"/);

for (const source of [respondent, doctor, admin]) {
  assert.match(source, /<details open style="margin-bottom:24px;">/);
  assert.match(source, /📋 결과 해석 안내/);
  assert.doesNotMatch(source, /결과 해석 안내 \(클릭하여 펼치기\)/);
}

for (const source of [respondent, app]) {
  assert.match(source, /choice-grid/);
  assert.match(source, /choice-count-\$\{options\.length\}/);
  assert.match(source, /submitSurvey\(\{ skipConfirmation: true \}\)/);
  assert.match(source, /async function submitSurvey\(\{ skipConfirmation = false \} = \{\}\)/);
  assert.match(source, /초경 이후이며 폐경 전인 여성/);
  assert.match(source, /초경 전이거나 폐경 후인 여성/);
  assert.match(source, /name="pms_applicability"/);
  assert.match(source, /aria-label="결과표\. 좌우로 밀어 전체 항목을 확인할 수 있습니다\."/);
}

for (const signupFile of ["signup-patient.html", "signup-patient-snubh01.html"]) {
  const signup = fs.readFileSync(signupFile, "utf8");
  assert.match(signup, /height:\s*44px;\s*min-height:\s*44px/);
  assert.match(signup, /input\[type=month\][\s\S]*max-width:\s*none/);
  assert.match(signup, /id="s_pnum2"/);
}

console.log("PASS mobile UX and PMS completion guards");
