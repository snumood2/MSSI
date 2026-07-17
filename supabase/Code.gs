const CONFIG = {
  SPREADSHEET_ID: '1mHaUquO0qdv7bpj9T7LIPVfyUsUlX87uyHiAS_dyG78',
  RAW_DATA_GID: 1056247064,
  DB2SHEET_GID: 8856437,
  SHEET2REPORT_GID: 1977304621,
  REPORT_GID: 1440639532,
  RAW_FALLBACK_NAME: 'RAWDATA',
  WEBHOOK_SECRET_PROPERTY: 'MSSI_WEBHOOK_SECRET',
  MAX_PAYLOAD_CHARS: 1000000,
  MAX_FLATTENED_FIELDS: 2500
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

    validatePayload_(params);
    const record = buildRecord_(params);
    const headers = ensureHeaders_(rawSheet, record);
    const appendedRow = upsertSheetRow_(rawSheet, headers, record);
    const db2SheetRow = db2Sheet ? syncDb2SheetRow_(db2Sheet, record) : null;
    SpreadsheetApp.flush();

    return json_({
      status: 'ok',
      mode: 'raw_dynamic_materialized_db2sheet',
      row: appendedRow,
      db2SheetRow: db2SheetRow,
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
  return json_({
    status: 'ok',
    service: 'mssi-sheet-sync'
  });
}

function doOptions() {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function repairDb2SheetSchema_(sheet) {
  if (!sheet) throw new Error('DB2SHEET was not found.');
  const width = Math.max(sheet.getLastColumn(), 1);
  const rows = sheet.getRange(1, 1, 2, width).getValues();
  const headers = rows[0].map(String);
  const questions = rows[1].map(String);

  headers.forEach((header, index) => {
    if (header === 'f3_4') headers[index] = 'f3';
  });

  // Each SPAQ row has 12 months plus "no difference". Preserve the physical
  // column order and normalize old one-based or partially shifted headers.
  for (let row = 0; row < 10; row++) {
    const indices = [];
    headers.forEach((header, index) => {
      if (new RegExp('^spaq1_r' + row + '_m\\d+$').test(header)) indices.push(index);
    });
    indices.slice(0, 13).forEach((index, month) => {
      headers[index] = 'spaq1_r' + row + '_m' + month;
    });
  }

  const additions = {
    f4: '6. 사회공포증 선별 / SOC3. 이런 사회적 상황이 두려워서 피하거나 그렇지 못할 경우 그 상황 때문에 고통스럽습니까?',
    pms_applicability: 'PMS 문항 적용 구분 (초경 이후 폐경 전 여성 / 초경 전 또는 폐경 후 여성 / 남성)',
    assessment_no: '검사회차',
    assessment_key: '환자번호-회차',
    migration_batch_id: '과거자료 이관 배치',
    migration_status: '과거자료 이관 상태',
    legacy_birth_year: '과거자료 출생연도',
    legacy_complete_scales_json: '결측 없이 이관된 척도 목록',
    legacy_source_rows_json: '원본 시트와 행 추적정보'
  };
  Object.keys(additions).forEach((header) => {
    if (headers.indexOf(header) === -1) {
      headers.push(header);
      questions.push(additions[header]);
    }
  });
  if (headers.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  sheet.getRange(1, 1, 2, headers.length).setValues([headers, questions]);
  SpreadsheetApp.flush();
  return headers;
}

function syncDb2SheetRow_(sheet, record) {
  let headers = repairDb2SheetSchema_(sheet);
  const questions = sheet.getRange(2, 1, 1, headers.length).getValues()[0];
  const seen = {};
  headers.forEach((header) => { if (header) seen[header] = true; });
  Object.keys(record).forEach((header) => {
    if (!seen[header]) {
      headers.push(header);
      questions.push(header);
      seen[header] = true;
    }
  });
  if (headers.length > sheet.getMaxColumns()) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  sheet.getRange(1, 1, 2, headers.length).setValues([headers, questions]);
  const responseIdColumn = headers.indexOf('response_id') + 1;
  const existingRow = responseIdColumn > 0 ? findDataRowByValue_(sheet, responseIdColumn, record.response_id, 3) : null;
  const targetRow = existingRow || Math.max(sheet.getLastRow() + 1, 3);
  if (targetRow > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());
  }
  const values = headers.map((header) => safeCellValue_(Object.prototype.hasOwnProperty.call(record, header) ? record[header] : ''));
  sheet.getRange(targetRow, 1, 1, values.length).setValues([values]);
  return targetRow;
}

function parsePayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('POST body is empty.');
  }
  if (e.postData.contents.length > CONFIG.MAX_PAYLOAD_CHARS) {
    throw new Error('POST body is too large.');
  }
  return JSON.parse(e.postData.contents);
}

function verifySecret_(params) {
  const expected = PropertiesService.getScriptProperties().getProperty(CONFIG.WEBHOOK_SECRET_PROPERTY);
  if (!expected) {
    throw new Error('Webhook secret is not configured.');
  }
  if (!constantTimeEqual_(String(params.secret || ''), String(expected))) {
    throw new Error('Invalid webhook secret.');
  }
}

function validatePayload_(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Invalid payload.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(params.responseId || ''))) {
    throw new Error('Invalid response id.');
  }
  if (!/^[0-9a-f-]{36}$/i.test(String(params.patientId || ''))) throw new Error('Invalid patient id.');
  if (!/^[A-Z0-9_-]{2,20}$/.test(String(params.hospitalCode || ''))) throw new Error('Invalid hospital code.');
  if (!/^[0-9]{8}$/.test(String(params.patientNumber || ''))) throw new Error('Invalid patient number.');
  if (params.dob && !/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(String(params.dob))) throw new Error('Invalid birth month.');
  if (!params.answers || typeof params.answers !== 'object' || Array.isArray(params.answers)) throw new Error('Invalid answers.');
  const count = countFields_(params.answers) + countFields_(params.scores || {});
  if (count > CONFIG.MAX_FLATTENED_FIELDS) throw new Error('Too many response fields.');
}

function constantTimeEqual_(a, b) {
  const left = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, a, Utilities.Charset.UTF_8);
  const right = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, b, Utilities.Charset.UTF_8);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i % left.length] ^ right[i % right.length]);
  return diff === 0;
}

function countFields_(source) {
  let count = 0;
  Object.keys(source || {}).forEach((key) => {
    if (!/^[A-Za-z0-9_:-]{1,100}$/.test(key)) throw new Error('Invalid response field.');
    const value = source[key];
    count += value && typeof value === 'object' && !Array.isArray(value) ? countFields_(value) : 1;
  });
  return count;
}

function buildRecord_(params) {
  const record = {
    timestamp: params.timestamp || new Date().toISOString(),
    patient_id: params.patientId || '',
    hospital_code: params.hospitalCode || '',
    patient_number: params.patientNumber || '',
    assessment_no: params.assessmentNo || '',
    assessment_key: params.assessmentKey || '',
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

function upsertSheetRow_(sheet, headers, record) {
  const responseIdColumn = headers.indexOf('response_id') + 1;
  const existingRow = responseIdColumn > 0 ? findDataRowByValue_(sheet, responseIdColumn, record.response_id, 2) : null;
  const targetRow = existingRow || Math.max(sheet.getLastRow() + 1, 2);
  const values = headers.map((header) => safeCellValue_(Object.prototype.hasOwnProperty.call(record, header) ? record[header] : ''));
  sheet.getRange(targetRow, 1, 1, values.length).setValues([values]);
  return targetRow;
}

function findDataRowByValue_(sheet, column, value, startRow) {
  if (!value || sheet.getLastRow() < startRow) return null;
  const range = sheet.getRange(startRow, column, sheet.getLastRow() - startRow + 1, 1);
  const match = range.createTextFinder(String(value)).matchEntireCell(true).findNext();
  return match ? match.getRow() : null;
}

function safeCellValue_(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@]/.test(value)) return "'" + value;
  return value;
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

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
