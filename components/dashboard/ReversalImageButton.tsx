'use client';
import { useState } from 'react';
import { reversalLabels, reversalStatus, type ReversalResult } from '@/lib/reversal-model';
import type { ReversalScan } from './useReversalScanner';
import ChartImageButton from './ChartImageButton';

const size = 30;
const num = (n: number | null | undefined, digits = 0) => n == null ? '—' : n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (n: number | null | undefined) => n == null ? '—' : `${n > 0 ? '+' : ''}${num(n, 2)}%`;
export default function ReversalImageButton({ scan, rows, running, filters }: {
  scan: ReversalScan; rows: ReversalResult[]; running: boolean; filters: string;
}) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size)), current = Math.min(page, pages);
  return <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
    {pages > 1 && <select aria-label="PNG 저장 페이지" value={current} onChange={e=>setPage(Number(e.target.value))}>
      {Array.from({length:pages},(_,i)=><option key={i} value={i+1}>PNG {i+1}/{pages} · {i*size+1}–{Math.min((i+1)*size,rows.length)}종목</option>)}
    </select>}
    <ChartImageButton label="후보 PNG 저장" title="현재 필터·정렬의 종목과 검색 기준을 저장합니다. 30종목씩 페이지를 선택할 수 있습니다." disabled={running || !scan.date} createJob={()=>{
      const snapshot = structuredClone(scan), selected = structuredClone(rows.slice((current-1)*size,current*size));
      const count = rows.length, pageNumber = current, pageCount = pages;
      const stamp = (value:string) => value ? new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST' : '미기록';
      return {content:null,plots:0,filename:`baltatool-reversal-${snapshot.date}-${pageNumber}of${pageCount}.png`,report:()=>({
        title:'급락 반등 후보 · 실험 전략',
        subtitle:[`${snapshot.date} · ${snapshot.phase==='intraday'?'장중 잠정':'장후 후보'} · ${snapshot.stage==='done'?'조회 완료':'일부 결과 · 전체 후보 미확정'}`,
          filters,`필터 결과 ${count}종목 · ${pageNumber}/${pageCount}페이지 · 시세 조회 ${snapshot.checked}/${snapshot.total}종목 · 실패·누락 ${snapshot.issues.length}종목`,
          `검색 시작 ${stamp(snapshot.startedAt)} · 완료 ${stamp(snapshot.finishedAt)}${snapshot.saved?' · 브라우저 저장본':''}`],
        panels:[],
        tables:[{title:selected.length?'조건별 후보 목록':'표시할 종목이 없습니다',subtitle:'등락률은 전일 종가 대비 · 거래량 비율은 각 신호일을 제외한 직전 20거래일 평균 대비',
          columns:[{label:'종목 / 코드',weight:2},{label:'시가총액 / 현재가',weight:1.4},{label:'전일 등락률',color:'#75a8f5'},{label:'당일 등락률',color:'#75a8f5'},{label:'거래량 비율\n전일 / 당일',weight:1.4},{label:'20일 하한가',weight:1.1},{label:'판별 상태',weight:1.1}],
          rows:selected.map(r=>[`${r.name}\n${r.code} · ${r.market.toUpperCase()}`,`${r.marketCap==null?'—':num(r.marketCap/1e12,2)+'조'}\n${num(r.close)}원`,pct(r.rates[0]),pct(r.rates[1]),r.volumeRatios.map(v=>v==null?'—':num(v,1)+'%').join(' / '),r.checks.limit==='pass'?'미접촉 · 산출':r.checks.limit==='fail'?'접촉 이력':'확인 필요',reversalStatus[r.status]])}],
        notes:[...Object.values(reversalLabels),
          '시총 = 최신 일봉 가격 × 현재 상장주수. 정규장 마감값 확정 여부 미검증 · 종목별 조회시점이 다릅니다.',
          '장중 누적 거래량은 확정 거래량이 아닙니다. 장 마감 후 재확인하세요. 관찰 후보이며 매수·수익을 보장하지 않습니다.',
          ...(snapshot.stage!=='done'||snapshot.issues.length?['조회 누락 종목에 후보가 있을 수 있습니다. 현재 결과는 전체 시장의 최종 후보가 아닙니다.']:[]),...snapshot.warnings],
      })};
    }}/>
  </div>;
}
