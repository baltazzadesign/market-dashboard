"use client";
import { useEffect, useRef, useState } from 'react';
import { formatNumber as n } from '@/lib/balta-model';
import type { PlotBar, FutureRange as ChartRange } from '@/lib/futures-model';
function axisLabel(time: string, range: ChartRange) {
  if (range === '1D') return time;
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(time);
  if (!date) return '—';
  return range === '1Y' ? `${date[1].slice(2)}.${date[2]}` : `${Number(date[2])}/${Number(date[3])}`;
}
export function CandlePlot({ candles, line = false, height = 228, range = '1D', timeScale = false, priceDigits = 0 }: { candles: PlotBar[]; line?: boolean; height?: number; range?: ChartRange; timeScale?: boolean; priceDigits?: number }) {
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
  const timestamps = candles.map(c => Date.parse(c.timestamp ?? ''));
  const elapsed = timeScale && timestamps.every(Number.isFinite) && timestamps.at(-1)! > timestamps[0];
  const duration = elapsed ? timestamps.at(-1)! - timestamps[0] + 60000 : 1;
  const x = (i: number) => elapsed ? left + (timestamps[i] - timestamps[0] + 30000) / duration * graphWidth : left + (i + .5) * graphWidth / candles.length;
  const nearest = (px: number) => candles.reduce((best, _, i) => Math.abs(x(i)-px) < Math.abs(x(best)-px) ? i : best, 0);
  const groups: number[][] = [];
  candles.forEach((c,i) => { if(!i || c.breakBefore) groups.push([]); groups.at(-1)!.push(i); });
  const bar = Math.max(1.2, Math.min(11, (elapsed ? 60000 / duration * graphWidth : graphWidth / candles.length) * .64));
  const maxVolume = Math.max(1, ...candles.map(c => c.volume ?? 0));
  const tickCount = Math.min(candles.length, width < 450 ? 4 : 5);
  const tickIndices = Array.from({ length: tickCount }, (_, i) => Math.round(i * (candles.length - 1) / Math.max(1, tickCount - 1)));
  const selected = hover == null ? null : candles[Math.min(hover, candles.length - 1)];
  return <div ref={container} className="terminal-candle-wrap"><svg className="terminal-candles" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="가격 차트" onPointerLeave={() => setHover(null)} onPointerMove={event => { const rect = event.currentTarget.getBoundingClientRect(); setHover(nearest((event.clientX - rect.left) / rect.width * width)); }}>
    {groups.map((group,j) => {const first=candles[group[0]]; if(!first.session)return null; const a=x(group[0]),b=x(group.at(-1)!);return <g key={'session'+j}><rect x={Math.max(left,a-bar)} y={top} width={Math.max(bar*2,b-a+bar*2)} height={height-top-bottom} fill={first.session==='NIGHT'?'#8e76b313':'#dcb4630b'}/>{group.length>10&&<text x={a+5} y={top+10} fill={first.session==='NIGHT'?'#a69ab9':'#bba471'} fontSize="9">{first.session==='NIGHT'?'야간':'주간'}</text>}</g>;})}
    {Array.from({ length: 5 }, (_, i) => { const value = upper - (upper - lower) * i / 4, py = y(value); return <g key={i}><line x1={left} y1={py} x2={width - right} y2={py} stroke="#333a333c"/><text x={width - right + 10} y={py + 4} fill="#a8a89d" fontSize="11">{n(value, priceDigits)}</text></g>; })}
    {tickIndices.map((index, i) => { const px = elapsed ? left + (i / Math.max(1,tickIndices.length-1)) * (graphWidth-bar) + bar/2 : x(index); const tickTime = elapsed ? timestamps[0] + (timestamps.at(-1)!-timestamps[0]) * i / Math.max(1,tickIndices.length-1) : candles[index].timestamp; return <g key={index}><line x1={px} y1={top} x2={px} y2={height - bottom} stroke="#333a333c"/><text className="terminal-time-tick" x={px} y={height - 5} fill="#969a91" textAnchor={i === 0 ? 'start' : i === tickIndices.length - 1 ? 'end' : 'middle'} fontSize="10">{timeScale && candles[index].timestamp ? new Date(tickTime!).toLocaleString('en-GB',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replace(',', '') : axisLabel(candles[index].time, range)}</text></g>; })}
    {line ? groups.map((group,j) => group.length===1 ? <circle key={j} cx={x(group[0])} cy={y(candles[group[0]].close)} r="2" fill="#e2be70"/> : <polyline key={j} fill="none" stroke="#e2be70" strokeWidth="2" vectorEffect="non-scaling-stroke" points={group.map(i => `${x(i)},${y(candles[i].close)}`).join(' ')}/>) : candles.map((c, i) => { const color = c.close >= c.open ? '#ff6258' : '#4bd0b8'; return <g key={c.time + i}><line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color}/><rect x={x(i) - bar / 2} y={Math.min(y(c.open), y(c.close))} width={bar} height={Math.max(1.5, Math.abs(y(c.open) - y(c.close)))} fill={color}/></g>; })}
    {volume && candles.map((c, i) => c.volume == null ? null : <rect key={i} x={x(i) - bar / 2} y={height - bottom - c.volume / maxVolume * (volumeHeight - 5)} width={bar} height={c.volume / maxVolume * (volumeHeight - 5)} fill={c.close >= c.open ? '#a74c3f' : '#2c7869'}/>)}
    {selected && hover != null && <><line x1={x(hover)} x2={x(hover)} y1={top} y2={height - bottom} stroke="#d6ba77" strokeDasharray="3 4"/><circle cx={x(hover)} cy={y(selected.close)} r="3" fill="#e9c47a"/></>}
  </svg>{selected && <div className="terminal-candle-tooltip"><b>{selected.timestamp ? new Date(selected.timestamp).toLocaleString('ko-KR', {timeZone:'Asia/Seoul'}) : selected.time}{selected.session ? ` · ${selected.session==='DAY'?'주간':'야간'}` : ''}{selected.contract_code ? ` · ${selected.contract_code}` : ''}</b><span>시 {n(selected.open, 2)} · 고 {n(selected.high, 2)} · 저 {n(selected.low, 2)} · 종 {n(selected.close, 2)}</span></div>}</div>;
}

