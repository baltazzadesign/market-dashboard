'use client';
import { marketClosedReason, monthWeekdaySlots } from '@/lib/market-calendar';
import { formatNumber as n } from '@/lib/balta-model';
import { investors, investorNames, type DailyMarket } from '@/lib/market-history-model';
import ChartImageButton from './ChartImageButton';
import { snapshotPlot } from './chart-image';

type Props = { month: string; today: string; days: DailyMarket[]; closedDates: Record<string,string>; asOf: string };
const WIDTH=1336, STEP=270, CELL=256, ROW=318;
const colors={foreign:'#5294ff',institution:'#ff545f',individual:'#f2ce53'};
const tone=(v:number|null)=>v===null||v===0?'#d5deca':v>0?'#ff545f':'#5294ff';
const pct=(v:number|null)=>v===null?'—':n(v,2,true)+'%';
const money=(v:number|null)=>v===null?'—':Math.abs(v)>=10000?n(v/10000,2,true)+'조':n(v,0,true)+'억';
function CalendarPlot({month,today,days,closedDates}:Props){
  const slots=monthWeekdaySlots(month),height=42+Math.ceil(slots.length/5)*ROW,byDate=new Map(days.map(d=>[d.date,d]));
  return <svg data-market-calendar-image-chart xmlns="http://www.w3.org/2000/svg" width={WIDTH} height={height} viewBox={`0 0 ${WIDTH} ${height}`}>
    {['월','화','수','목','금'].map((d,i)=><text key={d} x={i*STEP+CELL/2} y={25} textAnchor="middle" fontSize={17} fill="#a9b899">{d}</text>)}
    {slots.map((date,i)=>{
      const closure=date?(closedDates[date]??marketClosedReason(date)):null,day=!date||closure?undefined:byDate.get(date),future=Boolean(date&&date>today);
      return <g key={date||i} transform={`translate(${i%5*STEP},${42+Math.floor(i/5)*ROW})`}>
        <rect x={1} y={1} width={CELL-2} height={ROW-14} rx={7} fill={day?'#162011':'#10170d'} stroke={date&&date===today?'#d8ba79':'#34432c'}/>
        {date&&<><text x={15} y={30} fontSize={22} fontWeight={600} fill="#e1e6d5">{Number(date.slice(-2))}</text>
          <text x={CELL-15} y={28} textAnchor="end" fontSize={12} fill={day&&!day.finalized?'#d8ba79':'#8e9f7c'}>{closure?'휴장':day?(day.finalized?'마감 기록':day.time+' 미완료'):future?'예정':'기록 없음'}</text>
          {day?<>
            {(['kospi','kosdaq'] as const).map((key,j)=><g key={key}><text x={15} y={65+j*27} fontSize={14} fill="#a7b797">{key.toUpperCase()}</text><text x={CELL-15} y={65+j*27} textAnchor="end" fontSize={19} fontWeight={600} fill={tone(day[key].changePct)}>{pct(day[key].changePct)}</text></g>)}
            <path d={`M15 106H${CELL-15}`} stroke="#34432c"/>
            <text x={15} y={128} fontSize={13} fill="#a7b797">상승 {n(day.up)} / 하락 {n(day.down)}</text>
            <text x={15} y={151} fontSize={13} fill="#a7b797">시장폭</text><text x={CELL-15} y={151} textAnchor="end" fontSize={15} fill={tone(day.breadth)}>{n(day.breadth,0,true)}</text>
            {investors.map((key,j)=><g key={key}><text x={15} y={181+j*24} fontSize={14} fill={colors[key]}>{investorNames[key]}</text><text x={CELL-15} y={181+j*24} textAnchor="end" fontSize={16} fill="#e1e6d5">{money(day.flows[key])}</text></g>)}
            <text x={15} y={256} fontSize={13} fill="#a7b797">거래대금</text><text x={CELL-15} y={256} textAnchor="end" fontSize={14} fill="#d5deca">{money(day.turnover)}</text>
            <text x={15} y={281} fontSize={13} fill="#a7b797">Pulse <tspan fill="#e1e6d5">{n(day.pulse)}</tspan></text>
            <rect x={110} y={273} width={CELL-125} height={6} rx={3} fill="#35422c"/>
            {day.pulse!==null&&<rect x={110} y={273} width={(CELL-125)*Math.max(0,Math.min(100,day.pulse))/100} height={6} rx={3} fill={day.pulse>=50?'#ff545f':'#5294ff'}/>}
          </>:<text x={15} y={85} fontSize={14} fill="#819271" textLength={closure&&closure.length>17?CELL-30:undefined} lengthAdjust="spacingAndGlyphs">{closure??(future?'—':'미수집')}</text>}
        </>}
      </g>;
    })}
  </svg>;
}
export default function MarketCalendarImageButton(props:Props){
  return <ChartImageButton label="캘린더 PNG 저장" title="선택한 월 전체의 지수·수급·시장폭·거래대금·Pulse를 PNG로 저장합니다." disabled={!props.month} createJob={()=>{
    const snapshot=structuredClone(props),label=snapshot.month.replace('-','년 ')+'월';
    return {plots:1,filename:`baltatool-market-calendar-${snapshot.month}.png`,content:<CalendarPlot {...snapshot}/>,report:root=>{
      const plot=snapshotPlot(root.querySelector('svg[data-market-calendar-image-chart]'));if(!plot)throw Error('시장 캘린더 이미지가 준비되지 않았습니다.');
      return {title:'시장 캘린더',subtitle:[`${label} · KOSPI / KOSDAQ · 수급·시장폭·거래대금: 양 시장 합계`,`${snapshot.days.length}일 기록 · 조회 기준 ${snapshot.asOf||'미기록'} KST`],
        panels:[{title:label,subtitle:'월~금 · 금색 테두리는 오늘 · 미완료 기록은 해당 시각 기준',metrics:[],wide:true,plot}],
        notes:['등락률은 전일 대비입니다. 금액은 억원 / 조원 단위이며, —는 결측값입니다.','Pulse는 시장점수(−100~100)를 0~100으로 환산한 값입니다. 빨강 50 이상 / 파랑 50 미만.','주말은 숨기고 평일 휴장일은 날짜와 휴장명만 표시합니다. 미수집·예정은 거래량이나 수급 0을 뜻하지 않습니다.',...(snapshot.month.slice(0,4)!=='2026'?['2026년 외의 기간은 주말·고정 휴일만 기본 반영됩니다. 추가 휴장일 설정 여부를 확인하세요.']:[])]};
    }};
  }}/>;
}
