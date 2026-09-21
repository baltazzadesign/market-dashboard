"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatNumber as n } from '@/lib/balta-model';
import type { MarketPulse } from '@/lib/market-pulse';
import type { NewsFeed, Quote, Ranking, StockDirectory } from '@/lib/terminal-model';
import { Icon } from './Icon';
import { useTerminalData } from './useTerminalData';

export function PulseDial({ pulse }: { pulse: MarketPulse }) {
  const score = pulse.score == null ? null : Math.max(0, Math.min(100, pulse.score));
  return <Link href="/pulse" className="terminal-panel terminal-pulse" aria-label="Market Pulse 상세 분석"><div><h2>Market Pulse</h2><svg viewBox="0 0 160 104" className="terminal-pulse-svg" role="img" aria-label={score == null ? '점수 산출 대기' : '시장점수 ' + score}>
    <defs><linearGradient id="terminal-gold-arc" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#d7a339"/><stop offset=".55" stopColor="#edc567"/><stop offset="1" stopColor="#fff0c3"/></linearGradient></defs>
    <path d="M20 85 A62 62 0 1 1 140 85" fill="none" stroke="#222523" strokeWidth="13" strokeLinecap="round" pathLength="100"/>
    {score != null && <path d="M20 85 A62 62 0 1 1 140 85" fill="none" stroke="url(#terminal-gold-arc)" strokeWidth="13" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(.1, score)} 100`}/>}
    <text x="80" y="67" textAnchor="middle" className="terminal-dial-score">{score ?? '—'}</text><text x="80" y="91" textAnchor="middle" className="terminal-dial-label">{pulse.regime}</text>
  </svg></div><dl className="terminal-pulse-factors">{pulse.factors.map(f => <div key={f.name} title={f.detail}><dt>{f.name.replace('외국인·기관 수급', '외인·기관').replace('시장폭 확산', '시장폭').replace('KOSPI·KOSDAQ 방향', '지수 방향').replace('장중 가속·변곡', '가속·변곡')}</dt><dd>{f.value == null ? '—' : n(50 + f.value * 50)}</dd></div>)}</dl></Link>;
}
export function StockRanking({ expanded = false, initialQuery = '' }: { expanded?: boolean; initialQuery?: string }) {
  const [sort, setSort] = useState('up'), [market, setMarket] = useState('all'), [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery.trim());
  useEffect(() => { const timer = setTimeout(() => setDebounced(query.trim()), 300); return () => clearTimeout(timer); }, [query]);
  const searching = expanded && !!query.trim();
  const directory = useTerminalData<StockDirectory>(expanded && debounced ? '/api/market/stocks?' + new URLSearchParams({ q: debounced, market }) : null, 0);
  const feed = useTerminalData<Ranking>('/api/market/ranking?' + new URLSearchParams({ sort, market }));
  useEffect(() => { setQuery(initialQuery); }, [initialQuery]);
  const rows = feed.data?.rows ?? [];
  return <section className={'terminal-panel terminal-rank' + (expanded ? ' terminal-rank-expanded' : '')}><div className="terminal-panel-heading"><h2>{expanded ? '종목 스캐너' : '상위 등락 종목'}</h2>{!expanded && <Link href="/research?tab=scanner">전체보기 <Icon name="right" size={12}/></Link>}</div>
    <div className="terminal-segments">{[['up', '상승률'], ['down', '하락률'], ['turnover', '거래대금'], ['volume', '거래량']].map(([key, label]) => <button key={key} onClick={() => setSort(key)} className={sort === key ? 'active' : ''} aria-pressed={sort === key}>{label}</button>)}</div>
    {expanded && <div className="terminal-scanner-tools"><label><Icon name="search"/><input aria-label="종목 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="전체 종목명 또는 코드 검색" maxLength={60}/></label>{query && <button className="button small" onClick={() => setQuery('')}>검색 지우기</button>}<select value={market} aria-label="시장 선택" onChange={e => setMarket(e.target.value)}><option value="all">전체 시장</option><option value="kospi">KOSPI</option><option value="kosdaq">KOSDAQ</option></select></div>}
    {searching ? <div className="terminal-stock-table terminal-directory"><div className="terminal-table-header"><span>코드</span><span>종목명</span><span>시장</span><span>상세</span></div>{debounced !== query.trim() || directory.loading ? <div className="terminal-empty">종목 검색 중…</div> : directory.error ? <div className="terminal-empty" role="status"><span>{directory.error}</span><button onClick={directory.refresh}>다시 조회</button></div> : !directory.data?.rows.length ? <div className="terminal-empty">일치하는 종목이 없습니다.</div> : directory.data.rows.map(row => <a className="terminal-stock-row" key={row.code} href={'https://finance.naver.com/item/main.naver?code=' + row.code} target="_blank" rel="noopener noreferrer"><span>{row.code}</span><strong>{row.name}</strong><span>{row.market.toUpperCase()}</span><span>종목 정보 ↗</span></a>)}</div> : <div className="terminal-stock-table"><div className="terminal-table-header"><span>순위</span><span>종목명</span><span>현재가</span><span>{sort === 'volume' ? '거래량' : sort === 'turnover' ? '거래대금' : '등락률'}</span></div>
    {feed.loading && !feed.data ? <div className="terminal-empty">종목 조회 중…</div> : feed.error ? <div className="terminal-empty" role="status"><span>{feed.error}</span><button onClick={feed.refresh}>다시 조회</button></div> : !rows.length ? <div className="terminal-empty">{query ? '조회된 순위 내 일치하는 종목이 없습니다.' : '조회된 종목이 없습니다.'}</div> : rows.slice(0, expanded ? 30 : 5).map((r, i) => <a className="terminal-stock-row" key={r.code} href={'https://finance.naver.com/item/main.naver?code=' + encodeURIComponent(r.code)} target="_blank" rel="noopener noreferrer" aria-label={r.name + ' 종목 정보 새 창'}><span>{i + 1}</span><strong>{r.name}{expanded && <small>{r.code}</small>}</strong><span>{n(r.price)}</span><b className={sort === 'volume' || sort === 'turnover' ? '' : (r.rate ?? 0) > 0 ? 'positive' : (r.rate ?? 0) < 0 ? 'negative' : ''}>{sort === 'volume' ? n(r.volume) : sort === 'turnover' ? (r.turnover == null ? '—' : n(r.turnover / 1e8, 1) + '억') : (r.rate == null ? '—' : n(r.rate, 2, true) + '%')}</b></a>)}</div>
    }
    <p className="terminal-source">{searching ? 'KIS 전체 KOSPI·KOSDAQ 종목 목록 · 최대 30건 · 상세는 네이버 증권' : 'KIS · KRX 순위 · 종목을 누르면 네이버 증권으로 이동'}</p>
  </section>;
}
export function NewsPanel({ expanded = false }: { expanded?: boolean }) {
  const feed = useTerminalData<NewsFeed>('/api/market/news', 300_000);
  return <section className="terminal-panel terminal-news"><div className="terminal-panel-heading"><h2>주요 뉴스</h2><a href="https://www.hankyung.com/finance" target="_blank" rel="noopener noreferrer">전체보기 <Icon name="right" size={12}/></a></div>
    {feed.loading ? <div className="terminal-empty">뉴스 조회 중…</div> : feed.error ? <div className="terminal-empty" role="status"><span>{feed.error}</span><button onClick={feed.refresh}>다시 조회</button></div> : <ul>{feed.data?.items.slice(0, expanded ? 20 : 6).map(item => <li key={item.url}><a href={item.url} target="_blank" rel="noopener noreferrer"><time dateTime={item.publishedAt}>{item.publishedAt ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(item.publishedAt)) : '—'}</time><span title={item.title}>{item.title}</span></a></li>)}</ul>}<p className="terminal-source">한국경제 · 제목을 누르면 원문으로 이동</p>
  </section>;
}
export function IndicatorTable({ rows }: { rows: Quote[] }) {
  return <section className="terminal-panel terminal-indicators"><div className="terminal-panel-heading"><h2>주요 시장 지표</h2></div><div className="terminal-indicator-head"><span>지표</span><span>현재값</span><span>전일대비</span><span>등락률</span></div>{rows.map(row => <div className="terminal-indicator-row" key={row.code}><span>{row.name}</span><strong>{n(row.price, row.unit === '%' ? 3 : 2)}</strong><span className={(row.change ?? 0) > 0 ? 'positive' : (row.change ?? 0) < 0 ? 'negative' : ''}>{n(row.change, row.unit === '%' ? 3 : 2, true)}</span><span className={(row.rate ?? 0) > 0 ? 'positive' : (row.rate ?? 0) < 0 ? 'negative' : ''}>{row.rate == null ? '—' : n(row.rate, 2, true) + '%'}</span></div>)}<p className="terminal-source">최근 제공값 · 금리 % / 증감 %p · 원유·금은 선물 USD</p></section>;
}
