"use client";

import {useMemo,useState} from 'react';
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {aiStrategies,type AiResearchPayload,type AiStrategy} from '@/lib/balta-ai-dashboard';
import {defaultPortfolioConfig,replayPortfolio,type PortfolioPolicy,type PortfolioHorizon} from '@/lib/balta-ai-portfolio';
import styles from './AiResearchPortfolio.module.css';

const strategyNames:Record<AiStrategy,string>={
 FLOW_V1:'외국인·기관 동반 순매수',FLOW_ACCEL_V1:'수급 가속',
 FLOW_PERSIST_V1:'5일 지속·상대 강도',FLOW_LIQUID_V1:'거래대금 보정'
};
const percentages=(v:number|null,suffix='%')=>v===null?'—':(v>0?'+':'')+
 v.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})+suffix;
const won=(v:number)=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(v);
const exitStyles=(v:number|null)=>v===null?styles.muted:v>0?styles.gain:v<0?styles.loss:styles.muted;

export default function AiResearchPortfolio({data}:{data:AiResearchPayload}){
 const [strategy,setStrategy]=useState<AiStrategy>('FLOW_V1');
 const [horizon,setHorizon]=useState<PortfolioHorizon>(3);
 const [policy,setPolicy]=useState<PortfolioPolicy>('REGIME');
 const [maxPositions,setMaxPositions]=useState<3|5|10>(5);
 const [cost,setCost]=useState(.30);
 const [riskStop,setRiskStop]=useState(8);
 const [lossPause,setLossPause]=useState(2);
 const signals=useMemo(()=>{
  const floor=new Date(data.asOf+'T00:00:00Z');
  floor.setUTCDate(floor.getUTCDate()-data.portfolioLookbackDays+1);
  const from=floor.toISOString().slice(0,10);
  return data.signals.filter(s=>s.trade_date>=from);
 },[data]);
 const result=useMemo(()=>replayPortfolio(signals,data.portfolioSessions,data.portfolioBars,{
  ...defaultPortfolioConfig,strategy,horizon,policy,maxPositions,
  roundTripCostPct:cost,drawdownBrakePct:riskStop,lossPauseDays:lossPause
 },data.asOf),[signals,data.portfolioSessions,data.portfolioBars,data.asOf,strategy,horizon,policy,maxPositions,cost,riskStop,lossPause]);
 const tradeDays=new Set(result.trades.map(x=>x.entryDate)).size;
 const sufficient=result.status==='ready'&&result.trades.length>=30&&tradeDays>=10;
 const chart=useMemo(()=>result.days.map(d=>({date:d.date.slice(5),equity:+(d.equity/1e8*100).toFixed(3)})),[result.days]);
 const stat=useMemo(()=>({
  entry:result.days.reduce((sum,d)=>sum+d.entries,0),
  last:result.days.at(-1),
  paused:result.days.filter(d=>d.paused).length
 }),[result.days]);
 return <section className={styles.root} aria-label="포트폴리오 위험관리 시뮬레이션">
  <div className={styles.header}>
   <div>
    <span className={styles.eyebrow}>BALTA RESEARCH · PORTFOLIO RISK LAB</span>
    <h2>포트폴리오 위험관리</h2>
    <p>여러 종목 동시 보유 시 가상 계좌의 자본 배분·현금·손실 위험을 검증합니다.</p>
   </div>
   <div className={styles.startCapital}>가상 초기자금 <strong>1억 원</strong><span>실거래 없음</span></div>
  </div>
  <div className={styles.controls}>
   <label>수급 전략<select value={strategy} onChange={e=>setStrategy(e.target.value as AiStrategy)}>
    {aiStrategies.map(s=><option key={s} value={s}>{strategyNames[s]}</option>)}
   </select></label>
   <label>종목 보유<select value={horizon} onChange={e=>setHorizon(Number(e.target.value) as PortfolioHorizon)}>
    {[1,3,5].map(v=><option key={v} value={v}>{v}거래일 후 종가 청산</option>)}
   </select></label>
   <label>시장별 투자 비중<select value={policy} onChange={e=>setPolicy(e.target.value as PortfolioPolicy)}>
    <option value="REGIME">시장별 차등 · 상승 80 / 횡보 50 / 하락 20%</option>
    <option value="FIXED_50">일정 50% · 시장 상태 불명 시 제외</option>
   </select></label>
   <label>최대 보유 종목<select value={maxPositions} onChange={e=>setMaxPositions(Number(e.target.value) as 3|5|10)}>
    {[3,5,10].map(v=><option key={v} value={v}>{v}개</option>)}
   </select></label>
   <label>왕복 비용 가정<select value={cost} onChange={e=>setCost(Number(e.target.value))}>
    {[0,.15,.30,.50,1].map(v=><option key={v} value={v}>{v.toFixed(2)}%</option>)}
   </select></label>
   <label>계좌 낙폭 매수 제한<select value={riskStop} onChange={e=>setRiskStop(Number(e.target.value))}>
    {[5,8,10,15].map(v=><option key={v} value={v}>고점 대비 -{v}% 도달 시</option>)}
   </select></label>
   <label>연속 손실 시 휴식<select value={lossPause} onChange={e=>setLossPause(Number(e.target.value))}>
    {[0,1,2,3,5].map(v=><option key={v} value={v}>{v===0?'미적용':v+'거래일 매수 제한'}</option>)}
   </select></label>
  </div>
  <div className={styles.rail}>
   <span><strong>동시 보유</strong> 최대 {maxPositions}개</span>
   <span><strong>종목당 상한</strong> 자산의 20%</span>
   <span><strong>낙폭 제한</strong> 이후 3거래일 신규 매수 제한</span>
   <span><strong>중복 매수</strong> 금지</span>
   <span><strong>자료 불일치</strong> 계산 중단</span>
  </div>
  <div className={styles.status}>
   <strong className={result.status==='incomplete'?styles.warning:styles.gold}>
    {result.status==='empty'?'후보 기록 대기':result.status==='incomplete'?'계좌 검증 미완료':sufficient?'관측된 모의 계좌 성과':'검증 표본 축적 중'}
   </strong>
   <span>종가 평가 {result.days.length}거래일 · 청산 {result.trades.length}건 · 서로 다른 진입일 {tradeDays}일 · {data.portfolioLookbackDays}일 범위</span>
  </div>
  <div className={styles.metrics}>
   <div><small>가상 계좌 누적 수익률</small><strong className={exitStyles(sufficient?result.totalReturnPct:null)}>{sufficient?percentages(result.totalReturnPct):'—'}</strong><span>초기 1억 원 대비 순자산 · 비용 가정 반영</span></div>
   <div><small>최대 낙폭 (MDD)</small><strong className={exitStyles(sufficient?result.maxDrawdownPct:null)}>{sufficient?percentages(result.maxDrawdownPct):'—'}</strong><span>계좌 일별 종가 기준 · 장중 MDD 아님</span></div>
   <div><small>가상 현금 비중</small><strong>{sufficient?percentages(result.cashEndPct):'—'}</strong><span>시장 상태·현금 투자 여력 반영</span></div>
   <div><small>최대 연속 손실일</small><strong>{sufficient?result.maxConsecutiveLossDays+'일':'—'}</strong><span>청산 손익이 음수인 거래일 연속</span></div>
  </div>
  <div className={styles.chartWrap}>
   <div className={styles.chartHead}><h3>계좌 순자산 변화</h3><span>시작 지수 100 · 확정된 종가만 표시</span></div>
   <div className={styles.chart}>
    {!sufficient?<div className={styles.empty}>
      {result.status==='incomplete'? '평가가격 누락으로 계좌 시뮬레이션이 중단됐습니다.':'최소 30개 청산과 서로 다른 10거래일의 진입 기록이 쌓인 뒤 순자산 차트를 표시합니다.'}
    </div>:<ResponsiveContainer width="100%" height="100%">
     <LineChart data={chart} margin={{left:0,right:20,top:20,bottom:10}}>
      <CartesianGrid vertical={false} stroke="#354034" strokeDasharray="3 4"/>
      <XAxis dataKey="date" tickLine={false} axisLine={false} stroke="#93a296" fontSize={11} minTickGap={16}/>
      <YAxis tickLine={false} axisLine={false} stroke="#93a296" fontSize={11} width={46} tickFormatter={v=>v.toFixed(0)}/>
      <Tooltip contentStyle={{background:'#111a13',border:'1px solid #665c3b',color:'#ebdba9',borderRadius:6}} formatter={v=>[typeof v==='number'?v.toFixed(2):String(v),'계좌 지수']} />
      <Line type="monotone" dataKey="equity" name="순자산" stroke="#e3c180" strokeWidth={2.5} dot={false} connectNulls={false}/>
     </LineChart>
    </ResponsiveContainer>}
   </div>
  </div>
  <div className={styles.bottom}>
   <span>신규 진입 가정 <strong>{stat.entry}건</strong></span>
   <span>잔여 가상 포지션 <strong>{result.openPositions}개</strong></span>
   <span>매수 제한일 <strong>{stat.paused}일</strong></span>
   <span>중복 신호 제외 <strong>{result.duplicateSignals}건</strong></span>
   <span>시장 판정 유보일 <strong>{result.unknownRegimes}일</strong></span>
   <span>가격 누락 <strong>{result.rejectedMissingPrice}건</strong></span>
  </div>
  <p className={styles.disclaimer}><strong>연구용 포트폴리오</strong> 비중 80/50/20%, 낙폭 -8%, 종목당 20%, 연속 손실 휴식은 검증된 최적값이 아닌 고정 연구 가정입니다. 지난 종가에서 손실을 확인한 후 <strong>다음 거래일</strong>부터 신규 진입을 제한하며 보유 종목을 즉시 강제 청산하지 않습니다. 소수점 수량·당일 시가 진입·종가 청산 및 왕복비용 분할은 실행 불가능할 수 있는 가상 가정입니다. 미확정·누락 가격은 보정하지 않고, 첫 관측일 전 기존 포지션을 소급하지 않으므로 계산 기간 밖의 손실·거래 기회는 반영되지 않습니다. 이는 30일 이내 연구 표본일 뿐 실제 계좌 수익률이나 위험 한도 보장이 아닙니다.</p>
 </section>;
}
