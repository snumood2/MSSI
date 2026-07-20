# Google Sheets 연동 설정

이 프로젝트는 설문 제출 시 로그인 JWT를 확인하는 Supabase Edge Function `submit-survey`가 점수를 계산하고 Google Apps Script Web App으로 payload를 전송합니다. 브라우저에는 Google 웹훅 secret을 두지 않습니다. Apps Script는 지정 스프레드시트의 `RAWDATA` 탭을 `response_id` 기준으로 갱신하고, Google Sheets 수식이 `RAWDATA -> DB2SHEET -> SHEET2REPORT -> 검사결과지` 순서로 결과지를 출력합니다.

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
3. 웹훅 secret을 반드시 설정합니다.
   - Apps Script `프로젝트 설정 > 스크립트 속성`에 `MSSI_WEBHOOK_SECRET` 추가
   - Supabase Function secret에도 같은 값을 `MSSI_WEBHOOK_SECRET`으로 설정
   - 미설정 시 Apps Script는 모든 POST 요청을 거부합니다.
4. `배포 > 새 배포 > 웹 앱`을 선택합니다.
5. 실행 권한은 본인, 접근 권한은 웹앱 호출 환경에 맞게 설정합니다.
6. 발급된 Web App URL을 Supabase Function secret `MSSI_GOOGLE_WEBHOOK_URL`에 넣습니다.

## 환경변수와 서버 secret

로컬 정적 배포가 아니라 호스팅 환경에서 `window.__ENV__`를 주입하는 경우 아래 값을 넣습니다.

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
GOOGLE_SHEETS_WEBHOOK_URL=...
ADMIN_EMAIL=...
```

`GOOGLE_SHEETS_WEBHOOK_URL`은 운영 상태 확인 도구만 사용합니다. 설문 브라우저 코드는 이 URL로 직접 POST하지 않습니다. Supabase에는 아래 server secret을 설정합니다.

```text
MSSI_GOOGLE_WEBHOOK_URL=...
MSSI_WEBHOOK_SECRET=...
```

Apps Script는 `CONFIG.SPREADSHEET_ID`로 대상 스프레드시트를 열기 때문에 standalone 프로젝트에서도 동작합니다.

## 동작 확인

Apps Script Web App URL을 브라우저에서 GET으로 열면 아래와 비슷한 JSON이 반환되어야 합니다.

```json
{
  "status": "ok",
  "service": "mssi-sheet-sync"
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

`DB2SHEET`는 1행에 DB 변수명, 2행에 설문지 질문/점수 설명, 3행부터 데이터를 표시합니다. 사용자는 `검사결과지!H4`에 `patient_number`(의사에게 받은 번호), `검사결과지!J4`에 `hospital_code`(병원코드)를 직접 입력합니다. `SHEET2REPORT!A4`는 `검사결과지!H4`, `SHEET2REPORT!B4`는 `검사결과지!J4`를 참조하여 해당 조합의 결과를 계산합니다. 웹앱과 Google Sheet 양쪽에서 같은 `병원코드 + 의사에게 받은 번호` 조합으로 조회됩니다.

## 결과 조회 캐시와 미입력 처리

운영 시트는 숨김 탭 `_REPORT_CACHE`에서 `병원코드 + 의사에게 받은 번호`에 해당하는 최신 `DB2SHEET` 행을 한 번만 선택합니다. `SHEET2REPORT`의 척도별 수식은 이 캐시 행을 참조하며, 각 셀에서 `DB2SHEET` 전체를 다시 `FILTER`하지 않습니다. `검사결과지`의 조회 수식도 `SHEET2REPORT!1:120` 범위만 검색합니다.

미입력과 실제 0점은 반드시 구분합니다.

- 필요한 원문항이 비어 있으면 점수, 판정, 환자비교백분위, 정상군비교백분위를 모두 빈칸으로 둡니다.
- 응답을 계산한 실제 결과가 0이면 숫자 `0`을 유지합니다.
- 백분위 및 판정 수식은 원점수 셀이 빈칸일 때 계산하지 않습니다.
- 빈칸에는 별도의 조건부 서식 색상을 적용하지 않습니다.

운영 수식을 변경할 때는 `_REPORT_CACHE`를 삭제하거나 표시 탭으로 전환하지 말고, 빈 조회, 실제 0점, 완전 응답 사례를 모두 확인합니다.
