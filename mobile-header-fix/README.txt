모바일 상단 잘림 수정

압축 안 mobile-header-fix 폴더를 기존 D:\market-dashboard 안에 넣으세요.
VS Code의 기존 CMD 터미널에서 한 줄씩 실행하세요.

xcopy "mobile-header-fix\components\*" "components\" /E /I /Y
xcopy "mobile-header-fix\app\*" "app\" /E /I /Y
npm run build

빌드 오류가 없으면:

git add components/dashboard/Workspace.tsx app/globals.css
git commit -m "fix mobile dashboard header layout"
git push

이 패치는 아래 두 파일만 업데이트합니다.
components/dashboard/Workspace.tsx
app/globals.css

수동 적용 시에도 위 경로 그대로 덮어쓰세요.
기존 BaltaJungyongHeaderLink.tsx는 계속 필요하며 수정하지 않습니다.
파일을 다른 위치에 낱개로 복사하지 마세요.
원본 두 파일은 덮어쓰기 전 별도 위치에 복사해 두면 되돌릴 수 있습니다.

화면 구성
- 스마트폰: 첫 줄 로고 / 장 상태, 둘째 줄 발타경 / 발타 중용 / 설정
- 메뉴와 설정 버튼은 최소 높이 44px로 누르기 쉽게 구성
- 긴 장 상태는 숨기지 않고 줄바꿈
- 900px 이하 좁은 화면에서도 상단 두 줄 적용
- 넓은 PC 화면은 기존 한 줄 배치 유지
- 다른 페이지의 topbar에 영향이 없도록 dashboard-topbar에만 적용

검증: TSX 구문 검사 및 상단 외 코드가 그대로 유지되는지 확인했습니다.
프로젝트 전체 소스가 없으므로 전체 빌드와 실제 기기 화면은 검증하지 않았습니다.
