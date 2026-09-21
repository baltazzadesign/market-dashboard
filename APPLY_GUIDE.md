# 발타툴 웹·모바일 시안 적용 수정본

보내주신 프로젝트를 기준으로 만든 **덮어쓰기용 수정 패키지**입니다. 전체 프로젝트를 새로 만드는 ZIP이 아닙니다. 소스 수정·추가 47개 파일, 재제작 이미지, 글꼴, 검증 화면을 포함합니다.

## 적용 방법

1. 기존 프로젝트를 커밋하거나 복사해 보관합니다.
2. ZIP을 풀고 `baltatool-reference-update` 안의 `app`, `components`, `lib`, `public`, `apps`, `tests`, `package.json`, `package-lock.json`을 기존 프로젝트의 같은 위치에 **병합·덮어쓰기**합니다. 기존 폴더를 통째로 삭제하지 마세요.
3. 프로젝트 최상위 터미널에서 실행합니다.

```bash
npm install
npm run test:terminal
npm run build
npm run dev
```

`package.json`에 공식 종목 목록 ZIP을 읽는 `fflate`가 추가되어 있으므로 `npm install`을 실행해야 합니다. 기존 `.env.local`과 Vercel 환경변수는 그대로 사용합니다.

웹만 먼저 적용해도 됩니다. 앱 수정은 `apps/mobile` 안에 들어 있습니다. 앱을 실행하려면 기존 모바일 프로젝트에서 다음 명령을 사용하세요. 모바일 프로젝트의 기존 Node 요구 사항은 22.13 이상입니다.

```bash
cd apps/mobile
npm install
npx expo start --go --clear
```

검토 후 기존 Git/Vercel 배포 절차로 반영하세요. 이번 작업에서 운영 사이트 배포, DB 쓰기, 실제 주문은 실행하지 않았습니다.

## 적용 내용

- 검정·금색 헤더, 왕관 로고, 달·산수화 배경, 지수 카드, 금색 Market Pulse 게이지.
- PC의 2열 차트·3열 정보 카드, 휴대폰의 지수 → Pulse → 차트 → 바로가기 → 뉴스 배치.
- 휴대폰 상단 가로 메뉴와 전체 메뉴, 종목 검색, 밝기 전환, 책임면책 고지의 오늘 숨기기.
- Market Pulse와 시장폭의 독립 화면 및 정상 경로 연결.
- `시장리서치` 안에서 섹터 지도와 종목 스캐너를 구분. 기존 날짜 비교·오전/오후·메모 검색·기간 성과 유지.
- 전체 KOSPI·KOSDAQ 종목명/코드 검색, 상승률·하락률·거래대금·거래량 순위. 종목 상세는 네이버 증권으로 연결.
- 지수 1D 관측 캔들, 기간별 일봉/주봉, 라인 전환, 차트 확대·전체보기.
- 원/달러, 국고채, WTI·금 선물, 최근월 선물 조회와 한국경제 증권 뉴스 제목/원문 연결.
- 날짜별 공유 메모 작성·태그·저장. 기존 버전 충돌 처리를 사용하고 미저장 내용 이동을 보호.
- Expo 앱의 로고·테마·홈·메뉴를 함께 수정하고 스캐너·메모·차트 화면 추가. 기존 발바닥 앱 아이콘 유지.
- 수급 색상: 외국인 파랑 / 기관 빨강 / 개인 노랑.

## 데이터 동작과 확인 범위

| 항목 | 처리 |
| --- | --- |
| 기존 수집 | `live`, `refresh`, `after-market`, cron, Vercel 스케줄 원본 유지 |
| 기존 DB | 테이블/SQL 변경 없음. 기존 날짜별 메모 테이블 사용 |
| 신규 시세 | 기존 KIS 키와 Supabase `kis_tokens`의 토큰 재사용. 새 토큰 발급·주문 없음 |
| 기본 선물 | 공식 예제의 전광판 시장 분류 `MKI` 사용. 제공된 계약 중 잔존 일수가 가장 짧은 계약의 실제 이름 표시 |
| 원유·금 | KIS 공식 해외선물 종목 목록에서 거래 중심 월물/근월물을 선택. 현물 가격과 구분해 선물로 표기 |
| 전체 종목 검색 | KIS 공식 KOSPI·KOSDAQ 종목 마스터. 검색 결과 최대 30건 |
| 1D 캔들 | 저장 지수 표본을 5분으로 묶은 관측 OHLC. 거래소 전체 체결의 정식 분봉과 다를 수 있으며 없는 거래량은 그리지 않음 |
| 기간 차트 | KIS가 실제 제공하는 일봉/주봉 범위. 데이터가 없는 기간을 생성하지 않음 |
| 앱 Pulse | 웹과 같은 Market Pulse 2.0 계산 및 시장별 섹터 시각 사용. 앱 기존 예시 점수는 미리보기로 명시 |
| 누락/실패 | `—`, 조회 대기 또는 재시도 안내. 운영 화면에 예시 시세를 대입하지 않음 |

로컬에서 완료한 검사:

- Next.js 배포 빌드와 웹·앱 TypeScript 검사 통과.
- 신규 데이터 계약 테스트 8개 통과 (`npm run test:terminal`).
- 제공된 모바일 기존 테스트 14개 통과 (`apps/mobile`에서 `npm test`).
- Expo iOS·Android·웹 JavaScript 번들 생성 통과. 검증 환경에서는 `--no-bytecode`로 실행했으며 스토어 설치 패키지를 만든 것은 아닙니다.
- 실제 브라우저에서 1440 / 1024 / 390 / 360px 화면, 가로 넘침, 로고, Pulse 메뉴, 동일 페이지 종목 재검색, 차트 확대, 기간 전환, 밝기, 메모 PUT, 모바일 메뉴, 책임면책 숨기기 확인.
- Expo 웹 미리보기에서 홈·Pulse·스캐너·더보기 이동 확인.

**운영 KIS/Supabase 인증정보가 제공되지 않아 실제 계정 응답·운영 서버 연결과 iPhone/Android 실기기 동작은 검증하지 않았습니다.** 적용 후 로그인해서 시세·순위·뉴스를 확인하세요. 해외선물 데이터는 계정의 제공 범위에 따라 조회되지 않을 수 있습니다. 제공되지 않은 기존 웹 `tests` 파일의 전체 회귀 테스트는 실행하지 못했으며, 포함된 신규 테스트와 모바일 테스트를 실행했습니다.

첨부 화면은 API 응답을 가로챈 **화면 검증용 예시 데이터** 또는 앱의 기존 미리보기입니다. 실제 시세·뉴스 캡처가 아닙니다. 예시 응답은 운영 코드에 들어 있지 않습니다.

## 이미지·글꼴

시안의 원본 레이어가 아닌 첨부 화면을 참고해 이미지 생성 도구로 재제작했습니다. 구도·색상·용도는 시안에 맞췄으며 원본과 픽셀 단위로 동일한 이미지는 아닙니다.

| 파일 | 크기 | 용도 |
| --- | --- | --- |
| `public/assets/balta-landscape-v2.webp` | 2172×724 | 웹 배너·바로가기 카드 |
| `public/assets/balta-logo-v2.webp` | 1000×305 | 웹 왕관·발타툴 로고 |
| `apps/mobile/assets/balta-landscape-v2.webp` | 1200×400 | 앱 더보기 배너 |
| `apps/mobile/assets/balta-logo-v2.png` | 800×244 | 앱 헤더 로고 |

제작 지시 요약: 깊은 검정 바탕, 금박 느낌의 달·한국식 구름·산 능선·소나무, 왼쪽 문구 여백, 오른쪽 산수 구도, 배경 이미지에는 UI/문구를 넣지 않음. 로고는 금색 왕관과 `발타툴`, 작은 `BALTATOOL` 표기 및 검정 바탕. 생성 후 용도에 맞게 여백과 해상도·WebP 압축을 정리했습니다.

웹 문구는 이미지에 굽지 않고 HTML로 표시합니다. Pretendard와 기존 프로젝트의 명조 글꼴을 로컬 파일로 포함했으며 라이선스는 `public/assets/PRETENDARD-LICENSE.txt`, `OFL.txt`에 있습니다.

## 참고한 공식 자료

- [KIS API 종합 안내](https://apiportal.koreainvestment.com/apiservice-summary)
- [KIS 공식 API 예제](https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm)
- [KIS 공식 종목 마스터 형식](https://github.com/koreainvestment/open-trading-api/tree/main/stocks_info)
- [한국경제 RSS 안내](https://www.hankyung.com/feed)

`CHANGED_FILES.txt`에 덮어쓰는 파일 목록이 있습니다. `previews`는 검증 화면입니다. 이전 `public` 폴더의 발타경 HTML 등 이번에 제공되지 않은 파일은 기존 것을 유지하세요.
