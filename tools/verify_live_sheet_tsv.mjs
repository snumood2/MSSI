import fs from "node:fs";
import path from "node:path";

const artifactDir = path.resolve(process.argv[2] || "");
if (!artifactDir || !fs.existsSync(artifactDir)) throw new Error("artifact directory is required");

const e2e = JSON.parse(fs.readFileSync(path.join(artifactDir, "e2e.json"), "utf8"));
const sheetRows = fs.readFileSync(path.join(artifactDir, "sheet2report.tsv"), "utf8")
  .split(/\r?\n/)
  .map((line) => line.split("\t"));
const finalReport = fs.readFileSync(path.join(artifactDir, "google-report.tsv"), "utf8");
const scores = e2e.scores;

const scoringSource = fs.readFileSync(new URL("../scoring.js", import.meta.url), "utf8");
const statsBody = scoringSource.match(/const STATS = (\{[\s\S]*?\n\});/)?.[1];
const STATS = Function(`return (${statsBody});`)();

const expectedScores = {
  ZUNG: scores.ZUNG, BAI: scores.BAI, MIQS: scores.MIQS, MDQ: scores.MDQ.score,
  TEMPS_Cyc: scores.TEMPS.cyc, TEMPS_Dep: scores.TEMPS.dep, TEMPS_Irr: scores.TEMPS.irr,
  TEMPS_Hyp: scores.TEMPS.hyp, TEMPS_Anx: scores.TEMPS.anx,
  MIQT_Total: scores.MIQT.total, MIQT_Labil: scores.MIQT.labil, MIQT_Down: scores.MIQT.down,
  MIQT_Up: scores.MIQT.up, MIQT_Season: scores.MIQT.season, MIQT_Child: scores.MIQT.child,
  CTQ_Total: scores.CTQ.total, CTQ_EA: scores.CTQ.ea, CTQ_PA: scores.CTQ.pa,
  CTQ_SA: scores.CTQ.sa, CTQ_EN: scores.CTQ.en, CTQ_PN: scores.CTQ.pn,
  IPSM_Total: scores.IPSM.total, IPSM_IA: scores.IPSM.ia, IPSM_NA: scores.IPSM.na,
  IPSM_SA: scores.IPSM.sa, IPSM_TIM: scores.IPSM.tim, IPSM_FIS: scores.IPSM.fis,
  CD_Total: scores.CD.total, CD_Hard: scores.CD.hard, CD_Persist: scores.CD.persist,
  CD_Optimism: scores.CD.optimism, CD_Support: scores.CD.support, CD_Spirit: scores.CD.spirit,
  ERSQ_Total: scores.ERSQ.total, ERSQ_Aware: scores.ERSQ.aware, ERSQ_Body: scores.ERSQ.body,
  ERSQ_Clarity: scores.ERSQ.clarity, ERSQ_Under: scores.ERSQ.under, ERSQ_Accept: scores.ERSQ.accept,
  ERSQ_Resil: scores.ERSQ.resil, ERSQ_Support: scores.ERSQ.support,
  ERSQ_Tolerate: scores.ERSQ.tolerate, ERSQ_Modify: scores.ERSQ.modify,
  BIS: scores.BIS, BAS: scores.BAS, BAS_Reward: scores.BAS_Sub.reward,
  BAS_Drive: scores.BAS_Sub.drive, BAS_Fun: scores.BAS_Sub.fun,
  AUDIT: scores.AUDIT, CMS: scores.CMS.score, SPAQ: scores.SPAQ.score,
  ASRS: scores.ASRS.total, WURS: scores.WURS,
  BAPQ_Total: scores.BAPQ.total, BAPQ_Aloof: scores.BAPQ.aloof,
  BAPQ_Pragma: scores.BAPQ.pragma, BAPQ_Rigid: scores.BAPQ.rigid,
  BOR: scores.BOR, PMS_Sym: scores.PMS.sym, PMS_Func: scores.PMS.func,
};

function normalCDF(x, mean, std) {
  const z = (x - mean) / std;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function rank(score, mean, std) {
  return Math.max(1, Math.min(100, Math.round((1 - normalCDF(score, mean, std)) * 100)));
}

const mismatches = [];
let checkedRows = 0;
for (const row of sheetRows) {
  const [, name, raw, display, patientRank, normalRank, , statKey] = row;
  if (!statKey || statKey === "stat_key") continue;
  if (statKey === "ASRS_Screen") {
    const expected = `6개 중 ${scores.ASRS.screen}개 (${scores.ASRS.screen >= 4 ? "성인ADHD의심됨" : "성인ADHD의심되지않음"})`;
    checkedRows++;
    if (display !== expected) mismatches.push({ name, statKey, field: "display", got: display, expected });
    continue;
  }
  if (!(statKey in expectedScores)) continue;
  const expected = expectedScores[statKey];
  checkedRows++;
  if (expected === "") {
    if (raw !== "") mismatches.push({ name, statKey, field: "score", got: raw, expected });
    continue;
  }
  if (Math.abs(Number(raw) - Number(expected)) > 1e-6) {
    mismatches.push({ name, statKey, field: "score", got: raw, expected });
  }
  const stat = STATS[statKey];
  if (stat) {
    const expectedPatient = rank(expected, stat.pat_m, stat.pat_sd);
    const expectedNormal = rank(expected, stat.nor_m, stat.nor_sd);
    if (Number(patientRank) !== expectedPatient) mismatches.push({ name, statKey, field: "patient_rank", got: patientRank, expected: expectedPatient });
    if (Number(normalRank) !== expectedNormal) mismatches.push({ name, statKey, field: "normal_rank", got: normalRank, expected: expectedNormal });
  }
}

const reportErrors = [...finalReport.matchAll(/#[A-Z0-9/?!]+/g)].map((match) => match[0]);
const output = {
  patient_number: e2e.patientNumber,
  hospital_code: e2e.hospitalCode,
  checked_rows: checkedRows,
  mismatches,
  report_errors: reportErrors,
  ok: checkedRows >= 50 && mismatches.length === 0 && reportErrors.length === 0,
};
fs.writeFileSync(path.join(artifactDir, "sheet-parity.json"), JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
if (!output.ok) process.exitCode = 1;
