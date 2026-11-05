'use client';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { kstParts, formatNumber } from '@/lib/balta-model';
import type { Sector } from '@/lib/market-research';
import { mapSectors, sectorColor, sectorDistribution, type MapSector } from '@/lib/sector-map-model';
import styles from './ResearchSectorMap.module.css';

const pct = (n: number | null) => n === null ? '—' : `${formatNumber(n, 2, true)}%`;
const sourceName = (s: MapSector) => s.sources.length > 1 ? '공통 지수' : s.market.toUpperCase();
const tone = (n: number | null) => n === null || n === 0 ? styles.flat : n > 0 ? styles.up : styles.down;
type Feed = { time: string; items: Sector[] };

export default function ResearchSectorMap({ date }: { date: string }) {
  const [feed, setFeed] = useState<Feed | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0), [market, setMarket] = useState('all'), [scope, setScope] = useState('industry');
  const [search, setSearch] = useState(''), [direction, setDirection] = useState('all'), [view, setView] = useState('map'), [selectedId, setSelectedId] = useState('');
  useEffect(() => {
    const c = new AbortController();
    async function load() {
      setLoading(true); setError('');
      try {
        const r = await fetch('/api/market/sectors?date=' + date, { signal: AbortSignal.any([c.signal, AbortSignal.timeout(55000)]), cache: 'no-store' });
        const j = await r.json(); if (!r.ok || j.ok === false) throw new Error(j.error || '업종 기록을 불러오지 못했습니다.');
        if (!c.signal.aborted) setFeed({ time: j.snapshot?.time ?? '', items: j.snapshot?.market_data?.sectors ?? [] });
      } catch (e) { if (!c.signal.aborted) setError(e instanceof Error ? e.message : '조회 실패'); }
      finally { if (!c.signal.aborted) setLoading(false); }
    }
    void load(); return () => c.abort();
  }, [date, refresh]);
  useEffect(() => {
    if (date !== kstParts().date) return;
    const timer = setInterval(() => { if (!document.hidden) setRefresh(n => n + 1); }, 60000);
    return () => clearInterval(timer);
  }, [date]);
  const all = useMemo(() => mapSectors(feed?.items ?? []), [feed]);
  const filtered = useMemo(() => all.filter(s => (scope === 'all' || s.industry) && (market === 'all' || s.sources.some(x => x === market)) && s.name.toLowerCase().includes(search.trim().toLowerCase())), [all, scope, market, search]);
  const counts = sectorDistribution(filtered);
  const items = filtered.filter(s => direction === 'all' || (direction === 'up' && s.change !== null && s.change > 0) || (direction === 'down' && s.change !== null && s.change < 0) || (direction === 'flat' && s.change === 0)).sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0) || a.name.localeCompare(b.name, 'ko'));
  const ranked = [...filtered].filter(s => s.change !== null).sort((a, b) => b.change! - a.change!);
  const leaders = ranked.filter(s => s.change! > 0).slice(0, 5), laggards = ranked.filter(s => s.change! < 0).reverse().slice(0, 5);
  // Store a stable code/name selection so periodic quote refreshes do not lose it.
  const selected = items.find(s => `${s.code}:${s.name}` === selectedId) ?? items[0];
  const select = (s: MapSector) => setSelectedId(`${s.code}:${s.name}`);
  const maxAbs = Math.max(1, ...filtered.map(s => Math.abs(s.change ?? 0)));
  const visible = view === 'map' ? items.slice(0, 36) : items;
  return <section className={styles.atlas} aria-label="섹터 강도 지도">
    <header className={styles.header}><div><span className={styles.eyebrow}>SECTOR ATLAS</span><h2>시장의 온도를 한눈에</h2><p>어디가 강하고, 어디가 약한지. 업종의 흐름을 비교하세요.</p></div><div className={styles.stamp}><span>{date} · 저장 기록</span><strong>{feed?.time || '기준 시각 확인 중'}</strong><button onClick={() => setRefresh(n => n + 1)} disabled={loading}>{loading ? '조회 중…' : '↻ 새로고침'}</button></div></header>
    <div className={styles.controls}>
      <div className={styles.segment} role="group" aria-label="지도 범위">{[['industry','업종 중심'],['all','전체 지수']].map(([key,label]) => <button key={key} aria-pressed={scope === key} onClick={() => setScope(key)}>{label}</button>)}</div>
      <select aria-label="업종 시장" value={market} onChange={e => setMarket(e.target.value)}><option value="all">양 시장</option><option value="kospi">KOSPI 수집 그룹</option><option value="kosdaq">KOSDAQ 수집 그룹</option></select>
      <label className={styles.search}><span aria-hidden="true">⌕</span><input aria-label="업종 검색" placeholder="업종명으로 찾기" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="검색 지우기" onClick={() => setSearch('')}>×</button>}</label>
    </div>
    {error && <p className={styles.notice} role="alert">{error}{feed && ' 이전 조회 결과를 표시합니다.'}</p>}
    {!feed && loading ? <div className={styles.empty} role="status">업종 지도를 불러오고 있습니다…</div> : <>
      <div className={styles.overview}>
        <div className={styles.breadth}><div className={styles.breadthHeading}><strong>등락 분포 <small>{filtered.length}개 지수</small></strong><span>현재 검색·시장 기준</span></div><div className={styles.distribution} aria-label={`상승 ${counts.up}, 하락 ${counts.down}, 보합 ${counts.flat}, 미확인 ${counts.missing}`}>{(['up','flat','down','missing'] as const).map(key => counts[key] > 0 && <i key={key} className={styles[key]} style={{flex:counts[key]}}/>)}</div><div className={styles.counts}><span className={styles.up}>상승 <b>{counts.up}</b></span><span className={styles.down}>하락 <b>{counts.down}</b></span><span>보합 <b>{counts.flat}</b></span>{counts.missing > 0 && <span>미확인 <b>{counts.missing}</b></span>}</div></div>
        <div className={styles.extreme}><span>가장 강한 지수</span><strong>{leaders[0]?.name ?? '상승 지수 없음'}</strong><b className={styles.up}>{pct(leaders[0]?.change ?? null)}</b></div>
        <div className={styles.extreme}><span>가장 약한 지수</span><strong>{laggards[0]?.name ?? '하락 지수 없음'}</strong><b className={styles.down}>{pct(laggards[0]?.change ?? null)}</b></div>
      </div>
      <div className={styles.layout}>
        <div className={styles.mapPanel}><div className={styles.mapToolbar}><div className={styles.segment} role="group" aria-label="등락 필터">{[['all','전체'],['up','상승'],['down','하락'],['flat','보합']].map(([key,label]) => <button key={key} aria-pressed={direction === key} onClick={() => setDirection(key)}>{label}</button>)}</div><div className={styles.viewSwitch} role="group" aria-label="지도 보기 방식"><button aria-pressed={view === 'map'} onClick={() => setView('map')}>지도</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}>목록</button></div></div>
          <div className={styles.legend}><span>전일 대비 등락률</span><div><span>−5%</span>{[-5,-3,-1,0,1,3,5].map(n => <i key={n} style={{background:sectorColor(n)}}/>)}<span>+5%</span></div></div>
          {items.length === 0 ? <div className={styles.empty}>해당 조건의 지수가 없습니다.<button onClick={() => {setSearch('');setDirection('all');setMarket('all');setScope('all');}}>전체 지수 보기</button></div> : view === 'map' ? <div className={styles.mosaic}>{visible.map((s, i) => <button key={s.id} className={`${styles.tile} ${i < 4 && items.length > 6 ? styles.featured : ''}`} style={{'--tile':sectorColor(s.change)} as CSSProperties} aria-pressed={selected?.id === s.id} onClick={() => select(s)} title={`${s.name} · ${sourceName(s)} · ${pct(s.change)}`}><small>{sourceName(s)}</small><strong>{s.name}</strong><b>{pct(s.change)}</b><span className={styles.tileMark} aria-hidden="true">{s.change === null || s.change === 0 ? '—' : s.change > 0 ? '↗' : '↘'}</span></button>)}</div> : <div className={styles.list}>{visible.map(s => <button key={s.id} aria-pressed={selected?.id === s.id} onClick={() => select(s)}><span><strong>{s.name}</strong><small>{sourceName(s)}</small></span><span className={styles.barTrack}><i style={{width:`${Math.abs(s.change ?? 0)/maxAbs*50}%`,left:s.change !== null && s.change < 0 ? `${50-Math.abs(s.change)/maxAbs*50}%`:'50%',background:s.change !== null && s.change < 0?'#639eea':'#ed697b'}}/></span><b className={tone(s.change)}>{pct(s.change)}</b></button>)}</div>}
          <div className={styles.mapFoot}><span>{view === 'map' ? '큰 셀: 등락폭 상위 4개 · 시가총액 비중 아님' : '막대: 0을 중심으로 전일 대비 등락률 비교'}</span>{items.length > 36 && view === 'map' && <button onClick={() => setView('list')}>전체 {items.length}개 목록 →</button>}</div>
        </div>
        <aside className={styles.sidebar}>
          <section className={styles.detail} aria-label="선택한 업종 상세" aria-live="polite"><span className={styles.eyebrow}>SECTOR FOCUS</span>{selected ? <><small>{sourceName(selected)} · {selected.code}</small><h3>{selected.name}</h3><strong className={`${styles.detailValue} ${tone(selected.change)}`}>{pct(selected.change)}</strong><p>전일 대비 등락률</p><dl><div><dt>지수</dt><dd>{formatNumber(selected.price,2)}</dd></div><div><dt>표시 범위 내 등락률 순위</dt><dd>{selected.change === null ? '—' : `${ranked.findIndex(s => s.id === selected.id)+1} / ${ranked.length}`}</dd></div></dl></> : <p>지도에서 업종을 선택하세요.</p>}</section>
          <section className={styles.ranks}><h3>강세 · 약세 TOP 5</h3>{[[leaders,'강세'],[laggards,'약세']].map(([rows,label]) => <div key={String(label)}><h4>{String(label)}</h4>{(rows as MapSector[]).length ? (rows as MapSector[]).map((s,i) => <button key={s.id} onClick={() => {setDirection('all');select(s);}}><small>{i+1}</small><span>{s.name}</span><b className={tone(s.change)}>{pct(s.change)}</b></button>) : <p>해당 지수 없음</p>}</div>)}</section>
        </aside>
      </div>
    </>}
    <footer className={styles.footnote}>색상은 전일 대비 등락률이며 ±5% 이상은 가장 진하게 표시합니다. 지도는 등락폭 순 최대 36개, 목록은 전체를 표시합니다. 업종 중심은 일반 업종명 기준이며 테마·파생·규모별 지수는 전체 보기에서 확인할 수 있습니다.<br/>시장 선택은 제공 데이터의 수집 그룹 기준입니다. 같은 코드·이름·수치의 중복은 하나로 묶고 ‘공통 지수’로 표시합니다. 미확인 값은 —로 표시합니다.</footer>
  </section>;
}
