/**
 * scoring.js
 * [REWRITTEN - Excel stats values, 4-column layout report structure]
 */

// --- 1. 통계 데이터 (Excel 수치 완벽 반영) ---
const STATS = {
  ZUNG:       { pat_m: 51.64,  pat_sd: 10.87,  nor_m: 43.42,  nor_sd: 10.01 },
  BAI:        { pat_m: 20.14,  pat_sd: 13.71,  nor_m: 10.27,  nor_sd: 10.30 },
  MIQS:       { pat_m: 50.03,  pat_sd: 37.19,  nor_m: 30.00,  nor_sd: 20.00 },
  MDQ:        { pat_m: 7.31,   pat_sd: 3.20,   nor_m: 3.00,   nor_sd: 3.30  },

  TEMPS_Cyc:  { pat_m: 6.47,   pat_sd: 3.62,   nor_m: 4.70,   nor_sd: 3.33  },
  TEMPS_Dep:  { pat_m: 3.60,   pat_sd: 2.37,   nor_m: 2.10,   nor_sd: 2.12  },
  TEMPS_Irr:  { pat_m: 2.29,   pat_sd: 2.12,   nor_m: 1.65,   nor_sd: 1.83  },
  TEMPS_Hyp:  { pat_m: 2.74,   pat_sd: 2.16,   nor_m: 2.87,   nor_sd: 2.28  },
  TEMPS_Anx:  { pat_m: 1.41,   pat_sd: 1.14,   nor_m: 1.40,   nor_sd: 1.14  },

  MIQT_Total: { pat_m: 29.77,  pat_sd: 9.82,   nor_m: 21.84,  nor_sd: 8.74  },
  MIQT_Labil: { pat_m: 7.63,   pat_sd: 4.48,   nor_m: 4.87,   nor_sd: 3.47  },
  MIQT_Down:  { pat_m: 6.79,   pat_sd: 2.11,   nor_m: 4.78,   nor_sd: 2.29  },
  MIQT_Up:    { pat_m: 5.67,   pat_sd: 2.10,   nor_m: 4.71,   nor_sd: 1.77  },
  MIQT_Season:{ pat_m: 3.54,   pat_sd: 3.08,   nor_m: 3.74,   nor_sd: 2.20  },
  MIQT_Child: { pat_m: 3.03,   pat_sd: 3.26,   nor_m: 2.25,   nor_sd: 2.13  },

  CTQ_Total:  { pat_m: 48.60,  pat_sd: 16.35,  nor_m: 42.45,  nor_sd: 15.61 },
  CTQ_EA:     { pat_m: 10.70,  pat_sd: 4.90,   nor_m: 8.20,   nor_sd: 4.05  },
  CTQ_PA:     { pat_m: 9.58,   pat_sd: 4.67,   nor_m: 8.13,   nor_sd: 4.11  },
  CTQ_SA:     { pat_m: 6.29,   pat_sd: 2.94,   nor_m: 6.49,   nor_sd: 3.23  },
  CTQ_EN:     { pat_m: 13.86,  pat_sd: 5.89,   nor_m: 11.01,  nor_sd: 5.28  },
  CTQ_PN:     { pat_m: 8.19,   pat_sd: 3.55,   nor_m: 8.61,   nor_sd: 3.40  },

  IPSM_Total: { pat_m: 98.98,  pat_sd: 17.47,  nor_m: 89.53,  nor_sd: 15.82 },
  IPSM_IA:    { pat_m: 21.11,  pat_sd: 4.34,   nor_m: 18.52,  nor_sd: 4.20  },
  IPSM_NA:    { pat_m: 23.97,  pat_sd: 3.34,   nor_m: 23.25,  nor_sd: 3.29  },
  IPSM_SA:    { pat_m: 19.59,  pat_sd: 5.06,   nor_m: 17.12,  nor_sd: 4.44  },
  IPSM_TIM:   { pat_m: 22.31,  pat_sd: 4.59,   nor_m: 20.46,  nor_sd: 4.31  },
  IPSM_FIS:   { pat_m: 12.29,  pat_sd: 3.53,   nor_m: 10.64,  nor_sd: 3.11  },

  CD_Total:   { pat_m: 45.52,  pat_sd: 19.58,  nor_m: 60.39,  nor_sd: 18.55 },
  CD_Hard:    { pat_m: 14.27,  pat_sd: 7.30,   nor_m: 18.86,  nor_sd: 6.26  },
  CD_Persist: { pat_m: 12.86,  pat_sd: 6.01,   nor_m: 16.33,  nor_sd: 5.02  },
  CD_Optimism:{ pat_m: 9.65,   pat_sd: 4.37,   nor_m: 13.04,  nor_sd: 3.71  },
  CD_Support: { pat_m: 5.09,   pat_sd: 2.88,   nor_m: 7.22,   nor_sd: 2.62  },
  CD_Spirit:  { pat_m: 3.95,   pat_sd: 2.11,   nor_m: 4.50,   nor_sd: 1.83  },

  ERSQ_Total: { pat_m: 1.79,   pat_sd: 0.77,   nor_m: 2.24,   nor_sd: 0.84  },
  ERSQ_Aware: { pat_m: 2.03,   pat_sd: 0.88,   nor_m: 2.17,   nor_sd: 0.84  },
  ERSQ_Body:  { pat_m: 2.06,   pat_sd: 1.04,   nor_m: 2.30,   nor_sd: 0.99  },
  ERSQ_Clarity:{ pat_m: 2.22,  pat_sd: 1.10,   nor_m: 2.58,   nor_sd: 0.94  },
  ERSQ_Under: { pat_m: 1.98,   pat_sd: 1.05,   nor_m: 2.53,   nor_sd: 0.91  },
  ERSQ_Accept:{ pat_m: 1.63,   pat_sd: 0.98,   nor_m: 2.24,   nor_sd: 0.92  },
  ERSQ_Resil: { pat_m: 1.51,   pat_sd: 1.01,   nor_m: 2.15,   nor_sd: 1.08  },
  ERSQ_Support:{ pat_m: 1.75,  pat_sd: 1.08,   nor_m: 2.32,   nor_sd: 1.13  },
  ERSQ_Tolerate:{ pat_m: 1.18, pat_sd: 0.99,   nor_m: 1.84,   nor_sd: 1.05  },
  ERSQ_Modify:{ pat_m: 1.70,   pat_sd: 0.90,   nor_m: 2.06,   nor_sd: 0.88  },

  BIS:        { pat_m: 22.63,  pat_sd: 3.83,   nor_m: 20.77,  nor_sd: 3.43  },
  BAS:        { pat_m: 35.79,  pat_sd: 7.79,   nor_m: 36.71,  nor_sd: 5.55  },
  BAS_Reward: { pat_m: 14.67,  pat_sd: 2.70,   nor_m: 14.49,  nor_sd: 2.48  },
  BAS_Drive:  { pat_m: 10.77,  pat_sd: 2.48,   nor_m: 10.94,  nor_sd: 2.03  },
  BAS_Fun:    { pat_m: 10.44,  pat_sd: 2.55,   nor_m: 10.46,  nor_sd: 2.10  },
  AUDIT:      { pat_m: 6.88,   pat_sd: 8.17,   nor_m: 2.61,   nor_sd: 2.71  },
  CMS:        { pat_m: 28.74,  pat_sd: 8.13,   nor_m: 30.58,  nor_sd: 9.16  },

  SPAQ:       { pat_m: 5.95,   pat_sd: 5.29,   nor_m: 5.90,   nor_sd: 4.45  },
  ASRS:       { pat_m: 46.80,  pat_sd: 12.68,  nor_m: 39.90,  nor_sd: 7.75  },
  WURS:       { pat_m: 25.89,  pat_sd: 20.10,  nor_m: 19.76,  nor_sd: 18.34 },
  BAPQ_Total: { pat_m: 3.27,   pat_sd: 0.64,   nor_m: 2.99,   nor_sd: 0.55  },
  BAPQ_Aloof: { pat_m: 3.57,   pat_sd: 0.91,   nor_m: 3.24,   nor_sd: 0.79  },
  BAPQ_Pragma:{ pat_m: 2.84,   pat_sd: 0.79,   nor_m: 2.56,   nor_sd: 0.68  },
  BAPQ_Rigid: { pat_m: 3.41,   pat_sd: 0.74,   nor_m: 3.15,   nor_sd: 0.61  },
  BOR:        { pat_m: 31.90,  pat_sd: 13.03,  nor_m: 23.79,  nor_sd: 10.76 },

  PMS_Sym:    { pat_m: 17.87,  pat_sd: 11.49,  nor_m: 15.71,  nor_sd: 7.80  },
  PMS_Func:   { pat_m: 4.43,   pat_sd: 3.81,   nor_m: 4.12,   nor_sd: 2.42  }
};

// --- 2. 수학적 헬퍼 함수 ---
function normalCDF(x, mean, std) {
  if (std === 0) return x < mean ? 0 : 1;
  const z = (x - mean) / std;
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2.0);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1.0 - p : p;
}

function getRank(score, mean, std) {
  const cdf = normalCDF(score, mean, std);
  let rank = Math.round((1 - cdf) * 100);
  return Math.max(1, Math.min(100, rank));
}

function getRankColor(rank) {
  if (rank <= 30) return "#FF5C7A";
  if (rank >= 70) return "#2B3CFF";
  return "#9FB0FF";
}

// --- 3. 채점 로직 ---
export function calculateScores(answers) {
  const get = (k) => (answers[k] !== undefined ? Number(answers[k]) : 0);
  const sum = (p, s, e) => { let t = 0; for (let i = s; i <= e; i++) t += get(`${p}${i}`); return t; };
  const avg = (keys) => keys.reduce((a, k) => a + get(k), 0) / keys.length;

  // ZUNG SDS (역채점: 2,5,6,11,12,14,16,17,18,20)
  let zung = 0;
  const zungRev = [2, 5, 6, 11, 12, 14, 16, 17, 18, 20];
  for (let i = 1; i <= 20; i++) {
    const v = get(`z${i}`);
    if (v > 0) zung += zungRev.includes(i) ? (5 - v) : v;
  }

  // BAI
  const bai = sum('b', 1, 21);

  // TEMPS-A (items 1-5 scale → "예" if >= 3)
  let tempsCyc = 0, tempsDep = 0, tempsIrr = 0, tempsHyp = 0, tempsAnx = 0;
  for (let i = 1; i <= 12; i++) { if (get(`t${i}`) >= 3) tempsCyc++; }
  for (let i = 13; i <= 20; i++) { if (get(`t${i}`) >= 3) tempsDep++; }
  for (let i = 21; i <= 28; i++) { if (get(`t${i}`) >= 3) tempsIrr++; }
  for (let i = 29; i <= 36; i++) { if (get(`t${i}`) >= 3) tempsHyp++; }
  for (let i = 37; i <= 39; i++) { if (get(`t${i}`) >= 3) tempsAnx++; }

  // MIQS (기분불안정성상태 - MSSI: freq * sev)
  let miqs = 0;
  for (let i = 1; i <= 20; i++) {
    miqs += (get(`mssi${i}_freq`) * get(`mssi${i}_sev`));
  }

  // MDQ
  const mdqScore = sum('mdq', 1, 13);
  const mdqPos = (mdqScore >= 7 && get('mdq14') === 1 && get('mdq15') >= 2);

  // MIQ-T (기분변동성 기질)
  // 17 items total: mt1-mt17
  // Lability (기분기복): mt1, mt6, mt11, mt16, mt17
  // Downward (기분하향): mt2, mt7, mt12
  // Upward (기분상승): mt3, mt8, mt13
  // Seasonality (계절기분변동성): mt4, mt9, mt14
  // Childhood (소아기기분변동성): mt5, mt10, mt15
  const miqtTotal = sum('mt', 1, 17);
  const miqtLabil = [1, 6, 11, 16, 17].reduce((a, c) => a + get(`mt${c}`), 0);
  const miqtDown  = [2, 7, 12].reduce((a, c) => a + get(`mt${c}`), 0);
  const miqtUp    = [3, 8, 13].reduce((a, c) => a + get(`mt${c}`), 0);
  const miqtSeason= [4, 9, 14].reduce((a, c) => a + get(`mt${c}`), 0);
  const miqtChild = [5, 10, 15].reduce((a, c) => a + get(`mt${c}`), 0);

  // CTQ (역채점: 2,5,7,10,13,16,19,22,26,28)
  const ctqRevItems = [2, 5, 7, 10, 13, 16, 19, 22, 26, 28];
  const ctqItems = Array.from({length: 28}, (_, i) => {
    const v = get(`ctq${i+1}`);
    return ctqRevItems.includes(i+1) ? (6 - v) : v;
  });
  const ctqTotal    = ctqItems.reduce((a, b) => a + b, 0);
  const ctqEA       = [3, 8, 14, 18, 25].reduce((a, c) => a + ctqItems[c-1], 0);
  const ctqPA       = [9, 11, 12, 15, 17].reduce((a, c) => a + ctqItems[c-1], 0);
  const ctqSA       = [20, 21, 23, 24, 27].reduce((a, c) => a + ctqItems[c-1], 0);
  const ctqEN       = [5, 7, 13, 19, 28].reduce((a, c) => a + ctqItems[c-1], 0);
  const ctqPN       = [1, 2, 4, 6, 26].reduce((a, c) => a + ctqItems[c-1], 0);

  // IPSM
  const ipsmTotal  = sum('ip', 1, 36);
  const ipsmIA     = [2, 9, 11, 15, 18, 19, 30, 36].reduce((a, c) => a + get(`ip${c}`), 0);
  const ipsmNA     = [3, 5, 10, 14, 23, 24, 25, 35].reduce((a, c) => a + get(`ip${c}`), 0);
  const ipsmSA     = [1, 8, 12, 17, 28, 31, 34].reduce((a, c) => a + get(`ip${c}`), 0);
  const ipsmTIM    = [4, 6, 13, 20, 26, 29, 32].reduce((a, c) => a + get(`ip${c}`), 0);
  const ipsmFIS    = [7, 16, 21, 22, 27, 33].reduce((a, c) => a + get(`ip${c}`), 0);

  // CD-RISC
  const cdTotal    = sum('cd', 1, 25);
  const cdHard     = [10, 11, 12, 16, 17, 23, 24, 25].reduce((a, c) => a + get(`cd${c}`), 0);
  const cdPersist  = [6, 7, 14, 15, 18, 19, 20].reduce((a, c) => a + get(`cd${c}`), 0);
  const cdOptimism = [1, 2, 4, 5, 8].reduce((a, c) => a + get(`cd${c}`), 0);
  const cdSupport  = [3, 9, 13].reduce((a, c) => a + get(`cd${c}`), 0);
  const cdSpirit   = [21, 22].reduce((a, c) => a + get(`cd${c}`), 0);

  // ERSQ (averages)
  const ersqTotal   = sum('er', 1, 27) / 27;
  const ersqAware   = avg(['er1','er2','er3']);
  const ersqBody    = avg(['er4','er5','er6']);
  const ersqClarity = avg(['er7','er8','er9']);
  const ersqUnder   = avg(['er10','er11','er12']);
  const ersqAccept  = avg(['er13','er14','er15']);
  const ersqResil   = avg(['er16','er17','er18']);
  const ersqSupport = avg(['er19','er20','er21']);
  const ersqTolerate= avg(['er22','er23','er24']);
  const ersqModify  = avg(['er25','er26','er27']);

  // BIS/BAS (reverse: bb1, bb18)
  const bis = [1, 6, 10, 13, 15, 18, 20].reduce((a, c) => a + ([1, 18].includes(c) ? (5 - get(`bb${c}`)) : get(`bb${c}`)), 0);
  const basReward = [5, 14, 19, 22].reduce((a, c) => a + get(`bb${c}`), 0);
  const basDrive  = [3, 9, 12, 21].reduce((a, c) => a + get(`bb${c}`), 0);
  const basFun    = [4, 8, 16, 23].reduce((a, c) => a + get(`bb${c}`), 0);
  const bas = basReward + basDrive + basFun;

  // BAPQ (averages per 12 items)
  const bapqAloof  = sum('ba', 1, 12) / 12;
  const bapqPragma = sum('ba', 13, 24) / 12;
  const bapqRigid  = sum('ba', 25, 36) / 12;
  const bapqTotal  = sum('ba', 1, 36) / 36;

  // AUDIT
  const audit = sum('au', 1, 10);

  // CMS (아침/저녁형)
  const cms = sum('cms', 1, 13);
  let cmsClass;
  if (cms >= 41) cmsClass = "아침형";
  else if (cms <= 26) cmsClass = "저녁형";
  else cmsClass = "중간형";

  // SPAQ
  const spaqScore = sum('spaq2_', 0, 5);
  const spaqGlobal = get('spaq_global');
  let spaqClass;
  if (spaqScore >= 11 && spaqGlobal >= 2) spaqClass = "SAD";
  else if (spaqScore >= 11 || spaqGlobal >= 2) spaqClass = "subsyndromal SAD";
  else spaqClass = "not SAD";

  // ASRS screening (6 items threshold-based)
  let asrsScreen = 0;
  for (let i = 1; i <= 3; i++) { if (get(`adhd${i}`) >= 3) asrsScreen++; }
  for (let i = 4; i <= 6; i++) { if (get(`adhd${i}`) >= 2) asrsScreen++; }
  const asrsResult = asrsScreen >= 4 ? `성인ADHD의심됨, 6개중${asrsScreen}항목` : `성인ADHD의심되지않음, 6개중${asrsScreen}항목`;
  const asrsTotal  = sum('adhd', 1, 18);

  // WURS
  const wurs = sum('wurs', 1, 25);

  // BOR
  const bor = sum('bor', 1, 24);

  // PMS
  const pmsSym  = sum('pms', 1, 14);
  const pmsFunc = sum('pms_imp', 1, 5);
  const pmsDiag = (pmsSym >= 10 && pmsFunc >= 3) ? "PMS" : "no-PMS";

  // 공존장애 선별
  const diag = {
    suicide: get('ds1') ? 'O' : 'X',
    zhae:    get('ds2') ? 'O' : 'X',
    attempt: get('ds4') ? 'O' : 'X',
    panic:   (get('d1a') && get('d1b') && get('d2')) ? 'O' : 'X',
    agora:   (get('e1') && get('e3')) ? 'O' : 'X',
    social:  (get('f1') && get('f3_4') && get('f6')) ? 'O' : 'X',
    ocd:     ((get('g1a') || get('g3a')) && get('g5')) ? 'O' : 'X',
    gad:     (get('n1a') && get('n1b') && get('n2')) ? 'O' : 'X'
  };

  // 기타 파생 점수
  const agitatedDep = (miqs >= 30 && asrsScreen >= 4) ? "양성" : "음성";
  const mixedDep    = (mdqPos || miqtTotal >= 29) ? "양성" : "음성";

  return {
    ZUNG: zung, BAI: bai,
    MIQS: miqs,
    MDQ: { score: mdqScore, pos: mdqPos },
    TEMPS: { cyc: tempsCyc, dep: tempsDep, irr: tempsIrr, hyp: tempsHyp, anx: tempsAnx },
    MIQT: { total: miqtTotal, labil: miqtLabil, down: miqtDown, up: miqtUp, season: miqtSeason, child: miqtChild },
    CTQ: { total: ctqTotal, ea: ctqEA, pa: ctqPA, sa: ctqSA, en: ctqEN, pn: ctqPN },
    IPSM: { total: ipsmTotal, ia: ipsmIA, na: ipsmNA, sa: ipsmSA, tim: ipsmTIM, fis: ipsmFIS },
    CD: { total: cdTotal, hard: cdHard, persist: cdPersist, optimism: cdOptimism, support: cdSupport, spirit: cdSpirit },
    ERSQ: { total: ersqTotal, aware: ersqAware, body: ersqBody, clarity: ersqClarity, under: ersqUnder,
            accept: ersqAccept, resil: ersqResil, support: ersqSupport, tolerate: ersqTolerate, modify: ersqModify },
    BIS: bis, BAS: bas,
    BAS_Sub: { reward: basReward, drive: basDrive, fun: basFun },
    BAPQ: { total: bapqTotal, aloof: bapqAloof, pragma: bapqPragma, rigid: bapqRigid },
    AUDIT: audit,
    CMS: { score: cms, class: cmsClass },
    SPAQ: { score: spaqScore, global: spaqGlobal, class: spaqClass },
    ASRS: { total: asrsTotal, screen: asrsScreen, result: asrsResult },
    WURS: wurs, BOR: bor,
    PMS: { sym: pmsSym, func: pmsFunc, diag: pmsDiag },
    AgitatedDep: agitatedDep, MixedDep: mixedDep,
    DIAG: diag
  };
}

// --- 4. 리포트 생성 ---
export function generateReport(scores, answers) {

  function makeRow(name, val, statKey, opts) {
    // opts can be a string (legacy desc) or an object {desc, sub, specialCols, textOnly, extra}
    let desc = "", sub = false, specialCols = false, textOnly = false, extra = undefined;
    if (typeof opts === 'string') {
      desc = opts;
    } else if (opts && typeof opts === 'object') {
      desc = opts.desc || "";
      sub = opts.sub || false;
      specialCols = opts.specialCols || false;
      textOnly = opts.textOnly || false;
      extra = opts.extra;
    }
    const s = STATS[statKey];
    if (!s) { console.warn('STATS missing key:', statKey); return null; }
    const pRank = getRank(val, s.pat_m, s.pat_sd);
    const nRank = getRank(val, s.nor_m, s.nor_sd);
    const row = {
      name,
      score: typeof val === 'number' ? Math.round(val * 100) / 100 : val,
      pat_rank: pRank,
      nor_rank: nRank,
      pat_color: getRankColor(pRank),
      nor_color: getRankColor(nRank),
      description: desc
    };
    if (sub) row.sub = true;
    if (specialCols) row.specialCols = true;
    if (textOnly) row.textOnly = true;
    if (extra !== undefined) row.extra = extra;
    return row;
  }

  function makeTextOnlyRow(name, textVal) {
    return { name, score: textVal, textOnly: true, pat_rank: null, nor_rank: null };
  }

  const sections = [];

  // ── 섹션 1: 우울, 불안, 기분안정성상태, 경조증 선별 ──
  sections.push({
    title: "우울, 불안, 기분안정성상태, 경조증 선별",
    groups: [
      {
        rows: [
          makeRow("우울점수", scores.ZUNG, 'ZUNG',
            "우울 수준을 측정하는 검사로, 응답결과가 20점 이상이면 약한 수준, 45점 이상이면 중등도 수준, 60점 이상이면 심한 수준에 해당합니다 (환자군평균 52, 정상군평균 43)."),
          makeRow("불안점수", scores.BAI, 'BAI',
            "불안 수준을 측정하는 검사로 응답결과가 8점 이상이면 약한 수준, 16점 이상이면 중등도 수준 26점 이상이면 심한 수준에 해당합니다 (환자군평균 20, 정상군평균 10)."),
          makeRow("경조증 선별", scores.MDQ.score, 'MDQ',
            "기분장애 질문지는 조증 또는 경조증의 증상들이 과거에 있었는지, 이 증상들이 동일한 시기에 발생했는지, 증상으로 인한 기능상의 문제가 어느 정도였는지를 조사하여 양극성장애를 선별하는 검사입니다 (환자군평균 7.31, 정상군평균 3.0)."),
          makeRow("기분불안정성상태", scores.MIQS, 'MIQS',
            "기분불안정성상태는 기분이 얼마나 불안정적인지를 알아보는 검사입니다. 높을수록 불안정한 상태를 뜻합니다 (환자군평균 48.6, 정상군평균 30.0).")
        ].filter(Boolean)
      },
      {
        label: "공존장애 선별",
        type: "comorbidity",
        items: [
          { name: "자살사고",  value: scores.DIAG.suicide },
          { name: "자해사고",  value: scores.DIAG.zhae },
          { name: "자살시도",  value: scores.DIAG.attempt },
          { name: "공황",      value: scores.DIAG.panic },
          { name: "광장공포",  value: scores.DIAG.agora },
          { name: "사회불안",  value: scores.DIAG.social },
          { name: "강박증상",  value: scores.DIAG.ocd },
          { name: "범불안",    value: scores.DIAG.gad }
        ]
      }
    ]
  });

  // ── 섹션 2: 정서기질 ──
  sections.push({
    title: "정서기질",
    groups: [
      {
        description: "정서기질은 기분장애와 관련이 높은 다섯 가지 기질을 어느 정도 갖고 있는지 알아보는 검사입니다. \"순환성기질 (환자군평균 6.5, 정상군평균 4.7, 간이결과기준)\"은 감정의 기복이나 변동이 심한 특성이며, \"우울기질 (환자군평균 3.6, 정상군평균 2.1)\"은 에너지가 낮고 기분이 저하되는 특성, \"과민성기질 (환자군평균 2.3, 정상군평균 1.7)\"은 주변의 사소한 일에도 쉽게 화를 내고 짜증이 나고 예민해지는 특성을 말합니다. \"과잉기질 (환자군평균 2.7, 정상군평균 2.9)\"은 에너지가 많고 기분이 고양되기 쉬운 기질이며, \"불안기질 (환자군평균 1.4, 정상군평균 1.4)\"은 걱정이 많고 쉽게 초조해지고 긴장을 느끼는 기질입니다.",
        rows: [
          makeRow("순환성기질", scores.TEMPS.cyc, 'TEMPS_Cyc'),
          makeRow("우울기질",   scores.TEMPS.dep, 'TEMPS_Dep'),
          makeRow("과민성기질", scores.TEMPS.irr, 'TEMPS_Irr'),
          makeRow("과잉기질",   scores.TEMPS.hyp, 'TEMPS_Hyp'),
          makeRow("불안기질",   scores.TEMPS.anx, 'TEMPS_Anx')
        ].filter(Boolean)
      }
    ]
  });

  // ── 섹션 3: 기분안정성기질 ──
  sections.push({
    title: "기분안정성기질",
    groups: [
      {
        description: "기분변동성 기질은 기분 변화 및 기복, 그에 따른 행동 양상이 반영된 개인의 안정적인 특성(trait)을 알아보는 검사입니다  (환자군평균 29.8, 정상군평균 21.8). \"기분기복 (환자군평균 7.6, 정상군평균 4.9)\"은 기분과 에너지, 인지 및 사회적인 행동의 변동성을 나타내는 특성이고,  \"기분하향 (환자군평균 6.8, 정상군평균 4.8)\"은 우울감 및 불안, 짜증을 느끼기 쉬운 특성이고, \"기분상승 (환자군평균 5.6, 정상군평균 4.7)\"은 긍정적이고 에너지가 넘치는 느낌에 대한 특성입니다. \"소아기 기분변동성 (환자군평균 3.0, 정상군평균 2.6)\"은 아동기에 형성된 애착 유형과 정서처리 방식이 현재 대인관계 유형에 얼마나 영향을 끼치는지 알아보는 특성이고, \"계절 기분변동성 (환자군평균 3.5, 정상군평균 3.7)\"은 계절 변화에 따라 달라지는 기분, 에너지, 행동 양상에 대한 특성입니다.",
        rows: [
          makeRow("기분변동성 기질 총점", scores.MIQT.total,  'MIQT_Total'),
          makeRow("기분기복",             scores.MIQT.labil,  'MIQT_Labil',  { sub: true }),
          makeRow("기분하향",             scores.MIQT.down,   'MIQT_Down',   { sub: true }),
          makeRow("기분상승",             scores.MIQT.up,     'MIQT_Up',     { sub: true }),
          makeRow("계절 기분변동성",      scores.MIQT.season, 'MIQT_Season', { sub: true }),
          makeRow("소아기 기분변동성",    scores.MIQT.child,  'MIQT_Child',  { sub: true })
        ].filter(Boolean)
      }
    ]
  });

  // ── 섹션 4: 아동기외상, 대인관계민감성, 회복탄력성 ──
  sections.push({
    title: "아동기외상, 대인관계민감성, 회복탄력성",
    groups: [
      {
        label: "아동기외상",
        description: "아동기 외상은 아동기에 정서적, 신체적, 성적 학대나 방임 등의 경험이 있었는지를 알아보는 검사입니다 (환자군평균 48.6, 정상군평균 42.5). 아동기외상 항목의 응답결과 점수가 41점 이상이면 약한 수준, 56점 이상이면 중등도 수준, 73점 이상이면 심한 수준에 해당합니다. \"감정적 학대 (환자군평균 10.7, 정상군평균 8.2)\", \"신체적 학대 (환자군평균 9.6, 정상군평균 8.1)\", \"성적 학대 (환자군평군 6.3 정상군평균 6.5)\", \"감정적 방치 (환자군평균 13.9 정상군평균 11.0)\", \"신체적 방치 (환자군평균 8.2, 정상군평균 8.6)\"는 어떠한 종류의 외상적 경험을 했는지를 세부적으로 알아보는 설문입니다.",
        rows: [
          makeRow("아동기외상 총점", scores.CTQ.total, 'CTQ_Total'),
          makeRow("감정적학대",     scores.CTQ.ea,    'CTQ_EA',    { sub: true }),
          makeRow("신체적학대",     scores.CTQ.pa,    'CTQ_PA',    { sub: true }),
          makeRow("성적학대",       scores.CTQ.sa,    'CTQ_SA',    { sub: true }),
          makeRow("감정적방치",     scores.CTQ.en,    'CTQ_EN',    { sub: true }),
          makeRow("신체적방치",     scores.CTQ.pn,    'CTQ_PN',    { sub: true })
        ].filter(Boolean)
      },
      {
        label: "대인관계민감도",
        description: "대인관계민감도 검사는 대인관계에서 타인의 반응이나 의도, 거절 신호에 민감한지를 측정하는 검사입니다 (환자군평균 98.9, 정상군평균 89.5). \"대인인식 (환자군평균 21.1, 정상군평균 18.5)\"은 자신이 타인에게 또는 타인이 자신에게 미치는 부정적이거나 비판적인 영향 또는 반응을 인식하는 특성이며, \"승인욕구 (환자군평균 24.0, 정상군평균 23.2)\"는 다른 사람들의 희망/요구 사항을 충족시키고자 하는 특성이고, \"분리불안 (환자군평균 19.6, 정상군평균 17.1)\"은 유년기 애착 형성의 어려움이 대인관계의 유대감에 영향을 미치는 정도를 알아보는 특성이며, \"소심함 (환자군평균 22.3, 정상군평균 20.5)\"은 대인관계민감도에 있어 행동적인 특성으로 사회적인 기술로 여겨집니다. 마지막으로, \"유약한내적자기 (환자군평균 12.3, 정상군평균 10.6)\"는 얼마나 취약한 자기가치감(자존감)을 가지고 있는지 알아보는 특성입니다.",
        rows: [
          makeRow("대인관계민감도 총점", scores.IPSM.total, 'IPSM_Total'),
          makeRow("대인인식",           scores.IPSM.ia,    'IPSM_IA',    { sub: true }),
          makeRow("승인욕구",           scores.IPSM.na,    'IPSM_NA',    { sub: true }),
          makeRow("분리불안",           scores.IPSM.sa,    'IPSM_SA',    { sub: true }),
          makeRow("소심함",             scores.IPSM.tim,   'IPSM_TIM',   { sub: true }),
          makeRow("유약한내적자기",     scores.IPSM.fis,   'IPSM_FIS',   { sub: true })
        ].filter(Boolean)
      },
      {
        label: "회복력",
        description: "회복력 검사는 스트레스 대처능력, 실패로부터 회복하는 능력을 측정합니다 (환자군평균 45.5, 정상군평균 60.4). 점수가 높을수록 회복력이 높은 것을 뜻합니다. \"강인성 (환자군평균 14.3, 정상군평균 18.9)\"은 개인의 높은 기준, 뛰어난 능력, 끈기를 알아보는 특성이며, \"인내 (환자군평균 12.9, 정상군평균 16.3)\"는 자신의 능력에 대한 믿음, 부정적인 것에 대한 내성, 스트레스에 대한 대처 능력에 대한 특성이고, \"낙관성 (환자군평균 9.7, 정상군평균 13.0)\"은 긍정적인 수용과 관련된 특성이며, \"지지 (환자군평균 5.1, 정상군평균 7.2)\"는 안정적인 대인관계에 대한 특성이고, \"영성 (환자군평균 4.0, 정상군평균 4.5)\"은 영적인 영향력에 대한 특성입니다.",
        rows: [
          makeRow("회복력 총점", scores.CD.total,    'CD_Total'),
          makeRow("강인성",     scores.CD.hard,     'CD_Hard',    { sub: true }),
          makeRow("인내",       scores.CD.persist,  'CD_Persist', { sub: true }),
          makeRow("낙관성",     scores.CD.optimism, 'CD_Optimism',{ sub: true }),
          makeRow("지지",       scores.CD.support,  'CD_Support', { sub: true }),
          makeRow("영성",       scores.CD.spirit,   'CD_Spirit',  { sub: true })
        ].filter(Boolean)
      }
    ]
  });

  // ── 섹션 5: 정서조절, 행동패턴, 음주, 수면양상 ──
  {
    const cmsRow = makeRow("아침/저녁형", scores.CMS.score, 'CMS',
      "아침 활동형, 저녁 활동형 여부를 측정하는 검사로 (환자군평균 28.7, 정상군평균 30.6), 점수가 높을수록 아침형, 낮을수록 저녁형에 해당합니다. 응답결과가 41점 이상은 아침형, 26점 이하는 저녁형에 해당하며, 그 중간 점수에 있을 경우에는 구분이 뚜렷하지 않은 중간형에 해당합니다.");
    if (cmsRow) { cmsRow.specialCols = true; cmsRow.extra = scores.CMS.class; }
    sections.push({
      title: "정서조절, 행동패턴, 음주, 수면양상",
      groups: [
        {
          label: "정서조절능력",
          description: "자신이 평소 자신의 정서에 대해서 얼마나 느끼고 생각하고 조절할 수 있는지에 대해 알아보는 검사입니다 (환자군평균 1.8, 정상군평균 2.2). 응답결과의 점수가 높을수록 자신의 정서에 대해서 많이 느끼고 생각하고 조절하려고 하는 것을 뜻합니다. \"의식, 감각, 명료성\"은 자신이 경험하고 있는 감정을 명확히 인식, 지각할 수 있는지를 측정하며, \"이해, 수용, 회복력\"은 감정을 불러일으킨 상황에 대한 이해, 부정적인 감정을 수용하거나 직면하여 감정을 처리하는 능력을 측정합니다. \"지지, 내성, 수정\"은 스트레스 상황에서 스스로를 안정시키고 부정적 감정을 인내하며 기분이 나아질 수 있도록 적극적으로 감정을 바꾸는 능력을 측정합니다.",
          rows: [
            makeRow("정서조절능력 총점", scores.ERSQ.total,    'ERSQ_Total'),
            makeRow("의식",             scores.ERSQ.aware,    'ERSQ_Aware',    { sub: true }),
            makeRow("감각",             scores.ERSQ.body,     'ERSQ_Body',     { sub: true }),
            makeRow("명료성",           scores.ERSQ.clarity,  'ERSQ_Clarity',  { sub: true }),
            makeRow("이해",             scores.ERSQ.under,    'ERSQ_Under',    { sub: true }),
            makeRow("수용",             scores.ERSQ.accept,   'ERSQ_Accept',   { sub: true }),
            makeRow("회복력",           scores.ERSQ.resil,    'ERSQ_Resil',    { sub: true }),
            makeRow("지지",             scores.ERSQ.support,  'ERSQ_Support',  { sub: true }),
            makeRow("내성",             scores.ERSQ.tolerate, 'ERSQ_Tolerate', { sub: true }),
            makeRow("수정",             scores.ERSQ.modify,   'ERSQ_Modify',   { sub: true })
          ].filter(Boolean)
        },
        {
          label: "행동억제, 행동활성",
          description: "행동억제는 부정적이고 처벌이 예상되는 신호에 민감하게 반응하여 행동을 억제하는 경향이며 (환자군평균 22.6, 정상군평균 20.8), \"행동활성\"은 긍정적이고 보상이 주어지는 신호에 민감하게 반응하여 행동이 쉽게 활성화되는 경향입니다 (환자군평균 35.8, 정상군평균 36.7). \"보상반응성은 (환자군평균 14.7, 정상군평균 14.5)\" 어떤 행동을 함에 있어 보상이나 긍정적인 반응에 초점을 맞추는 특성이며, \"추진성은 (환자군평균 10.8, 정상군평균 10.9)\" 원하는 목표를 위해 지속적으로 노력하는 특성이고, \"재미추구는 (환자군평균 10.4, 정상군평균 10.5)\" 새로운 보상에 대한 열망과 잠재적으로 보상이 주어질 것 같은 일에 관심을 가지는 특성입니다.",
          rows: [
            makeRow("행동억제",   scores.BIS,            'BIS'),
            makeRow("행동활성",   scores.BAS,            'BAS'),
            makeRow("보상반응성", scores.BAS_Sub.reward, 'BAS_Reward', { sub: true }),
            makeRow("추진성",     scores.BAS_Sub.drive,  'BAS_Drive',  { sub: true }),
            makeRow("재미추구",   scores.BAS_Sub.fun,    'BAS_Fun',    { sub: true })
          ].filter(Boolean)
        },
        {
          label: "음주경향",
          description: "음주 경향, 의존성, 위험 정도를 측정합니다 (환자군평균 6.9, 정상군평균 2.6). 응답결과가 12점 이상이면 약한 수준, 20점 이상이면 중등도 수준, 24점 이상이면 심한 수준의 문제가 있음을 의미합니다.",
          rows: [
            makeRow("음주경향점수", scores.AUDIT, 'AUDIT')
          ].filter(Boolean)
        },
        {
          label: "아침/저녁형",
          description: "아침 활동형, 저녁 활동형 여부를 측정하는 검사로 (환자군평균 28.7, 정상군평균 30.6), 점수가 높을수록 아침형, 낮을수록 저녁형에 해당합니다. 응답결과가 41점 이상은 아침형, 26점 이하는 저녁형에 해당하며, 그 중간 점수에 있을 경우에는 구분이 뚜렷하지 않은 중간형에 해당합니다.",
          rows: [cmsRow].filter(Boolean)
        }
      ]
    });
  }

  // ── 섹션 6: 계절성 우울증, 집중력, 경계선 성격, 행동문제, 성격특성 ──
  {
    const spaqRow = makeRow("계절성우울증", scores.SPAQ.score, 'SPAQ',
      "계절에 따라 수면, 기분, 식욕, 활력 등이 달라지는 경향을 보기 위한 검사입니다. 응답결과가 높을수록 계절에 따른 차이가 크다는 것을 의미합니다. 계절성이 심하고 이에 따른 일상생활의 지장이 크다면 계절성 우울증(SAD)에 해당할 수 있습니다. 설문 결과상 계절성 우울증이 약하게 있으면 \"subsyndromal SAD\" 없으면 \"not SAD\"로 표시됩니다. (환자군평균 6.0 정상군평균 5.9)");
    if (spaqRow) { spaqRow.specialCols = true; spaqRow.extra = scores.SPAQ.class; }

    const asrsScreenText = scores.ASRS.screen >= 4 ? "성인ADHD의심됨" : "성인ADHD의심되지않음";
    const asrsTotalRow = makeRow("성인기 주의집중문제", scores.ASRS.total, 'ASRS', "");
    if (asrsTotalRow) { asrsTotalRow.specialCols = true; asrsTotalRow.extra = asrsScreenText; }

    sections.push({
      title: "계절성 우울증, 집중력, 경계선 성격, 행동문제, 성격특성",
      groups: [
        {
          label: "계절성우울증",
          description: "계절에 따라 수면, 기분, 식욕, 활력 등이 달라지는 경향을 보기 위한 검사입니다. 응답결과가 높을수록 계절에 따른 차이가 크다는 것을 의미합니다. 계절성이 심하고 이에 따른 일상생활의 지장이 크다면 계절성 우울증(SAD)에 해당할 수 있습니다. 설문 결과상 계절성 우울증이 약하게 있으면 \"subsyndromal SAD\" 없으면 \"not SAD\"로 표시됩니다. (환자군평균 6.0 정상군평균 5.9)",
          rows: [spaqRow].filter(Boolean)
        },
        {
          label: "성인기 주의집중문제",
          description: "성인 ADHD 검사입니다 (환자군평균 46.8, 정상군평균 39.9). 6개 항목은 ADHD 진단기준에 대해 물어보는 것입니다. 이 중 4개 이상의 항목을 만족하면 성인 ADHD를 의심할 수 있습니다. 그런 경우 \"성인ADHD의심됨\"이라고 표시됩니다. 그러나 이것만으로 ADHD로 진단할 수는 없고, ADHD가 아니라 기분장애의 증상으로 집중력 문제가 있을 수도 있습니다. 하단의 점수는 ADHD 증상의 정도를 나타냅니다.",
          rows: [asrsTotalRow].filter(Boolean)
        },
        {
          label: "아동기 주의집중문제",
          description: "아동기 시절의 ADHD 증상과 병력을 측정하기 위한 검사입니다 (환자군평균 25.9, 정상군평균 19.8). 응답결과가 46점 이상일 경우, 과거 ADHD 경향을 보였을 가능성이 높을 수 있습니다.",
          rows: [
            makeRow("아동기 주의집중문제", scores.WURS, 'WURS')
          ].filter(Boolean)
        },
        {
          label: "범 행동문제 척도",
          description: "범 행동문제 척도는 자폐스펙트럼장애의 경도 또는 임상적 수준 이하의 증상을 확인하기 위한 검사입니다 (환자군평균 3.27, 정상군평균 2.99). \"무심한 성격은 (환자군평균 3.57, 정상군평균 3.24)\" 사회적 상호작용에 대한 관심이나 흥미가 부족한 특성이고, \"실용적 언어사용은 (환자군평균 2.84, 정상군평균 2.56)\" 사회적 의사소통 혹은 유동적이고 상호관계적 대화에 어려움이 있는 특성이며, \"경직된 성격은 (환자군평균 3.41, 정상군평균 3.15)\" 변화에 대한 관심이 적거나 변화에 적응하는 것에 어려움이 있는 특성입니다.",
          rows: [
            makeRow("범 행동문제 척도", scores.BAPQ.total,  'BAPQ_Total'),
            makeRow("무심한 성격",     scores.BAPQ.aloof,  'BAPQ_Aloof',  { sub: true }),
            makeRow("실용적 언어사용", scores.BAPQ.pragma, 'BAPQ_Pragma', { sub: true }),
            makeRow("경직된 성격",     scores.BAPQ.rigid,  'BAPQ_Rigid',  { sub: true })
          ].filter(Boolean)
        },
        {
          label: "경계성 성격장애 특성",
          description: "경계선 성격장애의 특성들을 측정하는 검사로 (환자군평균 32, 정상군평균 24), 정서, 자아정체감, 대인관계의 불안정성, 자해 등을 알아보고자 합니다. 응답결과가 39점 이상이면 경계선성격장애 환자집단과 유사한 수준의 문제를 경험하는 위험군으로 볼 수 있습니다.",
          rows: [
            makeRow("경계성 성격장애 특성", scores.BOR, 'BOR')
          ].filter(Boolean)
        }
      ]
    });
  }

  // ── 섹션 7: 생리주기에 따른 변화 (여성만) ──
  if (scores.PMS.sym > 0 || scores.PMS.func > 0) {
    sections.push({
      title: "생리주기에 따른 변화 (여성만 해당됩니다)",
      groups: [
        {
          description: "여성의 경우에만 평가합니다. 월경 전에 시작되는 월경전증후군에 대한 설문입니다. 증상정도는 월경전증후군으로 인한 기분, 활력 수준, 신체적 증상의 변화 정도를 평가합니다 (환자군평균 17.9, 정상군평균 15.7). 기능변화는 그런 증상으로 인해서 얼마나 일상생활 및 대인관계, 직업적, 사회적 기능에 얼마나 영향을 받는지를 평가합니다 (환자군평균 4.4, 정상군평균 4.1). 월경전증후군이 명확하면 PMS, 명확하지 않으면 no-PMS 로 표시됩니다.",
          rows: [
            makeRow("생리증후군 증상정도", scores.PMS.sym,  'PMS_Sym'),
            makeRow("생리증후군 기능변화", scores.PMS.func, 'PMS_Func'),
            makeTextOnlyRow("생리증후군 여부", scores.PMS.diag)
          ].filter(Boolean)
        }
      ]
    });
  }

  return {
    sections,
    instructions: getGlobalInstructions(),
    patientInfo: {}
  };
}

export function getGlobalInstructions() {
  return `본 검사 결과는 스스로의 응답하신 내용을 바탕으로 얻은 것입니다. "응답결과", "환자비교백분위", "정상군비교백분위" 모두 응답하신 분의 결과입니다. 결과를 해석하기 위해 "백분위"를 살펴보세요. "환자비교백분위"는 클리닉에 방문한 환자가 100명이 있다고 하면 그 100명 중 해당 항목의 점수가 몇 등에 해당하는지를 표시한 것입니다. 정상군비교백분위는 정신건강의학과에 방문한 적이 없는 사람들 100명 중 해당 항목의 점수가 몇 등에 해당하는지를 표시한 것입니다. 등수가 1에 가까울수록 그 항목의 점수가 높은 것이고 (빨간색), 등수가 100에 가까울수록 그 항목의 점수가 낮은 것입니다 (파란색). 예를 들어, 순환성기질의 환자비교백분위가 69등이고, 정상군비교 백분위가 83등이라면 분당서울대병원 기분장애클리닉에 방문한 환자들 100명 중에 순환성기질이 69번째로 높고, 정신건강의학과에 방문한 적이 없는 사람들 100명 중에서 83번째로 높다는 뜻입니다. 항목마다 높은 점수 (백분위가 1등에 가까운 점수)가 긍정적인 의미일 수도 있고 부정적인 의미일 수도 있습니다. 예를 들어 회복력과 정서조절능력의 경우 높은 점수가 긍정적인 것이고, 그 외 대부분의 항목은 높은 점수가 부정적인 경우입니다. 과잉기질, 행동억제/행동활성, 아침/저녁형과 같이 긍정적이나 부정적으로 구분하기 어려운 것도 있습니다. 각 항목이 어떤 의미인지는 검사 설명을 참조하세요. 검사 설명에 있는 점수와 비교하려면 "응답결과"의 점수를 이용하세요.`;
}
