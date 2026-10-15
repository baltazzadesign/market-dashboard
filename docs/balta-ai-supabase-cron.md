# BALTA AI Supabase 기본 예약 실행 (2026-10-15)

## 작동 상태
이 문서는 기존 GitHub Actions의 예약 지연(2026-10-15 예정 07:37 KST → 실제 09:45 KST)을 줄이기 위한 독립적인 서버측 실행기를 설명합니다. GitHub Actions는 예비 연구 워커로 유지하며, 시장 데이터 수집용 기존 `/api/cron`과 Vercel `vercel.json`은 변경하지 않습니다.

**Supabase pg_cron이 직접 수행하는 것은 FLOW_V1 및 FLOW_ACCEL_V1의 아침 0~10개 후보 선정, immutable INSERT, 사후 조회 확인입니다.** 가격 수집과 0·1·3·5거래일 수익률 평가는 KIS 자격 증명을 보유한 기존 GitHub Actions `scripts/balta-ai-research.ts --phase=close`가 수행합니다. Supabase는 20:15 KST에 마감 평가 로그 누락을 감시합니다. 이 DB 실행기가 자동으로 ChatGPT 메시지를 전송하거나 PDF를 생성하지는 않습니다.

## 현재 Supabase Cron (프로젝트 기준 cron.timezone=GMT)
| 이름 | UTC cron | KST | 작업 |
|---|---|---|---|
| balta-ai-core-primary-0802-kst | `2 23 * * 0-4` | 평일 08:02 | 필수 두 전략 계산·저장 |
| balta-ai-core-retry-0832-kst | `32 23 * * 0-4` | 평일 08:32 | 동일 작업 멱등 재실행 |
| balta-ai-core-final-0850-kst | `50 23 * * 0-4` | 평일 08:50 | 오전 마지막 재시도 |
| balta-ai-core-audit-0855-kst | `55 23 * * 0-4` | 평일 08:55 | 별도 트랜잭션에서 저장 확인·미완료 기록 |
| balta-ai-close-audit-2015-kst | `15 11 * * 1-5` | 평일 20:15 | KIS 마감 워커 로그 존재 여부 확인 |

시각이 UTC와 KST로 하루 다를 수 있습니다. KST는 연중 UTC+9이며 서머타임이 없습니다. `pg_cron` 자체가 사용할 프로젝트 설정값을 변경하면 예약식을 재검토해야 합니다.

## 실패 처리 및 데이터 계약
- Supabase 내부 `balta_internal.run_morning_core()`만 신호를 저장하며 직접 HTTP 호출이나 실거래 주문을 하지 않습니다.
- `balta_internal.previous_verified_session()`과 **2026년 검증용 휴장일 표**를 사용합니다. **2027년 및 이후에는 거래소 캘린더가 추가로 검증될 때까지 자동으로 건너뜁니다.**
- 두 연속 거래일의 `investor_flow_history`와 그 수집 시각을 검사합니다. 100개 미만 종목, 소스 날짜 불일치, 미래 관측, 외인/기관/연기금 필수 수치 결측은 보수적으로 처리합니다.
- 수급 배열은 v1 순서 `[pension, foreign, institution, ...]`을 사용합니다. 2026-10-15 기준 자료의 2026-10-14/13일 수급에 대한 읽기 전용 계산 결과가 원래 엔진의 370개 동반매수·202개 가속과 일치했습니다.
- 기존 신호는 `ON CONFLICT DO NOTHING`으로 변경하지 않습니다. 원본 후보/근거 및 소스일은 `balta_ai_signals`에 함께 저장합니다.
- 새로운 INSERT 후 즉시 DB 확인하고, 08:55에 **별도 트랜잭션으로 한 번 더 확인**합니다. `balta_ai_run_log.details.storageVerification`에서 `ok` 상태를 확인할 수 있습니다.
- 미저장 또는 오류는 `incomplete`로 기록하고, 데이터가 없는데 성공하거나 0% 수익이라고 표시하지 않습니다.
- 09:00 KST 이후는 어떤 경로에서도 그날 신규 사전 후보를 생성하지 않습니다. 연휴·주말은 건너뜁니다.
- 핵심 두 전략 외 `FLOW_PERSIST_V1`, `FLOW_LIQUID_V1`, `FLOW_CASH_V1`은 기존 GitHub 워커가 수행하는 추가 연구로 구분합니다. Supabase 오전 저장이 이들 실험의 성공을 보증하지 않습니다.

## 운영 점검 SQL (읽기 전용)
```sql
select jobname,schedule,active from cron.job where jobname like 'balta-ai-%' order by jobname;
select j.jobname,d.start_time,d.status,d.return_message
from cron.job_run_details d join cron.job j on j.jobid=d.jobid
where j.jobname like 'balta-ai-%'
order by d.start_time desc limit 15;
select trade_date,phase,result,executed_at,details->'storageVerification' as storage_audit
from public.balta_ai_run_log order by executed_at desc limit 5;
select trade_date,strategy,source_date,generated_at,jsonb_array_length(picks) as picks
from public.balta_ai_signals order by trade_date desc,strategy limit 15;
```

Vercel 및 GitHub 저장소 Secrets는 Supabase SQL 안에 복사하지 않았습니다. 실제 첫 08:02 실행과 첫 마감 평가는 다음 증시 거래일에 확인해야 합니다. 이 자동 연구는 주문·매매 실행 및 AI 모델 자동 재학습을 하지 않습니다.
