'use client';
import { investorLabel, rankingAmount, rankingMarketLabels, rankingNotes, streakLabel, type RankingEntry, type RankingResponse } from '@/lib/investor-ranking';
import ChartImageButton from './ChartImageButton';
import { snapshotPlot } from './chart-image';

function RankingPlot({rows,color,maximum}:{rows:RankingEntry[];color:string;maximum:number}){
  const width=640,height=Math.max(150,rows.length*70+8);
  return <svg data-investor-ranking-chart width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" style={{background:'#0d120e'}}>
    {!rows.length&&<text x={20} y={50} fill="#a5b099" fontSize={18}>해당 방향의 순매수 종목이 없습니다.</text>}
    {rows.map((row,i)=><g key={row.code} transform={`translate(0,${i*70})`}>
      <text x={6} y={27} fill="#83917a" fontSize={16}>{String(i+1).padStart(2,'0')}</text>
      <text x={42} y={26} fill="#e4e6dc" fontSize={20} fontWeight={600} textLength={row.name.length>14?335:undefined} lengthAdjust="spacingAndGlyphs">{row.name}</text>
      <text x={632} y={27} textAnchor="end" fill={color} fontSize={21} fontWeight={600}>{rankingAmount(row.net)}</text>
      <text x={42} y={46} fill="#8d9d84" fontSize={12}>{row.code} · {row.market.toUpperCase()} · {streakLabel(row)}</text>
      <rect x={42} y={55} width={Math.max(1,Math.abs(row.net)/maximum*590)} height={5} rx={2.5} fill={color} opacity={.8}/>
      <path d="M42 68H634" stroke="#263322" strokeWidth={.6}/>
    </g>)}
  </svg>;
}
export default function InvestorRankingImageButton({data,disabled}:{data:RankingResponse|null;disabled:boolean}){
  return <ChartImageButton label="순위 PNG 저장" title="선택한 날짜·주체·시장의 순위와 수집 범위를 한 장으로 저장합니다." disabled={disabled||!data?.group?.covered} createJob={()=>{
    const snapshot=structuredClone(data);if(!snapshot?.group)throw Error('저장할 순위가 없습니다.');
    const group=snapshot.group,label=investorLabel(group.investor),maximum=Math.max(1,...group.buy.map(r=>r.net),...group.sell.map(r=>-r.net));
    const panels=[{rows:group.buy,title:'순매수 TOP30',color:'#f07979',total:group.buyTotal,count:group.buyCount},{rows:group.sell,title:'순매도 TOP30',color:'#75a8f5',total:group.sellTotal,count:group.sellCount}];
    return {plots:2,filename:`baltatool-investor-${group.investor}-${group.market}-${snapshot.date}.png`,
      content:<div style={{display:'flex',gap:20}}>{panels.map(p=><RankingPlot key={p.title} rows={p.rows} color={p.color} maximum={maximum}/>)}</div>,
      report:root=>{
        const plots=Array.from(root.querySelectorAll<SVGSVGElement>('svg[data-investor-ranking-chart]')).map(svg=>snapshotPlot(svg));
        if(plots.length!==2||plots.some(p=>!p))throw Error('순위 이미지가 준비되지 않았습니다.');
        return {title:`${label} 매매 순위`,subtitle:[`${snapshot.date} · ${rankingMarketLabels[group.market]} · 금액 단위 억원 · KRX 일별 순매수`,
          `금액 확인 ${group.covered.toLocaleString('ko-KR')} / 대상 ${group.expected.toLocaleString('ko-KR')}종목 · ${group.covered===group.expected?'수집 완료':'일부 수집 — 전체 대상 순위 미확정'}`,
          `수집 완료 시각 ${new Date(snapshot.collectedAt!).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})} KST · 장후 조회 자료 · 원천 확정 여부 미검증`],
          panels:panels.map((p,i)=>({title:p.title,subtitle:`확인 범위 ${p.count}종목 중 상위 ${p.rows.length}종목 · 양쪽 막대 동일 금액 척도`,
            metrics:[{label:'해당 방향 전체 합계',value:rankingAmount(p.total)+'억',color:p.color},{label:'표시 TOP30 합계',value:rankingAmount(p.rows.reduce((sum,r)=>sum+r.net,0))+'억',color:p.color}],plot:plots[i]})),notes:rankingNotes(snapshot)};
      }};
  }}/>;
}
