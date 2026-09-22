"use client";
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { kstParts, formatNumber as n, dataStatus, type MarketRow } from '@/lib/balta-model';
import { buildMarketEvents } from '@/lib/balta-signals';
import type { Quote, TerminalSnapshot } from '@/lib/terminal-model';
import { emptyFxIndicators } from '@/lib/terminal-fx';
import type { ChartKind, Domain } from './chart-model';
import { Brand, Icon, type IconName } from './Icon';
import { useMarketFeed } from './useMarketFeed';
import { useMarketPulse } from './MarketPulse';
import { useTerminalData } from './useTerminalData';
import { PulseDial, StockRanking, IndicatorTable, NewsPanel } from './TerminalPanels';
import TerminalPriceChart from './TerminalPriceChart';
import InvestmentDisclaimer from './InvestmentDisclaimer';
import { Modal } from './Modal';
const MarketChart = dynamic(() => import('./MarketCharts'), { ssr: false, loading: () => <div className="terminal-empty">차트 준비 중…</div> });

function Spark({ values, color }: { values: (number | null)[]; color: string }) {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 2) return null;
  const min = Math.min(...valid), spread = Math.max(...valid) - min || 1;
  return <svg viewBox="0 0 100 44" aria-hidden="true" className="terminal-spark"><polyline points={valid.map((v, i) => `${i / (valid.length - 1) * 100},${40 - (v - min) / spread * 35}`).join(' ')} fill="none" stroke={color} strokeWidth="1.6"/></svg>;
}
function IndexCard({ quote, label, fallback, rows, onClick }: { quote?: Quote; label: string; fallback?: number | null; rows?: (number | null)[]; onClick: () => void }) {
  const positive = (quote?.rate ?? 0) >= 0;
  return <button className="terminal-panel terminal-index" onClick={onClick}><span className="terminal-index-label" title={quote?.name}>{quote?.name || label}</span><strong>{n(quote?.price ?? fallback, 2)}</strong><span className={'terminal-index-change ' + (quote?.rate == null ? '' : positive ? 'positive' : 'negative')}>{quote?.rate == null ? '시세 수신 대기' : <>{positive ? '▲' : '▼'} {n(Math.abs(quote.change ?? 0), 2)} <b>{n(quote.rate, 2, true)}%</b></>}</span>{rows && <Spark values={rows.slice(-90)} color={positive ? '#ff514e' : '#44a6ff'}/>}</button>;
}
export default function TerminalDashboard() {
  const [date, setDate] = useState(''), [now, setNow] = useState<Date | null>(null), [modal, setModal] = useState<'chart' | 'board' | 'future' | null>(null), [kind, setKind] = useState<ChartKind>('kospi');
  const [domain, setDomain] = useState<Domain>([540, 930]);
  useEffect(() => { const tick = () => { const time = new Date(); setDate(kstParts(time).date); setNow(time); }; tick(); const timer = setInterval(tick, 30000); return () => clearInterval(timer); }, []);
  const feed = useMarketFeed(date, false, true), rows = feed.rows, last = rows.at(-1);
  const snapshot = useTerminalData<TerminalSnapshot>('/api/market/terminal');
  const { pulse } = useMarketPulse(rows, date, feed.fetchedAt);
  const events = useMemo(() => buildMarketEvents(rows.filter(r => r.session === 'REGULAR')), [rows]);
  const quotes = snapshot.data?.quotes ?? [];
  const status = dataStatus(last, date, feed.error, now ?? new Date(0));
  const chartDomain: Domain = last && last.minute > 930 ? [540, 1200] : [540, 930];
  const indicators = emptyFxIndicators().map(q => snapshot.data?.indicators.find(r => r.code === q.code) ?? q);
  function expand(next: ChartKind) { setKind(next); setDomain(chartDomain); setModal('chart'); }
  const shortcuts: { title: string; description: string; icon: IconName; href?: string; click?: () => void; art: string }[] = [
    { title: '시장 캘린더', description: '과거를 보면\n오늘이 보입니다.', icon: 'calendar', href: '/history', art: 'calendar' },
    { title: '시장리서치', description: '지금 시장을 이끄는\n주도 섹터는?', icon: 'layers', href: '/research', art: 'sector' },
    { title: '내 메모', description: '시장의 순간을\n기록으로 남기세요.', icon: 'book', href: '/notes', art: 'notes' },
    { title: '차트 전체보기', description: '더 넓은 시야로\n시장을 바라보세요.', icon: 'chart', click: () => setModal('board'), art: 'charts' },
  ];
  return <main className="terminal-dashboard" id="main-content"><section className="terminal-hero"><div><h1>시장을 읽는<br/><strong>발바닥의 감각</strong></h1><p>데이터로 더 나은 판단을, 발타툴과 함께.</p><small>GOOD DATA. BETTER DECISIONS.</small></div><div className="terminal-hero-quote">흔들리지 않는 시선이<br/>기회를 만든다.<b>發</b></div></section>
    <div className="terminal-feed-status" role="status"><span><i className={status.tone}/>{feed.loading ? '시장 기록 조회 중' : status.label}{last ? ' · ' + last.time + ' 기준' : ''}</span><span>{date} · KST <button onClick={() => { void feed.refresh(true); snapshot.refresh(); }} aria-label="데이터 새로고침"><Icon name="refresh" size={13}/></button></span></div>
    {(feed.error || feed.warning) && <div className="terminal-notice" role="alert">{feed.error || feed.warning}{rows.length > 0 && ' · 마지막 조회 기록을 표시합니다.'}</div>}
    <div className="terminal-board"><div className="terminal-stats-row"><IndexCard label="KOSPI" quote={quotes.find(q => q.code === '0001')} fallback={last?.kospi} rows={rows.map(r => r.kospi)} onClick={() => expand('kospi')}/><IndexCard label="KOSDAQ" quote={quotes.find(q => q.code === '1001')} fallback={last?.kosdaq} rows={rows.map(r => r.kosdaq)} onClick={() => expand('kosdaq')}/><IndexCard label="최근월 선물" quote={quotes.find(q => !['0001', '1001'].includes(q.code))} onClick={() => setModal('future')}/><PulseDial pulse={pulse}/></div>
      <div className="terminal-chart-row"><TerminalPriceChart rows={rows} quotes={quotes} date={date} onExpand={expand}/><section className="terminal-panel terminal-flow-panel"><div className="terminal-panel-heading"><h2>투자주체별 누적 수급 <small>(억원)</small></h2><button className="terminal-icon-button" onClick={() => expand('flow')} aria-label="수급 차트 확대"><Icon name="expand" size={16}/></button></div><div className="terminal-flow-values">{[{ label: '외국인', key: 'foreignFlow', color: '#249dff' }, { label: '기관', key: 'instFlow', color: '#ff5053' }, { label: '개인', key: 'indivFlow', color: '#f4c532' }].map(item => <span key={item.key}><i style={{ background: item.color }}/>{item.label}<b style={{ color: item.color }}>{n(last?.[item.key as keyof MarketRow] as number | null, 0, true)}</b></span>)}</div>{rows.length ? <MarketChart rows={rows} kind="flow" domain={chartDomain} compact syncGroup="terminal-overview" onExpand={() => expand('flow')}/> : <div className="terminal-empty terminal-price-empty">{feed.loading ? '수급 기록 조회 중…' : '저장된 수급 기록이 없습니다.'}</div>}<div className="terminal-chart-caption"><span>KOSPI + KOSDAQ 합산 · 저장된 누적 순매수</span><Link href="/flow">수급 상세 ›</Link></div></section></div>
      <div className="terminal-summary-row"><IndicatorTable rows={indicators}/><StockRanking/><NewsPanel/></div>
      <section className="terminal-shortcuts" aria-label="빠른 메뉴">{shortcuts.map(item => { const contents = <><Icon name={item.icon} size={29}/><div><strong>{item.title}</strong><p>{item.description}</p></div><span className="terminal-shortcut-arrow"><Icon name="right" size={14}/></span></>; return item.href ? <Link key={item.title} href={item.href} className={'terminal-shortcut ' + item.art}>{contents}</Link> : <button key={item.title} onClick={item.click} className={'terminal-shortcut ' + item.art}>{contents}</button>; })}</section>
    </div>{(snapshot.error || snapshot.data?.warnings.length) ? <p className="terminal-source" role="status">{snapshot.error || snapshot.data?.warnings.join(' · ')} · 미수신 시세는 —로 표시합니다.</p> : null}<footer className="terminal-footer"><Link href="/" aria-label="발타툴 홈"><Brand/></Link><small>GOOD DATA. BETTER DECISIONS.</small><nav><a href="/baltagyeong.html">발타경</a><Link href="/balta-jungyong">발타 중용</Link><Link href="/disclaimer">책임면책고지</Link></nav></footer><InvestmentDisclaimer/>
    <Modal open={modal === 'chart'} onClose={() => setModal(null)} title="차트 상세" wide><div className="terminal-expanded-chart"><div className="terminal-segments">{(['kospi', 'kosdaq', 'flow', 'breadth'] as ChartKind[]).map(v => <button key={v} className={kind === v ? 'active' : ''} onClick={() => setKind(v)}>{v === 'flow' ? '수급' : v === 'breadth' ? '시장폭' : v.toUpperCase()}</button>)}</div><MarketChart rows={rows} kind={kind} domain={domain} onDomainChange={setDomain} events={events} showMarkers onReset={() => setDomain(chartDomain)}/></div></Modal>
    <Modal open={modal === 'board'} onClose={() => setModal(null)} title="차트 전체보기" full><div className="terminal-chart-board">{(['kospi', 'kosdaq', 'flow', 'breadth', 'ratio', 'score'] as ChartKind[]).map(v => <section className="terminal-panel" key={v}><MarketChart rows={rows} kind={v} domain={domain} onDomainChange={setDomain} compact onExpand={() => expand(v)} syncGroup="terminal-board"/></section>)}</div></Modal>
    <Modal open={modal === 'future'} onClose={() => setModal(null)} title="최근월 선물"><div className="terminal-menu-content">{quotes.filter(q => !['0001', '1001'].includes(q.code)).map(q => <div key={q.code}><h3>{q.name}</h3><p className="terminal-future-price">{n(q.price, 2)}</p><p>전일 대비 {n(q.change, 2, true)} ({n(q.rate, 2, true)}%)</p><p>거래량 {n(q.volume)} · {q.code}</p></div>)}{!quotes.some(q => !['0001', '1001'].includes(q.code)) && <p>선물 시세를 받지 못했습니다. 잠시 후 다시 조회해 주세요.</p>}<p className="terminal-source">KIS 선물전광판 · 잔존 일수가 가장 짧은 제공 계약</p><button className="button" onClick={snapshot.refresh}>다시 조회</button></div></Modal>
  </main>;
}
