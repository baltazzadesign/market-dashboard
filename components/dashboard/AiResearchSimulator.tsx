"use client";

import { useMemo, useState } from 'react';
import { exitScenarioIds,exitScenarioLabels,summarizeSimulation, type ExitScenarioId } from '@/lib/balta-ai-exits';
import type { AiHorizon,AiResearchPayload,AiStrategy } from '@/lib/balta-ai-dashboard';
import styles from './AiResearchSimulator.module.css';

const costs=[0,.15,.3,.5,1] as const;
const strategyNames:Record<AiStrategy,string>={
 FLOW_V1:'동반 순매수',FLOW_ACCEL_V1:'순매수 가속',
 FLOW_PERSIST_V1:'5일 지속',FLOW_LIQUID_V1:'거래대금 보정'
};
const fmt=(n:number|null,unit='%')=>n===null?'—':(n>0?'+':'')+n.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})+unit;
export default function AiResearchSimulator({data,horizon,strategy}:{
 data:AiResearchPayload;horizon:AiHorizon;strategy:'all'|AiStrategy
}){
 const [cost,setCost]=useState<number>(.3);
 const [chosen,setChosen]=useState<ExitScenarioId>('TP5_SL3');
 const filtered=useMemo(()=>data.simulations.filter(r=>strategy==='all'||r.strategy===strategy),[data.simulations,strategy]);
 const featured=useMemo(()=>summarizeSimulation(filtered,chosen,horizon,cost),[filtered,chosen,horizon,cost]);
 const table=useMemo(()=>exitScenarioIds.map(id=>({
  id,...summarizeSimulation(filtered,id,horizon,cost)
 })),[filtered,horizon,cost]);
 const minimum=featured.observations>=30&&featured.uniqueDays>=10;
 return <section className={styles.section}>
  <div className={styles.head}>
   <div>
    <span className={styles.eyebrow}>BALTA RESEARCH · EXIT SCENARIO LAB</span>
    <h2>매매 전략 시뮬레이션</h2>
    <p>선정일 시가 진입 가정 · 일봉 OHLC로 익절·손절·보유 기간 비교</p>
   </div>
   <span className={styles.meta}>최근 {data.simulationLookbackDays}일 기록 · {horizon===0?'당일':horizon+'거래일'} 평가</span>
  </div>
  <div className={styles.selectors}>
   <label>매도 방식
    <select value={chosen} onChange={e=>setChosen(e.target.value as ExitScenarioId)}>
     {exitScenarioIds.map(id=><option key={id} value={id}>{exitScenarioLabels[id]}</option>)}
    </select>
   </label>
   <div className={styles.costSetting}>
    <span>왕복 총 거래비용 가정</span>
    <div className={styles.costButtons}>{costs.map(n=><button key={n} aria-pressed={cost===n}
     className={cost===n?styles.selected:''} onClick={()=>setCost(n)}>{n.toFixed(2)}%</button>)}</div>
   </div>
  </div>
  <div className={styles.metrics}>
   <div><small>평가 완료</small><strong>{featured.observations}<em>건</em></strong><span>선정일 {featured.uniqueDays}일</span></div>
   <div><small>비용 반영 평균</small><strong className={minimum?(featured.meanNet!==null&&featured.meanNet>0?styles.up:styles.down):styles.muted}>
    {minimum?fmt(featured.meanNet):'—'}</strong><span>{minimum?'총 거래비용 가정 차감':'최소 30건·10일 필요'}</span></div>
   <div><small>비용 반영 승률</small><strong>{minimum&&featured.winRate!==null?featured.winRate.toFixed(1)+'%':'—'}</strong><span>비용 차감 후 수익률 양수</span></div>
   <div><small>관측 최악 수익률</small><strong className={styles.muted}>{minimum?fmt(featured.worstNet):'—'}</strong><span>단일 종목 최악 관측치 · MDD 아님</span></div>
  </div>
  <div className={styles.tableWrap}>
   <table className={styles.table}>
    <thead><tr><th>매도 시나리오</th><th>평가 건수</th><th>평가 거래일</th><th>매도 전 평균</th>
     <th>비용 반영 평균</th><th>비용 반영 승률</th><th>손절 발생률</th></tr></thead>
    <tbody>{table.map(row=>{
     const enough=row.observations>=30&&row.uniqueDays>=10;
     return <tr key={row.id} className={row.id===chosen?styles.activeRow:''}>
      <td>{exitScenarioLabels[row.id]}</td><td>{row.observations}</td><td>{row.uniqueDays}</td>
      <td>{enough?fmt(row.meanGross):'—'}</td>
      <td className={enough&&row.meanNet!==null&&row.meanNet>0?styles.up:styles.down}>{enough?fmt(row.meanNet):'—'}</td>
      <td>{enough&&row.winRate!==null?row.winRate.toFixed(1)+'%':'—'}</td>
      <td>{enough&&row.stopRate!==null?row.stopRate.toFixed(1)+'%':'—'}</td>
     </tr>;
    })}</tbody>
   </table>
  </div>
  <div className={styles.strategyInfo}>
    {strategy==='all'?'4개 수급 전략을 합산한 연구 관측입니다. 동일 종목 중복 추천은 전략별 별도 관측으로 집계됩니다.':strategyNames[strategy]+' 전략의 연구 관측입니다.'}
  </div>
  <div className={styles.notes}>
   <p><strong>비용 가정:</strong> 선택한 0~1.00%는 매수·매도 수수료, 거래세, 슬리피지를 합친 임의 왕복 비용으로, 공식 요율이나 실제 체결비용이 아닙니다. 비용 반영 수익률은 총 모의 수익률에서 비용을 %p 단위로 차감한 근사치입니다.</p>
   <p><strong>일봉 한계:</strong> 익절·손절이 같은 날 발생하면 손절을 먼저 적용하며, 야간 갭으로 목표를 통과한 경우 다음 시가를 가정합니다. 실제 호가 순서·유동성·체결 가능 여부는 알 수 없고 수정주가 기반이므로 주문 가능한 수익이 아닙니다.</p>
   <p><strong>표본 기준:</strong> 최소 30개 평가 종목과 서로 다른 10거래일 확보 전에는 성과 숫자를 표시하지 않습니다. 각 보유기간은 완전히 확정된 KRX 거래일만 사용하며 아직 도래하지 않은 기간과 결측 구간을 0%로 치환하지 않습니다.</p>
  </div>
 </section>;
}
