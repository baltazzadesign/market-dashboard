# 발타툴 V8 · 승인 시안 기준 UI 패치

## 기준
- 사용자가 승인한 검정/금색 동양풍 대시보드 시안
- 사용자가 제공한 `발바닥 타짜` 원본 심볼/워드마크를 웹 에셋으로 가공해 사용
- 기존 Next.js / Supabase / KIS / cron / 저장 데이터 구조 유지

## 주요 변경
1. 좌측 상단/상단 고정 로고를 실제 발바닥 타짜 이미지 기반 가로형 로고로 교체
2. 사용자 원본 이미지에서 추출한 달/구름/산/붓터치 아트로 Hero/카드 배경 구성
3. 메인 대시보드 레이아웃을 승인 시안 비율로 재조정
4. 메인 차트 기본값을 KOSPI로 변경, KOSPI/KOSDAQ 빠른 전환 제공
5. 우측 투자주체 누적 수급 차트 유지
6. 상위 등락 종목 패널 추가(KIS 등락률 순위 API 활용)
7. `/flow` 시장 수급 전용 페이지 신규 추가
   - 투자주체별 누적 수급
   - 최근 5분 순매수 속도
   - 외인+기관 수급 압력(저장 수급 변화 기반, 체결강도로 오인하지 않도록 명시)
   - 시간대별 수급 비교
   - 외국인 vs 기관 스프레드
   - 합산 수급 0선 전환 시점
   - 오늘의 핵심 신호
8. 발타경 / 발타 중용 / 책임면책 고지 유지

## 덮어쓸 파일
- `app/globals.css`
- `app/api/market/breadth-test/route.ts`
- `components/dashboard/Icon.tsx`
- `components/dashboard/Workspace.tsx`

## 새 파일
- `app/flow/page.tsx`
- `components/dashboard/MarketFlowWorkspace.tsx`
- `components/dashboard/MarketMovers.tsx`
- `public/assets/balta-emblem.webp`
- `public/assets/balta-logo-horizontal.webp`
- `public/assets/balta-logo-poster.webp`
- `public/assets/balta-hero-art.webp`
- `public/assets/balta-landscape.webp`
- `public/assets/balta-ornament.webp`

## 적용
프로젝트 루트에 이 압축파일 내부 구조 그대로 덮어씁니다.

```bash
npm run typecheck
npm run build
npm run dev
```

메인: `http://localhost:3000`
시장 수급: `http://localhost:3000/flow`

## 검증 메모
- 수정 TS/TSX 파일은 TypeScript transpile syntax 검사 통과
- `globals.css` 중괄호 균형 검사 통과
- 이 작업 환경에는 프로젝트 전체 `node_modules`가 없어 실제 Next 전체 빌드는 여기서 완료하지 못했음
- 선물 카드 값은 검증되지 않은 KIS 선물 endpoint를 임의로 만들지 않고 현재 실제 수집값인 시장폭으로 유지함
