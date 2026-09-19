# 환자용 생활습관 · MSSI 경과

`patient.html`은 기존 `config.js`, Supabase 계정, `auth-session.js`를 그대로 사용한다. 홈페이지의 기존 `ls.html`, `mssi.html` 주소는 로그인과 세션이 있는 이 저장소로 이동한다. `next`는 history/lifestyle/mssi 세 값만 허용한다.

## 보안과 저장

- Google API는 매 요청의 토큰을 Supabase `/auth/v1/user`로 검증하고, 해당 UID의 보호된 profiles를 다시 읽는다. 클라이언트가 환자번호·UID·병원을 지정하는 요청은 거부한다.
- 대상 병원은 SNUBH01이며, 제출 전 기존 `patient_can_use_hospital` 규칙을 확인한다.
- 기록은 기존 Google 시트의 `로그인설문` 탭에 UID와 함께 저장한다. 환자에게는 그 UID의 기록만 반환한다. 서비스 키는 브라우저나 Apps Script에 포함하지 않는다.
- 환자의 과거 비로그인 기록을 번호만으로 자동 연결하지 않는다. 검증된 연결 절차가 없는 기록은 의료진 화면에서만 기존 방식으로 조회한다.
- 점수는 서버가 문항으로 재계산하며, 저장 후 readback 확인과 request ID 기반 재시도 중복 방지를 적용한다.
- Apps Script는 USER_DEPLOYING으로 실행하지만 API는 모든 읽기·쓰기 요청에서 Supabase 인증·권한을 확인한다. 익명 GET에는 상태 정보만 있다.
- 기존 의료진 앱은 계속 Google Sheet USER_ACCESSING + 읽기 전용 권한으로 동작하며 로그인설문 탭을 함께 읽는다.
- 실제 응답이나 토큰을 로그·URL·브라우저 저장소에 추가하지 않는다. 기존 Supabase 세션 저장만 사용한다.

Google API 프로젝트: `1gHqeFjFfKcy8fZXlKvisvRq92vTB_ZfNBrAIHGULSGUVgkcxs_GNvEgR`.
Google Sheet: `1w6lMOTlXJQgF8qkc98j0MfzzCpNIGFnwFDHJhvwtGp4`.

## 재빌드

이 폴더에서 `npm ci` 후 `npm run build`를 실행한다. 웹 산출물은 저장소 루트의 patient 파일들로, 서버 산출물은 제외된 `.google-build/`로 생성된다. 서버 업데이트는 위 Apps Script 프로젝트의 기존 배포를 갱신하여 API URL을 유지한다. `.google-build`를 웹에 배포하지 않는다. 기존 환자 계정·보안 SQL·임상평가 설문 엔진은 변경하지 않는다.

가상 미리보기 소스는 `patient-app/preview.tsx`이며 실제 빌드 진입점에서 제외한다. 운영 페이지에 가상 환자 기록이 표시되지 않는다.

2026-09-19 검증: 서버 인증·UID 분리·주입 차단·잘못된 응답·중복 제출·원문항 점수 테스트, 실제 가상 계정 2개/설문 4건의 저장·본인 조회·교차 조회 차단, 모바일 390px 가로 넘침 없음, 두 설문의 필수 응답 및 상세 기록 동작을 확인했다.
