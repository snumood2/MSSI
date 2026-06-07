const CONFIG = {
  SPREADSHEET_ID: '1mHaUquO0qdv7bpj9T7LIPVfyUsUlX87uyHiAS_dyG78',
  RAW_DATA_GID: 1056247064,
  CALC_GID: 1563113795,
  REPORT_GID: 1440639532,
  RAW_FALLBACK_NAME: 'RAW_DATA',
  WEBHOOK_SECRET_PROPERTY: 'MSSI_WEBHOOK_SECRET'
};

const FIXED_HEADERS = [
  'timestamp',
  'response_id',
  'patient_id',
  'dob',
  'hospital_code',
  'patient_number',
  'doctor_nickname',
  'hospital_nickname',
  'scores_json',
  'report_json'
];

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

    const headers = ensureHeaders_(rawSheet, params);
    const rowValues = buildRow_(params, headers);
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

function ensureHeaders_(sheet, params) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(FIXED_HEADERS);
    sheet.setFrozenRows(1);
  }

  let lastColumn = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  const required = buildHeaders_(params);
  const seen = {};

  headers.forEach((header) => {
    if (header) seen[header] = true;
  });

  const additions = required.filter((header) => !seen[header]);
  if (additions.length) {
    sheet.getRange(1, headers.length + 1, 1, additions.length).setValues([additions]);
    headers = headers.concat(additions);
    sheet.setFrozenRows(1);
  }

  return headers;
}

function buildHeaders_(params) {
  const answers = params.answers || {};
  const answerHeaders = Object.keys(answers).sort(naturalSort_);
  return FIXED_HEADERS.concat(answerHeaders);
}

function buildRow_(params, headers) {
  const answers = params.answers || {};
  const scoresJson = params.scoresJson || JSON.stringify(params.scores || {});
  const reportJson = params.reportJson || JSON.stringify(params.report || {});

  return headers.map((header) => {
    switch (header) {
      case 'timestamp':
        return params.timestamp || new Date().toISOString();
      case 'response_id':
        return params.responseId || '';
      case 'patient_id':
        return params.patientId || '';
      case 'dob':
        return params.dob || '';
      case 'hospital_code':
        return params.hospitalCode || '';
      case 'patient_number':
        return params.patientNumber || '';
      case 'doctor_nickname':
        return params.doctorNickname || '';
      case 'hospital_nickname':
        return params.hospitalNickname || '';
      case 'scores_json':
        return scoresJson;
      case 'report_json':
        return reportJson;
      default:
        return Object.prototype.hasOwnProperty.call(answers, header) ? answers[header] : '';
    }
  });
}

function naturalSort_(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
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
