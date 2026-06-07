import fs from "node:fs";

const report = JSON.parse(fs.readFileSync(new URL("../mssi_operational_e2e_report.json", import.meta.url), "utf8"));
const qidMap = JSON.parse(fs.readFileSync(new URL("../supabase/qid_col_map.json", import.meta.url), "utf8")).qid_to_col;

function legacyRow(patient) {
  const row = Array(854).fill(0);
  row[0] = patient.patient_number;
  row[1] = patient.dob || "";
  row[2] = patient.index % 2 ? 1 : 2;

  for (const [qid, rawOffset] of Object.entries(qidMap)) {
    if (Object.prototype.hasOwnProperty.call(patient.answers, qid)) {
      row[rawOffset] = patient.answers[qid];
    }
  }

  for (let i = 1; i <= 13; i++) {
    const key = `csm${i}`;
    if (patient.answers[key] !== undefined) row[653 + i] = patient.answers[key];
  }

  for (let i = 1; i <= 15; i++) {
    const key = `mdq${i}`;
    if (patient.answers[key] !== undefined) row[20 + i] = patient.answers[key];
  }

  const mssiOffsets = [
    [38, 39, 40], [41, 42, 43], [25, 26, 27], [31, 32, 33], [44, 45, 46],
    [34, 35, 36], [51, 52, 53], [47, 48, 49], [21, 22, 23], [11, 12, 13],
    [66, 67, 68], [69, 70, 71], [72, 73, 74], [54, 55, 56], [15, 16, 17],
    [14, 15, 16], [58, 59, 60], [86, 87, 88], [80, 81, 82], [47, 48, 49],
  ];
  for (let i = 1; i <= 20; i++) {
    const [yn, freq, sev] = mssiOffsets[i - 1];
    if (patient.answers[`mssi${i}_yn`] !== undefined) row[yn - 1] = patient.answers[`mssi${i}_yn`];
    if (patient.answers[`mssi${i}_freq`] !== undefined) row[freq - 1] = patient.answers[`mssi${i}_freq`];
    if (patient.answers[`mssi${i}_sev`] !== undefined) row[sev - 1] = patient.answers[`mssi${i}_sev`];
  }
  if (patient.answers.mssi21 !== undefined) row[4] = patient.answers.mssi21;

  return row;
}

const out = {
  doctor: report.doctor,
  patients: report.patients.map((patient) => ({
    patient_number: patient.patient_number,
    response_id: patient.response_id,
    legacy_row: legacyRow(patient),
    expected_rows: patient.expected_rows,
  })),
};

fs.writeFileSync(new URL("../mssi_operational_legacy_rows.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("WROTE mssi_operational_legacy_rows.json");
