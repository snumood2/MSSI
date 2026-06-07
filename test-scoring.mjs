import assert from 'node:assert/strict';
import { calculateScores } from './scoring.js';

function tempsAnswers(ranges) {
  const answers = {};
  for (const [start, end, count] of ranges) {
    for (let i = start; i <= end; i++) answers[`t${i}`] = i < start + count ? 1 : 0;
  }
  return answers;
}

const scores = calculateScores(tempsAnswers([
  [1, 12, 11],
  [13, 20, 5],
  [21, 28, 5],
  [29, 36, 7],
  [37, 39, 3],
]));

assert.deepEqual(scores.TEMPS, { cyc: 11, dep: 5, irr: 5, hyp: 7, anx: 3 });

const noPmsScores = calculateScores({
  pms_skip: 0,
  ...Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`pms1_${i + 1}`, 1])),
  ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`pms_imp${i + 1}`, 1])),
});
assert.deepEqual(noPmsScores.PMS, { sym: 0, func: 0, diag: 'no-PMS' });

const skippedPmsScores = calculateScores({ pms_skip: 1 });
assert.deepEqual(skippedPmsScores.PMS, { sym: '', func: '', diag: '' });

const positivePmsScores = calculateScores({
  pms_skip: 0,
  ...Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`pms1_${i + 1}`, i < 5 ? 4 : 1])),
  ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`pms_imp${i + 1}`, i === 0 ? 3 : 1])),
});
assert.deepEqual(positivePmsScores.PMS, { sym: 15, func: 2, diag: 'PMS' });

console.log('scoring tests passed');
