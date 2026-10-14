# BALTA RESEARCH | 자동 일간 투자자 수급 PDF (운영 가이드)

## 목적 / 현 상태
- 독립 사이트 메뉴 `/balta-research`: 승인된 **당일 수급 + 지수·시장폭 + 종목 주가·거래량** 리서치 보관소.
- 전용 `/balta-research/admin`: 별도 운영자 발행 키를 입력해 초안 열람·PDF 검토·수동 승인.
- 기존 AI 종목 연구소, 4개 수급전략, 시장 브리핑·투자자매매순위 저장을 전혀 변경하지 않는다.
- 기본 동작은 **19:10 및 21:20 KST 월~금 초안 생성 재시도**, 휴장일 건너뜀, **자동 공개 금지**.
- OpenAI 키가 없거나 수집 불충분, PDF 오류이면 보고서가 없고 `balta_research_runs`에 상태만 기록한다.

## 처음 필요한 운영 설정
1. GitHub repository → Settings → Secrets and variables → Actions → Secrets에 `OPENAI_API_KEY` 추가. API 사용량/과금은 ChatGPT 구독과 별개이다.
2. Vercel Project → Settings → Environment Variables에 **20자 이상의 별도 랜덤 문자열** `BALTA_RESEARCH_ADMIN_KEY` 등록(Production 환경). 기존 발타툴 접근코드를 운영자 발행 키로 재사용하지 않는다. 승인은 별도 키 입력 후 진행한다.
3. 네 기존 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KIS_APPKEY`, `KIS_APPSECRET`는 GitHub Actions에서 재사용한다. 키는 브라우저·PDF·DB 분석 내용에 들어가지 않는다.
4. 선택: Actions repository variable `OPENAI_RESEARCH_MODEL` (기본 `gpt-5-mini`), `MARKET_HOLIDAYS`.
5. Supabase migration `20261014_balta_research_publications.sql` 적용, RLS/private Storage 확인. 이 작업은 코드 반영 전에 수행한다.

## 수집과 검증
- 종목별 순위: `investor_rankings`, `date=거래일`, `snapshot.groups[investor:all]`. 필수 외국인·기관 90% 이상 수집, 11개 주체.
- 출처: `market_daily`, **15:30 정규장** 관측, KOSPI·KOSDAQ 및 상승·하락 종목 수 LIVE.
- `investor_flow_history`: 과거 최근 5개 실제 수급일; 해당 데이터가 부족하거나 금액 null이면 보충하지 않는다. 지속기간은 랭킹 스냅샷의 `days`, `exact` 속성으로만 해석한다.
- 가격·거래량·거래대금: KIS `inquire-daily-itemchartprice` 조회, 관심종목 상위 **최대 9개만**. 당일 종가 존재하고 5개 종목 이상 완성해야 분석한다. 과거 20일 평균 거래량 비율은 적어도 15개 관측치가 필요하다.
- 순매수의 기관 전체와 하위 주체는 중복 합산하지 않는다; 미확인 113개 같은 자료는 총계에서 제외, 0원으로 간주하지 않는다. KRX vs NXT 구분과 잠정치/수정 가능성 고지.
- **수치·계산은 TypeScript 결정론적**, OpenAI 모델에 전달되는 JSON은 최대 9개 관심 종목과 11개 주체의 집계만 포함. GPT는 수치 없는 서술, 다음 관찰 조건만 엄격한 JSON schema로 반환하며, 숫자·계산값·없는 코드·목표가·매매 명령이 있으면 전체 초안 실패.
- PDF는 Python ReportLab, OS `fonts-nanum`으로 한국어 출력. 템플릿은 16:9 다크 차콜/샴페인 골드 11페이지. 페이지당 주제(표지/범위/수급/기관/시장/종목/개별 해석/리스크/다음 지표/출처). 실제 확정된 가격·거래량만 표시.
- 분석 결과는 `balta_research_reports`에 `draft`로 저장, 파일은 **비공개 Supabase Storage** `balta-research/YYYY-MM-DD/daily-v1.pdf`. 승인되면 `published`로 변경하며 재작성/덮어쓰기 하지 않는다.

## 운영 특성
- GH Actions 예약은 **best effort**라 지연될 수 있다. 최초 초안이 생기면 두 번째 재시도는 API 호출을 하지 않는다.
- 한국시간 19:00 이전에는 생성하지 않는다. 19:10/21:20 이외 수집 지연이면 초안이 생성되지 않으며 수집 완료 이후 수동 workflow dispatch로 재실행할 수 있다. 다만 현재 워커는 KST **당일자**만 생성하므로 다음날 수동 백필은 별도 구현이 필요.
- 생성 단계별 상태: `needs_key`, `incomplete`, `failed`, `draft_ready`, `published`. 공개 페이지는 성공적으로 승인된 리포트만 보여준다.
- 동일 `trade_date` 기본키로 기존 보고서 중복 생성 방지. 최초 PDF 업로드 성공/DB 저장 실패 때는 업로드가 재시도될 수 있고 승인 전 데이터만 저장한다.
- 운영자 키는 별도 승인 헤더로 서버에 전송하며 브라우저 저장소(localStorage)에 보존하지 않는다. 발행 후 PDF는 사이트 접근코드를 가진 사용자만 프록시를 통해 읽는다.
- 이 버전에는 계좌 실매매·주문·실제 수익률 예측/거래비용 추정·기업 밸류에이션·전종목 일봉 수집·완전자동 공개가 없다.
- 자동 게시 전환은 수집 완전성, 수치 교차 대조, PDF 렌더링, 모델 오류 빈도, API 비용의 실운영 검증 후 별도 요청/설정으로 진행한다.
