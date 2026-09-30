# 발타툴 현재 접속자 수

상단 오른쪽에 `● 접속 12` 형태로 표시합니다. 숫자는 예시이며 실제 수집값을 표시합니다. 표시를 누르면 집계 기준이 열립니다.

## 적용 순서

1. 제공된 `online-presence.sql` 파일 전체를 복사합니다.
2. **발타툴에서 사용하는 Supabase 프로젝트 → SQL Editor → New query**에 붙여넣고 **Run**을 누릅니다. 테이블과 함수가 한 번에 생성됩니다. 다시 실행해도 기존 접속 행을 삭제하지 않습니다.
3. `app(2).zip`, `components(2).zip`, `lib(2).zip`을 모두 풉니다. 각 ZIP의 **내용물**을 프로젝트의 `app`, `components`, `lib` 폴더 안에 각각 병합하여 덮어씁니다. 폴더 자체를 삭제하거나 `app/app`처럼 중첩시키지 않습니다.
4. 프로젝트 최상위 `package.json`이 있는 폴더에서 실행합니다.

```bash
npm run build
```

빌드가 성공하면 배포합니다.

```bash
git add app components lib
git commit -m "Add online presence counter"
git push
```

이전 세부 투자자 수급, 시장폭 점수와 가속도 0선 개선도 이번 ZIP에 포함됩니다. 새 npm 패키지나 환경변수는 필요하지 않습니다. 기존 서버용 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, 기존 로그인 방식을 사용합니다.

SQL은 테스트용 PostgreSQL 환경에서 실행·검증했습니다. 운영 Supabase에는 직접 실행하지 않았으며, 사이트 배포도 하지 않았습니다. 위 SQL 실행과 배포를 마쳐야 운영 화면에서 집계됩니다.

## 집계 기준

- **로그인 후 대시보드 화면을 보고 있는 브라우저**를 기준으로 합니다. 본인도 포함됩니다.
- 최근 **90초** 안에 접속 확인을 보낸 브라우저 수를 집계하며, 화면은 **30초 주기**로 갱신합니다. 초 단위로 즉시 반영되는 인원수는 아닙니다.
- 같은 브라우저의 여러 탭은 공통 쿠키로 하나의 행을 사용합니다. Web Locks와 탭 간 통신을 사용할 수 있으면 요청과 최신 숫자도 공유합니다.
- 다른 브라우저·PC·휴대폰·시크릿 창은 별도로 집계됩니다. 개인별 로그인 계정 수나 누적 방문자 수가 아닙니다.
- 화면이 숨겨져 있으면 접속 확인 요청을 멈추고 다시 보이면 재개합니다. 네트워크 단절이나 창 닫기는 마지막 확인 후 90초가 지나면 집계에서 제외되며, 보는 쪽 화면은 다음 갱신 때 반영됩니다.
- 한 탭을 닫았다고 브라우저 전체를 즉시 삭제하지 않으므로, 다른 탭을 보고 있는 사람을 잘못 제외하지 않습니다.
- 로그인 화면과 상단 헤더가 없는 발타 중용 페이지는 집계 요청을 보내지 않습니다.
- 집계 중이거나 조회가 실패하면 회색 점과 `—`가 표시됩니다. 실패를 0으로 바꾸거나 임의의 숫자를 만들지 않습니다.

## 데이터와 비용

새 테이블 `public.baltatool_presence`는 임의의 브라우저 UUID와 최근 접속 확인 시각 두 필드만 보관합니다. 이 기능은 이름, IP, 방문 URL을 테이블에 저장하지 않습니다.

데이터는 Supabase에서 합산하므로 여러 Vercel 인스턴스에서도 같은 집계 원본을 사용합니다. 만료 행은 다음 접속 확인 때 삭제됩니다. 별도 cron이나 상시 실행 PC가 필요하지 않습니다.

활성 브라우저마다 보통 분당 약 2회의 `/api/presence` 및 DB 함수 요청이 추가됩니다. 여러 탭은 가능한 경우 요청을 공유하고, DB도 20초 이내 같은 브라우저의 중복 갱신은 건너뜁니다. KIS API 호출은 추가되지 않습니다.

로그인과 요청 출처를 서버에서 확인합니다. 식별 쿠키는 서명하고 HttpOnly로 발급합니다. 브라우저에 Supabase 서비스 역할 키를 보내지 않으며, DB 테이블·함수는 서비스 역할만 사용하도록 권한을 설정했습니다.

## 배포 후 확인

1. 로그인한 상태에서 상단의 접속 숫자를 확인합니다.
2. 같은 브라우저에서 다른 탭을 열어도 한 브라우저로 유지됩니다.
3. 다른 브라우저나 휴대폰으로 로그인한 뒤 기존 화면의 다음 갱신에서 증가하는지 확인합니다.
4. 다른 브라우저를 닫고 약 90초와 다음 갱신 주기가 지난 뒤 감소하는지 확인합니다.

계속 `—`라면 개발자 도구 Network의 `/api/presence` 응답을 확인합니다.

| 응답 | 확인할 내용 |
| --- | --- |
| `PRESENCE_SETUP_REQUIRED` | 같은 Supabase 프로젝트에 SQL을 실행했는지 확인 |
| `PRESENCE_NOT_CONFIGURED` | 기존 서버용 Supabase 환경변수 설정 확인 |
| `PRESENCE_UNAVAILABLE` | DB 연결·권한·일시적인 요청 오류 확인 |
| `UNAUTHORIZED` | 다시 로그인 |
| `FORBIDDEN` | 정상 사이트 주소에서 접속했는지 확인 |

## 변경 파일과 검증

- `app/api/presence/route.ts` 신규
- `lib/online-presence.ts` 신규
- `components/dashboard/OnlinePresence.tsx` 신규
- `components/dashboard/OnlinePresence.module.css` 신규
- `components/dashboard/useOnlinePresence.ts` 신규
- `components/dashboard/TerminalHeader.tsx` 수정
- `online-presence.sql` 신규 DB 설정

TypeScript 및 Next.js 프로덕션 빌드를 통과했습니다. API 테스트 4개와 PGlite(PostgreSQL)의 실제 SQL 실행 테스트를 통과했습니다. SQL 재실행, 동일 브라우저 중복, 만료, 익명/일반 사용자 권한 차단을 검증했습니다. 브라우저에서는 동시 탭 요청 공유, 별도 브라우저, 30초 갱신, 숨김/복귀, 오류/복구, 로그인 화면 제외, 320–1660px 배치를 확인했습니다.

참고한 공식 문서:
- Supabase Database Functions: https://supabase.com/docs/guides/database/functions
- Web Locks API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- Page Visibility API: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
