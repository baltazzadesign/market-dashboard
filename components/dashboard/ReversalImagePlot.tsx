import { reversalStatus, type ReversalResult } from '@/lib/reversal-model';
const num=(n:number|null|undefined,d=0)=>n==null?'—':n.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=(n:number|null|undefined)=>n==null?'—':`${n>0?'+':''}${num(n,2)}%`;
export default function ReversalImagePlot({rows,favorites}:{rows:ReversalResult[];favorites:string[]}){
  const width=1336,height=64+Math.max(1,rows.length)*90;
  return <svg data-reversal-image-chart xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{background:'#10130f'}}>
    <rect width={width} height={64} fill="#1b1f17"/>
    {[[28,'☆'],[65,'종목 / 흐름'],[550,'시가총액'],[682,'전일 등락률'],[808,'당일 등락률'],[987,'거래량 / 20일 평균'],[1158,'20일 하한가'],[1308,'상태 / 분석']].map(([x,label],i)=><text key={i} x={x} y={i===5?26:36} textAnchor={i<2?'start':'end'} fontSize={12} fill="#9a9d95">{label}</text>)}
    <text x={987} y={47} textAnchor="end" fontSize={11} fill="#9a9d95">전일 · 당일</text>
    {!rows.length&&<text x={width/2} y={115} textAnchor="middle" fontSize={17} fill="#9a9d95">현재 필터에 표시할 종목이 없습니다.</text>}
    {rows.map((r,i)=>{
      const values=r.closes,lo=Math.min(...values),hi=Math.max(...values);
      const points=values.map((v,n)=>`${n/Math.max(values.length-1,1)*84},${27-(v-lo)/Math.max(hi-lo,1)*24}`).join(' ');
      const statusColor=r.status==='match'?'#d8ba79':r.status==='review'?'#deb27d':'#aaaca3';
      const statusBg=r.status==='match'?'#302b1c':r.status==='review'?'#35291d':'#272b23';
      const checkColor=r.checks.limit==='pass'?'#8cb89b':r.checks.limit==='fail'?'#e28f8b':'#d8ba79';
      return <g key={r.code} transform={`translate(0,${64+i*90})`}>
        <path d={`M0 0H${width}`} stroke="#30352d" strokeWidth={.7}/>
        <text x={28} y={49} fontSize={23} fill={favorites.includes(r.code)?'#d8ba79':'#6a7363'}>{favorites.includes(r.code)?'★':'☆'}</text>
        <text x={65} y={35} fontSize={16} fontWeight={650} fill="#e7e8df" textLength={r.name.length>12?210:undefined} lengthAdjust="spacingAndGlyphs">{r.name}</text>
        <text x={65} y={61} fontSize={11} fill="#9a9d95">{r.code} · {r.market.toUpperCase()}</text>
        <g transform="translate(295,29)">{values.length>1?<polyline points={points} fill="none" stroke="#879f88" strokeWidth={1.6}/>:<text x={30} y={18} fill="#9a9d95">—</text>}</g>
        <text x={550} y={35} textAnchor="end" fontSize={15} fill="#e7e8df">{r.marketCap==null?'—':num(r.marketCap/1e12,2)+'조'}</text>
        <text x={550} y={61} textAnchor="end" fontSize={12} fill="#9a9d95">{num(r.close)}원</text>
        {[682,808].map((x,n)=><text key={x} x={x} y={47} textAnchor="end" fontSize={15} fill="#84aaf5">{pct(r.rates[n])}</text>)}
        <text x={987} y={47} textAnchor="end" fontSize={14}>
          <tspan fill={r.volumeRatios[0]!=null&&r.volumeRatios[0]>150?'#e28f8b':'#d4d9ca'}>{r.volumeRatios[0]==null?'—':num(r.volumeRatios[0],1)+'%'}</tspan>
          <tspan fill="#5f6859">　/　</tspan>
          <tspan fill={r.volumeRatios[1]!=null&&r.volumeRatios[1]>150?'#e28f8b':'#d4d9ca'}>{r.volumeRatios[1]==null?'—':num(r.volumeRatios[1],1)+'%'}</tspan>
        </text>
        <text x={1158} y={47} textAnchor="end" fontSize={13} fill={checkColor}>{r.checks.limit==='pass'?'미접촉 · 산출':r.checks.limit==='fail'?'접촉 이력':'확인 필요'}</text>
        <rect x={1224} y={28} width={84} height={30} rx={4} fill={statusBg}/>
        <text x={1266} y={48} textAnchor="middle" fontSize={12} fill={statusColor}>{reversalStatus[r.status]}</text>
      </g>;
    })}
  </svg>;
}
