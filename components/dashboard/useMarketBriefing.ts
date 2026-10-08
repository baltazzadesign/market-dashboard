'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isValidDate, kstParts, record } from '@/lib/balta-model';
import { briefingDates, briefingNews, type Briefing } from '@/lib/market-briefing';
import type { NewsItem } from '@/lib/terminal-model';

type ResponseData = Briefing & { dates: string[] };
type State = { date: string; data: ResponseData | null; loading: boolean; error: string; news: NewsItem[]; newsMessage: string };
export function useMarketBriefing(initialDate: string) {
  const [today, setToday] = useState(() => kstParts().date);
  const [date, setDate] = useState(() => isValidDate(initialDate) && initialDate <= kstParts().date && initialDate >= '2000-01-01' ? initialDate : kstParts().date);
  const [auto, setAuto] = useState(true);
  const [state, setState] = useState<State>({ date: '', data: null, loading: true, error: '', news: [], newsMessage: '' });
  const pending = useRef<AbortController | null>(null), version = useRef(0);

  const refresh = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController(), ticket = ++version.current;
    pending.current = controller;
    const active = () => !controller.signal.aborted && ticket === version.current;
    setState(old => ({ ...(old.date === date ? old : { date, data: null, news: [], newsMessage: '' }), loading: true, error: '' }));
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(28000)]);
    const get = async (url: string) => {
      const response = await fetch(url, { cache: 'no-store', signal });
      if (response.status === 401) { window.location.assign('/login'); throw new Error('로그인이 필요합니다.'); }
      const data = record(await response.json());
      if (!response.ok || data.ok !== true) throw new Error(typeof data.error === 'string' ? data.error : '데이터를 불러오지 못했습니다.');
      return data;
    };
    const newsTask = date === kstParts().date ? get('/api/market/news') : Promise.resolve(null);
    const [briefing, news] = await Promise.allSettled([get('/api/market/briefing?date=' + date), newsTask]);
    if (!active()) return;
    const newsData = news.status === 'fulfilled' ? news.value : null;
    const items = newsData && Array.isArray(newsData.items) ? briefingNews(newsData.items as NewsItem[], date) : [];
    const newsMessage = date !== kstParts().date ? '과거 뉴스 아카이브는 아직 연결되지 않았습니다.'
      : news.status === 'rejected' ? '뉴스 연결이 지연되고 있습니다. 새로고침으로 다시 조회할 수 있습니다.'
      : newsData?.stale ? '뉴스 연결이 지연되어 이전에 조회한 오늘의 기사를 표시합니다.'
      : !items.length ? '오늘 발행된 뉴스가 아직 조회되지 않았습니다.' : '';
    setState(old => ({ date, data: briefing.status === 'fulfilled' ? briefing.value as ResponseData : old.date === date ? old.data : null,
      loading: false, error: briefing.status === 'rejected' ? briefing.reason instanceof Error ? briefing.reason.message : '브리핑을 불러오지 못했습니다.' : '', news: items, newsMessage }));
    pending.current = null;
  }, [date]);

  useEffect(() => { void refresh(); return () => { pending.current?.abort(); version.current++; }; }, [refresh]);
  useEffect(() => {
    const tick = () => {
      const now = kstParts(); setToday(now.date);
      if (auto && date === now.date && !document.hidden && !pending.current) void refresh();
    };
    const timer = window.setInterval(tick, 60000);
    return () => window.clearInterval(timer);
  }, [auto, date, refresh]);

  function selectDate(next: string) {
    if (!isValidDate(next) || next > today || next < '2000-01-01') return;
    setDate(next);
    const url = new URL(window.location.href); url.searchParams.set('date', next);
    window.history.replaceState(null, '', url.pathname + url.search);
  }
  const current = state.date === date ? state : { date, data: null, loading: true, error: '', news: [], newsMessage: '' };
  const dates = current.data?.today === today ? current.data.dates : briefingDates(today);
  return { ...current, today, dates, auto, setAuto, selectDate, refresh };
}
