"use client";
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,CartesianGrid,Tooltip,Legend,Brush} from 'recharts';
import {type MarketRow,minuteLabel} from '@/lib/balta-model';
import {overlayRows} from '@/lib/market-research';
const colors=['#5294ff','#ff667a','#f2ce53','#a58aff'];
export default function ResearchCharts({days,metric,relative}:{days:{date:string;rows:MarketRow[]}[];metric:'foreignFlow'|'instFlow'|'indivFlow'|'diff'|'kospi'|'kosdaq';relative:boolean}){
 const data=overlayRows(days,metric,relative),unit=metric==='diff'?'종목':metric==='kospi'||metric==='kosdaq'?relative?'%':'pt':'억원';
 return <div style={{height:420,width:'100%'}}><ResponsiveContainer><LineChart data={data} margin={{top:15,right:20,bottom:10,left:12}}><CartesianGrid stroke="#252d38" strokeDasharray="3 3"/><XAxis dataKey="minute" tickFormatter={minuteLabel} minTickGap={45} stroke="#8d98a8"/><YAxis width={72} domain={['auto','auto']} stroke="#8d98a8" tickFormatter={v=>Number(v).toLocaleString('ko-KR',{maximumFractionDigits:1})}/><Tooltip labelFormatter={v=>minuteLabel(Number(v))} formatter={(v)=>[Number(v).toLocaleString('ko-KR',{maximumFractionDigits:2})+' '+unit]} contentStyle={{background:'#14191f',border:'1px solid #343b46',color:'#e0e5ee'}}/><Legend/>{days.map((d,i)=><Line key={d.date} dataKey={d.date} name={d.date} stroke={colors[i]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false}/>)}<Brush dataKey="minute" tickFormatter={minuteLabel} height={25} stroke="#5294ff" fill="#14191f"/></LineChart></ResponsiveContainer></div>;
}
