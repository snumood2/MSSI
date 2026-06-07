# Google Sheets 연동 설정

이 프로젝트는 설문 제출 시 브라우저에서 Google Apps Script Web App으로 payload를 전송하고, Apps Script가 지정 스프레드시트의 `RAWDATA` 탭에 한 행을 추가합니다. 이후 Google Sheets 수식이 `RAWDATA -> DB2SHEET -> SHEET2REPORT -> 검사결과지` 순서로 데이터를 정리하고 결과지를 출력합니다.

## 대상 스프레드시트

- Spreadsheet ID: `1mHaUquO0qdv7bpj9T7LIPVfyUsUlX87uyHiAS_dyG78`
- `RAWDATA` gid: `1056247064`
- `DB2SHEET` gid: `8856437`
- `SHEET2REPORT` gid: `1977304621`
- `결과계산(2)` gid: `1563113795`
- `검사결과지` gid: `1440639532`

## Apps Script 배포

1. Apps Script 프로젝트를 엽니다. 대상 Google Sheet의 `확장 프로그램 > Apps Script`에서 열어도 되고, 새 standalone Apps Script 프로젝트를 만들어도 됩니다.
2. [`Code.gs`](./Code.gs)의 전체 내용을 Apps Script 편집기에 붙여넣습니다.
3. 선택 사항으로 웹훅 secret을 설정합니다.
   - Apps Script `프로젝트 설정 > 스크립트 속성`에 `MSSI_WEBHOOK_SECRET` 추가
   - 웹앱에도 같은 값을 `VITE_WEBHOOK_SECRET` 환경변수로 설정
4. `배포 > 새 배포 > 웹 앱`을 선택합니다.
5. 실행 권한은 본인, 접근 권한은 웹앱 호출 환경에 맞게 설정합니다.
6. 발급된 Web App URL을 웹앱 환경변수 `GOOGLE_SHEETS_WEBHOOK_URL`에 넣습니다.

## 웹앱 환경변수

로컬 정적 배포가 아니라 호스팅 환경에서 `window.__ENV__`를 주입하는 경우 아래 값을 넣습니다.

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
GOOGLE_SHEETS_WEBHOOK_URL=...
VITE_WEBHOOK_SECRET=...   # 선택 사항
ADMIN_EMAIL=...
```

현재 [`config.js`](../config.js)는 환경변수가 없으면 저장소의 기본 Supabase URL, anon key, Apps Script URL을 사용합니다. Apps Script는 `CONFIG.SPREADSHEET_ID`로 대상 스프레드시트를 열기 때문에 standalone 프로젝트에서도 동작합니다.

## 동작 확인

Apps Script Web App URL을 브라우저에서 GET으로 열면 아래와 비슷한 JSON이 반환되어야 합니다.

```json
{
  "status": "ok",
  "mode": "raw_dynamic_full_payload",
  "rawSheet": { "gid": 1056247064 },
  "db2Sheet": { "gid": 8856437 },
  "sheet2Report": { "gid": 1977304621 },
  "reportSheet": { "gid": 1440639532 }
}
```

설문 제출 후 `RAWDATA` 탭에는 동적 헤더 구조로 한 행이 추가됩니다. 고정 컬럼 뒤에 설문 응답 변수와 계산 점수가 변수명 기준으로 이어집니다.

- A열: `timestamp`
- B열: `patient_id`
- C열: `hospital_code`
- D열: `patient_number`
- E열: `dob`
- F열: `sex`
- G열 이후: `response_id`, `doctor_nickname`, `hospital_nickname`, `scores_json`, `report_json`
- 이후 컬럼: `z1`, `t1`, `au1`, `csm1`, `spaq2_0` 같은 설문 응답 변수와 `score_ZUNG`, `score_TEMPS_cyc`, `score_PMS_diag` 같은 계산 점수

`DB2SHEET`는 1행에 DB 변수명, 2행에 설문지 질문/점수 설명, 3행부터 데이터를 표시합니다. 사용자는 `검사결과지!H4`에 `hospital_code`, `검사결과지!J4`에 `patient_number`를 직접 입력합니다. `SHEET2REPORT!A4`는 `검사결과지!J4`, `SHEET2REPORT!B4`는 `검사결과지!H4`를 참조하여 해당 조합의 결과를 계산합니다. 웹앱과 Google Sheet 양쪽에서 같은 `병원코드 + 의사에게 받은 번호` 조합으로 조회됩니다.
