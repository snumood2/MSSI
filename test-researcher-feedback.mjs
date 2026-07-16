import assert from "node:assert/strict";
import { calculateScores, generateReport, getRankColor } from "./scoring.js";

assert.equal(getRankColor(1), "#FF5C7A");
assert.equal(getRankColor(49), "#FF5C7A");
assert.equal(getRankColor(50), "#5F6368");
assert.equal(getRankColor(51), "#2B3CFF");
assert.equal(getRankColor(100), "#2B3CFF");

const ocdCases = [
  [{ g1a: 1, g2: 1, g3a: 0, g5: 1 }, "O", "X"],
  [{ g1a: 0, g3a: 1, g5: 1 }, "X", "O"],
  [{ g1a: 1, g2: 1, g3a: 1, g5: 1 }, "O", "O"],
  [{ g1a: 0, g3a: 0 }, "X", "X"],
];

for (const [answers, expectedObsession, expectedCompulsion] of ocdCases) {
  const scores = calculateScores(answers);
  assert.equal(scores.DIAG.ocdObsession, expectedObsession);
  assert.equal(scores.DIAG.ocdCompulsion, expectedCompulsion);
  const comorbidity = generateReport(scores, answers).sections
    .flatMap((section) => section.groups || [])
    .find((group) => group.type === "comorbidity");
  assert.equal(comorbidity.items.find((item) => item.name === "강박사고").value, expectedObsession);
  assert.equal(comorbidity.items.find((item) => item.name === "강박행동").value, expectedCompulsion);
}

const bapqAnswers = {
  ba1: 3, ba2: 3, ba3: 5, ba4: 2, ba5: 5, ba6: 1,
  ba7: 5, ba8: 5, ba9: 3, ba10: 5, ba11: 2, ba12: 2,
  ba13: 1, ba14: 1, ba15: 4, ba16: 5, ba17: 2, ba18: 3,
  ba19: 3, ba20: 3, ba21: 5, ba22: 3, ba23: 4, ba24: 5,
  ba25: 4, ba26: 2, ba27: 3, ba28: 5, ba29: 1, ba30: 5,
  ba31: 5, ba32: 2, ba33: 6, ba34: 3, ba35: 2, ba36: 3,
};
const bapq = calculateScores(bapqAnswers).BAPQ;
assert.equal(bapq.total, 3);
assert.equal(bapq.aloof, 43 / 12);
assert.equal(bapq.pragma, 29 / 12);
assert.equal(bapq.rigid, 3);

const spaqCases = [
  [{ spaq2_0: 2, spaq2_1: 2, spaq2_2: 2, spaq2_3: 2, spaq2_4: 2, spaq2_5: 1, spaq3_2: 0 }, "subsyndromal SAD"],
  [{ spaq2_0: 2, spaq2_1: 2, spaq2_2: 2, spaq2_3: 2, spaq2_4: 2, spaq2_5: 1, spaq3_2: 1 }, "subsyndromal SAD"],
  [{ spaq2_0: 2, spaq2_1: 2, spaq2_2: 2, spaq2_3: 2, spaq2_4: 2, spaq2_5: 1, spaq3_2: 2 }, "SAD"],
  [{ spaq2_0: 2, spaq2_1: 2, spaq2_2: 2, spaq2_3: 1, spaq2_4: 1, spaq2_5: 1, spaq3_2: 2 }, "subsyndromal SAD"],
  [{ spaq2_0: 2, spaq2_1: 2, spaq2_2: 2, spaq2_3: 1, spaq2_4: 1, spaq2_5: 1, spaq3_2: 1 }, "not SAD"],
  [{ spaq2_0: 2, spaq2_1: 2, spaq2_2: 2, spaq2_3: 2, spaq2_4: 2, spaq2_5: 1, spaq3: 0, spaq3_2: 3 }, "subsyndromal SAD"],
];
for (const [answers, expected] of spaqCases) assert.equal(calculateScores(answers).SPAQ.class, expected);

const screeningSection = generateReport(calculateScores(bapqAnswers), bapqAnswers).sections
  .find((section) => section.title === "혼합/초조 우울증 및 양극성장애 선별");
assert.ok(screeningSection);
assert.deepEqual(screeningSection.groups[0].rows.map((row) => row.name), [
  "기분불안정상태검사", "초조우울증선별", "혼합우울증선별", "기분변동성 기질", "MDQ 선별결과",
]);

console.log("researcher feedback regression tests passed");
