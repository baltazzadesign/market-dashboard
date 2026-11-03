"use client";

import type {ReactNode} from "react";
import {formatNumber, valueClass, type MarketEvent, type MarketRow} from "@/lib/balta-model";
import {breadthScoreDetails} from "@/lib/breadth-score";
import {flowMarketNames, selectMarketRows} from "@/lib/market-flow-selection";
import type {MarketPulse} from "@/lib/market-pulse";
import {FlowMarketPicker, useFlowMarket} from "./FlowMarketContext";
import {Brand} from "./Icon";
import {Metrics, FlowPanel, SignalPanel} from "./Insights";
import MarketPulsePanel from "./MarketPulse";
import SectorHeatmap from "./SectorHeatmap";
import styles from "./DailyCommandCenter.module.css";

type Props = {
  date: string;
  rows: MarketRow[];
  events: MarketEvent[];
  pulse: MarketPulse;
  sectorStatus: string;
  warning: string;
  loading: boolean;
  controls: ReactNode;
  children: ReactNode;
  onSignal: (minute: number) => void;
  onRecords: () => void;
};

function PulseCard({pulse}: {pulse: MarketPulse}) {
  return <section className={styles.pulse}>
    <svg viewBox="0 0 96 64" aria-hidden="true">
      <path d="M8 52 A40 40 0 0 1 88 52" fill="none" stroke="#35372e" strokeWidth="8" strokeLinecap="round"/>
      {pulse.score !== null && pulse.score > 0 && <path d="M8 52 A40 40 0 0 1 88 52" fill="none" stroke="#dfb556" strokeWidth="8" strokeLinecap="round" pathLength="100" strokeDasharray={`${pulse.score} 100`}/>}
      <text x="48" y="49" textAnchor="middle" fill="currentColor" fontSize="24" fontWeight="700">{formatNumber(pulse.score)}</text>
    </svg>
    <div><small>Market Pulse</small><strong><span className="sr-only">{formatNumber(pulse.score)}점 </span>{pulse.regime}</strong><span>{pulse.time ? "정규장 "+pulse.time : "정규장 기록 대기"}</span></div>
  </section>;
}

function BreadthCard({row, marketName}: {row?: MarketRow; marketName: string}) {
  const breadth = breadthScoreDetails(row);
  return <section className={styles.breadth}>
    <h3>시장 폭 <small>{marketName}</small></h3>
    {row && breadth ? <>
      <strong className={valueClass(row.diff)}>{formatNumber(row.diff,0,true)}<small> 종목</small></strong>
      <p>{row.up === row.down ? "상승·하락 종목 수가 같습니다." : Math.min(row.up,row.down) > 0 ? (row.down > row.up ? "하락 종목이 상승 종목의 " : "상승 종목이 하락 종목의 ") + formatNumber(Math.max(row.up,row.down) / Math.min(row.up,row.down),1) + "배" : (row.up > row.down ? "상승 종목 우위" : "하락 종목 우위")}</p>
      <div className={styles.strip} aria-hidden="true">
        <i style={{width:breadth.upPercent+"%",background:"var(--up)"}}/><i style={{flex:1}}/><i style={{width:breadth.downPercent+"%",background:"var(--down)"}}/>
      </div>
      <div className={styles.counts}><span>상승 {formatNumber(row.up)}</span><span>보합 {formatNumber(row.flat)}</span><span>하락 {formatNumber(row.down)}</span></div>
      {breadth.held && <small>직전 시장폭 유지</small>}
    </> : <p>시장 폭 기록 대기</p>}
  </section>;
}

export default function DailyCommandCenter({date,rows,events,pulse,sectorStatus,warning,loading,controls,children,onSignal,onRecords}: Props) {
  const {market} = useFlowMarket();
  const last = rows.at(-1);
  const breadthRow = last && selectMarketRows([last],market)[0];
  return <div className={styles.shell}>
    <header className={styles.hero}>
      <Brand/><div className={styles.kicker}>BALTA TOOL　/　COMMAND CENTER</div>
      <h2>시장 커맨드센터</h2><p>{date}　·　{last ? last.time+" 기준" : "기록 대기"}</p>
    </header>
    <div className={styles.frame}>
      <div className={styles.controls}><FlowMarketPicker/>{controls}</div>
      {warning && <p role="status" className={styles.warning}>{warning}</p>}
      <Metrics rows={rows} loading={loading} pulseCard={<PulseCard pulse={pulse}/>}/>
      <div className={styles.grid}>
        <FlowPanel row={last} diverging/>
        <BreadthCard row={breadthRow} marketName={flowMarketNames[market]}/>
        <SectorHeatmap key={date} dateOverride={date} compact distribution/>
        <SignalPanel events={events} onSelect={onSignal} onAll={onRecords}/>
      </div>
      <details className={styles.more}><summary>Market Pulse 판정 상세</summary>
        <MarketPulsePanel pulse={pulse} sectorStatus={sectorStatus} warning={warning}/>
      </details>
      <h3 className={styles.chartTitle}>장중 흐름 차트</h3>{children}
    </div>
  </div>;
}
