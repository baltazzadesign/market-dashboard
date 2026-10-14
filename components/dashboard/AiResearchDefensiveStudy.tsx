"use client";

import { useMemo,useState } from 'react';
import { evaluateBearMarketSkip,summarizeFollowups,followupHorizons,type FollowupHorizon,type StopScenario } from '@/lib/balta-ai-stop-policy';
import type { AiHorizon,AiResearchPayload,AiStrategy } from '@/lib/balta-ai-dashboard';
import styles from './AiResearchDefensiveStudy.module.css';

const scenarioOptions:{value:StopScenario;label:string}[]=[
 {value:'STOP_3',label:'-3% 손절'},
 {value:'TP5_SL3',label:'+5% 익절 / -3% 손절'},
 {value:'TP8_SL5',label:'+8% 익절 / -5% 손절'}
];
const costOptions=[0,.15,.30,.5,1];
const percent=(value:number|null,suffix='%')=>value===null?'—':(value>0?'+':'')+value.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})+suffix;
const tone=(n:number|null)=>n===null?styles.muted:n>=0?styles.up:styles.down;
export default function AiResearchDefensiveStudy({data,horizon,strategy}:{
 data:AiResearchPayload;horizon:AiHorizon;strategy:'all'|AiStrategy
}){
 const [stop,setStop]=useState<StopScenario>('STOP_3');
 const [postPeriod,setPostPeriod]=useState<FollowupHorizon>(3);
 const [cost,setCost]=useState(.3);
 const follow=useMemo(()=>summarizeFollowups(data.stopFollowups,stop,postPeriod,strategy),
  [data.stopFollowups,stop,postPeriod,strategy]);
 const policy=useMemo(()=>evaluateBearMarketSkip(data.signals,data.outcomes,horizon,strategy,cost),
  [data.signals,data.outcomes,horizon,strategy,cost]);
 const readyFollow=follow.status==='descriptive',readyPolicy=policy.status==='descriptive';
 return <section className={styles.root} aria-label="손절 후 반등 및 하락장 진입 회피 분석">
  <div className={styles.header}>
   <div><span className={styles.eyebrow}>BALTA RESEARCH · DEFENSIVE POLICY STUDY</span>
    <h2>손절 후 반등 · 하락장 진입 회피</h2>
    <p>실거래가 아닌 사후 관측 · 손절 정책과 신규 진입 제한의 효과를 독립 검증</p></div>
   <span className={styles.range}>손절 추적: 최근 {data.simulationLookbackDays}일 · 해당 거래일 종료 후 확정</span>
  </div>
  <div className={styles.columns}>
   <div className={styles.panel}>
    <h3>01. 손절 이후 주가 추적</h3>
    <div className={styles.controls}>
     <label>분석 손절
      <select value={stop} onChange={e=>setStop(e.target.value as StopScenario)}>
       {scenarioOptions.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
      </select>
     </label>
     <label>손절 후 확인 기간
      <select value={postPeriod} onChange={e=>setPostPeriod(Number(e.target.value) as FollowupHorizon)}>
       {followupHorizons.map(h=><option key={h} value={h}>{h}거래일</option>)}
      </select>
     </label>
    </div>
    <div className={styles.stats}>
     <div><small>추적 완료</small><strong>{follow.events}건</strong><span>선정일 {follow.days}일</span></div>
     <div><small>손절 이후 평균 변화</small><strong className={tone(readyFollow?follow.avgAfterStop:null)}>{readyFollow?percent(follow.avgAfterStop):'—'}</strong><span>손절 추정가 대비 확인일 종가</span></div>
     <div><small>원매수가 회복 경험</small><strong>{readyFollow&&follow.recoverHighRate!==null?follow.recoverHighRate.toFixed(1)+'%':'—'}</strong><span>손절 다음 거래일부터 고가 기준</span></div>
     <div><small>추가 최대 하락 평균</small><strong className={tone(readyFollow?follow.avgWorstPostStop:null)}>{readyFollow?percent(follow.avgWorstPostStop):'—'}</strong><span>손절 후 구간 최저가 · 종목별 평균</span></div>
    </div>
    <p className={styles.foot}>일봉에서 손절이 먼저 발생한 것으로 가정합니다. 손절 당일 고가는 반등으로 인정하지 않습니다. 손절 이후 주가 상승이 곧 재진입 수익을 의미하지 않으며, 손절·재진입 비용과 실제 체결은 고려하지 않았습니다.</p>
   </div>
   <div className={styles.panel}>
    <h3>02. 하락 우세 시 신규 진입 회피</h3>
    <div className={styles.controls}>
     <label>가상 왕복 거래비용
      <select value={cost} onChange={e=>setCost(Number(e.target.value))}>
       {costOptions.map(v=><option key={v} value={v}>{v.toFixed(2)}%</option>)}
      </select>
     </label>
    </div>
    <div className={styles.stats}>
     <div><small>비교 가능한 후보</small><strong>{policy.eligible}건</strong><span>선정일 {policy.days}일 · 미검증 {policy.unsettled}</span></div>
     <div><small>항상 진입 시 평균</small><strong className={tone(readyPolicy?policy.unconditionalNet:null)}>{readyPolicy?percent(policy.unconditionalNet):'—'}</strong><span>전체 후보 동일 가중 평균</span></div>
     <div><small>하락장 회피 시 평균</small><strong className={tone(readyPolicy?policy.conditionalNet:null)}>{readyPolicy?percent(policy.conditionalNet):'—'}</strong><span>하락 우세는 현금 0% 가정</span></div>
     <div><small>회피 정책의 차이</small><strong className={tone(readyPolicy?policy.netDifference:null)}>{readyPolicy?percent(policy.netDifference,'%p'):'—'}</strong><span>시장 우세 판단 이전의 자료만 사용</span></div>
    </div>
    <div className={styles.tradeBreakdown}>
     <span>가상 매수 <b>{policy.traded}건</b></span>
     <span>진입 회피 <b>{policy.skipped}건</b></span>
     <span>회피한 손실 <b>{policy.avoidedLosingTrades}건</b></span>
     <span>놓친 상승 <b>{policy.foregoneWinningTrades}건</b></span>
     <span>판정 유보 <b>{policy.unknown}건</b></span>
    </div>
    <p className={styles.foot}>전날 확정된 지수 등락·시장폭으로 ‘하락 우세’인 경우에만 신규 진입을 건너뜁니다. 건너뛴 자금은 현금 수익률 0%로 가정하며 실제 투자 수익과 다릅니다. 판정 유보·미검증 후보는 비교 대상에서 제외합니다.</p>
   </div>
  </div>
  <div className={styles.disclosure}>
   <strong>성과 판단 보류 조건</strong>
   손절 후 추적과 신규 진입 회피 모두 각각 최소 30건·서로 다른 10거래일 이상이어야 수익률을 공개합니다.
   4개 전략에 중복 포함된 종목은 전략별 독립 관측으로 취급하므로 통계적으로 독립인 거래 30건을 의미하지 않습니다.
   현금 수익률·시장 구분 임계값·손절 가격은 고정 연구 가정이며 실거래 주문이나 검증된 투자 조언이 아닙니다.
  </div>
 </section>;
}
