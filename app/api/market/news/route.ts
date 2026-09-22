import { hasDashboardAccess } from '@/lib/balta-access';
import { readKisNews, readRssNews } from '@/lib/terminal-news';
import type { NewsFeed } from '@/lib/terminal-model';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
let cached: { expires: number; fetched: number; data: NewsFeed } | null = null;
let pending: Promise<NewsFeed> | null = null;
async function feed(): Promise<NewsFeed> {
  if (cached && cached.expires > Date.now()) return cached.data;
  if (pending) return pending;
  pending = (async () => {
    try {
      // Independent official sources; a blocked RSS must not hide KIS headlines.
      const items = await Promise.any([
        readKisNews(),
        readRssNews('https://www.hankyung.com/feed/finance', '한국경제', 'hankyung.com'),
        readRssNews('https://www.mk.co.kr/rss/50200011/', '매일경제', 'mk.co.kr'),
      ]);
      const data: NewsFeed = { ok: true, items, asOf: new Date().toISOString(), stale: false };
      cached = { expires: Date.now() + 300_000, fetched: Date.now(), data };
      return data;
    } catch {
      if (cached && Date.now() - cached.fetched < 6 * 60 * 60 * 1000) {
        cached = { ...cached, expires: Date.now() + 60_000, data: { ...cached.data, stale: true } };
        return cached.data;
      }
      throw new Error('NEWS_UNAVAILABLE');
    }
  })().finally(() => { pending = null; });
  return pending;
}
export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  try { return Response.json(await feed(), { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return Response.json({ ok: false, items: [], error: '뉴스 제공처 연결이 지연되고 있습니다. 잠시 후 다시 조회해 주세요.' }, { status: 503 }); }
}
