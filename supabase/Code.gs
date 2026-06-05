// MSSI Webhook - Google Apps Script
// 배포: Supabase Script Editor에 붙여넣기 → 배포 → 웹 앱 URL 복사

// ========== 설정 ==========
// Script Properties에서 WEBHOOK_SECRET 설정 (선택)
// 스크립트 편집기 → 프로젝트 설정 → 스크립트 속성 → 추가
const CONFIG = {
  TOKEN: PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET') || ''
};

function doPost(e) {
  try {
    // === 토큰 검증 (선택) ===
    const token = (e.parameter && e.parameter.token) || '';
    if (CONFIG.TOKEN && token !== CONFIG.TOKEN) {
      return ContentService
        .createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid token' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const params = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    let rawSheet = ss.getSheetByName('RAW_DATA');
    if (!rawSheet) {
      rawSheet = ss.insertSheet('RAW_DATA');

      const headers = buildHeaders(params);
      rawSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      rawSheet.setFrozenRows(1);
    }

    const newRow = buildRow(params, rawSheet);
    rawSheet.appendRow(newRow);

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', row: rawSheet.getLastRow() }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function buildHeaders(params) {
  const fixed = ['timestamp', 'patient_id', 'dob', 'hospital_code', 'patient_number', 'doctor_nickname', 'hospital_nickname'];
  const qIds = Object.keys(params.answers || {}).sort();
  return [...fixed, ...qIds];
}

function buildRow(params, sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = [];

  for (let h of headers) {
    switch (h) {
      case 'timestamp':
        row.push(params.timestamp || new Date().toISOString());
        break;
      case 'patient_id':
        row.push(params.patientId || '');
        break;
      case 'dob':
        row.push(params.dob || '');
        break;
      case 'hospital_code':
        row.push(params.hospitalCode || '');
        break;
      case 'patient_number':
        row.push(params.patientNumber || '');
        break;
      case 'doctor_nickname':
        row.push(params.doctorNickname || '');
        break;
      case 'hospital_nickname':
        row.push(params.hospitalNickname || '');
        break;
      default:
        row.push(params.answers && params.answers[h] !== undefined ? params.answers[h] : '');
    }
  }

  return row;
}

function doOptions(e) {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}
