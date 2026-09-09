# 시장 복기 · 공유 메모

캘린더 날짜 상세 → 복기 · 메모 또는 대시보드 왼쪽 시장 복기에서 엽니다.
재생 1/5/20배속, 일시정지, 처음으로, 분 단위 이동, 지표 선택, 차트 확대를 지원합니다. 1배속은 1초당 시장시간 1분입니다. 현재 재생 시각까지의 기록만 차트와 신호 계산에 전달합니다. 누락된 분에는 마지막 관측 시각과 누락 문구가 표시됩니다.

메모는 Supabase에 저장됩니다. 현재 프로젝트에는 개인 사용자 ID가 없으므로 공용 로그인 사용자가 함께 보는 공유 메모입니다. 메모와 쉼표 구분 태그를 저장할 수 있습니다. 태그 검색은 포함하지 않습니다. 날짜 이동 전에 저장하세요. 동시 수정 충돌은 저장을 중단하고 입력 내용은 유지합니다.

## 1. DB 추가
Supabase 프로젝트의 SQL Editor에서 동봉한 supabase/migrations/002_market_notes.sql 내용을 실행하세요. 기존 시장 데이터는 변경하지 않고 메모 테이블을 추가합니다. RLS를 활성화하고 익명/일반 클라이언트 권한을 차단하며 인증된 서버 API만 서비스 키로 접근합니다.

## 2. 파일 적용
ZIP 안 market-dashboard 폴더 내용을 D:\market-dashboard에 덮어씁니다. 이전 동시간대 비교 업데이트가 적용된 프로젝트 기준입니다.

```bat
npm run build
git add app/replay app/api/market/notes components/dashboard/ReplayWorkspace.tsx components/dashboard/Workspace.tsx components/dashboard/HistoryWorkspace.tsx supabase/migrations/002_market_notes.sql REPLAY_UPDATE.md
git commit -m "Add market replay and shared notes"
git push origin main
```

Vercel 배포 완료 후 복기 페이지에서 날짜를 선택하고 메모 저장 → 새로고침으로 저장을 확인하세요. 별도 크론/환경변수 변경은 없습니다.

검증: Next 프로덕션 빌드 및 TypeScript 검사. 운영 Supabase에 SQL 실행, 실제 메모 저장과 브라우저 시각 검증은 여기서 수행하지 않았습니다.
