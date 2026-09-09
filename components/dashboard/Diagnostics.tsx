"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { collectionHealth, detectChanges, recentDivergence, signalPerformance } from '@/lib/market-diagnostics';
import { formatNumber as f, minuteLabel, sourceLabel, breadthLabel, type MarketRow, type MarketEvent } from '@/lib/balta-model';
export default function Diagnostics({rows,events,date,now,error,loading,onSelect}:{rows:MarketRow[];events:MarketEvent[];date:string;now:Date|null;error:string;loading:boolean;onSelect:(minute:number)=>void}) {
  const [market,setMarket]=useState<'kospi'|'kosdaq'>('kospi'),[horizon,setHorizon]=useState<30|60|'close'>(30);
  const [alerts,setAlerts]=useState(false);const notified=useRef('');
  const health=useMemo(()=>now&&date?collectionHealth(rows,date,now):null,[rows,date,now]);
  const changes=useMemo(()=>detectChanges(rows),[rows]);
  const divergence=useMemo(()=>recentDivergence(rows),[rows]);
  const performance=useMemo(()=>signalPerformance(rows,events,market,horizon),[rows,events,market,horizon]);
  useEffect(()=>{
    if(!health?.stale){notified.current='';return;}
    if(loading||!alerts||notified.current===date)return;
    notified.current=date;
    if('Notification' in window&&Notification.permission==='granted')new Notification('baltatool · 수집 지연',{body:'3분 이상 새 기록이 없습니다. 크론 실행 기록을 확인하세요.',tag:'collection-delay'});
  },[health,alerts,date,loading]);
  async function toggleAlerts(){if(alerts){setAlerts(false);return;}if('Notification' in window){try{setAlerts(await Notification.requestPermission()==='granted');}catch{setAlerts(false);}}}
  return <section className="panel diagnostics" aria-label="수집 상태 및 신호 분석">
    <div className="panel-header"><div><h2 className="panel-title">시장 모니터</h2><p className="panel-subtitle">{date} · 저장 기록으로 분석</p></div><button className="button small" onClick={()=>void toggleAlerts()}>수집 지연 알림 {alerts?'ON':'OFF'}</button></div>
    <div className="diagnostic-body">
      <div role="status"><strong>{loading?'기록 조회 중':error?'수집·조회 상태 확인':health?.closed??(health?.stale?'수집 지연 감지':health?.live?'정규장 모니터링':'장외 / 과거 기록')}</strong><p>마지막 기록 {health?.last?.time??'없음'} · {sourceLabel(health?.last?.flowSource)} · {breadthLabel(health?.last?.breadthSource)}</p>{error&&<p className="negative">{error}</p>}
        <p>분별 기록 누락 {loading?'—':health?.missing??0}개 · 장 시작부터 완료된 분 기준. 과거 미수집 구간도 포함합니다.</p>
        {!!health?.gaps.length&&!loading&&<details><summary>누락 구간 보기</summary><p>{health.gaps.map(g=>minuteLabel(g.start)+'–'+minuteLabel(g.end)).join(', ')}</p></details>}
        <small>알림은 이 화면이 열려 있고 브라우저 알림을 허용한 동안 동작합니다. 휴장일은 기존 캘린더 기준이며 추가 지정 휴장일은 별도 확인이 필요합니다.</small>
      </div>
      <div className="diagnostic-grid"><div><h3>최근 30분 변화</h3>{divergence?<><strong>{divergence.divergent?'지수·시장폭 반대 방향 감지':'뚜렷한 괴리 없음'}</strong><p>KOSPI {f(divergence.change,2,true)}% · 시장폭 {f(divergence.breadth,0,true)}종목</p><p><span style={{color:'#5796ff'}}>외국인 {f(divergence.foreign,0,true)}</span> · <span style={{color:'#ff536b'}}>기관 {f(divergence.inst,0,true)}</span> · <span style={{color:'#ffd35a'}}>개인 {f(divergence.indiv,0,true)}</span> 억원</p></>:<p>연속된 정상 종목수 기록 31개가 필요합니다.</p>}<small>지수 0.1% 이상 변화와 시장폭 변화의 방향을 비교합니다. 전일 대비 등락이 아닙니다.</small></div>
      <div><h3>수급 전환</h3>{changes.length?changes.slice(0,6).map((c,i)=><button className="diagnostic-event" key={c.minute+' '+i} onClick={()=>onSelect(c.minute)}><strong>{c.time} · {c.label}</strong><small>{c.detail}</small></button>):<p>정상 수급 기록에서 감지된 전환이 없습니다.</p>}<small>당일 누적 수급 기준 · 연속된 1분 기록만 비교 · 클릭하면 차트로 이동</small></div></div>
      <div><div className="toolbar"><h3>신호 성과 · 선택 거래일</h3><select aria-label="성과 지수" value={market} onChange={e=>setMarket(e.target.value as typeof market)}><option value="kospi">KOSPI</option><option value="kosdaq">KOSDAQ</option></select><select aria-label="성과 평가 시점" value={horizon} onChange={e=>setHorizon(e.target.value==='close'?'close':Number(e.target.value) as 30|60)}><option value={30}>30분 후</option><option value={60}>1시간 후</option><option value="close">15:30 기록</option></select></div>
      <div className="diagnostic-table"><table><thead><tr><th>수집 신호</th><th>평가 / 미평가</th><th>평균 지수 등락</th><th>방향 일치율</th></tr></thead><tbody>{performance.map(g=><tr key={g.label}><td>{g.label}</td><td>{g.count} / {g.pending}</td><td>{f(g.count?g.sum/g.count:null,2,true)}%</td><td>{f(g.count?g.wins/g.count*100:null,1)}%</td></tr>)}</tbody></table></div>{!performance.length&&<p>평가할 방향성 수집 신호가 없습니다.</p>}
      <small>수집 당시 저장된 신호만 평가합니다. 정확한 평가 시각의 가격이 없으면 미평가 처리합니다. 하락 신호는 실제 하락했을 때 방향 일치로 집계합니다. 반복 신호의 평가 구간은 겹칠 수 있으며, 표본은 독립적이지 않습니다. 수수료·슬리피지를 반영한 전략 수익률이 아닙니다.</small></div>
    </div>
  </section>;
}
