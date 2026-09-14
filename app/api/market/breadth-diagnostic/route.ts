import { hasDashboardAccess } from "@/lib/balta-access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KIS_BASE =
  process.env.KIS_BASE ?? "https://openapi.koreainvestment.com:9443";
const CUSTTYPE = process.env.KIS_CUSTTYPE ?? "P";
const FETCH_TIMEOUT_MS = 8000;

type StoredKisToken = {
  access_token?: string;
  expires_at?: string;
};

type AnyRow = Record<string, any>;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return {
    url: url.replace(/\/$/, "").replace(/\/rest\/v1$/, ""),
    key,
  };
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getStoredKisToken() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다."
    );
  }

  const res = await fetchWithTimeout(
    `${config.url}/rest/v1/kis_tokens?select=access_token,expires_at&id=eq.default&limit=1`,
    {
      headers: {
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
      },
    }
  );

  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      `Supabase KIS 토큰 조회 실패 ${res.status}: ${text || res.statusText}`
    );
  }

  if (!text.trim()) {
    throw new Error("Supabase KIS 토큰 응답이 비어 있습니다.");
  }

  const rows = JSON.parse(text) as StoredKisToken[];
  const row = rows?.[0];

  if (!row?.access_token) {
    throw new Error(
      "Supabase kis_tokens에 access_token이 없습니다. 기존 live/cron을 한 번 실행한 뒤 다시 테스트해 주세요."
    );
  }

  if (row.expires_at) {
    const expiresAt = new Date(row.expires_at).getTime();

    if (Number.isFinite(expiresAt) && expiresAt <= Date.now() + 60_000) {
      throw new Error(
        "Supabase에 저장된 KIS 토큰이 만료됐습니다. 기존 live/cron을 한 번 실행한 뒤 다시 테스트해 주세요."
      );
    }
  }

  return String(row.access_token);
}


const COUNT_FIELDS = ["ascn_issu_cnt", "down_issu_cnt", "stnr_issu_cnt", "uplm_issu_cnt", "lslm_issu_cnt"];

function inspectOutput(value: unknown) {
  const rows = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return {
    shape: Array.isArray(value) ? "array" : value === null ? "null" : typeof value,
    rowCount: rows.length,
    samples: rows.slice(0, 3).map((item: any) => {
      const row = item && typeof item === "object" ? item : {};
      const counts = Object.fromEntries(COUNT_FIELDS.map(key => [key, {
        present: Object.prototype.hasOwnProperty.call(row, key),
        raw: row[key] ?? null,
      }]));
      const values = COUNT_FIELDS.slice(0, 3).map(key => {
        const raw = row[key];
        if ((typeof raw !== "string" && typeof raw !== "number") || String(raw).trim() === "") return null;
        const n = Number(String(raw).replace(/,/g, ""));
        return Number.isInteger(n) && n >= 0 ? n : null;
      });
      return {
        keys: Object.keys(row), counts,
        price: row.bstp_nmix_prpr ?? null,
        status: values.some(n => n === null) ? "MISSING_OR_INVALID_FIELDS"
          : values.every(n => n === 0) ? "EXPLICIT_ZERO" : "NONZERO_COUNTS",
      };
    }),
  };
}

async function probe(token: string, code: "0001" | "1001", api: "063" | "066") {
  const category = api === "066";
  const params = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: code });
  if (category) {
    params.set("FID_COND_SCR_DIV_CODE", "20214");
    params.set("FID_MRKT_CLS_CODE", code === "0001" ? "K" : "Q");
    params.set("FID_BLNG_CLS_CODE", "0");
  }
  const trId = category ? "FHPUP02140000" : "FHPUP02100000";
  const endpoint = "/uapi/domestic-stock/v1/quotations/" + (category ? "inquire-index-category-price" : "inquire-index-price");
  const request = { api, market: code === "0001" ? "KOSPI" : "KOSDAQ", trId, endpoint, params: Object.fromEntries(params) };
  try {
    const res = await fetchWithTimeout(KIS_BASE + endpoint + "?" + params, {
      headers: {
        "content-type": "application/json; charset=utf-8", authorization: "Bearer " + token,
        appkey: process.env.KIS_APPKEY!, appsecret: process.env.KIS_APPSECRET!, tr_id: trId, custtype: CUSTTYPE,
      },
    });
    let data: any;
    try { data = await res.json(); }
    catch { return { request, httpStatus: res.status, status: "NON_JSON_RESPONSE" }; }
    const ok = res.ok && String(data?.rt_cd) === "0";
    return {
      request, httpStatus: res.status, status: ok ? "API_SUCCESS" : "API_ERROR",
      rt_cd: data?.rt_cd ?? null, msg_cd: data?.msg_cd ?? null,
      tr_cont: res.headers.get("tr_cont"),
      outputs: { output: inspectOutput(data?.output), output1: inspectOutput(data?.output1), output2: inspectOutput(data?.output2) },
    };
  } catch {
    return { request, status: "NETWORK_OR_TIMEOUT_ERROR" };
  }
}

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!hasDashboardAccess(request)) return Response.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401, headers });
  if (!process.env.KIS_APPKEY || !process.env.KIS_APPSECRET) return Response.json({ ok: false, error: "KIS 앱 설정이 없습니다." }, { status: 503, headers });
  let token: string;
  try { token = await getStoredKisToken(); }
  catch { return Response.json({ ok: false, error: "저장된 KIS 토큰을 사용할 수 없습니다. 대시보드 새로고침 후 다시 확인하세요." }, { status: 503, headers }); }
  const results = [];
  // Four bounded requests, sequentially, to reduce bursts alongside the collector.
  for (const code of ["0001", "1001"] as const) {
    for (const api of ["063", "066"] as const) results.push(await probe(token, code, api));
  }
  return Response.json({
    ok: results.every(result => result.status === "API_SUCCESS"),
    capturedAt: new Date().toISOString(),
    purpose: "063·066 원본 종목 수 진단. DB 저장 및 토큰 발급 없음.",
    interpretation: {
      EXPLICIT_ZERO: "응답에 상승·하락·보합 필드가 모두 존재하며 실제 값이 0입니다. API_SUCCESS 여부와 함께 확인하세요.",
      MISSING_OR_INVALID_FIELDS: "필드 누락 또는 숫자 형식 문제입니다. 실제 0과 구분해야 합니다.",
      NONZERO_COUNTS: "0이 아닌 종목 수가 있습니다. 전체 시장 데이터의 유효성이 확인된 것은 아닙니다.",
    },
    results,
  }, { headers });
}
