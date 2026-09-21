발타툴 GOLD UI V4 FINAL POLISH

적용 기준
- V3 패치가 적용된 현재 발타툴 프로젝트에 덮어쓰기
- 데이터/KIS/Supabase/cron/차트 계산 로직 변경 없음
- 시각 UI와 반응형 레이아웃만 조정

수정 파일
1) app/globals.css
2) components/dashboard/Workspace.tsx

주요 변경
- 좌측 로고 존재감 소폭 강화(중복 로고 없음)
- 발타경/발타 중용 아래 BALTA PRINCIPLE 미니 아카이브 카드 추가
- Hero 달/산수화/붓터치가 중앙까지 자연스럽게 이어지도록 조정
- 지수 카드 높이/하단 텍스트 정렬 보정
- 발타의 서재 및 면책고지 하단 마감 정리
- 620px 이하 모바일 레이아웃/터치영역/safe-area/하단 5메뉴 보강
- 작은 모바일 화면에서 발타의 서재 카드와 면책고지 압축 표시

적용 후
npm run typecheck
npm run build
npm run dev

확인 권장 화면
- PC 1440px 이상
- 브라우저 개발자도구 390x844 또는 실제 모바일
