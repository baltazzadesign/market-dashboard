export const KRX_AFTER_MARKET_EFFECTIVE_DATE = "2026-09-14";

// 2026-09-14 live H0STCNT0 payload verification:
// 47 fields per trade record, with MARKET_CLS_CODE observed at index 46.
// Official sample may still expose the previous 46-field layout.
export const CURRENT_H0STCNT0_COLUMNS = [
  "MKSC_SHRN_ISCD", "STCK_CNTG_HOUR", "STCK_PRPR", "PRDY_VRSS_SIGN",
  "PRDY_VRSS", "PRDY_CTRT", "WGHN_AVRG_STCK_PRC", "STCK_OPRC",
  "STCK_HGPR", "STCK_LWPR", "ASKP1", "BIDP1", "CNTG_VOL", "ACML_VOL",
  "ACML_TR_PBMN", "SELN_CNTG_CSNU", "SHNU_CNTG_CSNU", "NTBY_CNTG_CSNU",
  "CTTR", "SELN_CNTG_SMTN", "SHNU_CNTG_SMTN", "CCLD_DVSN", "SHNU_RATE",
  "PRDY_VOL_VRSS_ACML_VOL_RATE", "OPRC_HOUR", "OPRC_VRSS_PRPR_SIGN",
  "OPRC_VRSS_PRPR", "HGPR_HOUR", "HGPR_VRSS_PRPR_SIGN", "HGPR_VRSS_PRPR",
  "LWPR_HOUR", "LWPR_VRSS_PRPR_SIGN", "LWPR_VRSS_PRPR", "BSOP_DATE",
  "NEW_MKOP_CLS_CODE", "TRHT_YN", "ASKP_RSQN1", "BIDP_RSQN1",
  "TOTAL_ASKP_RSQN", "TOTAL_BIDP_RSQN", "VOL_TNRT",
  "PRDY_SMNS_HOUR_ACML_VOL", "PRDY_SMNS_HOUR_ACML_VOL_RATE",
  "HOUR_CLS_CODE", "MRKT_TRTM_CLS_CODE", "VI_STND_PRC",
  "MARKET_CLS_CODE"
];

export function parseSymbolConfig(value) {
  const items = String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((item) => {
      const [symbolRaw, marketRaw] = item.split(":").map((v) => v?.trim());
      const symbol = String(symbolRaw ?? "");
      const market = String(marketRaw ?? "").toUpperCase();
      if (!/^\d{6}$/.test(symbol)) throw new Error(`잘못된 종목코드: ${symbol || item}`);
      if (!['KOSPI','KOSDAQ'].includes(market)) throw new Error(`시장 구분 필요: ${item} (예: 005930:KOSPI)`);
      return { symbol, market };
    });

  if (items.length === 0) throw new Error('KIS_AFTER_MARKET_SYMBOLS가 비어 있습니다.');
  if (items.length > 40) throw new Error(`KIS WebSocket 구독은 최대 40개입니다. 현재 ${items.length}개입니다.`);

  const dedup = new Map();
  for (const item of items) dedup.set(item.symbol, item);
  return [...dedup.values()];
}

export function parseColumnsOverride(value) {
  const columns = String(value ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  return columns.length ? columns : null;
}

export function extractCcnlKrxColumnsFromPython(source) {
  const text = String(source ?? "");
  const fnStart = text.indexOf('def ccnl_krx(');
  if (fnStart < 0) return null;
  const nextFn = text.indexOf('\ndef ', fnStart + 1);
  const block = text.slice(fnStart, nextFn > fnStart ? nextFn : undefined);
  const marker = block.indexOf('columns = [');
  if (marker < 0) return null;
  const arrayText = block.slice(marker, block.indexOf(']\n', marker) + 1);
  const columns = [...arrayText.matchAll(/["']([A-Z0-9_]+)["']/g)].map((m) => m[1]);
  return columns.length ? columns : null;
}

export function hasAfterMarketSchema(columns) {
  return Array.isArray(columns) && columns.includes('MARKET_CLS_CODE');
}

export function payloadToRecord(payload, columns) {
  const values = String(payload ?? '').split('^');
  const record = {};
  for (let i = 0; i < columns.length && i < values.length; i += 1) record[columns[i]] = values[i];
  return { record, fieldCount: values.length, schemaCount: columns.length };
}

export function buildObservedAt(bsopDate, hhmmss) {
  const d = String(bsopDate ?? '');
  const t = String(hhmmss ?? '');
  if (!/^\d{8}$/.test(d) || !/^\d{6}$/.test(t)) return null;
  const iso = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${t.slice(0,2)}:${t.slice(2,4)}:${t.slice(4,6)}+09:00`;
  const parsed = new Date(iso);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function formatKstLocalIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((x) => x.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+09:00`;
}

export function splitH0stcnt0Frame(raw) {
  const parts = String(raw ?? '').split('|');
  if (parts.length < 4 || parts[1] !== 'H0STCNT0') return null;
  const values = String(parts[3] ?? '').split('^');
  return {
    trId: parts[1],
    itemCount: Number(parts[2] ?? 0),
    payload: parts[3],
    values,
    symbol: String(values[0] ?? ''),
  };
}

export function buildProbeSnapshot(raw, columns = CURRENT_H0STCNT0_COLUMNS, receivedAt = new Date()) {
  const frame = splitH0stcnt0Frame(raw);
  if (!frame) return null;
  return {
    receivedAt: receivedAt.toISOString(),
    receivedAtKst: formatKstLocalIso(receivedAt),
    trId: frame.trId,
    symbol: frame.symbol,
    fieldCount: frame.values.length,
    knownSchemaCount: Array.isArray(columns) ? columns.length : 0,
    schemaReady: hasAfterMarketSchema(columns),
    values: frame.values,
  };
}

function hhmmssFromKstIso(value) {
  const match = String(value ?? '').match(/T(\d{2}:\d{2}:\d{2})/);
  return match?.[1] ?? '';
}

function dominant(values) {
  const counts = new Map();
  for (const value of values) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  let bestValue = '';
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) { bestValue = value; bestCount = count; }
  }
  return { value: bestValue, count: bestCount, ratio: values.length ? bestCount / values.length : 0 };
}

// Diagnostic only. This never changes schema or enables persistence.
export function rankMarketClsCodeCandidates(samples, transition = '16:00:00') {
  const usable = Array.isArray(samples) ? samples.filter((x) => Array.isArray(x?.values)) : [];
  const before = usable.filter((x) => hhmmssFromKstIso(x.receivedAtKst) < transition);
  const after = usable.filter((x) => hhmmssFromKstIso(x.receivedAtKst) >= transition);
  const maxFields = Math.max(0, ...usable.map((x) => x.values.length));
  const rows = [];

  for (let index = 0; index < maxFields; index += 1) {
    const beforeValues = before.map((x) => x.values[index]).filter((v) => v !== undefined);
    const afterValues = after.map((x) => x.values[index]).filter((v) => v !== undefined);
    if (!beforeValues.length || !afterValues.length) continue;
    const b = dominant(beforeValues);
    const a = dominant(afterValues);
    if (a.value !== '3') continue;

    let score = a.ratio * 60;
    if (b.value !== '3') score += 25;
    if (['1','2','5'].includes(b.value)) score += 10;
    if (b.ratio >= 0.8) score += 5;
    rows.push({
      index,
      score: Math.round(score * 100) / 100,
      before: b,
      after: a,
      beforeSamples: beforeValues.length,
      afterSamples: afterValues.length,
    });
  }
  return rows.sort((a, b) => b.score - a.score || a.index - b.index);
}

export function mapAfterMarketQuote(payload, columns, symbolMarket) {
  if (!hasAfterMarketSchema(columns)) return { ok: false, reason: 'SCHEMA_NOT_READY' };
  const { record, fieldCount, schemaCount } = payloadToRecord(payload, columns);
  if (String(record.MARKET_CLS_CODE ?? '') !== '3') return { ok: false, reason: 'NOT_AFTER_MARKET', fieldCount, schemaCount };

  const symbol = String(record.MKSC_SHRN_ISCD ?? '');
  const market = symbolMarket.get(symbol);
  if (!market) return { ok: false, reason: 'UNTRACKED_SYMBOL', fieldCount, schemaCount };

  const tradeDateRaw = String(record.BSOP_DATE ?? '');
  const tradeDate = /^\d{8}$/.test(tradeDateRaw)
    ? `${tradeDateRaw.slice(0,4)}-${tradeDateRaw.slice(4,6)}-${tradeDateRaw.slice(6,8)}`
    : '';
  if (tradeDate < KRX_AFTER_MARKET_EFFECTIVE_DATE) return { ok: false, reason: 'PRE_EFFECTIVE_DATE', fieldCount, schemaCount };

  const observedAt = buildObservedAt(record.BSOP_DATE, record.STCK_CNTG_HOUR);
  const price = Number(record.STCK_PRPR);
  if (!tradeDate || !observedAt || !Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: 'INVALID_QUOTE', fieldCount, schemaCount };
  }

  return {
    ok: true,
    fieldCount,
    schemaCount,
    row: {
      trade_date: tradeDate,
      market,
      symbol,
      venue: 'KRX',
      session: 'KRX_AFTER_MARKET',
      observed_at: observedAt,
      price,
      // KIS cumulative volume/turnover semantics across the new session are not yet
      // verified. Keep NULL until the official field semantics are confirmed.
      volume: null,
      turnover: null,
      regular_close: null,
      regular_close_verified: false,
      source: 'KIS:H0STCNT0:MARKET_CLS_CODE=3',
    },
  };
}
