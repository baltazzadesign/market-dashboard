import { parseDaily, parseHistory, parseSectors, record } from './model';
export type Session = { baseUrl: string; cookie: string; expiresAt: number };
export class ApiError extends Error { constructor(message: string, public status = 0) { super(message); this.name = 'ApiError'; } }
export function normalizeOrigin(input: string, allowLocalHttp = false) {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('https://로 시작하는 서버 주소를 입력해 주세요.'); }
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('경로·로그인 정보 없이 서버 주소만 입력해 주세요.');
  const local = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[::1\])$/.test(url.hostname);
  if (url.protocol !== 'https:' && !(allowLocalHttp && local && url.protocol === 'http:')) throw new Error('HTTPS 서버 주소가 필요합니다.');
  return url.origin;
}
type Transport = typeof fetch;
export class BaltaClient {
  constructor(public baseUrl: string, private session: Session | null, private transport: Transport = fetch) {}
  private async request(path: string, options: { signal?: AbortSignal; body?: object; auth?: boolean; method?: 'PUT' } = {}) {
    if (options.auth !== false && (!this.session || this.session.baseUrl !== this.baseUrl || this.session.expiresAt <= Date.now())) throw new ApiError('로그인이 만료되었습니다. 다시 로그인해 주세요.', 401);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (options.signal?.aborted) controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 20_000);
    try {
      const response = await this.transport(this.baseUrl + path, {
        method: options.method || (options.body ? 'POST' : 'GET'), signal: controller.signal, redirect: 'error', credentials: 'omit',
        headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.auth !== false && this.session ? { Cookie: this.session.cookie } : {}) },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      if (response.redirected || (response.url && new URL(response.url).origin !== this.baseUrl)) throw new ApiError('서버의 최종 주소를 설정에서 확인해 주세요.');
      if (response.status === 401) throw new ApiError(options.auth === false ? '접근 코드가 일치하지 않습니다.' : '로그인이 만료되었습니다. 다시 로그인해 주세요.', 401);
      if (response.status === 404) throw new ApiError('현재 서버에 이 기능이 아직 배포되지 않았습니다.', 404);
      if (response.status === 429) throw new ApiError('요청이 많습니다. 잠시 후 다시 조회해 주세요.', 429);
      if (response.status === 409) throw new ApiError('다른 화면에서 메모가 변경됐습니다. 작성한 내용을 복사한 뒤 다시 불러와 주세요.', 409);
      if (!response.ok) throw new ApiError(`서버에서 데이터를 읽지 못했습니다. (${response.status})`, response.status);
      const type = response.headers.get('content-type') || '';
      if (!type.includes('json')) throw new ApiError('JSON 대신 웹 페이지가 반환되었습니다. 서버 주소와 접근 권한을 확인해 주세요.');
      return { data: await response.json() as unknown, response };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (options.signal?.aborted) throw error;
      if (controller.signal.aborted) throw new ApiError('응답 시간이 초과되었습니다. 다시 시도해 주세요.');
      throw new ApiError('서버에 연결하지 못했습니다. 네트워크와 서버 주소를 확인해 주세요.');
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
  }
  async login(code: string): Promise<Session> {
    const { data, response } = await this.request('/api/auth/login', { body: { code }, auth: false });
    if (record(data).ok !== true) throw new ApiError('로그인 응답을 확인해 주세요.');
    // The inspected backend explicitly sets access=accessCode(), maxAge=86400.
    // RN may hide Set-Cookie. Only after a successful server check, reproduce that
    // exact legacy cookie contract. Never embed a default access code in the app.
    const issued = response.headers.get('set-cookie')?.match(/(?:^|,\s*)access=([^;\r\n]*)/)?.[1];
    return { baseUrl: this.baseUrl, cookie: `access=${issued ?? encodeURIComponent(code)}`, expiresAt: Date.now() + 86_400_000 };
  }
  async logout() { await this.request('/api/auth/logout', { body: {} }); }
  async daily(date: string, signal?: AbortSignal) { return parseDaily((await this.request('/api/market/daily?date=' + encodeURIComponent(date), { signal })).data, date); }
  async history(month: string, signal?: AbortSignal) { return parseHistory((await this.request(`/api/market/history?month=${encodeURIComponent(month)}&months=3`, { signal })).data, month); }
  async sectors(date: string, signal?: AbortSignal) { return parseSectors((await this.request('/api/market/sectors?date=' + encodeURIComponent(date), { signal })).data, date); }
  async terminal<T>(path: string, signal?: AbortSignal): Promise<T> {
    if (!/^\/api\/market\/(terminal|ranking|news|pulse|notes|stocks|index-candles)(\?|$)/.test(path)) throw new ApiError('지원하지 않는 조회입니다.');
    const { data } = await this.request(path, { signal });
    if (record(data).ok === false) throw new ApiError(String(record(data).error || '조회하지 못했습니다.'));
    return data as T;
  }
  async saveNote(date: string, note: { body: string; tags: string; version: number }) {
    return (await this.request('/api/market/notes?date=' + encodeURIComponent(date), { method: 'PUT', body: note })).data as { note: import('./terminal').Note };
  }
}
