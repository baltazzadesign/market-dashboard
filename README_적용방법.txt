발타툴 Gold UI 패치
====================

목표
- 검정 + 금색 동양풍 UI로 웹 대시보드 리뉴얼
- 상단/사이드 브랜드를 깔끔한 발바닥 심볼 + "발타툴" 워드마크로 통일
- 발타경 / 발타 중용 접근성 유지 및 사이드바 "BALTA ARCHIVE" 추가
- 모바일 620px 이하 반응형 대응
- 대시보드 하단 투자 책임·면책 고지 카드 추가
- /disclaimer 전체 고지 페이지 추가
- 기존 시장 데이터/API/차트 계산 로직은 변경하지 않음

적용
1. 현재 프로젝트를 백업 또는 git commit 합니다.
2. 이 ZIP의 app / components / public 폴더를 발타툴 프로젝트 최상위 폴더에 덮어씁니다.
3. VS Code 터미널에서 아래 순서로 확인합니다.

npm run typecheck
npm run build
npm run dev

4. 브라우저에서 확인할 화면
- /
- /daily
- /history
- /research
- /replay
- /baltagyeong.html
- /balta-jungyong
- /disclaimer

중요
- .env.local, Supabase, KIS API, cron, DB 스키마는 건드리지 않습니다.
- 새 의존성도 추가하지 않았습니다.
- 업로드받은 파일만으로 전체 프로젝트의 lib 폴더와 node_modules가 없어 여기서는 전체 Next.js build를 실행할 수 없었습니다.
- 대신 수정한 TSX 파일들은 TypeScript transpile 기반 문법 검사를 통과했습니다.
