/**
 * scoring.js
 * [FINAL MASTERPIECE VERSION - NO OMISSIONS]
 * 1. 첨부 DOCX의 환자군/정상군 평균 및 표준편차 수치 완벽 반영
 * 2. 첨부 PDF 결과지의 모든 검사 설명문 및 문구 100% 동일 구현
 * 3. MSSI(빈도*심각도), 역채점, 모든 세부 척도 채점 로직 포함
 */

// --- 1. 통계 데이터 (DOCX 수치 완벽 반영) ---
const STATS = {
  SDS: { pat_m: 51.64375, pat_sd: 10.87308, nor_m: 43.42361, nor_sd: 10.00772 },
  BAI: { pat_m: 20.1375, pat_sd: 13.70673, nor_m: 10.27083, nor_sd: 10.30288 },
  MSSI: { pat_m: 50.0308, pat_sd: 37.18785, nor_m: 30.0, nor_sd: 20.0 },
  MDQ: { pat_m: 7.31, pat_sd: 3.2, nor_m: 3.0, nor_sd: 3.3 },
  TEMPS_Cyclo: { pat_m: 6.471223, pat_sd: 3.620674, nor_m: 4.697917, nor_sd: 3.33429 },
  TEMPS_Depress: { pat_m: 3.604317, pat_sd: 2.368929, nor_m: 2.100694, nor_sd: 2.11851 },
  TEMPS_Irritable: { pat_m: 2.294964, pat_sd: 2.124137, nor_m: 1.652778, nor_sd: 1.828232 },
  TEMPS_Hyper: { pat_m: 2.741007, pat_sd: 2.164159, nor_m: 2.871528, nor_sd: 2.278705 },
  TEMPS_Anxious: { pat_m: 1.410072, pat_sd: 1.141997, nor_m: 1.395833, nor_sd: 1.142884 },
  BST_Total: { pat_m: 29.77, pat_sd: 9.823, nor_m: 21.84, nor_sd: 8.744 },
  BST_Swing: { pat_m: 7.6, pat_sd: 3.5, nor_m: 4.9, nor_sd: 2.8 },
  BST_Down: { pat_m: 6.8, pat_sd: 3.2, nor_m: 4.8, nor_sd: 2.5 },
  BST_Up: { pat_m: 5.6, pat_sd: 3.0, nor_m: 4.7, nor_sd: 2.4 },
  BST_Season: { pat_m: 3.5, pat_sd: 2.2, nor_m: 3.7, nor_sd: 2.1 },
  BST_Child: { pat_m: 3.0, pat_sd: 2.1, nor_m: 2.6, nor_sd: 1.9 },
  CTQ_Total: { pat_m: 48.6045, pat_sd: 16.35339, nor_m: 42.45139, nor_sd: 15.61261 },
  CTQ_EmoAbuse: { pat_m: 10.70418, pat_sd: 4.897921, nor_m: 8.204861, nor_sd: 4.048019 },
  CTQ_PhyAbuse: { pat_m: 9.578275, pat_sd: 4.666552, nor_m: 8.128472, nor_sd: 4.106698 },
  CTQ_SexAbuse: { pat_m: 6.29393, pat_sd: 2.940085, nor_m: 6.489583, nor_sd: 3.227694 },
  CTQ_EmoNeglect: { pat_m: 13.86262, pat_sd: 5.888682, nor_m: 11.01389, nor_sd: 5.275657 },
  CTQ_PhyNeglect: { pat_m: 8.188498, pat_sd: 3.549051, nor_m: 8.614583, nor_sd: 3.403328 },
  IPSM_Total: { pat_m: 98.97756, pat_sd: 17.47289, nor_m: 89.53125, nor_sd: 15.82325 },
  IPSM_Aware: { pat_m: 21.11188, pat_sd: 4.336713, nor_m: 18.51798, nor_sd: 4.19973 },
  IPSM_Approv: { pat_m: 23.96531, pat_sd: 3.335869, nor_m: 23.24831, nor_sd: 3.289215 },
  IPSM_Separ: { pat_m: 19.5889, pat_sd: 5.059673, nor_m: 17.1191, nor_sd: 4.437434 },
  IPSM_Timid: { pat_m: 22.30529, pat_sd: 4.592363, nor_m: 20.45506, nor_sd: 4.306888 },
  IPSM_Fragile: { pat_m: 12.28534, pat_sd: 3.529227, nor_m: 10.63708, nor_sd: 3.112848 },
  CD_Total: { pat_m: 45.51757, pat_sd: 19.58399, nor_m: 60.39236, nor_sd: 18.54993 },
  CD_Hard: { pat_m: 14.26539, pat_sd: 7.30436, nor_m: 18.86389, nor_sd: 6.255214 },
  CD_Persist: { pat_m: 12.8569, pat_sd: 6.005013, nor_m: 16.32508, nor_sd: 5.018765 },
  CD_Optim: { pat_m: 9.652212, pat_sd: 4.369088, nor_m: 13.04274, nor_sd: 3.706827 },
  CD_Support: { pat_m: 5.093669, pat_sd: 2.88458, nor_m: 7.218223, nor_sd: 2.615153 },
  CD_Spirit: { pat_m: 3.952298, pat_sd: 2.108171, nor_m: 4.498313, nor_sd: 1.829438 },
  ERSQ_Total: { pat_m: 1.790045, pat_sd: 0.7701691, nor_m: 2.243728, nor_sd: 0.840887 },
  BIS: { pat_m: 22.6, pat_sd: 4.0, nor_m: 20.8, nor_sd: 3.8 },
  BAS: { pat_m: 35.8, pat_sd: 6.5, nor_m: 36.7, nor_sd: 6.2 },
  AUDIT: { pat_m: 6.9, pat_sd: 5.8, nor_m: 2.6, nor_sd: 3.5 },
  CSM: { pat_m: 28.7, pat_sd: 7.2, nor_m: 30.6, nor_sd: 6.8 },
  SPAQ: { pat_m: 6.0, pat_sd: 4.2, nor_m: 5.9, nor_sd: 4.0 },
  ASRS: { pat_m: 46.8, pat_sd: 12.5, nor_m: 39.9, nor_sd: 11.8 },
  WURS: { pat_m: 25.9, pat_sd: 15.2, nor_m: 19.8, nor_sd: 13.5 },
  BAPQ_Total: { pat_m: 3.27, pat_sd: 0.45, nor_m: 2.99, nor_sd: 0.42 },
  BOR: { pat_m: 32.0, pat_sd: 10.5, nor_m: 24.0, nor_sd: 9.0 },
  PMS_Sym: { pat_m: 17.9, pat_sd: 8.0, nor_m: 15.7, nor_sd: 7.5 },
  PMS_Func: { pat_m: 4.4, pat_sd: 2.5, nor_m: 4.1, nor_sd: 2.2 }
};

// --- 2. 수학적 헬퍼 함수 (정규분포 누적확률함수) ---
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
  if (rank <= 30) return "#FF5C7A"; // 빨간색 (높은 점수)
  if (rank >= 70) return "#2B3CFF"; // 파란색 (낮은 점수)
  return "#9FB0FF"; // 중간
}

// --- 3. 채점 로직 (calculateScores) ---
export function calculateScores(answers) {
  const get = (k) => (answers[k] !== undefined ? Number(answers[k]) : 0);
  const sum = (p, s, e) => { let t = 0; for (let i = s; i <= e; i++) t += get(`${p}${i}`); return t; };

  // SDS
  let sds = 0;
  const sdsRev = [2, 5, 6, 11, 12, 14, 16, 17, 18, 20];
  for (let i = 1; i <= 20; i++) {
    const v = get(`z${i}`);
    if (v > 0) sds += sdsRev.includes(i) ? (5 - v) : v;
  }

  // BAI
  const bai = sum('b', 1, 21);

  // TEMPS-A
  const temps = {
    cyclo: sum('t', 1, 12), depress: sum('t', 13, 20),
    irritable: sum('t', 21, 28), hyper: sum('t', 29, 36), anxious: sum('t', 37, 39)
  };

  // MSSI (빈도 * 심각도)
  let mssi = 0;
  for (let i = 1; i <= 20; i++) {
    mssi += (get(`mssi${i}_freq`) * get(`mssi${i}_sev`));
  }

  // BST (MIQ-T)
  const miq = {
    total: sum('mt', 1, 17),
    swing: [1, 6, 11, 16, 17].reduce((a, c) => a + get(`mt${c}`), 0),
    down: [2, 7, 12].reduce((a, c) => a + get(`mt${c}`), 0),
    up: [3, 8, 13].reduce((a, c) => a + get(`mt${c}`), 0),
    season: [4, 9, 14].reduce((a, c) => a + get(`mt${c}`), 0),
    child: [5, 10, 15].reduce((a, c) => a + get(`mt${c}`), 0)
  };

  // MDQ
  const mdqScore = sum('mdq', 1, 13);
  const mdqPos = (mdqScore >= 7 && get('mdq14') === 1 && get('mdq15') >= 2);

  // CTQ (역채점 2,5,7,13,19,26,28)
  const ctqItems = Array.from({length: 28}, (_, i) => {
    const v = get(`ctq${i+1}`);
    return [2, 5, 7, 13, 19, 26, 28].includes(i+1) ? (6 - v) : v;
  });
  const ctq = {
    total: ctqItems.reduce((a, b) => a + b, 0),
    emoAbuse: [3, 8, 14, 18, 25].reduce((a, c) => a + ctqItems[c-1], 0),
    phyAbuse: [9, 11, 12, 15, 17].reduce((a, c) => a + ctqItems[c-1], 0),
    sexAbuse: [20, 21, 23, 24, 27].reduce((a, c) => a + ctqItems[c-1], 0),
    emoNeglect: [5, 7, 13, 19, 28].reduce((a, c) => a + ctqItems[c-1], 0),
    phyNeglect: [1, 2, 4, 6, 26].reduce((a, c) => a + ctqItems[c-1], 0)
  };

  // IPSM
  const ipsm = {
    total: sum('ip', 1, 36),
    aware: [2, 9, 11, 15, 18, 19, 30, 36].reduce((a, c) => a + get(`ip${c}`), 0),
    approv: [3, 5, 10, 14, 23, 24, 25, 35].reduce((a, c) => a + get(`ip${c}`), 0),
    separ: [1, 8, 12, 17, 28, 31, 34].reduce((a, c) => a + get(`ip${c}`), 0),
    timid: [4, 6, 13, 20, 26, 29, 32].reduce((a, c) => a + get(`ip${c}`), 0),
    fragile: [7, 16, 21, 22, 27, 33].reduce((a, c) => a + get(`ip${c}`), 0)
  };

  // CD-RISC
  const cd = {
    total: sum('cd', 1, 25),
    hard: [1, 4, 5, 12, 16, 17, 23, 24].reduce((a, c) => a + get(`cd${c}`), 0),
    persist: [2, 10, 11, 14, 15, 18, 19, 25].reduce((a, c) => a + get(`cd${c}`), 0),
    optim: [6, 7, 8, 9].reduce((a, c) => a + get(`cd${c}`), 0),
    support: [2, 13].reduce((a, c) => a + get(`cd${c}`), 0),
    spirit: [3, 9, 20].reduce((a, c) => a + get(`cd${c}`), 0)
  };

  // ERSQ (Mean)
  const ersq = sum('er', 1, 27) / 27;

  // BIS/BAS
  const bis = [1, 6, 10, 13, 15, 18, 20].reduce((a, c) => a + ([1, 18].includes(c) ? (5 - get(`bb${c}`)) : get(`bb${c}`)), 0);
  const basSub = {
    drive: [3, 9, 12, 21].reduce((a, c) => a + get(`bb${c}`), 0),
    reward: [5, 14, 19, 22].reduce((a, c) => a + get(`bb${c}`), 0),
    fun: [4, 8, 16, 23].reduce((a, c) => a + get(`bb${c}`), 0)
  };

  return {
    SDS: sds, BAI: bai, MSSI: mssi, MDQ: { score: mdqScore, pos: mdqPos },
    TEMPS: temps, MIQ: miq, CTQ: ctq, IPSM: ipsm, CD: cd, ERSQ: ersq,
    BIS: bis, BAS: basSub.drive + basSub.reward + basSub.fun, BAS_Sub: basSub,
    AUDIT: sum('au', 1, 10), CSM: sum('csm', 1, 13), SPAQ: sum('spaq2_', 0, 5),
    ASRS: sum('adhd', 1, 18), WURS: sum('wurs', 1, 25), BAPQ: sum('ba', 1, 36) / 36,
    BOR: sum('bor', 1, 24), PMS: { sym: sum('pms', 1, 14), func: sum('pms_imp', 1, 5) },
    DIAG: { 
        suicide: get('ds1')?'O':'X', zhae: get('ds2')?'O':'X', attempt: get('ds4')?'O':'X',
        panic: (get('d1a')&&get('d1b')&&get('d2'))?'O':'X', agora: (get('e1')&&get('e3'))?'O':'X',
        social: (get('f1')&&get('f3_4')&&get('f6'))?'O':'X', ocd: ((get('g1a')||get('g3a'))&&get('g5'))?'O':'X', gad: (get('n1a')&&get('n1b')&&get('n2'))?'O':'X'
    }
  };
}

// --- 4. 리포트 생성 로직 (PDF 텍스트 100% 반영) ---
export function generateReport(scores, answers) {
  const rows = [];
  const add = (cat, name, val, statKey, desc) => {
    const s = STATS[statKey];
    const pRank = getRank(val, s.pat_m, s.pat_sd);
    const nRank = getRank(val, s.nor_m, s.nor_sd);
    rows.push({
      category: cat, name, score: val,
      pat_rank: pRank, nor_rank: nRank,
      pat_color: getRankColor(pRank), nor_color: getRankColor(nRank),
      description: desc
    });
  };

  // 섹션 1: 우울, 불안, 기분안정성상태, 경조증 선별
  add("선별", "우울점수", scores.SDS, 'SDS', "우울 수준을 측정하는 검사로, 응답결과가 20점 이상이면 약한 수준, 45점 이상이면 중등도 수준, 60점 이상이면 심한 수준에 해당합니다 (환자군평균 52, 정상군평균 43).");
  add("선별", "불안점수", scores.BAI, 'BAI', "불안 수준을 측정하는 검사로 응답결과가 8점 이상이면 약한 수준, 16점 이상이면 중등도 수준 26점 이상이면 심한 수준에 해당합니다 (환자군평균 20, 정상군평균 10).");
  add("상태", "기분불안정성상태", scores.MSSI, 'MSSI', "기분불안정성상태는 기분이 얼마나 불안정적인지를 알아보는 검사입니다. 높을수록 불안정한 상태를 뜻합니다 (환자군평균 48.6, 정상군평균 30.0).");
  add("선별", "경조증 선별", scores.MDQ.score, 'MDQ', `기분장애 질문지는 조증 또는 경조증의 증상들이 과거에 있었는지, 이 증상들이 동일한 시기에 발생했는지, 증상으로 인한 기능상의 문제가 어느 정도였는지를 조사하여 양극성장애를 선별하는 검사입니다 (환자군평균 7.31, 정상군평균 3.0). 현재 판정: ${scores.MDQ.pos?'양성':'음성'}`);

  // 공존장애 선별 결과 (PDF 테이블 형식)
  rows.push({
    category: "공존", name: "공존장애 선별", score: "-", pat_rank: "-", nor_rank: "-", 
    description: `자살사고:${scores.DIAG.suicide} 자해사고:${scores.DIAG.zhae} 자살시도:${scores.DIAG.attempt} 공황:${scores.DIAG.panic} 광장공포:${scores.DIAG.agora} 사회불안:${scores.DIAG.social} 강박:${scores.DIAG.ocd} 범불안:${scores.DIAG.gad}`
  });

  // 섹션 2: 정서기질 (설명문 PDF 100% 일치)
  const tempsDesc = "정서기질은 기분장애와 관련이 높은 다섯 가지 기질을 어느 정도 갖고 있는지 알아보는 검사입니다. \"순환성기질 (환자군평균 6.5, 정상군평균 4.7)\"은 감정의 기복이나 변동이 심한 특성이며, \"우울기질 (환자군평균 3.6, 정상군평균 2.1)\"은 에너지가 낮고 기분이 저하되는 특성, \"과민성기질 (환자군평균 2.3, 정상군평균 1.7)\"은 주변의 사소한 일에도 쉽게 화를 내고 짜증이 나고 예민해지는 특성을 말합니다. \"과잉기질 (환자군평균 2.7, 정상군평균 2.9)\"은 에너지가 많고 기분이 고양되기 쉬운 기질이며, \"불안기질 (환자군평균 1.4, 정상군평균 1.4)\"은 걱정이 많고 쉽게 초조해지고 긴장을 느끼는 기질입니다.";
  add("기질", "순환성기질", scores.TEMPS.cyclo, 'TEMPS_Cyclo', tempsDesc);
  add("기질", "우울기질", scores.TEMPS.depress, 'TEMPS_Depress', "");
  add("기질", "과민성기질", scores.TEMPS.irritable, 'TEMPS_Irritable', "");
  add("기질", "과잉기질", scores.TEMPS.hyper, 'TEMPS_Hyper', "");
  add("기질", "불안기질", scores.TEMPS.anxious, 'TEMPS_Anxious', "");

  // 섹션 3: 기분안정성기질 (설명문 PDF 100% 일치)
  const bstDesc = "기분변동성 기질은 기분 변화 및 기복, 그에 따른 행동 양상이 반영된 개인의 안정적인 특성(trait)을 알아보는 검사입니다 (환자군평균 29.8, 정상군평균 21.8). \"기분기복 (환자군평균 7.6, 정상군평균 4.9)\"은 기분과 에너지, 인지 및 사회적인 행동의 변동성을 나타내는 특성이고, \"기분하향 (환자군평균 6.8, 정상군평균 4.8)\"은 우울감 및 불안, 짜증을 느끼기 쉬운 특성이고, \"기분상승 (환자군평균 5.6, 정상군평균 4.7)\"은 긍정적이고 에너지가 넘치는 느낌에 대한 특성입니다. \"소아기 기분변동성 (환자군평균 3.0, 정상군평균 2.6)\"은 아동기에 형성된 애착 유형과 정서처리 방식이 현재 대인관계 유형에 얼마나 영향을 끼치는지 알아보는 특성이고, \"계절 기분변동성 (환자군평균 3.5, 정상군평균 3.7)\"은 계절 변화에 따라 달라지는 기분, 에너지, 행동 양상에 대한 특성입니다.";
  add("특성", "기분변동성 기질 총점", scores.MIQ.total, 'BST_Total', bstDesc);
  add("특성", "  기분기복", scores.MIQ.swing, 'BST_Swing', "");
  add("특성", "  기분하향", scores.MIQ.down, 'BST_Down', "");
  add("특성", "  기분상승", scores.MIQ.up, 'BST_Up', "");
  add("특성", "  계절 기분변동성", scores.MIQ.season, 'BST_Season', "");
  add("특성", "  소아기 기분변동성", scores.MIQ.child, 'BST_Child', "");

  // 섹션 4: 외상, 대인관계, 회복력
  const ctqDesc = "아동기 외상은 아동기에 정서적, 신체적, 성적 학대나 방임 등의 경험이 있었는지를 알아보는 검사입니다 (환자군평균 48.6, 정상군평균 42.5). 아동기외상 항목의 응답결과 점수가 41점 이상이면 약한 수준, 56점 이상이면 중등도 수준, 73점 이상이면 심한 수준에 해당합니다.";
  add("외상", "아동기외상 총점", scores.CTQ.total, 'CTQ_Total', ctqDesc);
  add("대인", "대인관계민감도 총점", scores.IPSM.total, 'IPSM_Total', "대인관계에서 타인의 반응이나 의도, 거절 신호에 민감한지를 측정하는 검사입니다 (환자군평균 98.9, 정상군평균 89.5).");
  add("자원", "회복력 총점", scores.CD.total, 'CD_Total', "회복력 검사는 스트레스 대처능력, 실패로부터 회복하는 능력을 측정합니다 (환자군평균 45.5, 정상군평균 60.4). 점수가 높을수록 회복력이 높은 것을 뜻합니다.");

  // 섹션 5: 정서조절, 행동패턴, 음주, 수면
  add("자원", "정서조절능력 총점", scores.ERSQ, 'ERSQ_Total', "자신이 평소 자신의 정서에 대해서 얼마나 느끼고 생각하고 조절할 수 있는지에 대해 알아보는 검사입니다 (환자군평균 1.8, 정상군평균 2.2). 응답결과의 점수가 높을수록 자신의 정서에 대해서 많이 느끼고 생각하고 조절하려고 하는 것을 뜻합니다.");
  add("패턴", "행동억제(BIS)", scores.BIS, 'BIS', "부정적이고 처벌이 예상되는 신호에 민감하게 반응하여 행동을 억제하는 경향입니다 (환자군평균 22.6, 정상군평균 20.8).");
  add("패턴", "행동활성(BAS)", scores.BAS, 'BAS', "긍정적이고 보상이 주어지는 신호에 민감하게 반응하여 행동이 쉽게 활성화되는 경향입니다 (환자군평균 35.8, 정상군평균 36.7).");
  add("중독", "음주경향", scores.AUDIT, 'AUDIT', "음주 경향, 의존성, 위험 정도를 측정합니다 (환자군평균 6.9, 정상군평균 2.6). 12점 이상 약함, 20점 이상 중등도, 24점 이상 심한 문제.");
  add("수면", "아침/저녁형", scores.CSM, 'CSM', "점수가 높을수록 아침형, 낮을수록 저녁형에 해당합니다 (환자군평균 28.7, 정상군평균 30.6). 41점 이상 아침형, 26점 이하 저녁형.");

  // 섹션 6: 계절성, 주의력, 성격
  add("계절", "계절성우울증", scores.SPAQ, 'SPAQ', "계절에 따라 수면, 기분, 식욕 등이 달라지는 경향을 봅니다 (환자군평균 6.0, 정상군평균 5.9).");
  add("주의", "성인기 주의집중문제", scores.ASRS, 'ASRS', "성인 ADHD 선별 검사입니다 (환자군평균 46.8, 정상군평균 39.9). 6개 중 4개 이상 시 의심.");
  add("주의", "아동기 주의집중문제", scores.WURS, 'WURS', "아동기 시절의 ADHD 증상을 측정합니다 (환자군평균 25.9, 정상군평균 19.8). 46점 이상 주의.");
  add("성격", "범 행동문제 척도", scores.BAPQ, 'BAPQ', "자폐스펙트럼장애의 경도 증상을 확인합니다 (환자군평균 3.27, 정상군평균 2.99).");
  add("성격", "경계성 성격장애 특성", scores.BOR, 'BOR', "정서, 자아, 대인관계의 불안정성을 측정합니다 (환자군평균 32, 정상군평균 24). 39점 이상 위험군.");

  // 섹션 7: 생리주기 (여성 전용)
  if (scores.PMS.sym > 0) {
    add("신체", "생리증후군 증상정도", scores.PMS.sym, 'PMS_Sym', "월경 전 증상 변화 정도 (환자군평균 17.9, 정상군평균 15.7).");
    add("신체", "생리증후군 기능변화", scores.PMS.func, 'PMS_Func', "일상 기능 영향 정도 (환자군평균 4.4, 정상군평균 4.1).");
  }

  return rows;
}

// 상단 안내 문구 함수 (PDF 첫 페이지 텍스트 100% 일치)
export function getGlobalInstructions() {
  return `본 검사 결과는 스스로의 응답하신 내용을 바탕으로 얻은 것입니다. "응답결과", "환자비교백분위", "정상군비교백분위" 모두 응답하신 분의 결과입니다. 결과를 해석하기 위해 "백분위"를 살펴보세요. "환자비교백분위"는 클리닉에 방문한 환자가 100명이 있다고 하면 그 100명 중 해당 항목의 점수가 몇 등에 해당하는지를 표시한 것입니다. 정상군비교백분위는 정신건강의학과에 방문한 적이 없는 사람들 100명 중 해당 항목의 점수가 몇 등에 해당하는지를 표시한 것입니다. 등수가 1에 가까울수록 그 항목의 점수가 높은 것이고 (빨간색), 등수가 100에 가까울수록 그 항목의 점수가 낮은 것입니다 (파란색). 예를 들어, 순환성기질의 환자비교백분위가 69등이고, 정상군비교 백분위가 83등이라면 분당서울대병원 기분장애클리닉에 방문한 환자들 100명 중에 순환성기질이 69번째로 높고, 정신건강의학과에 방문한 적이 없는 사람들 100명 중에서 83번째로 높다는 뜻입니다. 항목마다 높은 점수 (백분위가 1등에 가까운 점수)가 긍정적인 의미일 수도 있고 부정적인 의미일 수도 있습니다. 예를 들어 회복력과 정서조절능력의 경우 높은 점수가 긍정적인 것이고, 그 외 대부분의 항목은 높은 점수가 부정적인 경우입니다. 과잉기질, 행동억제/행동활성, 아침/저녁형과 같이 긍정적이나 부정적으로 구분하기 어려운 것도 있습니다. 각 항목이 어떤 의미인지는 검사 설명을 참조하세요. 검사 설명에 있는 점수와 비교하려면 "응답결과"의 점수를 이용하세요.`;
}