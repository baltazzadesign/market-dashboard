import { kisTerminal, outputRows } from './kis-terminal';
import type { NewsItem } from './terminal-model';

export function cleanNewsText(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
}
export function parseNewsRss(xml: string, source: string, host: string): NewsItem[] {
  const items: NewsItem[] = [], seen = new Set<string>();
  for (const block of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const value = (tag: string) => cleanNewsText(block[1].match(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>', 'i'))?.[1] ?? '');
    try {
      const title = value('title'), url = new URL(value('link')), date = Date.parse(value('pubDate'));
      if (!title || !['https:', 'http:'].includes(url.protocol) || !(url.hostname === host || url.hostname.endsWith('.' + host)) || seen.has(url.href)) continue;
      items.push({ title, url: url.href, publishedAt: Number.isFinite(date) ? new Date(date).toISOString() : '', source, linkKind: 'article' });
      seen.add(url.href);
    } catch {}
    if (items.length === 20) break;
  }
  return items;
}
export async function readRssNews(url: string, source: string, host: string) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(7000), headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!response.ok) throw new Error('RSS_UNAVAILABLE');
  const xml = await response.text();
  if (xml.length > 2_000_000) throw new Error('RSS_TOO_LARGE');
  const items = parseNewsRss(xml, source, host);
  if (!items.length) throw new Error('RSS_EMPTY');
  return items;
}
export async function readKisNews(): Promise<NewsItem[]> {
  // Official examples_llm/domestic_stock/news_title/chk_news_title.py: blanks = latest/all.
  const body = await kisTerminal('/uapi/domestic-stock/v1/quotations/news-title', 'FHKST01011800', {
    FID_NEWS_OFER_ENTP_CODE: '', FID_COND_MRKT_CLS_CODE: '', FID_INPUT_ISCD: '', FID_TITL_CNTT: '',
    FID_INPUT_DATE_1: '', FID_INPUT_HOUR_1: '', FID_RANK_SORT_CLS_CODE: '', FID_INPUT_SRNO: '',
  }, 300_000);
  const seen = new Set<string>();
  const items = outputRows(body.output).flatMap(row => {
    const title = cleanNewsText(String(row.hts_pbnt_titl_cntt || ''));
    if (!title || seen.has(title)) return [];
    seen.add(title);
    const day = String(row.data_dt || ''), time = String(row.data_tm || '').padStart(6, '0');
    const timestamp = /^\d{8}$/.test(day) && /^\d{6}$/.test(time)
      ? Date.parse(`${day.slice(0,4)}-${day.slice(4,6)}-${day.slice(6)}T${time.slice(0,2)}:${time.slice(2,4)}:${time.slice(4)}+09:00`) : NaN;
    // This API provides headlines, not article URLs. Explicitly label the search link.
    return [{ title, url: 'https://search.naver.com/search.naver?where=news&query=' + encodeURIComponent(title),
      publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '',
      source: String(row.dorg || 'KIS 시황·공시'), linkKind: 'search' as const }];
  }).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 20);
  if (!items.length) throw new Error('KIS_NEWS_EMPTY');
  return items;
}
