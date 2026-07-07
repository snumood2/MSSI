const CONFIG = {
  SPREADSHEET_ID: '1mHaUquO0qdv7bpj9T7LIPVfyUsUlX87uyHiAS_dyG78',
  RAW_DATA_GID: 1056247064,
  DB2SHEET_GID: 8856437,
  SHEET2REPORT_GID: 1977304621,
  REPORT_GID: 1440639532,
  RAW_FALLBACK_NAME: 'RAWDATA',
  WEBHOOK_SECRET_PROPERTY: 'MSSI_WEBHOOK_SECRET'
};

const FIXED_HEADERS = [
  'timestamp',
  'patient_id',
  'hospital_code',
  'patient_number',
  'dob',
  'sex',
  'response_id',
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
    const db2Sheet = getSheetByGid_(ss, CONFIG.DB2SHEET_GID);
    const sheet2Report = getSheetByGid_(ss, CONFIG.SHEET2REPORT_GID);
    const reportSheet = getSheetByGid_(ss, CONFIG.REPORT_GID);

    const record = buildRecord_(params);
    const headers = ensureHeaders_(rawSheet, record);
    rawSheet.appendRow(headers.map((header) => Object.prototype.hasOwnProperty.call(record, header) ? record[header] : ''));

    const appendedRow = rawSheet.getLastRow();
    SpreadsheetApp.flush();

    return json_({
      status: 'ok',
      mode: 'raw_dynamic_full_payload',
      row: appendedRow,
      rawSheet: rawSheet.getName(),
      db2Sheet: db2Sheet ? db2Sheet.getName() : null,
      sheet2Report: sheet2Report ? sheet2Report.getName() : null,
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
    mode: 'raw_dynamic_full_payload',
    rawSheet: sheetInfo_(getSheetByGid_(ss, CONFIG.RAW_DATA_GID)),
    db2Sheet: sheetInfo_(getSheetByGid_(ss, CONFIG.DB2SHEET_GID)),
    sheet2Report: sheetInfo_(getSheetByGid_(ss, CONFIG.SHEET2REPORT_GID)),
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
  if (!expected) {
    return;
  }
  if (params.secret !== expected) {
    throw new Error('Invalid webhook secret.');
  }
}

function buildRecord_(params) {
  const record = {
    timestamp: params.timestamp || new Date().toISOString(),
    patient_id: params.patientId || '',
    hospital_code: params.hospitalCode || '',
    patient_number: params.patientNumber || '',
    dob: params.dob ? "'" + String(params.dob) : '',
    sex: params.sex || params.gender || '',
    response_id: params.responseId || '',
    doctor_nickname: params.doctorNickname || '',
    hospital_nickname: params.hospitalNickname || '',
    scores_json: params.scoresJson || JSON.stringify(params.scores || {}),
    report_json: params.reportJson || JSON.stringify(params.report || {})
  };

  flattenObject_(record, '', params.answers || {});
  flattenObject_(record, 'score_', params.scores || {});

  return record;
}

function flattenObject_(record, prefix, source) {
  Object.keys(source || {}).forEach((key) => {
    const value = source[key];
    const header = prefix + key;
    if (value === null || value === undefined) {
      record[header] = '';
    } else if (Array.isArray(value)) {
      record[header] = JSON.stringify(value);
    } else if (typeof value === 'object') {
      flattenObject_(record, header + '_', value);
    } else {
      record[header] = value;
    }
  });
}

function ensureHeaders_(sheet, record) {
  const required = Object.keys(record);
  const lastColumn = Math.max(sheet.getLastColumn(), FIXED_HEADERS.length, 1);

  if (sheet.getLastRow() === 0) {
    const headers = unique_(FIXED_HEADERS.concat(required.filter((header) => FIXED_HEADERS.indexOf(header) === -1)));
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return headers;
  }

  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String);
  for (let i = 0; i < FIXED_HEADERS.length; i++) {
    headers[i] = FIXED_HEADERS[i];
  }

  const seen = {};
  headers.forEach((header) => {
    if (header) seen[header] = true;
  });

  const additions = required.filter((header) => !seen[header]);
  const nextHeaders = headers.concat(additions);
  sheet.getRange(1, 1, 1, nextHeaders.length).setValues([nextHeaders]);
  sheet.setFrozenRows(1);
  return nextHeaders;
}

function unique_(values) {
  const seen = {};
  const out = [];
  values.forEach((value) => {
    if (value && !seen[value]) {
      seen[value] = true;
      out.push(value);
    }
  });
  return out;
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
