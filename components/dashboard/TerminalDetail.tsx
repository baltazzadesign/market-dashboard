"use client";
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { formatNumber as n, isValidDate, kstParts, type MarketRow } from '@/lib/balta-model';
import { useMarketFeed } from './useMarketFeed';
import MarketPulsePanel, { useMarketPulse } from './MarketPulse';
import { MarketSummary } from './Insights';
import { Icon } from './Icon';
import type { Domain } from './chart-model';
const Chart = dynamic(() => import('./MarketCharts'), { ssr: false, loading: () => <div className="terminal-empty">차트 준비 중…</div> });
export default function TerminalDetail({ view }: { view: 'pulse' | 'breadth' }) {
  const [date, setDate] = useState(''), [domain, setDomain] = useState<Domain>([540, 930]);
  useEffect(() => { const input = new URLSearchParams(window.location.search).get('date'); setDate(input && isValidDate(input) ? input : kstParts().date); }, []);
  const feed = useMarketFeed(date, false, true), last = feed.rows.at(-1), { pulse, sectorStatus } = useMarketPulse(feed.rows, date, feed.fetchedAt);
  return <main className="terminal-detail-page"><div className="terminal-detail-title"><div><h1>{view === 'pulse' ? 'Market Pulse' : '시장폭'}</h1><p>{view === 'pulse' ? '시장폭·수급·지수·섹터·가속을 함께 읽습니다.' : '지수 너머, 상승과 하락의 확산을 확인합니다.'}</p></div><div className="toolbar"><input type="date" aria-label="조회 날짜" value={date} max={kstParts().date} onChange={e => { if (isValidDate(e.target.value) && e.target.value <= kstParts().date) { setDate(e.target.value); setDomain([540,930]); } }}/><button className="button icon" onClick={() => void feed.refresh(true)} aria-label="새로고침"><Icon name="refresh"/></button></div></div>
    {(feed.error || feed.warning) && <div className="terminal-notice" role="alert">{feed.error || feed.warning}</div>}
    {view === 'breadth' && <div className="terminal-breadth-cards">{[['상승 종목', 'up', 'positive'], ['하락 종목', 'down', 'negative'], ['시장폭', 'diff', '']] .map(([name, key, color]) => <section className="terminal-panel" key={key}><h2>{name}</h2><strong className={color}>{n(last?.[key as keyof MarketRow] as number | undefined)}</strong></section>)}</div>}
    <div className="terminal-detail-grid">{view === 'pulse' ? <MarketPulsePanel pulse={pulse} sectorStatus={sectorStatus} warning={feed.warning}/> : <MarketSummary row={last}/>}<section className="terminal-panel pulse-detail-chart"><h2 className="panel-title">{view === 'pulse' ? '장중 시장점수 · 원점수 −100~100' : '상승·하락 종목 수 추이'}</h2>{feed.loading ? <div className="terminal-empty">시장 기록 조회 중…</div> : <Chart rows={feed.rows} kind={view === 'pulse' ? 'score' : 'breadth'} domain={domain} onDomainChange={setDomain} onReset={() => setDomain([540,930])}/>}</section></div>
  </main>;
}
