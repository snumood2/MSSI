const CONFIG = {
  SPREADSHEET_ID: '1mHaUquO0qdv7bpj9T7LIPVfyUsUlX87uyHiAS_dyG78',
  RAW_DATA_GID: 1056247064,
  CALC_GID: 1563113795,
  REPORT_GID: 1440639532,
  RAW_FALLBACK_NAME: 'RAWDATA',
  WEBHOOK_SECRET_PROPERTY: 'MSSI_WEBHOOK_SECRET'
};

const RAW_HEADERS = [
  'timestamp',
  'patient_id',
  'hospital_code',
  'patient_number',
  'dob',
  'sex'
];

const LEGACY_WIDTH = 878; // RAWDATA D:AFY
const QID_TO_LEGACY_OFFSET = JSON.parse('{"z1":3,"z2":4,"z3":5,"z4":6,"z5":7,"z6":8,"z7":9,"z8":10,"z9":11,"z10":12,"z11":13,"z12":14,"z13":15,"z14":16,"z15":17,"z16":18,"z17":19,"z18":20,"z19":21,"z20":22,"b1":23,"b2":24,"b3":25,"b4":26,"b5":27,"b6":28,"b7":29,"b8":30,"b9":31,"b10":32,"b11":33,"b12":34,"b13":35,"b14":36,"b15":37,"b16":38,"b17":39,"b18":40,"b19":41,"b20":42,"b21":43,"t1":44,"t2":45,"t3":46,"t4":47,"t5":48,"t6":49,"t7":50,"t8":51,"t9":52,"t10":53,"t11":54,"t12":55,"t13":56,"t14":57,"t15":58,"t16":59,"t17":60,"t18":61,"t19":62,"t20":63,"t21":64,"t22":65,"t23":66,"t24":67,"t25":68,"t26":69,"t27":70,"t28":71,"t29":72,"t30":73,"t31":74,"t32":75,"t33":76,"t34":77,"t35":78,"t36":79,"t37":80,"t38":81,"t39":82,"ds1":91,"ds2":92,"ds3":93,"ds4":94,"d1a":95,"d1b":96,"d2":97,"e1":98,"e3":99,"f1":100,"f3_4":101,"f6":102,"g1a":103,"g2":104,"g3a":105,"g5":106,"n1a":107,"n1b":108,"n2":109,"n3a":110,"n3b":111,"n3c":112,"n3d":113,"n3e":114,"n3f":115,"mt1":116,"mt2":117,"mt3":118,"mt4":119,"mt5":120,"mt6":121,"mt7":122,"mt8":123,"mt9":124,"mt10":125,"mt11":126,"mt12":127,"mt13":128,"mt14":129,"mt15":130,"mt16":131,"mt17":132,"ba1":133,"ba2":134,"ba3":135,"ba4":136,"ba5":137,"ba6":138,"ba7":139,"ba8":140,"ba9":141,"ba10":142,"ba11":143,"ba12":144,"ba13":145,"ba14":146,"ba15":147,"ba16":148,"ba17":149,"ba18":150,"ba19":151,"ba20":152,"ba21":153,"ba22":154,"ba23":155,"ba24":156,"ba25":157,"ba26":158,"ba27":159,"ba28":160,"ba29":161,"ba30":162,"ba31":163,"ba32":164,"ba33":165,"ba34":166,"ba35":167,"ba36":168,"ctq1":169,"ctq2":170,"ctq3":171,"ctq4":172,"ctq5":173,"ctq6":174,"ctq7":175,"ctq8":176,"ctq9":177,"ctq10":178,"ctq11":179,"ctq12":180,"ctq13":181,"ctq14":182,"ctq15":183,"ctq16":184,"ctq17":185,"ctq18":186,"ctq19":187,"ctq20":188,"ctq21":189,"ctq22":190,"ctq23":191,"ctq24":192,"ctq25":193,"ctq26":194,"ctq27":195,"ctq28":196,"ip1":197,"ip2":198,"ip3":199,"ip4":200,"ip5":201,"ip6":202,"ip7":203,"ip8":204,"ip9":205,"ip10":206,"ip11":207,"ip12":208,"ip13":209,"ip14":210,"ip15":211,"ip16":212,"ip17":213,"ip18":214,"ip19":215,"ip20":216,"ip21":217,"ip22":218,"ip23":219,"ip24":220,"ip25":227,"ip26":228,"ip27":229,"ip28":230,"ip29":231,"ip30":232,"ip31":233,"ip32":234,"ip33":235,"ip34":236,"ip35":237,"ip36":238,"cd1":239,"cd2":240,"cd3":241,"cd4":242,"cd5":243,"cd6":244,"cd7":245,"cd8":246,"cd9":247,"cd10":248,"cd11":249,"cd12":250,"cd13":251,"cd14":252,"cd15":253,"cd16":254,"cd17":255,"cd18":256,"cd19":257,"cd20":258,"cd21":259,"cd22":260,"cd23":261,"cd24":262,"cd25":263,"er1":264,"er2":265,"er3":266,"er4":267,"er5":268,"er6":269,"er7":270,"er8":271,"er9":272,"er10":273,"er11":274,"er12":275,"er13":276,"er14":277,"er15":278,"er16":279,"er17":280,"er18":281,"er19":282,"er20":283,"er21":284,"er22":285,"er23":286,"er24":287,"er25":288,"er26":289,"er27":290,"bb1":291,"bb2":292,"bb3":293,"bb4":294,"bb5":295,"bb6":296,"bb7":297,"bb8":298,"bb9":299,"bb10":300,"bb11":301,"bb12":302,"bb13":303,"bb14":304,"bb15":305,"bb16":306,"bb17":307,"bb18":308,"bb19":309,"bb20":310,"adhd1":311,"adhd2":312,"adhd3":313,"adhd4":314,"adhd5":315,"adhd6":335,"adhd7":336,"adhd8":337,"adhd9":338,"adhd10":339,"adhd11":340,"adhd12":341,"adhd13":342,"adhd14":343,"adhd15":344,"adhd16":345,"adhd17":346,"adhd18":347,"bor1":348,"bor2":349,"bor3":350,"bor4":351,"bor5":352,"bor6":353,"bor7":354,"bor8":355,"bor9":356,"bor10":357,"bor11":358,"bor12":359,"bor13":360,"bor14":361,"bor15":362,"bor16":363,"bor17":364,"bor18":365,"bor19":366,"bor20":367,"bor21":368,"bor22":369,"bor23":370,"bor24":371,"wurs1":372,"wurs2":373,"wurs3":374,"wurs4":375,"wurs5":376,"wurs6":377,"wurs7":378,"wurs8":379,"wurs9":380,"wurs10":381,"wurs11":382,"wurs12":383,"wurs13":384,"wurs14":385,"wurs15":386,"wurs16":387,"wurs17":388,"wurs18":389,"wurs19":390,"wurs20":391,"wurs21":392,"wurs22":393,"wurs23":394,"wurs24":395,"wurs25":396,"pms1_1":397,"pms1_2":398,"pms1_3":399,"pms1_4":400,"pms1_5":401,"pms1_6":402,"pms1_7":403,"pms1_8":404,"pms1_9":423,"pms1_10":424,"pms1_11":425,"pms1_12":426,"pms1_13":427,"pms1_14":428,"pms_imp1":429,"pms_imp2":430,"pms_imp3":431,"pms_imp4":432,"pms_imp5":433}');

function doPost(e) {
  const lock = LockService.getDocumentLock() || LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const params = parsePayload_(e);
    verifySecret_(params);

    const ss = getSpreadsheet_();
    const rawSheet = getSheetByGid_(ss, CONFIG.RAW_DATA_GID) || getOrCreateSheet_(ss, CONFIG.RAW_FALLBACK_NAME);
    const calcSheet = getSheetByGid_(ss, CONFIG.CALC_GID);
    const reportSheet = getSheetByGid_(ss, CONFIG.REPORT_GID);

    ensureLegacyHeaders_(rawSheet);
    const rowValues = buildLegacySheetRow_(params);
    rawSheet.appendRow(rowValues);

    const appendedRow = rawSheet.getLastRow();
    SpreadsheetApp.flush();

    return json_({
      status: 'ok',
      row: appendedRow,
      rawSheet: rawSheet.getName(),
      calcSheet: calcSheet ? calcSheet.getName() : null,
      reportSheet: reportSheet ? reportSheet.getName() : null
    });
  } catch (err) {
    return json_({ status: 'error', message: err && err.message ? err.message : String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  const ss = getSpreadsheet_();
  return json_({
    status: 'ok',
    mode: 'legacy_raw_with_hospital_code_lookup',
    rawSheet: sheetInfo_(getSheetByGid_(ss, CONFIG.RAW_DATA_GID)),
    calcSheet: sheetInfo_(getSheetByGid_(ss, CONFIG.CALC_GID)),
    reportSheet: sheetInfo_(getSheetByGid_(ss, CONFIG.REPORT_GID))
  });
}

function doOptions() {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('POST body is empty.');
  }
  return JSON.parse(e.postData.contents);
}

function verifySecret_(params) {
  const expected = PropertiesService.getScriptProperties().getProperty(CONFIG.WEBHOOK_SECRET_PROPERTY);
  if (expected && params.secret !== expected) {
    throw new Error('Invalid webhook secret.');
  }
}

function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('No active spreadsheet and CONFIG.SPREADSHEET_ID is empty.');
  return ss;
}

function getSheetByGid_(ss, gid) {
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  return null;
}

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function ensureLegacyHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(RAW_HEADERS);
    sheet.setFrozenRows(1);
    return;
  }
  sheet.getRange(1, 1, 1, RAW_HEADERS.length).setValues([RAW_HEADERS]);
  sheet.setFrozenRows(1);
}

function buildLegacySheetRow_(params) {
  const legacy = buildLegacyAnswerRow_(params);
  return [
    params.timestamp || new Date().toISOString(),
    params.patientId || '',
    params.hospitalCode || '',
    ...legacy
  ];
}

function buildLegacyAnswerRow_(params) {
  const answers = params.answers || {};
  const row = Array(LEGACY_WIDTH).fill(0);
  row[0] = params.patientNumber || '';
  row[1] = params.dob ? "'" + String(params.dob) : '';
  row[2] = Number(params.sex || params.gender || 1);

  Object.keys(QID_TO_LEGACY_OFFSET).forEach((qid) => {
    const offset = QID_TO_LEGACY_OFFSET[qid];
    if (Object.prototype.hasOwnProperty.call(answers, qid)) {
      row[offset] = answers[qid];
    }
  });

  for (let i = 1; i <= 13; i++) {
    const key = 'csm' + i;
    if (answers[key] !== undefined) row[653 + i] = answers[key];
  }

  for (let i = 1; i <= 15; i++) {
    const key = 'mdq' + i;
    if (answers[key] !== undefined) row[20 + i] = answers[key];
  }

  const mssiOffsets = [
    [38, 39, 40], [41, 42, 43], [25, 26, 27], [31, 32, 33], [44, 45, 46],
    [34, 35, 36], [51, 52, 53], [47, 48, 49], [21, 22, 23], [11, 12, 13],
    [66, 67, 68], [69, 70, 71], [72, 73, 74], [54, 55, 56], [15, 16, 17],
    [14, 15, 16], [58, 59, 60], [86, 87, 88], [80, 81, 82], [47, 48, 49]
  ];
  for (let i = 1; i <= 20; i++) {
    const positions = mssiOffsets[i - 1];
    const yn = positions[0];
    const freq = positions[1];
    const sev = positions[2];
    if (answers['mssi' + i + '_yn'] !== undefined) row[yn - 1] = answers['mssi' + i + '_yn'];
    if (answers['mssi' + i + '_freq'] !== undefined) row[freq - 1] = answers['mssi' + i + '_freq'];
    if (answers['mssi' + i + '_sev'] !== undefined) row[sev - 1] = answers['mssi' + i + '_sev'];
  }
  if (answers.mssi21 !== undefined) row[4] = answers.mssi21;

  return row;
}

function sheetInfo_(sheet) {
  if (!sheet) return null;
  return {
    name: sheet.getName(),
    gid: sheet.getSheetId(),
    rows: sheet.getLastRow(),
    columns: sheet.getLastColumn()
  };
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
