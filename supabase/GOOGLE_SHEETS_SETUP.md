# Google Sheets 연동 설정

이 프로젝트는 설문 제출 시 브라우저에서 Google Apps Script Web App으로 payload를 전송하고, Apps Script가 지정 스프레드시트의 원자료 탭에 한 행을 추가합니다. 계산 탭과 검사지 출력 탭은 기존 스프레드시트 수식/참조가 갱신되도록 직접 덮어쓰지 않습니다.

## 대상 스프레드시트

- Spreadsheet ID: `1mHaUquO0qdv7bpj9T7LIPVfyUsUlX87uyHiAS_dyG78`
- 원자료 탭 gid: `1056247064`
- 결과계산 탭 gid: `1563113795`
- 검사지 출력 탭 gid: `1440639532`

## Apps Script 배포

1. 대상 Google Sheet에서 `확장 프로그램 > Apps Script`를 엽니다.
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

현재 [`config.js`](../config.js)는 환경변수가 없으면 저장소의 기본 Supabase URL, anon key, Apps Script URL을 사용합니다.

## 동작 확인

Apps Script Web App URL을 브라우저에서 GET으로 열면 아래와 비슷한 JSON이 반환되어야 합니다.

```json
{
  "status": "ok",
  "rawSheet": { "gid": 1056247064 },
  "calcSheet": { "gid": 1563113795 },
  "reportSheet": { "gid": 1440639532 }
}
```

설문 제출 후 원자료 탭에 `timestamp`, `response_id`, 환자 메타데이터, `scores_json`, `report_json`, 각 문항 응답이 한 행으로 추가되면 연동이 성공한 것입니다.
