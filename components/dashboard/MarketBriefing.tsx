'use client';
import Link from 'next/link';
import { useState } from 'react';
import { formatNumber as fmt, kstParts } from '@/lib/balta-model';
import { useMarketBriefing } from './useMarketBriefing';
import MarketBriefingOutlook from './MarketBriefingOutlook';
import styles from './MarketBriefing.module.css';

const marketName = { kospi: '코스피', kosdaq: '코스닥' };
function color(n: number | null) { return n === null || n === 0 ? styles.neutral : n > 0 ? styles.up : styles.down; }
function shortDate(date: string) { return date.slice(5).replace('-', '.'); }
function weekday(date: string) { return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(new Date(date + 'T12:00:00+09:00')); }

export default function MarketBriefing({ initialDate = '' }: { initialDate?: string }) {
  const feed = useMarketBriefing(initialDate), data = feed.data, p = data?.latest;
  const [market, setMarket] = useState<'all' | 'kospi' | 'kosdaq'>('all');
  const outlookBlocked = feed.error ? '조회가 실패해 이전 결과를 표시하고 있습니다. 최신 기록을 확인할 때까지 방향 판단을 보류합니다.'
    : p && feed.date === feed.today && feed.minute >= 540 && feed.minute < 930 && feed.minute - p.minute >= 5
      ? `마지막 기록(${p.time})이 5분 이상 지연되어 현재 방향 판단을 보류합니다.`
      : p && feed.date === feed.today && feed.minute >= 930 ? '정규장이 종료되었습니다. 위 내용은 마지막 저장 시점의 해석이며 다음 거래일 방향을 예측하지 않습니다.' : undefined;
  const sectors = (data?.sectors ?? []).filter(s => market === 'all' || s.market === market);
  const positive = sectors.filter(s => s.change >= 0).slice(0, 4), negative = sectors.filter(s => s.change < 0).slice(-2).reverse();
  const shown = [...positive, ...negative];
  const status = feed.loading ? '조회 중' : feed.error ? '연결 확인' : data?.closedReason ? '휴장일' : !p ? '기록 대기' : feed.date < feed.today ? '과거 기록' : p.minute >= 930 ? '정규장 마감 기록' : '장중 기록';
  return <main className={styles.page} aria-label="시장 브리핑">
    <header className={styles.heading}>
      <div><div className={styles.eyebrow}>발타툴 · 시장의 기록</div><div className={styles.title}><h1>시장 브리핑</h1><span className={styles.beta}>해석 · 전망</span></div><p>지금 흐름의 이유와, 판단이 바뀌는 조건을 함께 읽습니다.</p></div>
      <div className={styles.dateStamp}><span className={styles.status}><i/>{status}</span><strong>{feed.date.replaceAll('-', '.')} <small>KST</small></strong></div>
    </header>

    <div className={styles.toolbar}>
      <div className={styles.dates} role="group" aria-label="브리핑 날짜 선택">{feed.dates.map(date => <button key={date} onClick={() => feed.selectDate(date)} aria-pressed={feed.date === date}>{date === feed.today ? '오늘 ' : ''}{shortDate(date)}<small>{weekday(date)}</small></button>)}</div>
      <div className={styles.controls}><input type="date" aria-label="브리핑 기준 날짜" min="2000-01-01" max={feed.today} value={feed.date} onChange={e => feed.selectDate(e.target.value)}/><button className={styles.refresh} onClick={() => void feed.refresh()} disabled={feed.loading}>{feed.loading ? '조회 중…' : '새로고침 ↻'}</button></div>
    </div>
    <div className={styles.meta}><span>{p ? `${shortDate(feed.date)} ${p.time} 시장 기록 기준 · ${data?.count}개 기록` : '정규장 09:00–15:30 저장 기록 기준'}</span><label><input type="checkbox" checked={feed.auto} onChange={e => feed.setAuto(e.target.checked)}/>오늘 1분 갱신</label></div>
    {feed.error && <div className={styles.warning} role="alert">{feed.error}{data && <span> 마지막 조회 결과를 표시하고 있습니다.</span>}<button onClick={() => void feed.refresh()} disabled={feed.loading}>다시 시도</button></div>}
    {(data?.warnings.length ?? 0) > 0 && <details className={styles.warning}><summary>데이터 확인 사항 {data!.warnings.length}개</summary><ul>{data!.warnings.map(w => <li key={w}>{w}</li>)}</ul></details>}

    {!data && !feed.error ? <div className={styles.empty} role="status"><span className={styles.eyebrow}>시장 기록 연결 중</span><h2>브리핑을 준비하고 있습니다</h2><p>선택한 날짜의 시장 기록과 업종 데이터를 불러옵니다.</p></div> : data && <>
      <div className={styles.mainGrid}>
        <section className={`${styles.panel} ${styles.hero}`} aria-labelledby="briefing-flow-title">
          <div className={styles.panelHeading}><h2 id="briefing-flow-title">지금 시장의 흐름</h2><span>{feed.date < feed.today ? '선택일 요약' : '정규장 요약'}</span></div>
          <div className={styles.heroBody}><div className={styles.kicker}>{p ? '지수 · 시장폭 · 투자자 수급을 연결한 해석' : data.closedReason ? '쉬어가는 시장' : '기록을 기다리는 중'}</div><h3>{data.insight?.headline ?? data.headline}</h3>
            {p ? <><div className={styles.tags}>{p.breadth && <span>상승 비율 {fmt(p.breadth.share, 1)}%</span>}<span>{p.time} 기준</span><span>수급 단위 · 억원</span></div>
              <div className={styles.indices}>{(['kospi', 'kosdaq'] as const).map(key => <div key={key}><span>{marketName[key]}</span><strong>{fmt(p[key].price, 2)}<small>pt</small></strong><b className={color(p[key].change)}>{p[key].change === null ? '전일 대비 확인 필요' : `${fmt(p[key].change, 2, true)}%`}<small>{p[key].change === null ? '' : '전일 대비'}</small></b></div>)}</div>
              <div className={styles.summaryTitle}><span/>시장을 이렇게 읽습니다</div>
              <ol className={styles.summaries}>{(data.insight?.explanation ?? data.summary).map((item, i) => <li key={item.title}><span className={styles.number}>{String(i + 1).padStart(2, '0')}</span><div><h4>{item.title}</h4><p>{item.text}</p></div></li>)}</ol>
              <div className={styles.flowStrip}>{[{ label: '외국인', value: p.foreign, cls: styles.foreign }, { label: '기관', value: p.institution, cls: styles.institution }, { label: '개인', value: p.individual, cls: styles.individual }].map(item => <div key={item.label}><span className={item.cls}>● {item.label}</span><strong>{fmt(item.value, 0, true)}<small>억원</small></strong></div>)}</div>
            </> : <div className={styles.emptyCopy}><p>{data.closedReason ? '휴장일에는 시장 요약을 생성하지 않습니다. 다른 거래일을 선택해 주세요.' : '선택한 날짜에 수집된 정규장 기록이 없습니다. 다른 날짜를 선택하거나 수집 상태를 확인해 주세요.'}</p><Link href={'/daily?date=' + feed.date}>일별 분석에서 기록 확인 ↗</Link></div>}
          </div><div className={styles.heroFoot}>발타툴 저장 데이터 자동 요약<span>기록에 근거한 시장 관찰</span></div>
        </section>

        <aside className={`${styles.panel} ${styles.sectorPanel}`} aria-labelledby="briefing-sectors-title"><div className={styles.panelHeading}><h2 id="briefing-sectors-title">주목 업종</h2><span>전일 대비 등락</span></div>
          <div className={styles.sectorBody}><div className={styles.segment} role="group" aria-label="업종 시장 선택">{(['all', 'kospi', 'kosdaq'] as const).map(key => <button key={key} aria-pressed={market === key} onClick={() => setMarket(key)}>{key === 'all' ? '전체' : marketName[key]}</button>)}</div>
            <p className={styles.sectorCaption}>상승 상위 · 하락 하위 업종을 함께 확인하세요. 인버스·레버리지·선물 전략지수는 제외합니다.</p>
            {shown.length ? <div className={styles.sectorList}>{shown.map(s => <details key={feed.date + s.market + s.code} className={styles.sector}><summary><div><span>{marketName[s.market]} · {s.time}</span><h3>{s.name}</h3></div><b className={color(s.change)}>{fmt(s.change, 2, true)}%<small>{s.change > 0 ? '상승' : s.change < 0 ? '하락' : '보합'} ＋</small></b></summary><p>{s.name} 업종 지수는 전일 대비 {fmt(s.change, 2, true)}%입니다. 조회된 {marketName[s.market]} 업종 {s.count}개 중 등락률 {s.rank}위입니다. 기준 시각은 {s.time}입니다.</p><p>업종 등락만으로 개별 종목의 움직임이나 상승·하락 원인을 확정할 수는 없습니다.</p></details>)}</div> : <div className={styles.sideEmpty}><span>◇</span><p>조회된 업종 기록이 없습니다.</p><small>시장 요약과 업종 기록의 수집 상태는 다를 수 있습니다.</small></div>}
            <Link className={styles.sectorLink} href={'/research?tab=sectors&date=' + feed.date}>업종 전체 보기 <span>↗</span></Link><small className={styles.note}>업종을 누르면 수치와 기준 시각을 볼 수 있습니다.</small>
          </div>
        </aside>
      </div>

      {data.insight && <MarketBriefingOutlook insight={data.insight} blocked={outlookBlocked}/>}

      <section className={`${styles.panel} ${styles.timelinePanel}`} aria-labelledby="briefing-timeline-title"><div className={styles.panelHeading}><h2 id="briefing-timeline-title">시간대별 시황 요약</h2><span>첫 기록 · 시간별 · 마지막 기록</span></div>
        {data.timeline.length ? <ol className={styles.timeline}>{data.timeline.map((item, i) => <li key={item.time}><time>{item.time}</time><i/><details open={i === data.timeline.length - 1}><summary>{item.title}<span>＋</span></summary><p>{item.text}</p></details></li>)}</ol> : <p className={styles.sectionEmpty}>저장된 시장 기록이 있으면 해당 시점의 흐름을 보여줍니다.</p>}
        <div className={styles.sectionFoot}>각 시각까지 수집된 수치로 재구성한 요약입니다. 이후 업종·뉴스를 과거 시황에 소급하지 않습니다.</div>
      </section>
    </>}

    <section className={`${styles.panel} ${styles.newsPanel}`} aria-labelledby="briefing-news-title"><div className={styles.panelHeading}><h2 id="briefing-news-title">오늘의 뉴스</h2><span>시황 참고 · 요약과 별도</span></div>
      {feed.news.length > 0 && <ul className={styles.newsList}>{feed.news.map(item => <li key={item.url}><a href={item.url} target="_blank" rel="noopener noreferrer"><span>{item.title}</span><small>{item.source} · {kstParts(new Date(item.publishedAt)).time} · {item.linkKind === 'search' ? '뉴스 검색' : '원문'} ↗</small></a></li>)}</ul>}
      {(feed.newsMessage || feed.loading && !feed.news.length) && <p className={styles.sectionEmpty}>{feed.newsMessage || '뉴스를 조회하고 있습니다.'}</p>}
    </section>
    <footer className={styles.footer}><div><strong>발타툴 시장 브리핑</strong><span>정규장 저장 기록 기반 · 지수·시장폭·수급·업종</span></div><nav aria-label="브리핑 관련 기능"><Link href={'/daily?date=' + feed.date}>일별 분석 ↗</Link><Link href="/research?tab=reversal">급락 반등 후보 ↗</Link><Link href="/stock-flow">종목 수급·공시 ↗</Link></nav></footer>
  </main>;
}
