"use client";
import { useMemo, useState } from 'react';
import { formatNumber as n, type MarketRow } from '@/lib/balta-model';
import { sampleCandles, type Candle, type Quote } from '@/lib/terminal-model';
import { Icon } from './Icon';
import { Modal } from './Modal';
import styles from './TerminalPriceChart.module.css';

const ranges = ['1D', '1W', '1M', '3M', '1Y'] as const;
type ChartRange = typeof ranges[number];
import { useTerminalData } from './useTerminalData';


function SpotPriceChart({ rows, quotes, date, onExpand, market }: { rows: MarketRow[]; quotes: Quote[]; date: string; market: 'kospi' | 'kosdaq'; onExpand: (market: 'kospi' | 'kosdaq') => void }) {
  const [range, setRange] = useState<ChartRange>('1D'), [line, setLine] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const feed = useTerminalData<{ ok: boolean; candles: Candle[]; caption: string }>(range === '1D' ? null : '/api/market/index-candles?' + new URLSearchParams({ market, range, date }), 300_000);
  const sampled = useMemo(() => sampleCandles(rows.map(r => ({ time: r.time, minute: r.minute, value: r[market] }))), [rows, market]);
  const candles = range === '1D' ? sampled : feed.data?.candles ?? [], q = quotes.find(v => v.code === (market === 'kospi' ? '0001' : '1001'));
  const period = candles.length ? `${candles[0].time} ~ ${candles.at(-1)!.time}` : date;
  const caption = range === '1D' ? '5분 관측 캔들 · 시간 (KST)' : `${feed.data?.caption || '기간별 지수'} · ${range === '1Y' ? '연/월' : '월/일'}`;
  const plot = (height = 228) => range !== '1D' && feed.loading
    ? <div className="terminal-empty terminal-price-empty" role="status">기간별 지수 조회 중…</div>
    : feed.error ? <div className="terminal-empty terminal-price-empty" role="alert"><span>{feed.error}</span><button onClick={feed.refresh}>다시 조회</button></div>
    : <CandlePlot key={market + range} candles={candles} line={line} range={range} height={height}/>;
  return <div><div className={"terminal-chart-tools " + styles.tools}><div className={"terminal-time-switch " + styles.periods}>{ranges.map(v => <button className={range === v ? 'active' : ''} onClick={() => setRange(v)} aria-pressed={range === v} key={v}>{v}</button>)}</div><select aria-label="차트 표시 방식" value={line ? 'line' : 'candle'} onChange={e => setLine(e.target.value === 'line')}><option value="candle">캔들</option><option value="line">라인</option></select><button className="terminal-icon-button" aria-label="지수 차트 확대" onClick={() => range === '1D' ? onExpand(market) : setExpanded(true)}><Icon name="expand" size={16}/></button></div>
    <div className="terminal-price-readout"><strong>{n(range === '1D' ? q?.price ?? rows.at(-1)?.[market] : candles.at(-1)?.close, 2)}</strong>{range === '1D' && q?.rate != null && <span className={q.rate >= 0 ? 'positive' : 'negative'}>{n(q.change, 2, true)} ({n(q.rate, 2, true)}%)</span>}</div>
    {plot()}
    <div className="terminal-chart-caption"><span>{caption}</span><span>{range === '1D' ? date : period}</span></div>
    <Modal open={expanded} onClose={() => setExpanded(false)} title={`${market.toUpperCase()} · ${range} 차트`} wide>
      <div className="terminal-expanded-chart">{plot(360)}<div className="terminal-chart-caption"><span>{caption}</span><span>{period}</span></div></div>
    </Modal>
  </div>;
}

export { CandlePlot } from './TerminalCandlePlot';
import { CandlePlot } from './TerminalCandlePlot';
import { FuturesPriceChart } from './FuturesPriceChart';
const markets = {kospi:'KOSPI',kosdaq:'KOSDAQ',kospi200:'KOSPI200 선물',kosdaq150:'KOSDAQ150 선물'} as const;
export default function TerminalPriceChart(props: {rows:MarketRow[];quotes:Quote[];date:string;onExpand:(market:'kospi'|'kosdaq')=>void}) {
  const [market,setMarket]=useState<keyof typeof markets>('kospi');
  return <section className={'terminal-panel terminal-price-panel '+styles.panel}>
    <div className={'terminal-segments '+styles.markets} aria-label="차트 시장 선택">{Object.entries(markets).map(([value,label])=><button key={value} aria-pressed={market===value} className={market===value?'active':''} onClick={()=>setMarket(value as keyof typeof markets)}>{label}</button>)}</div>
    {market==='kospi'||market==='kosdaq'?<SpotPriceChart {...props} market={market}/>:<FuturesPriceChart key={market} product={market}/>}
  </section>;
}
