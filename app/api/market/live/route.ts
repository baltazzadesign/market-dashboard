import { parseSectors } from "@/lib/market-research";
import { indexSnapshot } from "@/lib/kis-history";
import { kstParts } from "@/lib/balta-model";
import { getKrxMarketStatus, isRegularObservation, parseAdditionalHolidays } from "@/lib/market-calendar";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getKstTime() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

let cachedToken: string | null = null;
let cachedTokenExpireAt = 0;
let tokenPromise: Promise<string> | null = null;
let tokenCooldownUntil = 0;
let cachedWsApprovalKey: string | null = null;
let cachedWsApprovalExpireAt = 0;
let wsApprovalPromise: Promise<string> | null = null;
let lastSavedMinute = "";
let memoryPrevDiff = 0;
let memoryPrevFlowPower = 0;
let memoryRecentRows: Array<{ diff: number; foreignFlow: number; instFlow: number }> = [];
let memoryLastFlow: { foreign: number; inst: number; indiv: number; updatedAt: number } | null = null;
let memoryLastBreadth: {
  up: number;
  down: number;
  flat: number;
  kospi: number;
  kosdaq: number;
  updatedAt: number;
} | null = null;

const FLOW_FALLBACK_MAX_AGE_MS = 5 * 60 * 1000;
const KIS_FETCH_TIMEOUT_MS = Number(process.env.KIS_FETCH_TIMEOUT_MS ?? 8000);
const KIS_BASE = process.env.KIS_BASE ?? "https://openapi.koreainvestment.com:9443";
const KIS_WS_URL = process.env.KIS_WS_URL ?? "ws://ops.koreainvestment.com:21000";
const KIS_WS_TIMEOUT_MS = Number(process.env.KIS_WS_TIMEOUT_MS ?? 10000);
// KIS 공식 예제는 WebSocket approval key를 24시간 단위로 재인증합니다.
// 서버리스 메모리 캐시는 그보다 짧은 23시간만 재사용합니다.
const KIS_WS_APPROVAL_CACHE_MS = 23 * 60 * 60 * 1000;
const CUSTTYPE = process.env.KIS_CUSTTYPE ?? "P";

type FlowData = {
  complete?: boolean;
  markets?: { kospi: FlowData; kosdaq: FlowData };
  foreign: number;
  inst: number;
  indiv: number;
  source: "LIVE" | "FALLBACK" | "EMPTY" | "ERROR";
  raw?: any;
};

type StoredKisToken = {
  id: string;
  access_token: string;
  expires_at: string;
  updated_at?: string;
};

type BreadthSource = "LIVE" | "FALLBACK" | "SKIPPED";

type BreadthData = {
  up: number;
  down: number;
  flat: number;
  price: number;
  sectorRaw?: any;
  raw?: any;
};

type RealtimeIndexBreadth = {
  // H0UPCNT0가 실제 데이터 프레임 안에 돌려준 업종코드입니다.
  // KOSDAQ 후보키 10001은 반드시 REST KOSDAQ 지수값과 교차검증한 뒤에만 사용합니다.
  code: string;
  up: number;
  down: number;
  flat: number;
  price: number;
  receivedAt: number;
};

type RealtimeIndexBreadthPair = {
  kospi?: RealtimeIndexBreadth;
  kosdaq?: RealtimeIndexBreadth;
};

const MIN_NORMAL_BREADTH_TOTAL = 1500;
const MAX_NORMAL_BREADTH_TOTAL = 5000;
const BREADTH_DROP_FALLBACK_RATIO = 0.75;
const BREADTH_HARD_DROP_FALLBACK_RATIO = 0.7;
const MIN_VALID_INDEX_KOSPI = 1000;
const MIN_VALID_INDEX_KOSDAQ = 300;
const MARKET_OPEN_MINUTE = 9 * 60;
const MARKET_CLOSE_MINUTE = 15 * 60 + 30;

type SignalLevel = "강" | "중" | "약";

type SignalCategory = "FLOW" | "DIVERGENCE" | "ACCEL" | "SCORE" | "CROSS" | "TREND";

type MarketSignal = {
  type: string;
  message: string;
  level: SignalLevel;
  priority: number;
  category: SignalCategory;
};

type SupabaseLogPayload = {
  market_data?: Record<string, unknown>;
  createdat: string;
  time: string;
  up: number;
  down: number;
  flat: number;
  diff: number;
  accel: number;
  upratio: number;
  downratio: number;
  kospi: number;
  kosdaq: number;
  foreignflow: number;
  instflow: number;
  indivflow: number;
  flowpower: number;
  flowtrend: number;
  flowmomentum: number;
  alert: string;
  markettone: string;
  marketscore: number;
  marketstate: string;
  signals: MarketSignal[];
};

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

return {
  url: url
    .replace(/\/$/, "")
    .replace(/\/rest\/v1$/, ""),
  key,
};
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = KIS_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function getKstDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 없음");
  }

  const res = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: config.key,
      authorization: `Bearer ${config.key}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase 요청 실패 ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;

  return res.json();
}

function normalizeMinuteValue(time: string) {
  if (!time) return "";
  const m = String(time).match(/(\d{1,2}):(\d{2})/);
  if (!m) return String(time);
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function getMinutesFromHHmm(time: string) {
  const normalized = normalizeMinuteValue(time);
  const m = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isRegularMarketTime(time: string) {
  const minutes = getMinutesFromHHmm(time);
  return minutes >= MARKET_OPEN_MINUTE && minutes <= MARKET_CLOSE_MINUTE;
}

function getKstEightAmMs(date = new Date()) {
  const kstDate = getKstDateString(date);
  return new Date(`${kstDate}T08:00:00+09:00`).getTime();
}

function shouldRefreshTokenForToday(tokenRow: StoredKisToken | null, nowMs: number) {
  const todayEightAmMs = getKstEightAmMs(new Date(nowMs));
  if (nowMs < todayEightAmMs) return false;

  const updatedAtMs = tokenRow?.updated_at ? new Date(tokenRow.updated_at).getTime() : 0;
  const safeUpdatedAtMs = Number.isFinite(updatedAtMs) ? updatedAtMs : 0;

  return safeUpdatedAtMs < todayEightAmMs;
}

type SavedLogRow = Partial<SupabaseLogPayload> & {
  id?: number;
  created_at?: string;
};

function normalizeSavedRow(row: any): SavedLogRow | null {
  if (!row || typeof row !== "object") return null;

  return {
    id: toNumber(row.id),
    createdat: row.createdat ?? row.createdAt ?? row.created_at ?? "",
    time: normalizeMinuteValue(row.time ?? ""),
    up: toNumber(row.up),
    down: toNumber(row.down),
    flat: toNumber(row.flat),
    diff: toNumber(row.diff),
    accel: toNumber(row.accel),
    upratio: toNumber(row.upratio ?? row.upRatio),
    downratio: toNumber(row.downratio ?? row.downRatio),
    kospi: toNumber(row.kospi),
    kosdaq: toNumber(row.kosdaq),
    foreignflow: normalizeFlowDisplayUnit(row.foreignflow ?? row.foreignFlow),
    instflow: normalizeFlowDisplayUnit(row.instflow ?? row.instFlow),
    indivflow: normalizeFlowDisplayUnit(row.indivflow ?? row.indivFlow),
    flowpower: normalizeFlowDisplayUnit(row.flowpower ?? row.flowPower),
    flowtrend: normalizeFlowDisplayUnit(row.flowtrend ?? row.flowTrend),
    flowmomentum: normalizeFlowDisplayUnit(row.flowmomentum ?? row.flowMomentum),
    alert: row.alert ?? "",
    markettone: row.markettone ?? row.marketTone ?? "",
    marketscore: toNumber(row.marketscore ?? row.marketScore),
    marketstate: row.marketstate ?? row.marketState ?? "",
    signals: Array.isArray(row.signals) ? row.signals : [],
  };
}

async function getLatestLogFromSupabase(createdat?: string) {
  try {
    const dateFilter = createdat ? `&createdat=eq.${encodeURIComponent(createdat)}` : "";
    const rows = await supabaseRequest(`/rest/v1/logs?select=*${dateFilter}&order=id.desc&limit=1`);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return normalizeSavedRow(rows[0]);
  } catch (error) {
    console.warn("Supabase 오늘 최근 로그 조회 실패:", error);
    return null;
  }
}

async function getLogByMinuteFromSupabase(createdat: string, time: string) {
  try {
    const rows = await supabaseRequest(
      `/rest/v1/logs?select=*&createdat=eq.${encodeURIComponent(createdat)}&time=eq.${encodeURIComponent(time)}&order=id.desc&limit=1`
    );
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return normalizeSavedRow(rows[0]);
  } catch (error) {
    console.warn("Supabase 같은 분 로그 조회 실패:", error);
    return null;
  }
}

function hasSavedFlow(prevRow: SavedLogRow | null) {
  if (!prevRow) return false;
  return (
    toNumber(prevRow.foreignflow) !== 0 ||
    toNumber(prevRow.instflow) !== 0 ||
    toNumber(prevRow.indivflow) !== 0
  );
}

function hasFlowValue(flow: Pick<FlowData, "foreign" | "inst" | "indiv"> | null | undefined) {
  if (!flow) return false;
  return toNumber(flow.foreign) !== 0 || toNumber(flow.inst) !== 0 || toNumber(flow.indiv) !== 0;
}

function rememberFlow(flowData: FlowData) {
  if (flowData.source !== "LIVE" || !hasFlowValue(flowData)) return;

  memoryLastFlow = {
    foreign: normalizeFlowDisplayUnit(flowData.foreign),
    inst: normalizeFlowDisplayUnit(flowData.inst),
    indiv: normalizeFlowDisplayUnit(flowData.indiv),
    updatedAt: Date.now(),
  };
}

function getMemoryFlowFallback(raw?: any): FlowData | null {
  if (!memoryLastFlow) return null;

  const age = Date.now() - memoryLastFlow.updatedAt;
  if (age > FLOW_FALLBACK_MAX_AGE_MS) return null;

  return {
    foreign: memoryLastFlow.foreign,
    inst: memoryLastFlow.inst,
    indiv: memoryLastFlow.indiv,
    source: "FALLBACK",
    raw: {
      fallbackFrom: "memoryLastFlow",
      ageMs: age,
      raw,
    },
  };
}

function applyGasStyleFlowFallback(flowData: FlowData, prevRow: SavedLogRow | null): FlowData {
  // LIVE 값이 정상으로 들어오면 그 값을 즉시 메모리에 저장해서,
  // 이후 TR 074가 일시적으로 전부 0을 반환해도 직전 정상값으로 버틸 수 있게 합니다.
  if (flowData.source === "LIVE") {
    rememberFlow(flowData);
    return flowData;
  }

  // 1순위: DB에 저장된 직전 정상 수급값 사용
  if (hasSavedFlow(prevRow)) {
    const fallback = {
      foreign: normalizeFlowDisplayUnit(prevRow?.foreignflow),
      inst: normalizeFlowDisplayUnit(prevRow?.instflow),
      indiv: normalizeFlowDisplayUnit(prevRow?.indivflow),
      source: "FALLBACK" as const,
      raw: {
        fallbackFrom: "latestDbRow",
        raw: flowData.raw,
      },
    };

    // DB fallback도 다음 요청에서 다시 사용할 수 있게 메모리에 저장합니다.
    memoryLastFlow = {
      foreign: fallback.foreign,
      inst: fallback.inst,
      indiv: fallback.indiv,
      updatedAt: Date.now(),
    };

    return fallback;
  }

  // 2순위: 같은 서버 인스턴스의 메모리에 남아 있는 직전 정상 수급값 사용
  const memoryFallback = getMemoryFlowFallback(flowData.raw);
  if (memoryFallback) return {...memoryFallback, markets: flowData.markets};

  return flowData;
}

function getMarketSnapshotInvalidReason(row: SupabaseLogPayload) {
  const up = toNumber(row.up);
  const down = toNumber(row.down);
  const flat = toNumber(row.flat);
  const total = up + down + flat;

  if (total <= 0) return `breadth total is zero: total=${total}`;
  if (total < MIN_NORMAL_BREADTH_TOTAL) return `breadth total too small: total=${total}`;
  if (total >= MAX_NORMAL_BREADTH_TOTAL) return `breadth total too large: total=${total}`;
  if (up <= 0 || down <= 0) return `breadth up/down invalid: up=${up}, down=${down}`;
  if (toNumber(row.kospi) <= MIN_VALID_INDEX_KOSPI) return `kospi invalid: kospi=${row.kospi}`;
  if (toNumber(row.kosdaq) <= MIN_VALID_INDEX_KOSDAQ) return `kosdaq invalid: kosdaq=${row.kosdaq}`;

  return "";
}

function isValidMarketSnapshot(row: SupabaseLogPayload) {
  return getMarketSnapshotInvalidReason(row) === "";
}

function getBreadthTotal(row: Pick<SavedLogRow, "up" | "down" | "flat"> | null | undefined) {
  if (!row) return 0;
  return toNumber(row.up) + toNumber(row.down) + toNumber(row.flat);
}

function isNormalBreadthRow(row: SavedLogRow | null | undefined) {
  if (!row) return false;
  const total = getBreadthTotal(row);
  return (
    total >= MIN_NORMAL_BREADTH_TOTAL &&
    toNumber(row.up) > 0 &&
    toNumber(row.down) > 0 &&
    toNumber(row.kospi) > 1000 &&
    toNumber(row.kosdaq) > 300
  );
}

async function getLatestNormalBreadthRowFromSupabase(createdat?: string) {
  try {
    const dateFilter = createdat ? `&createdat=eq.${encodeURIComponent(createdat)}` : "";
    const rows = await supabaseRequest(`/rest/v1/logs?select=*${dateFilter}&order=id.desc&limit=60`);
    if (!Array.isArray(rows) || rows.length === 0) return null;

    for (const row of rows) {
      const normalized = normalizeSavedRow(row);
      const normalizedTime = String((normalized as any).time ?? "");
      if (isNormalBreadthRow(normalized) && isRegularMarketTime(normalizedTime)) return normalized;
    }

    return null;
  } catch (error) {
    console.warn("Supabase 오늘 최근 정상 breadth 조회 실패:", error);
    return null;
  }
}

function shouldFallbackBreadth(currentTotal: number, prevNormalTotal: number) {
  if (currentTotal <= 0) return true;
  if (currentTotal < MIN_NORMAL_BREADTH_TOTAL) return true;
  if (currentTotal >= MAX_NORMAL_BREADTH_TOTAL) return true;

  if (prevNormalTotal < MIN_NORMAL_BREADTH_TOTAL) return false;

  // 직전 정상 총합 대비 25% 이상 줄면 API 부분 응답 가능성이 높으므로 fallback 처리합니다.
  if (currentTotal < Math.round(prevNormalTotal * BREADTH_DROP_FALLBACK_RATIO)) return true;

  // 더 강한 급락 기준도 명시적으로 남겨 향후 조정하기 쉽게 합니다.
  if (currentTotal < Math.round(prevNormalTotal * BREADTH_HARD_DROP_FALLBACK_RATIO)) return true;

  return false;
}

function getMemoryBreadthFallbackRow(): SavedLogRow | null {
  if (!memoryLastBreadth) return null;

  const age = Date.now() - memoryLastBreadth.updatedAt;
  // 066은 1분 단위로 저장되므로, 메모리 fallback은 장중 일시 장애 방어용으로 10분까지만 사용합니다.
  if (age > 10 * 60 * 1000) return null;

  return {
    up: memoryLastBreadth.up,
    down: memoryLastBreadth.down,
    flat: memoryLastBreadth.flat,
    kospi: memoryLastBreadth.kospi,
    kosdaq: memoryLastBreadth.kosdaq,
    time: normalizeMinuteValue(getKstTime()),
  };
}

function rememberBreadthSnapshot(up: number, down: number, flat: number, kospi: number, kosdaq: number) {
  const total = up + down + flat;
  if (
    total < MIN_NORMAL_BREADTH_TOTAL ||
    total >= MAX_NORMAL_BREADTH_TOTAL ||
    up <= 0 ||
    down <= 0 ||
    kospi <= MIN_VALID_INDEX_KOSPI ||
    kosdaq <= MIN_VALID_INDEX_KOSDAQ
  ) {
    return;
  }

  memoryLastBreadth = {
    up,
    down,
    flat,
    kospi,
    kosdaq,
    updatedAt: Date.now(),
  };
}

async function saveLogToSupabase(row: SupabaseLogPayload) {
  try {
    const sameMinuteRow = await getLogByMinuteFromSupabase(row.createdat, row.time);

    if (sameMinuteRow?.id) {
      await supabaseRequest(`/rest/v1/logs?id=eq.${sameMinuteRow.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(row),
      });

      return { action: "updated", id: sameMinuteRow.id };
    }

    await supabaseRequest("/rest/v1/logs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });

    return { action: "inserted", id: null };
  } catch (error) {
    console.warn("Supabase 로그 저장 실패:", error);
    return { action: "failed", id: null };
  }
}


const KIS_TOKEN_ROW_ID = "default";
const KIS_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const KIS_TOKEN_COOLDOWN_MS = 70 * 1000;

function getStoredTokenExpireMs(tokenRow: StoredKisToken | null) {
  if (!tokenRow?.expires_at) return 0;
  const ms = new Date(tokenRow.expires_at).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

async function getStoredKisTokenFromSupabase() {
  try {
    const rows = await supabaseRequest(
      `/rest/v1/kis_tokens?select=*&id=eq.${encodeURIComponent(KIS_TOKEN_ROW_ID)}&limit=1`
    );

    if (!Array.isArray(rows) || rows.length === 0) return null;
    return rows[0] as StoredKisToken;
  } catch (error) {
    console.warn("Supabase KIS 토큰 조회 실패:", error);
    return null;
  }
}

async function saveKisTokenToSupabase(accessToken: string, expiresAtMs: number) {
  try {
    await supabaseRequest("/rest/v1/kis_tokens?on_conflict=id", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([
        {
          id: KIS_TOKEN_ROW_ID,
          access_token: accessToken,
          expires_at: new Date(expiresAtMs).toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  } catch (error) {
    console.warn("Supabase KIS 토큰 저장 실패:", error);
  }
}

async function getAccessToken() {
  const appkey = process.env.KIS_APPKEY;
  const appsecret = process.env.KIS_APPSECRET;

  if (!appkey || !appsecret) {
    throw new Error("KIS_APPKEY 또는 KIS_APPSECRET 없음");
  }

  const now = Date.now();

  // 1) 같은 서버리스 인스턴스 안에서는 메모리 캐시를 최우선 재사용합니다.
  if (cachedToken && now < cachedTokenExpireAt - KIS_TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken;
  }

  const storedToken = await getStoredKisTokenFromSupabase();
  const storedExpireMs = getStoredTokenExpireMs(storedToken);
  const needsDailyRefresh = shouldRefreshTokenForToday(storedToken, now);

  // 2) Vercel 서버리스 인스턴스가 바뀌어도 Supabase 저장 토큰 재사용
  if (
    !needsDailyRefresh &&
    storedToken?.access_token &&
    storedExpireMs &&
    now < storedExpireMs - KIS_TOKEN_REFRESH_BUFFER_MS
  ) {
    const storedAccessToken = String(storedToken.access_token);
    cachedToken = storedAccessToken;
    cachedTokenExpireAt = storedExpireMs;
    return storedAccessToken;
  }

  // 3) EGW00133 이후에는 tokenP 재시도를 막는 쿨다운을 둡니다.
  if (now < tokenCooldownUntil) {
    if (cachedToken) return cachedToken;

    if (storedToken?.access_token) {
      const storedAccessToken = String(storedToken.access_token);
      cachedToken = storedAccessToken;
      cachedTokenExpireAt = storedExpireMs || now + KIS_TOKEN_COOLDOWN_MS;
      return storedAccessToken;
    }

    const remainSec = Math.ceil((tokenCooldownUntil - now) / 1000);
    throw new Error(`KIS 토큰 발급 쿨다운 중입니다. ${remainSec}초 후 다시 시도하세요.`);
  }

  // 4) 동시에 여러 요청이 들어오면 tokenP는 1번만 호출합니다.
  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    const res = await fetchWithTimeout(`${KIS_BASE}/oauth2/tokenP`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey,
        appsecret,
      }),
      cache: "no-store",
    });

    const text = await res.text();
    let json: any = null;

    try {
      json = JSON.parse(text);
    } catch {
      tokenCooldownUntil = Date.now() + KIS_TOKEN_COOLDOWN_MS;
      throw new Error(`KIS 토큰 응답 JSON 파싱 실패: ${text}`);
    }

    if (!res.ok || !json.access_token) {
      const errorCode = String(json?.error_code ?? "");
      const errorDescription = String(json?.error_description ?? text ?? "");

      if (errorCode === "EGW00133" || res.status === 403) {
        tokenCooldownUntil = Date.now() + KIS_TOKEN_COOLDOWN_MS;
      }

      throw new Error(`KIS 토큰 발급 실패 ${res.status}: ${errorDescription || text}`);
    }

    const expiresInSec = Number(json.expires_in ?? 86400);
    const safeExpiresInSec = Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec : 86400;
    const expiresAtMs = Date.now() + safeExpiresInSec * 1000;

    const accessToken = String(json.access_token);

    cachedToken = accessToken;
    cachedTokenExpireAt = expiresAtMs;
    tokenCooldownUntil = 0;

    await saveKisTokenToSupabase(accessToken, expiresAtMs);

    return accessToken;
  })();

  try {
    return await tokenPromise;
  } finally {
    tokenPromise = null;
  }
}

function pickOutput(data: any) {
  const out = data.output1 ?? data.output ?? data.output2 ?? {};
  if (Array.isArray(out)) return out[0] ?? {};
  return out;
}

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeFlowDisplayUnit(value: any) {
  const n = toNumber(value);
  if (!Number.isFinite(n) || n === 0) return 0;

  // 수급 표시/저장 단위는 증권사 화면과 같은 억원 단위로 통일합니다.
  // LIVE 파싱 단계(parseFlowFromJson -> normalizeFlowUnit)에서 이미 /100 보정이 끝납니다.
  //
  // 중요 수정:
  // 기존에는 abs(n) >= 50,000이면 과거 DB 오저장값으로 보고 다시 /100 처리했는데,
  // 장중 개인 수급은 실제로 -50,000억 수준까지 정상적으로 커질 수 있습니다.
  // 그래서 개인 수급이 -50,000억을 넘는 순간 -500억대로 깨져 보였습니다.
  // 화면/저장 단계에서는 추가 단위 변환을 하지 않고 반올림만 합니다.
  return Math.round(n);
}

function pickNumber(obj: any, keys: string[]) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return toNumber(obj[key]);
    }
  }
  return 0;
}

// 공식 명세: 국내업종 현재지수[v1_국내주식-063].xlsx.
// 063 output -> 지수/시장폭, 066 output2 -> 업종 목록. 서로 합산하지 않습니다.
async function fetchBreadth(code: "0001" | "1001"): Promise<BreadthData> {
  const empty: BreadthData = {
    up: 0,
    down: 0,
    flat: 0,
    price: 0,
  };

  try {
    const token = await getAccessToken();

    const headers = {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_APPKEY!,
      appsecret: process.env.KIS_APPSECRET!,
      custtype: CUSTTYPE,
    };

    // 1) 063 국내업종 현재지수: 지수 + 시장폭 1차 소스
    const qs063 = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "U",
      FID_INPUT_ISCD: code,
    });

    const res063 = await fetchWithTimeout(
      `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-index-price?${qs063}`,
      {
        headers: {
          ...headers,
          tr_id: "FHPUP02100000",
        },
        cache: "no-store",
      }
    );

    const data063 = await res063.json();

    if (!res063.ok || String(data063?.rt_cd) !== "0") {
      console.warn("BREADTH_063_ERROR", {
        code,
        httpStatus: res063.status,
        msgCode: data063?.msg_cd,
        msg: data063?.msg1,
      });
    }

    const out063 =
      data063?.output && !Array.isArray(data063.output)
        ? data063.output
        : {};

    let up = toNumber(out063?.ascn_issu_cnt);
    let down = toNumber(out063?.down_issu_cnt);
    let flat = toNumber(out063?.stnr_issu_cnt);
    let price = toNumber(out063?.bstp_nmix_prpr);

    const total063 = up + down + flat;

    console.log("BREADTH_063_RESULT", {
      code,
      up,
      down,
      flat,
      total: total063,
      price,
      rawCounts: {
        ascn_issu_cnt: out063?.ascn_issu_cnt,
        down_issu_cnt: out063?.down_issu_cnt,
        stnr_issu_cnt: out063?.stnr_issu_cnt,
        uplm_issu_cnt: out063?.uplm_issu_cnt,
        lslm_issu_cnt: out063?.lslm_issu_cnt,
      },
    });

    // 2) 066 국내업종 구분별전체시세:
    //    기존 업종 데이터는 그대로 유지하고, output1의 시장폭을 063 장애 시 fallback으로 사용
    let sectorData: any = null;

    try {
      const qs066 = new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: "U",
        FID_INPUT_ISCD: code,
        FID_COND_SCR_DIV_CODE: "20214",
        FID_MRKT_CLS_CODE: code === "0001" ? "K" : "Q",
        FID_BLNG_CLS_CODE: "0",
      });

      const res066 = await fetchWithTimeout(
        `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-index-category-price?${qs066}`,
        {
          headers: {
            ...headers,
            tr_id: "FHPUP02140000",
          },
          cache: "no-store",
        }
      );

      sectorData = await res066.json();

      if (!res066.ok || String(sectorData?.rt_cd) !== "0") {
        console.warn("SECTOR_066_ERROR", {
          code,
          httpStatus: res066.status,
          msgCode: sectorData?.msg_cd,
          msg: sectorData?.msg1,
        });
      } else {
        const raw066 = Array.isArray(sectorData?.output1)
          ? sectorData.output1[0]
          : sectorData?.output1 ?? {};

        const up066 = toNumber(raw066?.ascn_issu_cnt);
        const down066 = toNumber(raw066?.down_issu_cnt);
        const flat066 = toNumber(raw066?.stnr_issu_cnt);
        const price066 = toNumber(raw066?.bstp_nmix_prpr);
        const total066 = up066 + down066 + flat066;

        console.log("BREADTH_066_SUMMARY", {
          code,
          up: up066,
          down: down066,
          flat: flat066,
          total: total066,
          price: price066,
        });

        if (total063 <= 0 && total066 > 0) {
          up = up066;
          down = down066;
          flat = flat066;

          if (price <= 0) {
            price = price066;
          }

          console.warn("BREADTH_066_FALLBACK", {
            code,
            reason: "063 breadth total is zero",
            up,
            down,
            flat,
            total: up + down + flat,
          });
        }

        if (total063 <= 0 && total066 <= 0) {
          console.warn("BREADTH_KIS_ALL_ZERO", {
            code,
            source063: {
              up: toNumber(out063?.ascn_issu_cnt),
              down: toNumber(out063?.down_issu_cnt),
              flat: toNumber(out063?.stnr_issu_cnt),
              price: toNumber(out063?.bstp_nmix_prpr),
            },
            source066: {
              up: up066,
              down: down066,
              flat: flat066,
              price: price066,
            },
          });
        }
      }
    } catch (error) {
      console.warn("SECTOR_066_REQUEST_FAILED", {
        code,
        error: String(error),
      });
    }

    return {
      up,
      down,
      flat,
      price,
      sectorRaw: sectorData,
      raw: {
        ...data063,
        output1: out063,
        snapshotTrId: "FHPUP02100000",
      },
    };
  } catch (error) {
    console.warn("BREADTH_063_REQUEST_FAILED", {
      code,
      error: String(error),
    });

    return empty;
  }
}


// KIS WebSocket 접속키 발급.
// 공식 샘플의 /oauth2/Approval + secretkey 규격을 그대로 사용합니다.
async function getKisWsApprovalKey() {
  const appkey = process.env.KIS_APPKEY;
  const appsecret = process.env.KIS_APPSECRET;

  if (!appkey || !appsecret) {
    throw new Error("KIS_APPKEY 또는 KIS_APPSECRET 없음");
  }

  const now = Date.now();
  if (cachedWsApprovalKey && now < cachedWsApprovalExpireAt) {
    return cachedWsApprovalKey;
  }

  if (wsApprovalPromise) {
    return wsApprovalPromise;
  }

  wsApprovalPromise = (async () => {
    const res = await fetchWithTimeout(
      `${KIS_BASE}/oauth2/Approval`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          appkey,
          secretkey: appsecret,
        }),
        cache: "no-store",
      },
      Math.min(KIS_FETCH_TIMEOUT_MS, 6000)
    );

    const raw = await res.text();
    let json: any = null;

    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`KIS WebSocket approval 응답 JSON 파싱 실패: ${raw.slice(0, 300)}`);
    }

    if (!res.ok || !json?.approval_key) {
      throw new Error(
        `KIS WebSocket approval 발급 실패 ${res.status}: ${String(
          json?.error_description ?? json?.msg1 ?? raw
        ).slice(0, 300)}`
      );
    }

    cachedWsApprovalKey = String(json.approval_key);
    cachedWsApprovalExpireAt = Date.now() + KIS_WS_APPROVAL_CACHE_MS;
    return cachedWsApprovalKey;
  })();

  try {
    return await wsApprovalPromise;
  } finally {
    wsApprovalPromise = null;
  }
}

function buildKisWsSubscribeMessage(approvalKey: string, code: "0001" | "10001") {
  return JSON.stringify({
    header: {
      approval_key: approvalKey,
      custtype: CUSTTYPE,
      tr_type: "1",
      "content-type": "utf-8",
    },
    body: {
      input: {
        tr_id: "H0UPCNT0",
        tr_key: code,
      },
    },
  });
}

async function websocketDataToText(data: any) {
  if (typeof data === "string") return data;

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    );
  }

  if (data && typeof data.text === "function") {
    return await data.text();
  }

  return String(data ?? "");
}

function parseH0upcnt0Row(values: string[]): RealtimeIndexBreadth | null {
  // KIS H0UPCNT0 컬럼 순서 (0-based):
  // 0 bstp_cls_code, 2 prpr_nmix,
  // 23 ascn_issu_cnt, 24 stnr_issu_cnt, 25 down_issu_cnt
  const code = String(values[0] ?? "").trim();
  if (!code) return null;

  const up = toNumber(values[23]);
  const flat = toNumber(values[24]);
  const down = toNumber(values[25]);
  const price = toNumber(values[2]);

  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    code,
    up,
    down,
    flat,
    price,
    receivedAt: Date.now(),
  };
}

function isRealtimeIndexPriceClose(actual: number, expected: number, tolerance = 0.02) {
  if (!Number.isFinite(actual) || actual <= 0) return false;
  if (!Number.isFinite(expected) || expected <= 0) return false;

  return Math.abs(actual - expected) / expected <= tolerance;
}

async function fetchRealtimeIndexBreadthPair(
  expectedKospiPrice: number,
  expectedKosdaqPrice: number
): Promise<RealtimeIndexBreadthPair> {
  const WebSocketCtor = globalThis.WebSocket;

  if (typeof WebSocketCtor !== "function") {
    throw new Error("현재 Node 런타임에 WebSocket 전역 객체가 없습니다.");
  }

  const approvalKey = await getKisWsApprovalKey();

  return await new Promise<RealtimeIndexBreadthPair>((resolve) => {
    const result: RealtimeIndexBreadthPair = {};
    let settled = false;
    let socket: WebSocket | null = null;

    const finish = (reason: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);

      try {
        if (socket && socket.readyState === 1) socket.close(1000, "breadth snapshot complete");
      } catch {
        // 연결 종료 실패는 snapshot 결과에 영향을 주지 않습니다.
      }

      console.log("BREADTH_WS_FINISH", {
        reason,
        kospi: result.kospi
          ? { up: result.kospi.up, down: result.kospi.down, flat: result.kospi.flat }
          : null,
        kosdaq: result.kosdaq
          ? { up: result.kosdaq.up, down: result.kosdaq.down, flat: result.kosdaq.flat }
          : null,
      });

      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      console.warn("BREADTH_WS_TIMEOUT", {
        timeoutMs: KIS_WS_TIMEOUT_MS,
        receivedKospi: Boolean(result.kospi),
        receivedKosdaq: Boolean(result.kosdaq),
      });
      finish("timeout");
    }, KIS_WS_TIMEOUT_MS);

    try {
      socket = new WebSocketCtor(KIS_WS_URL);
    } catch (error) {
      clearTimeout(timeoutId);
      console.warn("BREADTH_WS_CONNECT_FAILED", { error: String(error) });
      resolve(result);
      return;
    }

    socket.addEventListener("open", () => {
      try {
        socket?.send(buildKisWsSubscribeMessage(approvalKey, "0001"));

        // KOSDAQ 실시간 지수 후보키 10001을 검증합니다.
        // 수신 데이터는 REST KOSDAQ 지수값과 2% 이내일 때만 KOSDAQ으로 인정합니다.
        setTimeout(() => {
          try {
            if (socket?.readyState === 1) {
              socket.send(buildKisWsSubscribeMessage(approvalKey, "10001"));
            }
          } catch (error) {
            console.warn("BREADTH_WS_SUBSCRIBE_FAILED", {
              code: "10001",
              error: String(error),
            });
          }
        }, 100);
      } catch (error) {
        console.warn("BREADTH_WS_SUBSCRIBE_FAILED", {
          code: "0001",
          error: String(error),
        });
        finish("subscribe_failed");
      }
    });

    socket.addEventListener("message", (event: any) => {
      void (async () => {
        try {
          const raw = await websocketDataToText(event?.data);
          if (!raw) return;

          // 실시간 데이터: 0|H0UPCNT0|001|...^... 형태
          if (raw[0] === "0" || raw[0] === "1") {
            const parts = raw.split("|");
            if (parts.length < 4 || parts[1] !== "H0UPCNT0") return;

            // 실제 수신 프레임 확인용. snapshot 함수는 두 지수를 받으면 즉시 종료하므로
            // 정상 상황에서는 로그가 과도하게 쌓이지 않습니다.
            console.log("BREADTH_WS_RAW", raw.slice(0, 1600));

            // H0UPCNT0는 비암호화(0) 시세를 사용합니다.
            if (raw[0] !== "0") {
              console.warn("BREADTH_WS_ENCRYPTED_UNEXPECTED", { trId: parts[1] });
              return;
            }

            // KIS H0UPCNT0 공식 응답 컬럼은 총 30개(0~29)입니다.
            const fieldCount = 30;
            const count = Math.max(1, Number(parts[2]) || 1);
            const values = parts.slice(3).join("|").split("^");

            for (let i = 0; i < count; i += 1) {
              const rowValues = values.slice(i * fieldCount, (i + 1) * fieldCount);
              const parsed = parseH0upcnt0Row(rowValues);
              if (!parsed) continue;

              const kospiPriceMatch =
                parsed.code === "0001" &&
                isRealtimeIndexPriceClose(parsed.price, expectedKospiPrice);

              // 10001 구독에 대한 실제 데이터 코드가 10001 또는 1001로 돌아올 가능성을
              // 모두 관찰하되, 가격이 REST KOSDAQ 지수와 일치할 때만 사용합니다.
              const kosdaqCandidateCode =
                parsed.code === "10001" || parsed.code === "1001";
              const kosdaqPriceMatch =
                kosdaqCandidateCode &&
                isRealtimeIndexPriceClose(parsed.price, expectedKosdaqPrice);

              if (kospiPriceMatch) {
                result.kospi = parsed;
              }

              if (kosdaqPriceMatch) {
                result.kosdaq = parsed;
              }

              const market =
                kospiPriceMatch
                  ? "KOSPI"
                  : kosdaqPriceMatch
                    ? "KOSDAQ"
                    : "UNMATCHED";

              console.log("BREADTH_WS_RESULT", {
                market,
                code: parsed.code,
                up: parsed.up,
                down: parsed.down,
                flat: parsed.flat,
                total: parsed.up + parsed.down + parsed.flat,
                price: parsed.price,
                expectedKospiPrice,
                expectedKosdaqPrice,
                kospiPriceMatch,
                kosdaqPriceMatch,
              });

              if (market === "UNMATCHED") {
                console.warn("BREADTH_WS_PRICE_MISMATCH", {
                  code: parsed.code,
                  price: parsed.price,
                  expectedKospiPrice,
                  expectedKosdaqPrice,
                });
              }
            }

            if (result.kospi && result.kosdaq) {
              finish("both_received");
            }
            return;
          }

          // 구독 ACK / PINGPONG JSON 메시지
          if (raw.trim().startsWith("{")) {
            let message: any = null;
            try {
              message = JSON.parse(raw);
            } catch {
              return;
            }

            const trId = String(message?.header?.tr_id ?? "");
            if (trId === "PINGPONG") {
              // 공식 샘플 중 send(data) 방식과 동일하게 echo합니다.
              try {
                if (socket?.readyState === 1) socket.send(raw);
              } catch {
                // 짧은 snapshot 연결에서는 ping 응답 실패 시 timeout으로 자연스럽게 종료됩니다.
              }
              return;
            }

            const rtCd = String(message?.body?.rt_cd ?? "");
            const msg1 = String(message?.body?.msg1 ?? "");
            const trKey = String(message?.header?.tr_key ?? "");

            if (rtCd === "1") {
              console.warn("BREADTH_WS_ACK_ERROR", { trId, trKey, msg1 });

              // approval key 관련 오류일 가능성에 대비해 다음 요청에서 재발급합니다.
              if (/approval|key|인증|접속/i.test(msg1)) {
                cachedWsApprovalKey = null;
                cachedWsApprovalExpireAt = 0;
              }
            } else if (rtCd === "0") {
              console.log("BREADTH_WS_ACK", { trId, trKey, msg1 });
            }
          }
        } catch (error) {
          console.warn("BREADTH_WS_MESSAGE_ERROR", { error: String(error) });
        }
      })();
    });

    socket.addEventListener("error", (event: any) => {
      console.warn("BREADTH_WS_ERROR", {
        message: String(event?.message ?? "WebSocket error"),
      });
      finish("error");
    });

    socket.addEventListener("close", (event: any) => {
      if (!settled) {
        console.warn("BREADTH_WS_CLOSED_EARLY", {
          code: event?.code,
          reason: event?.reason,
        });
        finish("closed_early");
      }
    });
  });
}

function applyRealtimeIndexBreadth(target: BreadthData, realtime: RealtimeIndexBreadth) {
  target.up = realtime.up;
  target.down = realtime.down;
  target.flat = realtime.flat;

  if (target.price <= 0 && realtime.price > 0) {
    target.price = realtime.price;
  }

  const existingOutput1 =
    target.raw?.output1 && !Array.isArray(target.raw.output1) && typeof target.raw.output1 === "object"
      ? target.raw.output1
      : {};

  target.raw = {
    ...(target.raw ?? {}),
    output1: {
      ...existingOutput1,
      bstp_cls_code: realtime.code,
      bstp_nmix_prpr: String(target.price > 0 ? target.price : realtime.price),
      ascn_issu_cnt: String(realtime.up),
      stnr_issu_cnt: String(realtime.flat),
      down_issu_cnt: String(realtime.down),
    },
    breadthSnapshotTrId: "H0UPCNT0",
    breadthSnapshotSource: "WEBSOCKET_FALLBACK",
  };
}

function normalizeFlowUnit(value: number) {
  // TR_074 금액 필드는 실제 증권사 화면의 억원 단위보다 100배 크게 내려옵니다.
  // 예: 원본 416,200 -> 화면 4,162억.
  // 따라서 KOSPI/KOSDAQ 합산 전에 각 시장 값을 /100으로 보정합니다.
  if (!Number.isFinite(value) || value === 0) return 0;
  return Math.round(value / 100);
}

function parseFlowMinute(row: any) {
  const raw = String(
    row?.stck_cntg_hour ??
      row?.cntg_hour ??
      row?.bsop_hour ??
      row?.trd_hour ??
      row?.time ??
      row?.hour ??
      ""
  ).replace(/[^0-9]/g, "");

  if (raw.length >= 4) {
    const hour = Number(raw.slice(0, 2));
    const minute = Number(raw.slice(2, 4));
    if (Number.isFinite(hour) && Number.isFinite(minute)) return hour * 60 + minute;
  }

  return -1;
}

function flattenObjects(value: any): any[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenObjects(item));
  }

  if (typeof value === "object") {
    const nested = Object.values(value).flatMap((item) => flattenObjects(item));
    return [value, ...nested];
  }

  return [];
}

function getRows(data: any) {
  const candidates = [
    data?.output,
    data?.output1,
    data?.output2,
    data?.output3,
    data?.output4,
  ].filter(Boolean);

  const rows = candidates.flatMap((item) => flattenObjects(item));

  if (rows.length === 0) return flattenObjects(data);

  return rows;
}

function pickNumberByPattern(obj: any, patterns: RegExp[]) {
  if (!obj || typeof obj !== "object") return 0;

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === "") continue;

    if (patterns.some((pattern) => pattern.test(key))) {
      const n = toNumber(value);
      if (n !== 0) return n;
    }
  }

  return 0;
}

function pickNumberByKeysAndPattern(obj: any, keys: string[], patterns: RegExp[]) {
  const byKey = pickNumber(obj, keys);
  if (byKey !== 0) return byKey;
  return pickNumberByPattern(obj, patterns);
}

function parseFlowFromJson(data: any): Omit<FlowData, "source" | "raw"> {
  const rows = getRows(data);

  // 핵심 수정:
  // - qty/수량 필드는 절대 사용하지 않습니다.
  // - tr_pbmn/amt/val 등 순매수 "금액" 필드만 사용합니다.
  // - 시간대별 행이 여러 개 내려오면 합산하지 않고 가장 최근 행 1개만 사용합니다.
  // - route.ts에서 KOSPI/KOSDAQ 합산 후 화면/DB 모두 억원 단위로 통일합니다.
  const directKeyGroups = {
    foreign: [
      "frgn_ntby_tr_pbmn",
      "frgn_ntby_amt",
      "frgn_ntby_val",
      "frgn_seln_buy_amt",
      "frgn_ntby_tr_pbmn_1",
    ],
    inst: [
      "orgn_ntby_tr_pbmn",
      "inst_ntby_tr_pbmn",
      "orgn_ntby_amt",
      "inst_ntby_amt",
      "orgn_ntby_val",
      "inst_ntby_val",
    ],
    indiv: [
      "prsn_ntby_tr_pbmn",
      "indv_ntby_tr_pbmn",
      "prsn_ntby_amt",
      "indv_ntby_amt",
      "prsn_ntby_val",
      "indv_ntby_val",
    ],
  };

  const patternGroups = {
    foreign: [
      /^frgn.*ntby.*(tr|amt|val|pbmn)/i,
      /^foreign.*net.*(tr|amt|val|pbmn)/i,
    ],
    inst: [
      /^orgn.*ntby.*(tr|amt|val|pbmn)/i,
      /^inst.*ntby.*(tr|amt|val|pbmn)/i,
      /^organ.*net.*(tr|amt|val|pbmn)/i,
    ],
    indiv: [
      /^prsn.*ntby.*(tr|amt|val|pbmn)/i,
      /^indv.*ntby.*(tr|amt|val|pbmn)/i,
      /^individual.*net.*(tr|amt|val|pbmn)/i,
    ],
  };

  const candidates: Array<{
    minute: number;
    foreign: number;
    inst: number;
    indiv: number;
  }> = [];

  for (const row of rows) {
    const foreign = pickNumberByKeysAndPattern(row, directKeyGroups.foreign, patternGroups.foreign);
    const inst = pickNumberByKeysAndPattern(row, directKeyGroups.inst, patternGroups.inst);
    const indiv = pickNumberByKeysAndPattern(row, directKeyGroups.indiv, patternGroups.indiv);

    const complete = (Object.keys(directKeyGroups) as Array<keyof typeof directKeyGroups>).every(key =>
      Object.entries(row).some(([field,value]) => value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(String(value).replace(/,/g,""))) &&
        (directKeyGroups[key].includes(field) || patternGroups[key].some(pattern=>pattern.test(field)))));
    if (complete) {
      candidates.push({
        minute: parseFlowMinute(row),
        foreign: normalizeFlowUnit(foreign),
        inst: normalizeFlowUnit(inst),
        indiv: normalizeFlowUnit(indiv),
      });
    }
  }

  if (candidates.length > 0) {
    const latest = candidates.reduce((best, current) => {
      if (current.minute > best.minute) return current;
      if (current.minute === best.minute) return current;
      if (best.minute < 0 && current.minute < 0) return current;
      return best;
    }, candidates[0]);

    return {
      foreign: latest.foreign,
      inst: latest.inst,
      indiv: latest.indiv,
      complete: true,
    };
  }

  // 예외 응답: 투자자별 행으로 내려오는 경우만 투자자명 기준으로 처리합니다.
  // 이때도 qty/수량은 제외하고 금액 필드만 사용하며, 동일 투자자별 최신 행만 사용합니다.
  const byInvestor = new Map<string, { minute: number; amount: number }>();

  for (const row of rows) {
    const name = String(
      row?.invt_cls_name ??
        row?.ivst_cls_name ??
        row?.invr_cls_name ??
        row?.invst_cls_name ??
        row?.investor ??
        row?.name ??
        ""
    );

    const amount = pickNumberByKeysAndPattern(
      row,
      [
        "ntby_tr_pbmn",
        "ntby_amt",
        "net_buy_amt",
        "smtl_ntby_tr_pbmn",
        "tr_pbmn",
        "amount",
      ],
      [/ntby.*(tr|amt|val|pbmn)/i, /net.*buy.*(tr|amt|val|pbmn)/i]
    );

    if (!amount) continue;

    let key = "";
    const lowerName = name.toLowerCase();

    if (name.includes("외국") || lowerName.includes("foreign")) {
      key = "foreign";
    } else if (
      name.includes("기관") ||
      lowerName.includes("inst") ||
      name.includes("금융투자") ||
      name.includes("투신") ||
      name.includes("연기금") ||
      name.includes("보험") ||
      name.includes("은행") ||
      name.includes("기타금융")
    ) {
      key = "inst";
    } else if (name.includes("개인") || lowerName.includes("individual")) {
      key = "indiv";
    }

    if (!key) continue;

    const minute = parseFlowMinute(row);
    const prev = byInvestor.get(key);
    if (!prev || minute >= prev.minute || (minute < 0 && prev.minute < 0)) {
      byInvestor.set(key, { minute, amount: normalizeFlowUnit(amount) });
    }
  }

  return {
    complete: ["foreign","inst","indiv"].every(key=>byInvestor.has(key)),
    foreign: byInvestor.get("foreign")?.amount ?? 0,
    inst: byInvestor.get("inst")?.amount ?? 0,
    indiv: byInvestor.get("indiv")?.amount ?? 0,
  };
}
async function fetchInvestorFlowByMarket(market: "KOSPI" | "KOSDAQ"): Promise<FlowData> {
  try {
    const appkey = process.env.KIS_APPKEY!;
    const appsecret = process.env.KIS_APPSECRET!;
    const token = await getAccessToken();

    // 한국투자 TR_074(inquire-investor-time-by-market)는 FID_INPUT_ISCD_2가 필수입니다.
    // 안정적으로 동작했던 조합: KOSPI = KSP + 0001, KOSDAQ = KSQ + 1001
    const marketKey = market === "KOSPI" ? "KSP" : "KSQ";
    const marketCode = market === "KOSPI" ? "0001" : "1001";

    const qs = new URLSearchParams({
      fid_input_iscd: marketKey,
      fid_input_iscd_2: marketCode,
    });

    const res = await fetchWithTimeout(
      `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-investor-time-by-market?${qs.toString()}`,
      {
        method: "GET",
        headers: {
          "content-type": "application/json; charset=utf-8",
          authorization: `Bearer ${token}`,
          appkey,
          appsecret,
          tr_id: "FHPTJ04030000",
          custtype: CUSTTYPE,
        },
        cache: "no-store",
      }
    );

    const data = await res.json().catch((error) => ({
      rt_cd: "JSON_PARSE_ERROR",
      msg1: String(error),
    }));

    if (!res.ok || String(data?.rt_cd ?? "") !== "0") {
      console.log("074 ERROR", market, JSON.stringify(data).slice(0, 3000));

      return {
        foreign: 0,
        inst: 0,
        indiv: 0,
        source: "ERROR",
        raw: {
          request: { market, marketKey, marketCode },
          response: data,
          httpStatus: res.status,
        },
      };
    }

    const parsed = parseFlowFromJson(data);
    const hasValue = parsed.complete === true;

    console.log("074 RESULT", market, {
      request: { marketKey, marketCode },
      source: hasValue ? "LIVE" : "EMPTY",
      foreign: parsed.foreign,
      inst: parsed.inst,
      indiv: parsed.indiv,
    });

    return {
      ...parsed,
      source: hasValue ? "LIVE" : "EMPTY",
      raw: {
        request: { market, marketKey, marketCode },
        response: data,
      },
    };
  } catch (error) {
    console.warn("074 API 요청 실패 → flow fallback 대상으로 처리:", market, error);

    return {
      foreign: 0,
      inst: 0,
      indiv: 0,
      source: "ERROR",
      raw: {
        request: { market },
        error: String(error),
      },
    };
  }
}

async function fetchInvestorFlow(): Promise<FlowData> {
  try {
    const [kospiFlow, kosdaqFlow] = await Promise.all([
      fetchInvestorFlowByMarket("KOSPI"),
      fetchInvestorFlowByMarket("KOSDAQ"),
    ]);

    const foreign = kospiFlow.foreign + kosdaqFlow.foreign;
    const inst = kospiFlow.inst + kosdaqFlow.inst;
    const indiv = kospiFlow.indiv + kosdaqFlow.indiv;

    const hasValue = kospiFlow.source === "LIVE" && kosdaqFlow.source === "LIVE";
    const source: FlowData["source"] = hasValue ? "LIVE" : "ERROR";

    const combinedFlow: FlowData = {
      markets: {kospi:kospiFlow,kosdaq:kosdaqFlow},
      foreign,
      inst,
      indiv,
      source,
      raw: {
        kospi: kospiFlow.raw,
        kosdaq: kosdaqFlow.raw,
      },
    };

    // TR_074가 정상처리(rt_cd=0)인데도 두 시장 모두 0을 반환하는 경우가 있어
    // 메모리에 직전 정상 수급값이 있으면 즉시 FALLBACK 처리합니다.
    // DB fallback은 GET 본문 applyGasStyleFlowFallback에서 한 번 더 적용됩니다.
    if (!hasValue) {
      const memoryFallback = getMemoryFlowFallback(combinedFlow.raw);
      if (memoryFallback) return {...memoryFallback, markets: {kospi:kospiFlow,kosdaq:kosdaqFlow}};
    }

    return combinedFlow;
  } catch (error) {
    console.warn("수급 API 요청 실패:", error);

    return {
      foreign: 0,
      inst: 0,
      indiv: 0,
      source: "ERROR",
    };
  }
}

function buildAlert(diff: number, accel: number, upRatio: number, downRatio: number) {
  if (diff >= 800 && accel >= 50) return "🔥 강한 상승확산 + 가속";
  if (diff >= 500) return "🔥 상승확산 강함";
  if (diff >= 200) return "상승우위";

  if (diff <= -800 && accel <= -50) return "❄️ 강한 하락확산 + 가속";
  if (diff <= -500) return "❄️ 하락확산 강함";
  if (diff <= -200) return "하락우위";

  if (upRatio >= 0.6) return "상승비율 우세";
  if (downRatio >= 0.6) return "하락비율 우세";

  return "중립";
}

function buildAlertLevel(alert: string) {
  if (alert.includes("강한") || alert.includes("강함")) return "강";
  if (alert.includes("우위") || alert.includes("우세")) return "중";
  return "약";
}

function buildTone(diff: number) {
  if (diff >= 800) return "매우 강한 상승";
  if (diff >= 300) return "강한 상승";
  if (diff >= 100) return "상승 우세";

  if (diff <= -800) return "매우 강한 하락";
  if (diff <= -300) return "강한 하락";
  if (diff <= -100) return "하락 우세";

  return "중립";
}

function buildMarketScore(diff: number, upRatio: number, downRatio: number) {
  const scoreByDiff = Math.max(-60, Math.min(60, diff / 20));
  const scoreByRatio = Math.max(-40, Math.min(40, (upRatio - downRatio) * 100));

  return Math.round(scoreByDiff + scoreByRatio);
}

function createSignal(
  type: string,
  message: string,
  level: SignalLevel,
  priority: number,
  category: SignalCategory
): MarketSignal {
  return {
    type,
    message,
    level,
    priority,
    category,
  };
}

function buildSignals(
  diff: number,
  prevDiff: number,
  accel: number,
  marketScore: number
): MarketSignal[] {
  const signals: MarketSignal[] = [];

  if (prevDiff < 0 && diff > 0) {
    signals.push(createSignal("CROSS_UP", "0선 상향 돌파", "중", 50, "CROSS"));
  }

  if (prevDiff > 0 && diff < 0) {
    signals.push(createSignal("CROSS_DOWN", "0선 하향 이탈", "중", 50, "CROSS"));
  }

  if (accel >= 500) {
    signals.push(createSignal("ACCEL_UP_STRONG", "상승 가속 강함", "강", 70, "ACCEL"));
  } else if (accel >= 300) {
    signals.push(createSignal("ACCEL_UP", "상승 가속 강화", "중", 60, "ACCEL"));
  }

  if (accel <= -500) {
    signals.push(createSignal("ACCEL_DOWN_STRONG", "하락 가속 강함", "강", 70, "ACCEL"));
  } else if (accel <= -300) {
    signals.push(createSignal("ACCEL_DOWN", "하락 가속 강화", "중", 60, "ACCEL"));
  }

  if (marketScore >= 80) {
    signals.push(createSignal("SCORE_OVERHEAT_STRONG", "시장점수 강한 과열권", "강", 65, "SCORE"));
  } else if (marketScore >= 70) {
    signals.push(createSignal("SCORE_OVERHEAT", "시장점수 과열권", "중", 55, "SCORE"));
  }

  if (marketScore <= -80) {
    signals.push(createSignal("SCORE_OVERSOLD_STRONG", "시장점수 강한 침체권", "강", 65, "SCORE"));
  } else if (marketScore <= -70) {
    signals.push(createSignal("SCORE_OVERSOLD", "시장점수 침체권", "중", 55, "SCORE"));
  }

  return signals;
}

function buildFlowSignals(
  foreign: number,
  inst: number,
  indiv: number,
  diff: number,
  accel: number,
  flowSource: FlowData["source"],
  prevFlowPower: number,
  recentRows: any[]
): MarketSignal[] {
  const signals: MarketSignal[] = [];

  if (flowSource !== "LIVE") return signals;

  const smartFlow = foreign + inst;
  const flowPower = smartFlow;
  const flowTrend = flowPower - prevFlowPower;
  const absSmartFlow = Math.abs(smartFlow);

  const recentDiffs = recentRows.map((row) => Number(row.diff ?? 0)).reverse();
  const recentFlows = recentRows
    .map((row) => Number(row.foreignFlow ?? 0) + Number(row.instFlow ?? 0))
    .reverse();

  const isDiffRising3 =
    recentDiffs.length >= 3 &&
    recentDiffs[0] < recentDiffs[1] &&
    recentDiffs[1] < recentDiffs[2] &&
    recentDiffs[2] < diff;

  const isDiffFalling3 =
    recentDiffs.length >= 3 &&
    recentDiffs[0] > recentDiffs[1] &&
    recentDiffs[1] > recentDiffs[2] &&
    recentDiffs[2] > diff;

  const isFlowRising3 =
    recentFlows.length >= 3 &&
    recentFlows[0] < recentFlows[1] &&
    recentFlows[1] < recentFlows[2] &&
    recentFlows[2] < flowPower;

  const isFlowFalling3 =
    recentFlows.length >= 3 &&
    recentFlows[0] > recentFlows[1] &&
    recentFlows[1] > recentFlows[2] &&
    recentFlows[2] > flowPower;

  if (foreign > 0 && inst > 0 && absSmartFlow >= 10000) {
    signals.push(
      createSignal(
        "FLOW_STRONG_BUY",
        "외국인+기관 강한 동시 순매수",
        "강",
        100,
        "FLOW"
      )
    );
  } else if (foreign > 0 && inst > 0 && absSmartFlow >= 5000) {
    signals.push(
      createSignal("FLOW_BUY", "외국인+기관 동시 순매수", "중", 90, "FLOW")
    );
  }

  if (foreign < 0 && inst < 0 && absSmartFlow >= 10000) {
    signals.push(
      createSignal(
        "FLOW_STRONG_SELL",
        "외국인+기관 강한 동시 순매도",
        "강",
        100,
        "FLOW"
      )
    );
  } else if (foreign < 0 && inst < 0 && absSmartFlow >= 5000) {
    signals.push(
      createSignal("FLOW_SELL", "외국인+기관 동시 순매도", "중", 90, "FLOW")
    );
  }

  if (diff > 200 && smartFlow <= -5000) {
    signals.push(
      createSignal(
        "FLOW_DIVERGENCE_UP_WITH_SELL",
        "상승종목 우세지만 외국인+기관은 순매도",
        accel < 0 ? "강" : "중",
        accel < 0 ? 98 : 88,
        "DIVERGENCE"
      )
    );
  }

  if (diff < -200 && smartFlow >= 5000) {
    signals.push(
      createSignal(
        "FLOW_DIVERGENCE_DOWN_WITH_BUY",
        "하락종목 우세지만 외국인+기관은 순매수",
        accel > 0 ? "강" : "중",
        accel > 0 ? 98 : 88,
        "DIVERGENCE"
      )
    );
  }

  if (Math.abs(diff) <= 200 && absSmartFlow >= 10000) {
    signals.push(
      createSignal(
        smartFlow > 0 ? "FLOW_ACCUMULATION" : "FLOW_DISTRIBUTION",
        smartFlow > 0
          ? "지수 중립권에서 외국인+기관 매수 누적"
          : "지수 중립권에서 외국인+기관 매도 누적",
        "중",
        85,
        "FLOW"
      )
    );
  }

  if (flowTrend >= 5000 && flowPower >= 5000) {
    signals.push(
      createSignal(
        "FLOW_TREND_BUY",
        "외국인+기관 수급 추세 강화",
        flowTrend >= 10000 ? "강" : "중",
        flowTrend >= 10000 ? 96 : 86,
        "TREND"
      )
    );
  }

  if (flowTrend <= -5000 && flowPower <= -5000) {
    signals.push(
      createSignal(
        "FLOW_TREND_SELL",
        "외국인+기관 수급 이탈 추세 강화",
        flowTrend <= -10000 ? "강" : "중",
        flowTrend <= -10000 ? 96 : 86,
        "TREND"
      )
    );
  }

  if (isDiffRising3 && isFlowFalling3 && diff > 200 && flowPower < 0) {
    signals.push(
      createSignal(
        "REAL_DIVERGENCE_DISTRIBUTION",
        "상승확산 지속 중 외국인+기관 수급 이탈",
        "강",
        110,
        "DIVERGENCE"
      )
    );
  }

  if (isDiffFalling3 && isFlowRising3 && diff < -200 && flowPower > 0) {
    signals.push(
      createSignal(
        "REAL_DIVERGENCE_ACCUMULATION",
        "하락확산 지속 중 외국인+기관 수급 유입",
        "강",
        110,
        "DIVERGENCE"
      )
    );
  }

  return signals;
}

function buildMarketState(
  diff: number,
  accel: number,
  marketScore: number,
  flowPower: number,
  flowTrend: number,
  topSignal?: MarketSignal | null
) {
  if (topSignal?.type === "REAL_DIVERGENCE_DISTRIBUTION") {
    return "DISTRIBUTION";
  }

  if (topSignal?.type === "REAL_DIVERGENCE_ACCUMULATION") {
    return "ACCUMULATION";
  }

  if (diff >= 500 && accel >= 0 && flowPower >= 5000) {
    return flowTrend >= 0 ? "STRONG_TREND_UP" : "UP_BUT_FLOW_WEAKENING";
  }

  if (diff <= -500 && accel <= 0 && flowPower <= -5000) {
    return flowTrend <= 0 ? "STRONG_TREND_DOWN" : "DOWN_BUT_FLOW_IMPROVING";
  }

  if (diff > 0 && flowPower < 0) return "WEAK_BOUNCE";
  if (diff < 0 && flowPower > 0) return "SELLING_PRESSURE_EASING";

  if (marketScore >= 70) return "OVERHEATED";
  if (marketScore <= -70) return "OVERSOLD";

  return "NEUTRAL";
}

function sortSignals(signals: MarketSignal[]) {
  return [...signals].sort((a, b) => b.priority - a.priority);
}

function buildSignalAlert(signals: MarketSignal[]) {
  const topSignal = signals[0];

  if (!topSignal) return null;

  if (topSignal.level === "강") {
    return `🚨 ${topSignal.message}`;
  }

  if (topSignal.category === "DIVERGENCE") {
    return `⚠️ ${topSignal.message}`;
  }

  if (topSignal.category === "FLOW") {
    return `📊 ${topSignal.message}`;
  }

  return null;
}

function buildFinalAlertLevel(alert: string, signals: MarketSignal[]) {
  const topSignal = signals[0];

  if (topSignal?.level === "강") return "강";
  if (topSignal?.level === "중") return "중";

  return buildAlertLevel(alert);
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return Response.json({ok:false,error:"CRON_SECRET 설정이 필요합니다."},{status:503});
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    const url = new URL(req.url);
    const querySecret = url.searchParams.get("secret") ?? "";
    const isAuthorized = auth === `Bearer ${cronSecret}` || querySecret === cronSecret;

    if (!isAuthorized) {
      return Response.json({ ok: false, error: "UNAUTHORIZED_CRON" }, { status: 401 });
    }
  }

  try {
    const now = new Date();

    const timeStr = normalizeMinuteValue(
      new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now)
    );

    const createdat = getKstDateString(now);
    const minuteKey = `${createdat} ${timeStr}`;
    const parts = kstParts(now);
    const extraHolidays = parseAdditionalHolidays(process.env.MARKET_HOLIDAYS);
    const marketStatus = getKrxMarketStatus(now, extraHolidays);
    const isMarketTime = isRegularObservation(createdat, timeStr, extraHolidays);
    if (!isMarketTime) return Response.json({
      ok:true, saved:false, saveAction:"skipped", saveSkipReason:"OUT_OF_REGULAR_HOURS",
      createdat, time:timeStr, marketSession:marketStatus.session, marketStatus,
      dataAvailability:marketStatus.session === "CLOSED" ? "CLOSED" : "NOT_CONNECTED",
    }, { headers: { "Cache-Control": "no-store" } });

    const [kospiData, kosdaqData, rawFlowData, latestDbRow, latestNormalBreadthRow] = await Promise.all([
      fetchBreadth("0001"),
      fetchBreadth("1001"),
      fetchInvestorFlow(),
      getLatestLogFromSupabase(createdat),
      getLatestNormalBreadthRowFromSupabase(createdat),
    ]);

    let liveUp = kospiData.up + kosdaqData.up;
    let liveDown = kospiData.down + kosdaqData.down;
    let liveFlat = kospiData.flat + kosdaqData.flat;
    let liveTotal = liveUp + liveDown + liveFlat;
    let liveBreadthTransport: "REST_063_066" | "H0UPCNT0" = "REST_063_066";

    // 063/066 REST가 지수 가격은 주면서 시장폭만 0으로 반환하는 경우가 있어
    // 실제 실시간 국내지수 WebSocket(H0UPCNT0)을 1회 조회하고, REST 지수값과 교차검증된 시장만 보완합니다.
    if (liveTotal <= 0) {
      try {
        const wsBreadth = await fetchRealtimeIndexBreadthPair(kospiData.price, kosdaqData.price);
        const before = { up: liveUp, down: liveDown, flat: liveFlat, total: liveTotal };
        const applied: string[] = [];

        if (
          wsBreadth.kospi &&
          wsBreadth.kospi.up + wsBreadth.kospi.down + wsBreadth.kospi.flat > 0
        ) {
          applyRealtimeIndexBreadth(kospiData, wsBreadth.kospi);
          applied.push("0001");
        }

        if (
          wsBreadth.kosdaq &&
          wsBreadth.kosdaq.up + wsBreadth.kosdaq.down + wsBreadth.kosdaq.flat > 0
        ) {
          applyRealtimeIndexBreadth(kosdaqData, wsBreadth.kosdaq);
          applied.push(`KOSDAQ:${wsBreadth.kosdaq.code}`);
        }

        liveUp = kospiData.up + kosdaqData.up;
        liveDown = kospiData.down + kosdaqData.down;
        liveFlat = kospiData.flat + kosdaqData.flat;
        liveTotal = liveUp + liveDown + liveFlat;

        if (applied.length > 0) {
          liveBreadthTransport = "H0UPCNT0";
          console.warn("BREADTH_WS_FALLBACK_APPLIED", {
            applied,
            before,
            after: { up: liveUp, down: liveDown, flat: liveFlat, total: liveTotal },
          });
        } else {
          console.warn("BREADTH_WS_FALLBACK_EMPTY", {
            restTotal: before.total,
            receivedKospi: Boolean(wsBreadth.kospi),
            receivedKosdaq: Boolean(wsBreadth.kosdaq),
          });
        }
      } catch (error) {
        console.warn("BREADTH_WS_FALLBACK_FAILED", { error: String(error) });
      }
    }

    const memoryBreadthRow = getMemoryBreadthFallbackRow();
    const prevNormalRow =
      latestNormalBreadthRow ??
      (isNormalBreadthRow(latestDbRow) ? latestDbRow : null) ??
      (isNormalBreadthRow(memoryBreadthRow) ? memoryBreadthRow : null);
    const prevNormalTotal = getBreadthTotal(prevNormalRow);

    let breadthSource: BreadthSource = "LIVE";
    let breadthFallbackReason =
      liveBreadthTransport === "H0UPCNT0"
        ? "REST 063/066 breadth=0 -> H0UPCNT0 WebSocket live fallback"
        : "";

    let up = liveUp;
    let down = liveDown;
    let flat = liveFlat;

    if (shouldFallbackBreadth(liveTotal, prevNormalTotal) && prevNormalRow) {
      breadthSource = "FALLBACK";
      breadthFallbackReason =
        liveTotal < MIN_NORMAL_BREADTH_TOTAL
          ? `live breadth 합산 총합 비정상/결측: current=${liveTotal}, prev=${prevNormalTotal}`
          : `live breadth 합산 총합 급감: current=${liveTotal}, prev=${prevNormalTotal}`;
      up = toNumber(prevNormalRow.up);
      down = toNumber(prevNormalRow.down);
      flat = toNumber(prevNormalRow.flat);

      console.warn("⚠️ live breadth 급감 감지, 직전 정상값으로 대체:", {
        time: timeStr,
        liveTotal,
        prevNormalTotal,
        live: { up: liveUp, down: liveDown, flat: liveFlat },
        fallback: { up, down, flat },
      });
    }

    const diff = up - down;
    const total = up + down + flat;

    const upRatio = total > 0 ? up / total : 0;
    const downRatio = total > 0 ? down / total : 0;

    const recentRowsFromMemory = memoryRecentRows.slice(-3);
    const recentRows = recentRowsFromMemory.length > 0
      ? recentRowsFromMemory
      : latestDbRow
        ? [
            {
              diff: toNumber(latestDbRow.diff),
              foreignFlow: toNumber(latestDbRow.foreignflow),
              instFlow: toNumber(latestDbRow.instflow),
            },
          ]
        : [];

    const prevDiff = toNumber(latestDbRow?.diff ?? memoryPrevDiff);
    const accel = diff - prevDiff;

    const kospi = kospiData.price > 0 ? kospiData.price : toNumber(prevNormalRow?.kospi ?? latestDbRow?.kospi);
    const kosdaq = kosdaqData.price > 0 ? kosdaqData.price : toNumber(prevNormalRow?.kosdaq ?? latestDbRow?.kosdaq);

    if (breadthSource === "LIVE") {
      rememberBreadthSnapshot(up, down, flat, kospi, kosdaq);
    }

    // GAS 방식과 동일하게 074 LIVE 실패 시에는 직전 정상 수급값을 대체 표시/저장합니다.
    // 대신 marketstate에 FLOW_FALLBACK 마커를 남겨 page.tsx에서 상태를 구분할 수 있게 합니다.
    const flowData = applyGasStyleFlowFallback(rawFlowData, latestDbRow);

    // 수급 필드 확인용 디버그입니다.
    // /api/market/live?debug=flow 호출 시 066 지수 원본 + 074 수급 원본 + fallback 적용 후 값을 함께 확인합니다.
    if (new URL(req.url).searchParams.get("debug") === "flow") {
      return Response.json({
        kospi,
        kosdaq,
        rawKospi: kospiData,
        rawKosdaq: kosdaqData,
        rawFlowData,
        flowData,
        latestDbRow: latestDbRow
          ? {
              time: latestDbRow.time,
              foreignflow: latestDbRow.foreignflow,
              instflow: latestDbRow.instflow,
              indivflow: latestDbRow.indivflow,
              flowpower: latestDbRow.flowpower,
              marketstate: latestDbRow.marketstate,
            }
          : null,
        memoryLastFlow,
        memoryLastBreadth,
        liveBreadthTransport,
        breadthFallbackReason,
      });
    }

    if (hasFlowValue(flowData)) {
      memoryLastFlow = {
        foreign: normalizeFlowDisplayUnit(flowData.foreign),
        inst: normalizeFlowDisplayUnit(flowData.inst),
        indiv: normalizeFlowDisplayUnit(flowData.indiv),
        updatedAt: Date.now(),
      };
    }

    // 화면/DB 저장 단위는 증권사 화면과 같은 억원 단위로 통일합니다.
    // LIVE 수급은 parseFlowFromJson -> normalizeFlowUnit에서 /100 보정 후 억원 단위로 정리됩니다.
    // DB/메모리 폴백 중 과거에 100배로 잘못 저장된 값은 normalizeFlowDisplayUnit에서 보정합니다.
    const foreign = normalizeFlowDisplayUnit(flowData.foreign);
    const inst = normalizeFlowDisplayUnit(flowData.inst);
    const indiv = normalizeFlowDisplayUnit(flowData.indiv);

    const flowPower = foreign + inst;
    const prevFlowPower = toNumber(latestDbRow?.flowpower ?? memoryPrevFlowPower);
    const flowTrend = flowPower - prevFlowPower;
    const flowMomentum = Math.round(prevFlowPower * 0.7 + flowPower * 0.3);

    const baseAlert = buildAlert(diff, accel, upRatio, downRatio);
    const marketTone = buildTone(diff);
    const marketScore = buildMarketScore(diff, upRatio, downRatio);

    const baseSignals = buildSignals(diff, prevDiff, accel, marketScore);
    const flowSignals = buildFlowSignals(
      foreign,
      inst,
      indiv,
      diff,
      accel,
      flowData.source,
      prevFlowPower,
      recentRows
    );
    const signals = sortSignals([...baseSignals, ...flowSignals]);
    const signalAlert = buildSignalAlert(signals);
    const alert = signalAlert ?? baseAlert;
    const baseMarketState = buildMarketState(
      diff,
      accel,
      marketScore,
      flowPower,
      flowTrend,
      Array.isArray(signals) && signals.length > 0 ? signals[0] : null
    );
    const marketState = `${baseMarketState}|FLOW_${flowData.source}|BREADTH_${breadthSource}`;

    const sectorRows = [...parseSectors(kospiData.sectorRaw ?? {},"kospi"),...parseSectors(kosdaqData.sectorRaw ?? {},"kosdaq")];
    let sectorSaveStatus = "skipped";
    const marketData = {
      version: 2, capturedAt: now.toISOString(),
      session: "REGULAR", regime: marketStatus.regime, tradeDate: createdat,
      closeBasis: "REGULAR_SESSION_OBSERVATION", officialCloseVerified: false,
      kospi: indexSnapshot(kospiData.raw,rawFlowData.markets?.kospi,breadthSource === "LIVE"),
      kosdaq: indexSnapshot(kosdaqData.raw,rawFlowData.markets?.kosdaq,breadthSource === "LIVE"),
    };
    const rowToSave: SupabaseLogPayload = {
      market_data: marketData,
      createdat,
      time: timeStr,
      up,
      down,
      flat,
      diff,
      accel,
      upratio: upRatio,
      downratio: downRatio,
      kospi,
      kosdaq,
      foreignflow: foreign,
      instflow: inst,
      indivflow: indiv,
      flowpower: flowPower,
      flowtrend: flowTrend,
      flowmomentum: flowMomentum,
      alert,
      markettone: marketTone,
      marketscore: marketScore,
      marketstate: marketState,
      signals,
    };

    let saveResult: { action: string; id: number | null } = {
      action: "skipped",
      id: null,
    };
    const snapshotInvalidReason = getMarketSnapshotInvalidReason(rowToSave);
    let saveSkipReason = isMarketTime ? snapshotInvalidReason : "OUT_OF_REGULAR_HOURS";

    if (isMarketTime && !snapshotInvalidReason) {
      saveSkipReason = "";
      lastSavedMinute = minuteKey;

      memoryRecentRows.push({
        diff,
        foreignFlow: foreign,
        instFlow: inst,
      });
      memoryRecentRows = memoryRecentRows.slice(-10);

      memoryPrevDiff = diff;
      memoryPrevFlowPower = flowPower;
      if (hasFlowValue({ foreign, inst, indiv })) {
        memoryLastFlow = { foreign, inst, indiv, updatedAt: Date.now() };
      }

      saveResult = await saveLogToSupabase(rowToSave);
      if (sectorRows.length) {
        try {
          await supabaseRequest("/rest/v1/rpc/save_market_sectors", {
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({p_date:createdat,p_time:timeStr,p_captured:now.toISOString(),p_sectors:sectorRows})
          });
          sectorSaveStatus = "saved";
        } catch { sectorSaveStatus = "error"; console.warn("업종 저장 실패: 003_market_research.sql 적용 및 DB 상태를 확인하세요."); }
      }


      console.log("✅ LIVE 저장 처리:", timeStr, saveResult.action, "수급:", flowData.source, "breadth:", breadthSource, {
        foreign,
        inst,
        indiv,
      });
    } else {
      console.warn(isMarketTime ? "⚠️ 비정상 데이터라 저장 생략:" : "⏸️ 정규장 시간이 아니라 저장 생략:", {
        time: timeStr,
        marketSession: isMarketTime ? "REGULAR" : "OUT_OF_REGULAR_HOURS",
        up,
        down,
        flat,
        total,
        liveTotal,
        prevNormalTotal,
        kospi,
        kosdaq,
        flowSource: flowData.source,
        breadthSource,
        breadthFallbackReason,
        snapshotInvalidReason,
        saveSkipReason,
      });
    }

    return Response.json({
      time: timeStr,
      createdat,
      up,
      down,
      flat,
      diff,
      accel,
      upRatio,
      downRatio,
      kospi,
      kosdaq,
      kospiUp: kospiData.up,
      kospiDown: kospiData.down,
      kosdaqUp: kosdaqData.up,
      kosdaqDown: kosdaqData.down,
      marketSession: isMarketTime ? "REGULAR" : "OUT_OF_REGULAR_HOURS",
      liveBreadthTotal: liveTotal,
      savedBreadthTotal: total,
      prevNormalBreadthTotal: prevNormalTotal,
      breadthSource,
      breadthFallbackReason,
      foreign,
      inst,
      indiv,
      foreignFlow: foreign,
      instFlow: inst,
      indivFlow: indiv,
      flowSource: flowData.source,
      rawFlowSource: rawFlowData.source,
      sectorSaveStatus,
      flowPower,
      prevFlowPower,
      flowTrend,
      flowMomentum,
      alert,
      baseAlert,
      topSignal: Array.isArray(signals) && signals.length > 0 ? signals[0] : null,
      marketTone,
      marketScore,
      marketState,
      signals,
      ok: saveResult.action !== "failed",
      error: saveResult.action === "failed" ? "SAVE_FAILED" : undefined,
      market_data: marketData,
      marketStatus,
      saved: ["inserted","updated"].includes(saveResult.action),
      saveAction: saveResult.action,
      snapshotInvalidReason,
      saveSkipReason,
    });
  } catch (error: any) {
    console.error("/api/market/live 전체 처리 실패:", error);

    const now = new Date();
    const timeStr = normalizeMinuteValue(
      new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now)
    );

    return Response.json({
      ok: false,
      error: "LIVE_PROCESS_FAILED",
      detail: error?.message ?? String(error),
      time: timeStr,
      flowSource: "ERROR",
      breadthSource: "SKIPPED",
      saved: false,
      saveAction: "skipped",
      saveSkipReason: "LIVE_PROCESS_FAILED",
    });
  }
}