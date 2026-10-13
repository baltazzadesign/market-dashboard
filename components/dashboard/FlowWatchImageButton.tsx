'use client';
import { useState } from 'react';
import { monthWeekdaySlots } from '@/lib/market-calendar';
import { investorLabel, rankingAmount, rankingMarketLabels } from '@/lib/investor-ranking';
import { flowWatchKinds, flowWatchLabels, type FlowWatchEvent, type FlowWatchKind, type FlowWatchReport } from '@/lib/investor-flow-watch';
import ChartImageButton from './ChartImageButton';
import { snapshotPlot } from './chart-image';
const colors={buying:'#d67f72',exit:'#75a6dc',reentry:'#c8b77e'};
const amount=(v:number|null|undefined)=>v==null?'—':rankingAmount(v);
const ratio=(v:number|null)=>v==null?'—':v.toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
const WIDTH=1336, PAGE_SIZE=30;
function CalendarPlot({data}:{data:FlowWatchReport}){
  const slots=monthWeekdaySlots(data.month),height=42+Math.ceil(slots.length/5)*154;
  return <svg data-flow-watch-image-chart xmlns="http://www.w3.org/2000/svg" width={WIDTH} height={height} viewBox={`0 0 ${WIDTH} ${height}`}>
    {['월','화','수','목','금'].map((d,i)=><text key={d} x={i*268+126} y={24} textAnchor="middle" fontSize={17} fill="#adb99d">{d}</text>)}
    {slots.map((date,i)=>{
      const day=data.days.find(d=>d.date===date),active=day&&(day.status==='ready'||day.status==='partial');
      return <g key={date||i} transform={`translate(${i%5*268},${42+Math.floor(i/5)*154})`}>
        <rect width={256} height={142} rx={6} fill={date===data.selectedDate?'#29301c':'#111a0e'} stroke={date===data.selectedDate?'#d8ba79':'#3d4d31'}/>
        {date&&<><text x={16} y={29} fontSize={19} fill={active?'#d7dfc8':'#7d8b70'}>{Number(date.slice(-2))}</text>
          <text x={239} y={27} textAnchor="end" fontSize={12} fill="#c7b57f">{day?.status==='partial'?'일부':day?.backfilled?'소급':''}</text>
          {active?flowWatchKinds.map((kind,n)=><g key={kind}><text x={16} y={60+n*29} fontSize={16} fill={colors[kind]}>{kind==='buying'?'연속':kind==='exit'?'이탈':'재매수'}</text><text x={238} y={60+n*29} textAnchor="end" fontSize={19} fill={colors[kind]}>{day.covered?day.counts[kind].toLocaleString('ko-KR'):'—'}</text></g>)
            :<text x={16} y={85} fontSize={15} fill="#809172">{day?.status==='future'?'—':day?.reason||'미수집'}</text>}
        </>}
      </g>;
    })}
  </svg>;
}
function WatchPlot({data,rows,kind}:{data:FlowWatchReport;rows:FlowWatchEvent[];kind:FlowWatchKind}){
  const height=64+Math.max(1,rows.length)*106;
  const headings=['종목 · 최근 10거래일','당일 순매수',kind==='buying'?'매수 지속':'직전 매수 구간',kind==='buying'?'연속 구간 합계':'직전 구간 합계',kind==='buying'?'최근 5일 합계':kind==='exit'?'당일 이탈 비율':'재매수 / 매도구간','확인 포인트'];
  return <svg data-flow-watch-image-chart xmlns="http://www.w3.org/2000/svg" width={WIDTH} height={height} viewBox={`0 0 ${WIDTH} ${height}`} style={{background:'#111a0e'}}>
    <rect width={WIDTH} height={64} fill="#1b2616"/>
    {headings.map((h,i)=><text key={h} x={[18,465,635,825,1040,1080][i]} y={38} textAnchor={i===0||i===5?'start':'end'} fontSize={14} fill="#adb99d">{h}</text>)}
    {!rows.length&&<text x={WIDTH/2} y={120} textAnchor="middle" fontSize={17} fill="#97a987">{data.selected.status==='ready'||data.selected.status==='partial'?(data.selected.covered?'현재 조건에 해당하는 종목이 없습니다.':'해당 투자자의 당일 금액이 확인되지 않았습니다.'):data.selected.reason||'선택한 날짜의 수급 이력이 없습니다.'}</text>}
    {rows.map((r,i)=>{
      const run=kind==='buying'?r.run:r.previousRun,maximum=Math.max(1,...r.trail.map(t=>Math.abs(t.net??0)));
      const tag=kind==='buying'?(r.newStreak?`오늘 ${data.criteria.minimumDays}일 달성`:'매수 지속'):kind==='exit'?'첫 순매도':'재매수 첫날';
      return <g key={r.code} transform={`translate(0,${64+i*106})`}>
        <path d={`M0 0H${WIDTH}`} stroke="#2b3a23"/>
        <text x={18} y={29} fontSize={17} fill="#e0e5d1" textLength={r.name.length>16?310:undefined} lengthAdjust="spacingAndGlyphs">{r.name}</text>
        <text x={18} y={49} fontSize={11} fill="#839474">{r.code} · {r.market.toUpperCase()}</text>
        {r.trail.map((t,n)=>{const h=t.net==null?0:t.net===0?1:Math.max(3,Math.abs(t.net)/maximum*22);return <g key={t.date} transform={`translate(${18+n*16},61)`}><rect width={12} height={30} rx={2} fill="#1e2b18"/>{t.net==null?<text x={6} y={21} textAnchor="middle" fill="#7a8671">·</text>:<rect x={3} y={(30-h)/2} width={6} height={h} rx={1} fill={t.net>0?colors.buying:t.net<0?colors.exit:'#7a8671'}/>}</g>;})}
        <text x={465} y={48} textAnchor="end" fontSize={18} fill={r.net>=0?colors.buying:colors.exit}>{amount(r.net)}</text>
        <text x={635} y={40} textAnchor="end" fontSize={17} fill="#dce1d0">{run?`${run.days}일${run.exact?'':' 이상'}`:'—'}</text>
        <text x={635} y={64} textAnchor="end" fontSize={12} fill="#8a9c7a">{run?run.start.slice(5)+'부터':''}</text>
        <text x={825} y={40} textAnchor="end" fontSize={17} fill="#dce1d0">{amount(run?.total)}</text>
        {!run?.exact&&<text x={825} y={64} textAnchor="end" fontSize={12} fill="#8a9c7a">확인된 구간 합계</text>}
        <text x={1040} y={40} textAnchor="end" fontSize={17} fill="#dce1d0">{kind==='buying'?amount(r.fiveDayNet):ratio(kind==='exit'?r.sellRatio:r.reentryRatio)}</text>
        <text x={1040} y={64} textAnchor="end" fontSize={12} fill="#8a9c7a">{kind==='buying'?'5거래일 모두 확인 시':kind==='exit'?'직전 구간 순매수액 대비':`매도 ${amount(r.soldAmount)}억 대비`}</text>
        <rect x={1080} y={23} width={158} height={30} rx={4} fill="#1d2b18"/>
        <text x={1090} y={44} fontSize={14} fill={colors[kind]}>{tag}</text>
        <text x={1080} y={76} fontSize={12} fill="#8a9c7a">{kind==='reentry'?`${r.exitDate?.slice(5)} 이탈 · ${r.gapDays}거래일 후`:kind==='exit'?'0원 중단은 이탈에서 제외':'종목 차트에서 가격 흐름 확인'}</text>
      </g>;
    })}
  </svg>;
}
export default function FlowWatchImageButton({data,rows,kind,query,sort,calendar=false}:{data:FlowWatchReport;rows:FlowWatchEvent[];kind:FlowWatchKind;query:string;sort:string;calendar?:boolean}){
  const [page,setPage]=useState(1),pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE)),current=Math.min(page,pages);
  return <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
    {!calendar&&pages>1&&<select aria-label="수급 PNG 저장 페이지" value={current} onChange={e=>setPage(Number(e.target.value))}>{Array.from({length:pages},(_,i)=><option key={i} value={i+1}>PNG {i+1}/{pages} · {i*PAGE_SIZE+1}–{Math.min((i+1)*PAGE_SIZE,rows.length)}종목</option>)}</select>}
    <ChartImageButton label={calendar?'캘린더 PNG 저장':'추적 PNG 저장'} title={calendar?'현재 월·투자자·조건의 수급 캘린더를 저장합니다.':'현재 분류·검색·정렬의 목록을 최근 10거래일 흐름과 함께 저장합니다. 30종목씩 페이지를 선택할 수 있습니다.'} createJob={()=>{
      const snapshot=structuredClone(data),selected=structuredClone(rows.slice((current-1)*PAGE_SIZE,current*PAGE_SIZE)),count=rows.length,p=calendar?1:current,pc=calendar?1:pages;
      const d=snapshot.selected,c=snapshot.criteria,hasDay=(d.status==='ready'||d.status==='partial')&&d.covered>0;
      return {plots:1,content:calendar?<CalendarPlot data={snapshot}/>:<WatchPlot data={snapshot} rows={selected} kind={kind}/>,
        filename:`baltatool-flow-${calendar?'calendar':kind}-${snapshot.investor}-${snapshot.market}-${calendar?snapshot.month:snapshot.selectedDate}-${p}of${pc}.png`,
        report:root=>{
          const plot=snapshotPlot(root.querySelector('svg[data-flow-watch-image-chart]'));if(!plot)throw Error('수급 이미지가 준비되지 않았습니다.');
          return {title:`${investorLabel(snapshot.investor)} · ${calendar?'수급 캘린더':flowWatchLabels[kind]+' 추적'}`,
            subtitle:[`${calendar?snapshot.month:snapshot.selectedDate} · ${rankingMarketLabels[snapshot.market]} · 단위 억원 · KRX 일별 순매수`,
              `연속 ${c.minimumDays}거래일 이상 · 이탈 후 ${c.reentryWindow}거래일 이내 재매수 · 당일 금액 절댓값 ${c.minimumAmount}억원 이상`,
              ...(calendar?[`선택일 ${snapshot.selectedDate} · 월~금 · 연속은 진행 종목 수, 이탈·재매수는 당일 신규 발생 수`]:[`${sort==='days'?'매수 연속일 긴 순':sort==='accumulated'?'매수 구간 누적액 큰 순':'당일 금액 큰 순'}${query.trim()?' · 검색: '+query.trim():''} · 검색 결과 ${count}종목 · ${p}/${pc}페이지`,
                `당일 금액 확인 ${d.covered}/${d.expected}종목 · 판단 보류 ${d.undetermined}종목 · ${d.status==='ready'?'수집 이력 기준':d.status==='partial'?'일부 이력 · 확인된 신호만 표시':d.reason||'미수집'}`]),
              `선택일 이력 보완 ${d.observedAt?new Date(d.observedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})+' KST':'미기록'}${d.backfilled?' · 소급조회':''}`],
            panels:[{title:calendar?`${snapshot.month.replace('-','년 ')}월`:`${flowWatchLabels[kind]} · ${count}종목`,subtitle:calendar?'금색 테두리는 선택일 · 일부 / 소급 / 미수집 / 휴장 구분':'막대: 최근 10거래일 순매수 · 빨강 매수 / 파랑 매도 / 점 미확인',wide:true,
              metrics:flowWatchKinds.map(k=>({label:'선택일 '+flowWatchLabels[k],value:hasDay?d.counts[k].toLocaleString('ko-KR')+'종목':'—',color:colors[k]})),plot}],
            notes:[...(calendar?['날짜별 집계는 종목 검색과 목록 분류 선택의 영향을 받지 않습니다. 같은 종목이 여러 날짜에 포함될 수 있습니다.','일부: 금액 누락·이력 부족 포함. 미수집·미확인 값은 0종목으로 간주하지 않습니다.']:['목록은 현재 검색·정렬 기준입니다. 상단 선택일 집계는 검색 전 전체 집계입니다.','N일 이상: 시작 이전 기록이 없어 확인된 구간만 표시. 이탈·재매수 비율은 금액 비교이며 보유비중·수익률이 아닙니다.']),
              `이력 확인 범위 ${snapshot.historyStart??'없음'} ~ ${snapshot.historyEnd??'없음'} · 한국투자증권`,...snapshot.warnings],
          };
        }};
    }}/>
  </div>;
}
