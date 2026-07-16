import assert from "node:assert/strict";
import fs from "node:fs";

const styles = fs.readFileSync("styles.css", "utf8");
const respondent = fs.readFileSync("respondent.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");

assert.match(styles, /choice-count-5[\s\S]*nth-child\(4\)[\s\S]*nth-child\(5\)/);
assert.match(styles, /좌우로 밀어 전체 결과를 확인하세요/);
assert.match(styles, /-webkit-text-size-adjust:\s*100%/);
assert.match(styles, /\.save-quit-btn[\s\S]*min-height:\s*50px/);
assert.match(respondent, /class="btn save-quit-btn"/);

for (const source of [respondent, app]) {
  assert.match(source, /choice-grid/);
  assert.match(source, /choice-count-\$\{options\.length\}/);
  assert.match(source, /submitSurvey\(\{ skipConfirmation: true \}\)/);
  assert.match(source, /async function submitSurvey\(\{ skipConfirmation = false \} = \{\}\)/);
  assert.match(source, /PMS 문항을 건너뛰고 검사 완료/);
  assert.match(source, /aria-label="결과표\. 좌우로 밀어 전체 항목을 확인할 수 있습니다\."/);
}

console.log("PASS mobile UX and PMS completion guards");
