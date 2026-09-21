import { hasDashboardAccess } from '@/lib/balta-access';
import type { NewsItem } from '@/lib/terminal-model';
export const dynamic = 'force-dynamic';
let cached: { expires: number; items: NewsItem[]; asOf: string } | null = null;
let pending: Promise<{ items: NewsItem[]; asOf: string }> | null = null;
function text(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}
async function feed() {
  if (cached && cached.expires > Date.now()) return cached;
  if (pending) return pending;
  pending = (async () => {
    // Official publisher feed directory: https://www.hankyung.com/feed
    const response = await fetch('https://www.hankyung.com/feed/finance', { cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!response.ok) throw new Error('News unavailable');
    const xml = await response.text(), items: NewsItem[] = [];
    for (const block of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
      const value = (tag: string) => text(block[1].match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'i'))?.[1] ?? '');
      const title = value('title'), link = value('link'), date = Date.parse(value('pubDate'));
      try {
        const url = new URL(link);
        if (!title || url.protocol !== 'https:' || !/(^|\.)hankyung\.com$/.test(url.hostname)) continue;
        items.push({ title, url: url.href, publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : '', source: '한국경제' });
      } catch {}
      if (items.length === 20) break;
    }
    if (!items.length) throw new Error('Empty feed');
    cached = { items, asOf: new Date().toISOString(), expires: Date.now() + 300_000 };
    return cached;
  })().finally(() => { pending = null; });
  return pending;
}
export async function GET(request: Request) {
  if (!hasDashboardAccess(request)) return Response.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 });
  try { const data = await feed(); return Response.json({ ok: true, items: data.items, asOf: data.asOf }, { headers: { 'Cache-Control': 'private, no-store' } }); }
  catch { return Response.json({ ok: false, items: [], error: '뉴스를 불러오지 못했습니다. 다시 조회해 주세요.' }, { status: 503 }); }
}
