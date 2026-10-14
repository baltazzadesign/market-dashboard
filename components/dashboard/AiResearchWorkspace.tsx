"use client";

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  aiStrategies,cohortPerformance,dailyPerformance,latestRunForPhase,
  makeOutcomeMap,outcomeKey,signalDays,type AiHorizon,type AiResearchPayload,type AiRun,type AiStrategy
} from '@/lib/balta-ai-dashboard';
import styles from './AiResearchWorkspace.module.css';

const periods=[7,30,60,90] as const;
const horizons:[AiHorizon,string][]=[[0,'당일 종가'],[1,'1거래일'],[3,'3거래일'],[5,'5거래일']];
const strategies:({value:'all'|AiStrategy;label:string})[]=[
  {value:'all',label:'전체 전략'},{value:'FLOW_V1',label:'동반 순매수'},{value:'FLOW_ACCEL_V1',label:'순매수 가속'}
];
const strategyLabel=(value:string)=>value==='FLOW_V1'?'동반 순매수':value==='FLOW_ACCEL_V1'?'순매수 가속':value;
const nf=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
function fixed(v:number|null,digits=2){
  return v===null||!Number.isFinite(v)?'—':v.toLocaleString('ko-KR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
}
function pct(value:number|null,plus=true){
  return value===null?'—':(plus&&value>0?'+':'')+fixed(value)+'%';
}
const tone=(v:number|null)=>v===null?styles.unverified:v>0?styles.positive:v<0?styles.negative:'';
const runLabel=(run:AiRun|null)=>!run?'실행 기록 없음':run.result==='complete'?'실행 완료':run.result==='incomplete'?'일부 미완료':'실행 건너뜀';
function runInfo(run:AiRun|null){
  if(!run)return '예약 실행 후 기록이 표시됩니다.';
  const time=new Date(run.executed_at);
  const stamp=Number.isFinite(time.getTime())?time.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):run.trade_date;
  return stamp+' · '+run.trade_date+' 기준';
}

export default function AiResearchWorkspace(){
  const [days,setDays]=useState<(typeof periods)[number]>(30);
  const [horizon,setHorizon]=useState<AiHorizon>(1);
  const [strategy,setStrategy]=useState<'all'|AiStrategy>('all');
  const [requestedDate,setRequestedDate]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [data,setData]=useState<AiResearchPayload|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    const ctrl=new AbortController();
    setLoading(true);setError('');
    fetch('/api/ai-research?days='+days,{cache:'no-store',signal:ctrl.signal})
      .then(async r=>{
        const payload:unknown=await r.json();
        if(!r.ok)throw new Error(typeof payload==='object'&&payload!==null&&'error' in payload&&typeof payload.error==='string'?payload.error:'연구 기록을 불러오지 못했습니다.');
        return payload as AiResearchPayload;
      })
      .then(result=>{
        if(!Array.isArray(result.signals)||!Array.isArray(result.outcomes)||!Array.isArray(result.runs))
          throw new Error('연구 기록 형식이 올바르지 않습니다.');
        setData(result);
      })
      .catch(e=>{if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'연구 기록 조회 실패');})
      .finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
    return ()=>ctrl.abort();
  },[days,refresh]);

  const signals=data?.signals??[];
  const outcomes=data?.outcomes??[];
  const runs=data?.runs??[];
  const dates=useMemo(()=>signalDays(signals),[signals]);
  const selectedDate=dates.includes(requestedDate)?requestedDate:dates[0]??'';
  const selected=useMemo(()=>signals.filter(s=>s.trade_date===selectedDate&&(strategy==='all'||s.strategy===strategy)),[signals,selectedDate,strategy]);
  const allFiltered=useMemo(()=>strategy==='all'?signals:signals.filter(s=>s.strategy===strategy),[signals,strategy]);
  const stats=useMemo(()=>cohortPerformance(allFiltered,outcomes,horizon),[allFiltered,outcomes,horizon]);
  const chartData=useMemo(()=>dailyPerformance(signals,outcomes,horizon).map(x=>({
    ...x,date:x.date.slice(5),
    baseline:x.baseline===null?null:Number(x.baseline.toFixed(2)),
    acceleration:x.acceleration===null?null:Number(x.acceleration.toFixed(2))
  })),[signals,outcomes,horizon]);
  const outcomeMap=useMemo(()=>makeOutcomeMap(outcomes),[outcomes]);
  const morning=useMemo(()=>latestRunForPhase(runs,'morning'),[runs]);
  const close=useMemo(()=>latestRunForPhase(runs,'close'),[runs]);
  const candidateCount=allFiltered.reduce((sum,s)=>sum+s.picks.length,0);
  const hasChart=chartData.some(x=>x.baseline!==null||x.acceleration!==null);

  return <main className={'terminal-detail-page '+styles.workspace} id="main-content">
    <div className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>BALTA RESEARCH · PAPER STRATEGY LAB</span>
        <h1>AI 종목 연구소</h1>
        <p>수급 신호를 기록하고, 거래일이 지난 뒤 실제 가격으로 검증합니다.<br/>미래 예측과 관측된 성과를 구분하는 실험형 리서치입니다.</p>
      </div>
      <div className={styles.heroActions}>
        <span className={styles.labFlag}><span className={styles.dot}/>실거래 없음 · 연구 중</span>
        <button className={styles.refresh} onClick={()=>setRefresh(v=>v+1)} disabled={loading}>{loading?'조회 중…':'데이터 새로고침 ↻'}</button>
      </div>
    </div>

    <div className={styles.controls}>
      <div className={styles.buttonGroup} aria-label="조회 기간">
        {periods.map(v=><button key={v} aria-pressed={days===v} className={days===v?styles.active:''} onClick={()=>setDays(v)}>{v}일</button>)}
      </div>
      <div className={styles.buttonGroup} aria-label="검증 기간">
        {horizons.map(([value,label])=><button key={value} aria-pressed={horizon===value} className={horizon===value?styles.active:''} onClick={()=>setHorizon(value)}>{label}</button>)}
      </div>
      <label className={styles.selectLabel}>전략 <select value={strategy} onChange={e=>setStrategy(e.target.value as 'all'|AiStrategy)}>
        {strategies.map(v=><option value={v.value} key={v.value}>{v.label}</option>)}
      </select></label>
    </div>

    {error&&<div className={styles.error} role="alert"><strong>데이터 조회 실패</strong><span>{error}</span><button onClick={()=>setRefresh(v=>v+1)}>다시 시도</button></div>}
    {loading&&<div className={styles.loading} role="status">발타 리서치 데이터를 불러오는 중입니다…</div>}
    {!loading&&!error&&!signals.length&&<div className={styles.emptyMain} role="status">
      <span className={styles.emptyGlyph}>◎</span>
      <strong>아직 저장된 AI 매수 후보가 없습니다.</strong>
      <p>평일 아침 후보 선정이 성공하고 Supabase에 기록되면 이곳에 나타납니다. 후보가 없을 때 임의 종목이나 수익률을 표시하지 않습니다.</p>
      <a href="https://github.com/baltazzadesign/market-dashboard/actions/workflows/balta-ai-paper-daily.yml" target="_blank" rel="noopener noreferrer">자동 실행 기록 확인 ↗</a>
    </div>}

    <div className={styles.metricGrid} aria-label="연구 성과 지표">
      <div className={styles.metric}><span>수집된 후보 관측</span><strong>{error||loading?'—':nf.format(candidateCount)}<small>건</small></strong><p>전략별 선택 종목의 누적 관측 건수 · {dates.length}거래일</p></div>
      <div className={styles.metric}><span>검증 완료</span><strong>{error||loading?'—':nf.format(stats.observations)}<small>건</small></strong><p>선택한 기간·전략·보유 기간의 평가 수</p></div>
      <div className={styles.metric}><span>평균 모의 수익률</span><strong className={tone(stats.mean)}>{error||loading?'—':pct(stats.mean)}</strong><p>당일 시가 진입 가정 · 비용 및 슬리피지 미반영</p></div>
      <div className={styles.metric}><span>관측 승률</span><strong>{error||loading?'—':stats.winRate===null?'—':fixed(stats.winRate,1)+'%'}</strong><p>수익률 0% 초과 비율 · 검증 표본 기준</p></div>
    </div>

    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div><h2>전략별 일일 성과 비교</h2><p>선정일별 동일 보유 기간의 종목 평균 수익률 · 누적 복리수익률이 아닙니다.</p></div>
        <span className={styles.panelMeta}>선택 기간: {horizons.find(x=>x[0]===horizon)?.[1]}</span>
      </div>
      <div className={styles.chart}>
        {!hasChart||error||loading?<div className={styles.chartEmpty}>아직 이 기간의 검증 완료 성과가 없습니다.</div>:
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{top:22,right:24,left:2,bottom:3}}>
              <CartesianGrid vertical={false} stroke="#2c332c" strokeDasharray="2 5"/>
              <XAxis dataKey="date" stroke="#9ca697" fontSize={11} tickLine={false} axisLine={false} minTickGap={18}/>
              <YAxis stroke="#9ca697" fontSize={11} tickLine={false} axisLine={false} width={54} tickFormatter={v=>v+'%'}/>
              <Tooltip contentStyle={{background:'#101610',color:'#f0e3c1',border:'1px solid #5a4b31',borderRadius:7}}
                labelStyle={{color:'#e6c585'}} formatter={(value,name)=>{
                  const v=typeof value==='number'?value:Number(value);
                  return [Number.isFinite(v)?pct(v):'—',String(name)];
                }}/>
              <ReferenceLine y={0} stroke="#665d4a" strokeDasharray="3 5"/>
              <Line name="동반 순매수" type="monotone" dataKey="baseline" stroke="#d6b36c" strokeWidth={2} connectNulls={false} dot={{r:2}} activeDot={{r:5}}/>
              <Line name="순매수 가속" type="monotone" dataKey="acceleration" stroke="#76bdac" strokeWidth={2} connectNulls={false} dot={{r:2}} activeDot={{r:5}}/>
            </LineChart>
          </ResponsiveContainer>}
      </div>
      <div className={styles.legend}><span><i style={{background:'#d6b36c'}}/>동반 순매수 (FLOW_V1)</span><span><i style={{background:'#76bdac'}}/>순매수 가속 (FLOW_ACCEL_V1)</span><span>차트 공백 = 미검증</span></div>
    </section>

    <div className={styles.lowerGrid}>
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div><h2>선정 종목 및 사후 검증</h2><p>선정일의 당시 수급 근거와 0·1·3·5거래일별 결과를 분리 표시합니다.</p></div>
          <label className={styles.selectLabel}>선정일 <select value={selectedDate} disabled={!dates.length} onChange={e=>setRequestedDate(e.target.value)}>
            {!dates.length&&<option value="">데이터 없음</option>}
            {dates.map(d=><option key={d} value={d}>{d}</option>)}
          </select></label>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}><thead><tr>
            <th>전략·순위</th><th>종목</th><th>외국인</th><th>기관</th><th>평가 점수</th><th>당일</th><th>1일</th><th>3일</th><th>5일</th>
          </tr></thead><tbody>
            {selected.flatMap(s=>s.picks.map((p,i)=>{
              const result=(h:number)=>outcomeMap.get(outcomeKey(s.trade_date,s.strategy,p.code,h))?.return_pct??null;
              return <tr key={[s.trade_date,s.strategy,p.code].join(':')}>
                <td><small className={styles.strategy}>{strategyLabel(s.strategy)}</small><br/>#{i+1}</td>
                <td><Link href={'/stock-flow?code='+encodeURIComponent(p.code)} className={styles.stockName}>{p.name}</Link><small className={styles.code}>{p.code} · {p.market.toUpperCase()}</small></td>
                <td className={styles.foreign}>{fixed(p.foreign,1)}</td>
                <td className={styles.institution}>{fixed(p.institution,1)}</td>
                <td>{fixed(p.score,1)}</td>
                {[0,1,3,5].map(h=><td key={h} className={tone(result(h))}>{pct(result(h))}</td>)}
              </tr>;
            }))}{!selected.some(s=>s.picks.length)&&<tr><td colSpan={9} className={styles.noRows}>선택한 날짜와 전략에 저장된 후보가 없습니다.</td></tr>}
          </tbody></table>
        </div>
        <div className={styles.tableNote}>금액·점수 단위: 억원. 수익률은 저장된 KIS 수정주가 기반 모의 평가이며, 빈 값은 수익률 0%가 아니라 미검증을 의미합니다.</div>
      </section>

      <aside className={styles.sideColumn}>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><h2>수집·검증 실행 상태</h2><p>GitHub Actions에서 Supabase에 저장한 기록</p></div></div>
          <div className={styles.runList}>
            {([{key:'morning',title:'오전 후보 선정',value:morning},{key:'close',title:'오후 성과 검증',value:close}] as const).map(v=>
              <div key={v.key} className={styles.run}><div><strong>{v.title}</strong><span>{runInfo(v.value)}</span></div>
                <b className={v.value?.result==='complete'?styles.runOk:v.value?.result==='incomplete'?styles.runWarn:styles.runNeutral}>{runLabel(v.value)}</b></div>)}
          </div>
          <p className={styles.sideNote}>실행 기록이 없다고 오류로 단정하지 않습니다. GitHub Actions 실행 및 DB 저장 여부를 확인해야 합니다.</p>
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}><div><h2>전략별 검증 통계</h2><p>선택 보유 기간 · 실제 완료된 표본</p></div></div>
          <div className={styles.strategyCards}>
            {aiStrategies.map(s=>{
              const value=cohortPerformance(signals,outcomes,horizon,s);
              return <div key={s} className={styles.strategyCard}>
                <div><strong>{strategyLabel(s)}</strong><small>{s}</small></div>
                <div><span>검증 표본</span><b>{value.observations}건</b></div>
                <div><span>평균 수익률</span><b className={tone(value.mean)}>{pct(value.mean)}</b></div>
                <div><span>승률</span><b>{value.winRate===null?'—':fixed(value.winRate,1)+'%'}</b></div>
              </div>;
            })}
          </div>
        </section>
      </aside>
    </div>

    <footer className={styles.disclaimer}>
      <strong>연구 자료 · 실거래 아님</strong>
      외국인·기관 수급 기반 후보를 매일 기록하는 실험입니다. 시가 체결 가능성, 호가 잔량, 거래비용·세금·슬리피지, 지수 대비 초과수익은 반영하지 않았습니다. 과거 모의 성과는 미래 수익을 보장하지 않으며 매수 권유가 아닙니다.
    </footer>
  </main>;
}
