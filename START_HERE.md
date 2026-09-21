# 발타툴 모바일 앱

Expo + React Native + TypeScript로 만든 iOS/Android 앱입니다. **이번 파일은 Expo SDK 57 / 화면 오류 수정본(앱 1.0.2)**입니다. `apps/mobile` 폴더가 앱 프로젝트입니다.

## 이미 SDK 57을 적용했다면

`Unexpected text node: . A text node cannot be a child of a <View>` 오류를 수정했습니다. 로그인·설정 화면에서 안내 메시지가 비어 있을 때 빈 문자열이 화면에 전달되지 않도록 변경했습니다.

1. 실행 중인 **Expo 터미널**에서 `Ctrl+C`를 누릅니다.
2. 이 압축의 `apps` 폴더를 `D:\market-dashboard`에 복사해 같은 파일을 덮어씁니다. 최종 경로는 `D:\market-dashboard\apps\mobile`입니다.
3. 아래 명령으로 다시 실행합니다. 기존 SDK 57 설치에서 패키지 버전이 바뀌지 않았으므로 `npm ci`를 다시 실행할 필요는 없습니다.

```powershell
npm.cmd --prefix "D:\market-dashboard\apps\mobile" start -- --clear
```

PC 브라우저는 UI 미리보기입니다. **예시 데이터로 둘러보기**로 화면을 확인하고, 실제 서버 로그인은 iPhone 카메라로 새 QR 코드를 열어 Expo Go에서 진행합니다.

기존 SDK 54 앱을 설치했다면 실행 중인 Expo 터미널에서 `Ctrl+C`를 누른 뒤, 이 파일의 `apps/mobile`을 기존 `D:\market-dashboard\apps\mobile`에 덮어쓰세요. `package.json`과 `package-lock.json`도 함께 교체해야 합니다. 그다음 아래 명령으로 다시 설치하고 실행합니다.

## 기존 발타툴 프로젝트에 넣기

1. 이 압축을 풀고 **apps 폴더**를 기존 발타툴 프로젝트 최상위(`package.json`이 있는 곳)에 복사합니다. 기존 `apps`가 있으면 그 안에 `mobile`만 추가합니다.
2. Windows의 VS Code 터미널에서 아래를 실행합니다. 현재 프로젝트 위치인 `D:\market-dashboard` 기준입니다. 다른 위치라면 아래 경로를 바꾸세요. 전체 경로를 사용하므로 현재 터미널이 루트든 모바일 폴더든 동일하게 동작합니다.

```powershell
npm.cmd --prefix "D:\market-dashboard\apps\mobile" ci
npm.cmd --prefix "D:\market-dashboard\apps\mobile" run integrate:parent
npm.cmd --prefix "D:\market-dashboard\apps\mobile" start -- --clear
```

PowerShell에서 `npm.ps1` 실행 정책 오류가 나지 않도록 `npm.cmd`를 사용합니다. `integrate:parent`는 모바일 패키지의 명령입니다. 루트에서 경로 지정 없이 실행하면 `Missing script` 오류가 납니다.

macOS/Linux는 프로젝트 최상위에서 다음을 실행합니다.

```sh
cd apps/mobile
npm ci
npm run integrate:parent
npm start -- --clear
```

`integrate:parent`는 상위 프로젝트가 Next.js인지 확인하고, 기존 `tsconfig.json`의 `exclude`에 `apps/mobile`만 추가합니다. 원본은 `apps/mobile/.integration/`에 보관합니다. 이미 추가되어 있으면 바꾸지 않습니다. 상위 프로젝트가 없으면 독립 실행 안내만 출력합니다.

루트 `package.json`, React/Next.js 버전, KIS, Supabase, API, cron, Vercel 설정은 변경하지 않습니다. 루트에 새 workspace 설정을 추가할 필요도 없습니다. 모바일의 의존성과 잠금 파일은 `apps/mobile` 안에서 관리합니다.

상위 ESLint가 프로젝트 전체를 검사한다면, 기존 ESLint 설정의 전역 `ignores` 목록에도 `apps/mobile/**`를 추가하세요. 최신 ESLint 설정 파일은 공유 자료에서 확인되지 않아 자동으로 수정하지 않습니다.

## 휴대폰에서 실행

- Node.js **22.13.0 이상**이 필요합니다. Node.js 24 LTS를 권장합니다. `node -v`로 확인합니다.
- 휴대폰에 **SDK 57을 지원하는 Expo Go**를 설치합니다. PC가 랜선이어도 됩니다. PC의 랜선과 휴대폰의 Wi-Fi가 같은 공유기의 내부 네트워크에 연결되어 있어야 합니다.
- 위 실행 명령으로 뜬 QR 코드를 Android는 Expo Go에서, iPhone은 카메라에서 엽니다.
- 앱에서 **기존 발타툴 웹 접근 코드**를 입력합니다. 코드가 앱에 들어 있지는 않습니다.
- 기본 서버는 `https://www.baltatool.com`입니다. 실제 서버가 다른 최종 주소를 쓴다면 로그인 화면의 **서버 주소 변경**에서 바꿉니다.
- 연결 전 UI를 보고 싶으면 **예시 데이터로 둘러보기**를 누릅니다. 실제 데이터처럼 자동으로 섞이는 동작은 없습니다.

이 앱은 **Expo SDK 57 / React Native 0.86.3 / React 19.2.3** 조합입니다. Expo Go에서 SDK 57과 SDK 54가 맞지 않는다고 표시되었던 문제를 해결하도록 관련 의존성과 잠금 파일을 함께 갱신했습니다. 실행 명령은 Expo Go 모드를 명시합니다.

교체 후에도 SDK 54라고 표시되면 이전 Expo 서버를 종료하고, 모바일 파일을 덮어쓴 뒤 위 `ci`와 `start -- --clear`를 다시 실행해 **새 QR 코드**를 여세요. 다른 폴더에서 실행 중인 Expo 서버의 QR 코드를 열지 않았는지도 확인합니다. Expo Go가 앞으로 다른 SDK로 바뀌면 프로젝트 전체의 호환 버전 조정이나 별도 개발 빌드가 필요합니다.

공식 안내: https://expo.dev/changelog/sdk-57 · https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/

### 연결이 안 될 때

먼저 휴대폰 브라우저로 서버 주소가 열리는지 확인합니다. Expo QR 연결 문제라면 같은 공유기의 내부 네트워크인지, 게스트 Wi-Fi의 기기 간 통신 차단이나 Windows 방화벽이 Node.js를 막는지 확인합니다. LAN 연결을 쓸 수 없으면 위 `start -- --clear` 대신 `start -- --tunnel --clear`를 사용할 수 있습니다(추가 터널 패키지와 네트워크 접근 필요). 터널은 Expo 개발 서버 연결용이며 로컬 Next.js API까지 공개하지는 않습니다.

`localhost`는 휴대폰 자신을 가리킵니다. PC에서 실행 중인 Next.js에 연결하려면 PC의 LAN IP와 포트를 씁니다. 개발 모드에서만 `http://192.168.x.x:3000` 같은 사설 HTTP 주소를 허용하며, 운영 앱은 HTTPS 서버를 사용합니다. 실기기 OS 정책 때문에 HTTP가 차단되면 HTTPS 개발 서버를 사용하세요.

필요하다면 모바일 폴더에서만 다음을 실행해 기본 서버를 바꿀 수 있습니다.

```powershell
Copy-Item .env.example .env
```

`.env`에는 `EXPO_PUBLIC_API_BASE_URL`만 넣습니다. **기존 웹의 `.env.local`을 모바일로 복사하지 마세요.** KIS 키, Supabase service role, cron 비밀값, 접근 코드는 앱 환경변수에 넣지 않습니다. 앱에서 입력한 로그인 값은 기기의 SecureStore에 저장합니다.

## 구현한 화면

| 화면 | 기능 |
|---|---|
| Dashboard | KOSPI/KOSDAQ, 당일 저장 지수, 수급 요약, 시장폭, Pulse |
| 수급 | 외국인·기관·개인 합산 누적 순매수, 터치 조회, 확대 |
| 시장폭 | 상승/하락/보합, 상승 비율, 종목수 차이, 차트 |
| Market Pulse | 기존 −100~100 점수의 0~100 환산, 장중 추이, 산출 설명 |
| 캘린더 | 주말을 뺀 월간 달력, 서버 휴장일, 월 수익률, 날짜별 상세 그래프 |
| 섹터 | KOSPI/KOSDAQ 필터, 업종 등락률 히트맵, 순위, 상세 |
| 설정 | 서버 주소, 조회 주기, 기본 시장, 로그아웃 |

하단 메뉴는 홈·수급·시장폭·캘린더·더보기입니다. Pulse·섹터·설정은 더보기에 있고, 홈에서도 Pulse·섹터로 이동할 수 있습니다.

금색 발자국 트레이더 원본 이미지를 아이콘/스플래시/앱 브랜드 이미지로 포함했습니다. Expo Go의 홈 화면 아이콘은 Expo Go 아이콘이고, **별도 설치용 앱을 빌드해야 발타툴 이름과 아이콘으로 설치됩니다.**

## 기존 API와 연결하는 방식

| 호출 | 사용 목적 | 기존 동작 |
|---|---|---|
| `POST /api/auth/login` | 접근 코드 확인 | `{code}` → `{ok:true}`, `access` 쿠키 |
| `POST /api/auth/logout` | 로그아웃 | 서버 세션 쿠키 해제 |
| `GET /api/market/daily?date=YYYY-MM-DD` | 지수·수급·시장폭·Pulse | `rows`, `selectedDate` |
| `GET /api/market/history?month=YYYY-MM&months=3` | 캘린더·월간 요약 | `days`, `closedDates` |
| `GET /api/market/sectors?date=YYYY-MM-DD` | 섹터 | `snapshot.market_data.sectors` |

앱 → 기존 Next.js 조회 API → 기존 Supabase 저장 데이터 흐름입니다. KIS 수집과 저장은 기존 cron/worker가 맡습니다. `/api/market/live`, `/api/market/refresh`, `/api/cron`은 앱에서 호출하지 않습니다. 새 SQL과 DB 테이블은 없습니다.

수급/시장폭은 현재 API가 제공하는 **KOSPI+KOSDAQ 합산**으로 표시합니다. 지수 카드의 등락률은 **그날 첫 저장 기록 대비**이며 전일 종가 대비라고 표시하지 않습니다. 캘린더의 일간 등락률은 서버가 제공한 `changePct`입니다.

정규장과 애프터마켓을 섞지 않습니다. 이번 7개 화면은 정규장 기록을 표시하며, 응답에 장후 행이 있어도 분리합니다. 애프터마켓 전용 화면은 이번 패키지에 포함하지 않았습니다.

데이터가 없거나 API가 미배포(404)이면 안내를 표시합니다. `SKIPPED` 등 시장폭 결측은 0이나 중립 점수로 대체하지 않습니다. `FALLBACK`은 이전 값으로 명시하고 Pulse에서 제외합니다. 실패 후 같은 앱 세션에 남아 있는 정상 조회 결과는 마지막 기록으로 표시합니다. 앱 재시작 후 시세를 오프라인으로 저장·복원하는 기능은 포함하지 않습니다.

기본 갱신은 오늘 장중 기록 60초, 섹터 120초입니다. 공통 query key로 여러 화면의 중복 조회를 줄이고 백그라운드에서는 자동 갱신을 멈춥니다. 캘린더는 진입·직접 새로고침 때 조회합니다.

## 확인 범위와 남은 실기기 확인

현재 작업 환경에는 사용자의 PC/GitHub 최신 체크아웃이 직접 연결되어 있지 않습니다. 저장된 `market-dashboard-update.zip`의 프로젝트 구조·인증·조회 API, 이후 섹터/시장폭/장중 수정본을 읽고 모바일 계약을 맞췄습니다. **기존 저장소에 직접 커밋하거나 배포한 결과가 아닌 추가용 패키지**입니다.

검증 결과는 `apps/mobile/VALIDATION.md`에 기록했습니다. 작업 환경에서 운영 서버 요청은 시간 초과되어 **실서버 로그인과 실제 데이터 수신, iOS/Android 기기에서의 쿠키 전달은 아직 확인되지 않았습니다.** 기존 접근 코드로 로그인해 세 조회 API가 응답하는지 확인해야 합니다. 서버의 인증 계약이 이후 변경됐다면 `src/data/client.ts`의 로그인/인증 어댑터만 해당 계약에 맞춥니다.

로컬에서 실제 API 응답을 확인하려면:

```powershell
npm.cmd --prefix "D:\market-dashboard\apps\mobile" run check:api
```

현재 접근 코드를 화면에 표시하지 않고 입력받으며, 수집 API를 호출하지 않습니다. 날짜의 저장 기록이 비어 있는 성공 응답도 정상 연결로 봅니다.

## 추가 실행 명령

Windows에서 다음 명령은 모바일 폴더로 이동한 뒤 실행합니다.

```powershell
cd "D:\market-dashboard\apps\mobile"
npm.cmd run typecheck
npm.cmd test
npx.cmd expo install --check
npm.cmd run export:all
```

웹 화면 미리보기: `npm.cmd run web` → **예시 데이터로 둘러보기**. 기존 Next.js 서버는 같은 출처의 쿠키 인증을 사용하므로 이 별도 웹 미리보기의 실제 로그인은 제공하지 않습니다. iOS/Android가 실제 연결 대상입니다.

Android 에뮬레이터: Android Studio 기기를 실행한 뒤 `npm.cmd run android`.

iOS 시뮬레이터: macOS/Xcode에서 `npm run ios`. macOS/Linux에서는 `npm.cmd` 대신 `npm`을 사용합니다. Windows에서는 iPhone 실기기로 확인할 수 있습니다.

## 발타툴 아이콘으로 별도 설치하기

아래는 Expo 계정과 플랫폼 서명이 필요한 **다음 빌드 단계**입니다. 이 작업에서 원격 빌드·스토어 제출·배포는 실행하지 않았습니다.

```powershell
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest build:configure
npx.cmd eas-cli@latest build --platform android --profile preview
```

Android `preview` 프로필은 내부 설치용 APK입니다. iPhone 내부 설치는 Apple 계정과 기기 등록/서명 조건이 필요합니다. iOS 시뮬레이터용은 `--platform ios --profile simulator`, 스토어 준비용은 `--platform all --profile production`을 사용합니다. `com.baltatool.mobile`은 프로젝트에 설정한 식별자이므로 최초 플랫폼 등록 때 사용 가능 여부를 확인합니다.

원본 웹 프로젝트의 `npm run build`는 모바일 추가 후 별도로 실행해 현재 체크아웃 기준으로 확인하세요.
