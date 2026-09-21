"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatNumber as n, type MarketRow } from '@/lib/balta-model';
import { sampleCandles, type Candle, type Quote } from '@/lib/terminal-model';
import { Icon } from './Icon';
import { useTerminalData } from './useTerminalData';

export function CandlePlot({ candles, line = false, height = 228 }: { candles: Candle[]; line?: boolean; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null), [width, setWidth] = useState(760);
  useEffect(() => {
    const node = container.current; if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(node); return () => observer.disconnect();
  }, [candles.length > 0]);
  if (!candles.length) return <div ref={container} className="terminal-empty terminal-price-empty">표시할 가격 기록이 없습니다.</div>;
  const left = 8, right = width < 450 ? 44 : 64, top = 14, bottom = 26;
  const volume = candles.some(c => c.volume != null && c.volume > 0), volumeHeight = volume ? 35 : 0;
  const max = Math.max(...candles.map(c => c.high)), min = Math.min(...candles.map(c => c.low));
  const spread = max - min || Math.max(1, max * .002), upper = max + spread * .12, lower = min - spread * .12;
  const graphHeight = height - top - bottom - volumeHeight, graphWidth = width - left - right;
  const y = (v: number) => top + (upper - v) / (upper - lower) * graphHeight;
  const x = (i: number) => left + (i + .5) * graphWidth / candles.length;
  const bar = Math.max(1.2, Math.min(11, graphWidth / candles.length * .64));
  const maxVolume = Math.max(1, ...candles.map(c => c.volume ?? 0));
  const selected = hover == null ? null : candles[Math.min(hover, candles.length - 1)];
  return <div ref={container} className="terminal-candle-wrap"><svg className="terminal-candles" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="지수 가격 차트" onPointerLeave={() => setHover(null)} onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(candles.length - 1, Math.floor(((event.clientX - rect.left) / rect.width * width - left) / graphWidth * candles.length)))); }}>
    {Array.from({ length: 5 }, (_, i) => { const value = upper - (upper - lower) * i / 4, py = y(value); return <g key={i}><line x1={left} y1={py} x2={width - right} y2={py} stroke="#333a333c"/><text x={width - right + 10} y={py + 4} fill="#a8a89d" fontSize="11">{n(value, 0)}</text></g>; })}
    {[0, .25, .5, .75, 1].map((v, i) => { const index = Math.round(v * (candles.length - 1)), px = x(index); return <g key={i}><line x1={px} y1={top} x2={px} y2={height - bottom} stroke="#333a333c"/><text x={px} y={height - 5} fill="#969a91" textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} fontSize="10">{candles[index].time.length > 5 ? candles[index].time.slice(5) : candles[index].time}</text></g>; })}
    {line ? <polyline fill="none" stroke="#e2be70" strokeWidth="2" vectorEffect="non-scaling-stroke" points={candles.map((c, i) => `${x(i)},${y(c.close)}`).join(' ')}/> : candles.map((c, i) => { const color = c.close >= c.open ? '#ff6258' : '#4bd0b8'; return <g key={c.time + i}><line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color}/><rect x={x(i) - bar / 2} y={Math.min(y(c.open), y(c.close))} width={bar} height={Math.max(1.5, Math.abs(y(c.open) - y(c.close)))} fill={color}/></g>; })}
    {volume && candles.map((c, i) => c.volume == null ? null : <rect key={i} x={x(i) - bar / 2} y={height - bottom - c.volume / maxVolume * (volumeHeight - 5)} width={bar} height={c.volume / maxVolume * (volumeHeight - 5)} fill={c.close >= c.open ? '#a74c3f' : '#2c7869'}/>)}
    {selected && hover != null && <><line x1={x(hover)} x2={x(hover)} y1={top} y2={height - bottom} stroke="#d6ba77" strokeDasharray="3 4"/><circle cx={x(hover)} cy={y(selected.close)} r="3" fill="#e9c47a"/></>}
  </svg>{selected && <div className="terminal-candle-tooltip"><b>{selected.time}</b><span>시 {n(selected.open, 2)} · 고 {n(selected.high, 2)} · 저 {n(selected.low, 2)} · 종 {n(selected.close, 2)}</span></div>}</div>;
}

export default function TerminalPriceChart({ rows, quotes, date, onExpand }: { rows: MarketRow[]; quotes: Quote[]; date: string; onExpand: (market: 'kospi' | 'kosdaq') => void }) {
  const [market, setMarket] = useState<'kospi' | 'kosdaq'>('kospi'), [range, setRange] = useState('1D'), [line, setLine] = useState(false);
  const feed = useTerminalData<{ ok: boolean; candles: Candle[]; caption: string }>(range === '1D' ? null : '/api/market/index-candles?' + new URLSearchParams({ market, range, date }), 300_000);
  const sampled = useMemo(() => sampleCandles(rows.map(r => ({ time: r.time, minute: r.minute, value: r[market] }))), [rows, market]);
  const candles = range === '1D' ? sampled : feed.data?.candles ?? [], q = quotes.find(v => v.code === (market === 'kospi' ? '0001' : '1001'));
  return <section className="terminal-panel terminal-price-panel"><div className="terminal-chart-tools"><div className="terminal-segments terminal-market-switch">{(['kospi', 'kosdaq'] as const).map(v => <button key={v} className={market === v ? 'active' : ''} onClick={() => setMarket(v)} aria-pressed={market === v}>{v.toUpperCase()}</button>)}</div><div className="terminal-time-switch">{['1D', '1W', '1M', '3M', '1Y'].map(v => <button className={range === v ? 'active' : ''} onClick={() => setRange(v)} aria-pressed={range === v} key={v}>{v}</button>)}</div><select aria-label="차트 표시 방식" value={line ? 'line' : 'candle'} onChange={e => setLine(e.target.value === 'line')}><option value="candle">캔들</option><option value="line">라인</option></select><button className="terminal-icon-button" aria-label="지수 차트 확대" onClick={() => onExpand(market)}><Icon name="expand" size={16}/></button></div>
    <div className="terminal-price-readout"><strong>{n(range === '1D' ? q?.price ?? rows.at(-1)?.[market] : candles.at(-1)?.close, 2)}</strong>{range === '1D' && q?.rate != null && <span className={q.rate >= 0 ? 'positive' : 'negative'}>{n(q.change, 2, true)} ({n(q.rate, 2, true)}%)</span>}</div>
    {range !== '1D' && feed.loading ? <div className="terminal-empty terminal-price-empty">기간별 지수 조회 중…</div> : feed.error ? <div className="terminal-empty terminal-price-empty"><span>{feed.error}</span><button onClick={feed.refresh}>다시 조회</button></div> : <CandlePlot candles={candles} line={line}/>}
    <div className="terminal-chart-caption"><span>{range === '1D' ? '5분 관측 캔들 · 저장된 지수 표본 기준' : feed.data?.caption}</span><time>{date}</time></div>
  </section>;
}
