import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  CURRENT_H0STCNT0_COLUMNS,
  buildProbeSnapshot,
  extractCcnlKrxColumnsFromPython,
  hasAfterMarketSchema,
  mapAfterMarketQuote,
  parseColumnsOverride,
  parseSymbolConfig,
} from './kis-after-market-lib.mjs';

const KIS_BASE = (process.env.KIS_BASE ?? 'https://openapi.koreainvestment.com:9443').replace(/\/$/, '');
const WS_URL = process.env.KIS_WS_URL ?? 'ws://ops.koreainvestment.com:21000/tryitout';
const OFFICIAL_SAMPLE_URL = process.env.KIS_H0STCNT0_SCHEMA_URL ??
  'https://raw.githubusercontent.com/koreainvestment/open-trading-api/main/examples_user/domestic_stock/domestic_stock_functions_ws.py';
const APPKEY = process.env.KIS_APPKEY;
const APPSECRET = process.env.KIS_APPSECRET;
const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '').replace(/\/rest\/v1$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PERSIST = process.env.KIS_AFTER_MARKET_PERSIST === '1';
const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_KEY);
const HEARTBEAT_MS = Math.max(15_000, Number(process.env.KIS_AFTER_MARKET_HEARTBEAT_MS ?? 30_000));

const CAPTURE = process.env.KIS_AFTER_MARKET_CAPTURE === '1';
const CAPTURE_DIR = path.resolve(process.env.KIS_AFTER_MARKET_CAPTURE_DIR ?? '.runtime/kis-after-market-probe');
const CAPTURE_START = process.env.KIS_AFTER_MARKET_CAPTURE_START ?? '15:55:00';
const CAPTURE_END = process.env.KIS_AFTER_MARKET_CAPTURE_END ?? '16:10:00';
const CAPTURE_MAX_SAMPLES = Math.max(100, Number(process.env.KIS_AFTER_MARKET_CAPTURE_MAX_SAMPLES ?? 5000));

if (!APPKEY || !APPSECRET) throw new Error('KIS_APPKEY / KIS_APPSECRET가 필요합니다.');
if (PERSIST && !HAS_SUPABASE) {
  throw new Error('KIS_AFTER_MARKET_PERSIST=1 사용 시 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
}

const symbols = parseSymbolConfig(process.env.KIS_AFTER_MARKET_SYMBOLS);
const symbolMarket = new Map(symbols.map((x) => [x.symbol, x.market]));
let websocketOpen = false;
let lastMessageAt = null;
let lastAfterMarketAt = null;
let lastError = null;
let columns = CURRENT_H0STCNT0_COLUMNS;
let captureCount = 0;
let captureFile = null;
const lastCapturedSecondBySymbol = new Map();

async function supabase(pathname, init = {}) {
  if (!HAS_SUPABASE) {
    throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  }

  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${text}`);
  }

  // return=minimal 등으로 성공 응답 본문이 비어 있을 수 있음
  if (!text.trim()) return null;

  return JSON.parse(text);
}

async function heartbeat() {
  if (!HAS_SUPABASE) return;
  const now = new Date().toISOString();
  const body = [{
    id: 'kis_after_market',
    connected: websocketOpen,
    schema_ready: hasAfterMarketSchema(columns),
    persistence_enabled: PERSIST,
    last_message_at: lastMessageAt,
    last_after_market_at: lastAfterMarketAt,
    last_error: lastError,
    symbols,
    updated_at: now,
  }];
  try {
    await supabase('/rest/v1/market_session_collector_health?on_conflict=id', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error('[heartbeat]', error);
  }
}

async function resolveColumns() {
  const override = parseColumnsOverride(process.env.KIS_H0STCNT0_COLUMNS);
  if (override) return override;

  try {
    const res = await fetch(OFFICIAL_SAMPLE_URL, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`schema fetch ${res.status}`);

    const source = await res.text();
    const discovered = extractCcnlKrxColumnsFromPython(source);

    // 공식 샘플이 MARKET_CLS_CODE까지 반영된 경우에만 우선 사용.
    if (discovered?.length && hasAfterMarketSchema(discovered)) {
      console.log(
        `[schema] official schema adopted: fields=${discovered.length}`
      );
      return discovered;
    }

    if (discovered?.length) {
      console.warn(
        `[schema] official sample is still ${discovered.length} fields without MARKET_CLS_CODE; ` +
        `using runtime-verified local ${CURRENT_H0STCNT0_COLUMNS.length}-field schema`
      );
    }
  } catch (error) {
    console.warn(
      '[schema] 공식 샘플 자동 확인 실패, runtime-verified 로컬 스키마 사용:',
      String(error)
    );
  }

  return CURRENT_H0STCNT0_COLUMNS;
}

async function getApprovalKey() {
  const res = await fetch(`${KIS_BASE}/oauth2/Approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: APPKEY, secretkey: APPSECRET }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.approval_key) throw new Error(`KIS approval_key 발급 실패 ${res.status}: ${JSON.stringify(data)}`);
  return data.approval_key;
}

async function saveQuote(row) {
  await supabase('/rest/v1/market_session_quotes?on_conflict=trade_date,market,symbol,venue,session,observed_at', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([row]),
  });
}

function subscribe(ws, approvalKey) {
  for (const { symbol } of symbols) {
    ws.send(JSON.stringify({
      header: { approval_key: approvalKey, custtype: 'P', tr_type: '1', 'content-type': 'utf-8' },
      body: { input: { tr_id: 'H0STCNT0', tr_key: symbol } },
    }));
  }
}

function kstTime(snapshot) {
  return String(snapshot?.receivedAtKst ?? '').slice(11, 19);
}

function kstDate(snapshot) {
  return String(snapshot?.receivedAtKst ?? '').slice(0, 10);
}

async function maybeCaptureFrame(raw) {
  if (!CAPTURE || captureCount >= CAPTURE_MAX_SAMPLES) return;
  const snapshot = buildProbeSnapshot(raw, columns, new Date());
  if (!snapshot) return;
  const time = kstTime(snapshot);
  if (!time || time < CAPTURE_START || time > CAPTURE_END) return;

  const secondKey = snapshot.receivedAtKst.slice(0, 19);
  if (lastCapturedSecondBySymbol.get(snapshot.symbol) === secondKey) return;
  lastCapturedSecondBySymbol.set(snapshot.symbol, secondKey);

  if (!captureFile) {
    await mkdir(CAPTURE_DIR, { recursive: true });
    captureFile = path.join(CAPTURE_DIR, `h0stcnt0-${kstDate(snapshot)}.jsonl`);
    console.log(`[probe:capture] ${captureFile}`);
  }
  await appendFile(captureFile, `${JSON.stringify(snapshot)}\n`, 'utf8');
  captureCount += 1;
  if (captureCount === CAPTURE_MAX_SAMPLES) console.warn(`[probe:capture] max samples reached: ${CAPTURE_MAX_SAMPLES}`);
}

async function handleRealtimeFrame(raw) {
  const parts = raw.split('|');
  if (parts.length < 4 || parts[1] !== 'H0STCNT0') return;

  lastMessageAt = new Date().toISOString();

  await maybeCaptureFrame(raw);

  if (!hasAfterMarketSchema(columns)) {
    console.log(
      `[probe] H0STCNT0 fields=${String(parts[3]).split('^').length}; ` +
      `MARKET_CLS_CODE 공식 위치 대기 중`
    );
    return;
  }

  const values = String(parts[3] ?? '').split('^');
  const recordSize = columns.length;

  if (recordSize <= 0 || values.length % recordSize !== 0) {
    console.warn(
      `[ws:frame] unexpected field count: received=${values.length}, ` +
      `recordSize=${recordSize}, itemCount=${parts[2]}`
    );
    return;
  }

  const actualCount = values.length / recordSize;
  const advertisedCount = Number(parts[2] ?? 0);

  if (
    Number.isFinite(advertisedCount) &&
    advertisedCount > 0 &&
    advertisedCount !== actualCount
  ) {
    console.warn(
      `[ws:frame] item count mismatch: advertised=${advertisedCount}, actual=${actualCount}`
    );
  }

  for (let i = 0; i < actualCount; i += 1) {
    const start = i * recordSize;
    const payload = values.slice(start, start + recordSize).join('^');

    const mapped = mapAfterMarketQuote(
      payload,
      columns,
      symbolMarket
    );

    if (!mapped.ok) {
      continue;
    }

    lastAfterMarketAt = new Date().toISOString();

    console.log(
      '[after-market]',
      mapped.row.symbol,
      mapped.row.market,
      mapped.row.price,
      mapped.row.observed_at
    );

    if (PERSIST) {
      await saveQuote(mapped.row);
    }
  }
}

async function runOnce() {
  columns = await resolveColumns();
  console.log(`[schema] fields=${columns.length} MARKET_CLS_CODE=${hasAfterMarketSchema(columns) ? 'READY' : 'PENDING'}`);
  if (!hasAfterMarketSchema(columns)) {
    console.warn('[schema] KIS 공식 샘플에 MARKET_CLS_CODE 위치가 아직 확인되지 않아 DB 저장을 자동 차단합니다.');
  }
  if (CAPTURE) {
    console.log(`[probe:capture] ON ${CAPTURE_START}~${CAPTURE_END} KST; max=${CAPTURE_MAX_SAMPLES}; dir=${CAPTURE_DIR}`);
  }

  const approvalKey = await getApprovalKey();
  const ws = new WebSocket(WS_URL);

  const heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
  try {
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        websocketOpen = true;
        lastError = null;
        console.log(`[ws] connected ${WS_URL}; subscriptions=${symbols.length}`);
        subscribe(ws, approvalKey);
        heartbeat();
      });

      ws.addEventListener('message', async (event) => {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        try {
          if (raw.startsWith('0|') || raw.startsWith('1|')) {
            await handleRealtimeFrame(raw);
            return;
          }
          const trimmed = raw.trim();

// 빈 프레임 무시
if (!trimmed) return;

// JSON 형태가 아닌 제어 프레임 무시
if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
  console.warn('[ws:skip] non-json frame:', trimmed.slice(0, 120));
  return;
}

let msg;

try {
  msg = JSON.parse(trimmed);
} catch {
  console.warn('[ws:skip] malformed json:', trimmed.slice(0, 120));
  return;
}

if (msg?.header?.tr_id === 'PINGPONG') {
  ws.send(raw);
  return;
}
          if (msg?.body?.rt_cd === '1') console.warn('[ws:kis]', msg?.body?.msg1 ?? raw);
        } catch (error) {
          lastError = String(error);
          console.error('[ws:message]', error);
        }
      });

      ws.addEventListener('error', (event) => reject(new Error(`WebSocket error: ${event?.message ?? 'unknown'}`)));
      ws.addEventListener('close', (event) => {
        websocketOpen = false;
        resolve(event);
      });
    });
  } finally {
    clearInterval(heartbeatTimer);
    websocketOpen = false;
    await heartbeat();
  }
}

async function main() {
  console.log(`[worker] tracked=${symbols.map((x) => `${x.symbol}:${x.market}`).join(',')}`);
  console.log(`[worker] persist=${PERSIST ? 'ON' : 'OFF (probe only)'}`);
  let retry = 0;
  while (true) {
    try {
      await runOnce();
      retry = 0;
    } catch (error) {
      websocketOpen = false;
      lastError = String(error);
      console.error('[worker]', error);
      await heartbeat();
      retry += 1;
    }
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(retry, 5));
    console.log(`[worker] reconnect in ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
