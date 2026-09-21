// Read-only KIS additions. Reuses the token stored by the existing collector.
// Contract source: github.com/koreainvestment/open-trading-api/examples_llm
import { record } from './balta-model';

type CacheEntry = { expires: number; value: Promise<Record<string, unknown>> };
const cache = new Map<string, CacheEntry>();
let queue: Promise<unknown> = Promise.resolve();
let tokenValue = '', tokenUntil = 0;
let tokenPromise: Promise<string> | null = null;

async function storedToken(): Promise<string> {
  if (tokenValue && Date.now() < tokenUntil) return tokenValue;
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
    const base = process.env.SUPABASE_URL?.replace(/\/$/, '').replace(/\/rest\/v1$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key || !process.env.KIS_APPKEY || !process.env.KIS_APPSECRET) throw new Error('시장 조회 연결을 확인해 주세요.');
    const response = await fetch(base + '/rest/v1/kis_tokens?select=access_token,expires_at&id=eq.default&limit=1', {
      headers: { apikey: key, authorization: 'Bearer ' + key }, cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('시장 조회 인증을 읽지 못했습니다.');
    const rows = await response.json();
    const row = record(Array.isArray(rows) ? rows[0] : null);
    const expires = Date.parse(String(row.expires_at ?? ''));
    if (typeof row.access_token !== 'string' || !row.access_token || (Number.isFinite(expires) && expires <= Date.now() + 60_000)) throw new Error('시장 조회 인증 갱신을 기다리고 있습니다.');
    tokenValue = row.access_token;
    tokenUntil = Math.min(Date.now() + 60_000, Number.isFinite(expires) ? expires - 60_000 : Infinity);
    return tokenValue;
  })().finally(() => { tokenPromise = null; });
  return tokenPromise;
}

export async function kisTerminal(path: string, trId: string, params: Record<string, string>, ttl = 60_000) {
  const key = path + '?' + new URLSearchParams(params);
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.value;
  const value = (async () => {
    const token = await storedToken();
    const work = queue.catch(() => {}).then(async () => {
      const response = await fetch((process.env.KIS_BASE || 'https://openapi.koreainvestment.com:9443') + key, {
        headers: { 'content-type': 'application/json; charset=utf-8', authorization: 'Bearer ' + token,
          appkey: process.env.KIS_APPKEY!, appsecret: process.env.KIS_APPSECRET!, tr_id: trId, custtype: process.env.KIS_CUSTTYPE || 'P' },
        cache: 'no-store', signal: AbortSignal.timeout(8000),
      });
      const body = record(await response.json());
      if (!response.ok || String(body.rt_cd) !== '0') throw new Error('현재 시세를 받지 못했습니다. 잠시 후 다시 조회해 주세요.');
      return body;
    });
    queue = work.catch(() => {}).then(() => new Promise(resolve => setTimeout(resolve, 180)));
    return work;
  })();
  cache.set(key, { expires: Date.now() + ttl, value });
  if (cache.size > 100) for (const [k, entry] of cache) if (entry.expires < Date.now()) cache.delete(k);
  try { return await value; } catch (error) { cache.set(key, { expires: Date.now() + 10_000, value }); throw error; }
}

export const outputRows = (value: unknown) => (Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : []).map(record);
