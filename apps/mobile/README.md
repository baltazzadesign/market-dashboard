# 발타툴 모바일

Expo SDK 57 / React Native 0.86.3 / React 19.2.3 / 앱 1.0.2. Node.js 22.13.0 이상이 필요합니다.

1.0.2는 로그인·설정·공통 UI에서 빈 안내 문자열이 View의 자식으로 렌더링되던 오류를 수정했습니다. SDK 57 의존성은 그대로이므로 1.0.1에서 업데이트할 때는 파일 교체 후 재시작만 하면 됩니다.

프로젝트 최상위의 `START_HERE.md`에 설치·실행·API 계약·검증 범위를 정리했습니다. 아래 명령은 이 `apps/mobile` 폴더에서 실행합니다. Windows PowerShell에서는 `npm` 대신 `npm.cmd`를 사용합니다.

```sh
npm ci
npm run integrate:parent
npm start -- --clear
```

폴더 구조:

- `App.tsx`, `index.ts`: 앱 진입점과 오류 경계
- `src/navigation.tsx`: 하단 탭과 상세 화면
- `src/screens/`: 요청한 7개 화면, 로그인
- `src/components/`: 공통 UI와 SVG 터치 차트
- `src/data/client.ts`: 기존 로그인/조회 API 클라이언트
- `src/data/model.ts`: 실제 응답 검증·정규화·결측/세션 처리
- `src/data/demo.ts`: 명시적으로 선택하는 예시 모드
- `src/state/AppProvider.tsx`: 인증, 기기 저장, 설정, 공통 조회 캐시
- `assets/icon.png`: 사용자 원본 아이콘
- `scripts/`: 상위 프로젝트 검사 분리, 실제 API 확인
- `tests/`: 데이터/인증/프로젝트 적용 계약 테스트

개발 문서:

- Expo SDK: https://docs.expo.dev/versions/v57.0.0/
- 환경변수: https://docs.expo.dev/guides/environment-variables/
- SecureStore: https://docs.expo.dev/versions/v57.0.0/sdk/securestore/
- 네이티브 빌드: https://docs.expo.dev/build/setup/

앱에 서버 비밀키를 추가하지 마세요. KIS와 Supabase의 서버 처리는 기존 Next.js 프로젝트에 유지됩니다.
