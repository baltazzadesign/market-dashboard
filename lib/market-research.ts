import {type MarketRow, type MarketEvent, numeric, record,signalLabel,eventDirection,eventLevel} from './balta-model';

export type Sector={
 code:string;
 name:string;
 market:'kospi'|'kosdaq';
 price:number;
 change:number|null;
 turnoverRaw:number|null;
};

export type SectorStrength=Sector&{
 strength:number;
 rank:number;
 turnoverShare:number;
 sizeLevel:1|2|3;
};

// TR066 output2 fields: KIS official inquire_index_category_price sample.
export function parseSectors(raw:unknown,market:Sector['market']):Sector[]{
 const body=record(raw);if(String(body.rt_cd)!=='0'||!Array.isArray(body.output2))return [];
 const found=new Map<string,Sector>();
 for(const value of body.output2){const r=record(value),code=String(r.bstp_cls_code??'').trim(),name=String(r.hts_kor_isnm??'').trim(),price=numeric(r.bstp_nmix_prpr);if(!code||!name||!price||price<=0)continue;
 let change=numeric(r.bstp_nmix_prdy_ctrt);const sign=String(r.prdy_vrss_sign??'');if(change!==null&&['4','5'].includes(sign))change=-Math.abs(change);if(change!==null&&['1','2'].includes(sign))change=Math.abs(change);
 found.set(code,{code,name,market,price,change,turnoverRaw:numeric(r.acml_tr_pbmn)});
 }return [...found.values()];
}

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}

/**
 * 섹터 강도는 "등락률 + 거래대금 집중도"를 한 화면에서 비교하기 위한 상대 점수입니다.
 * 절대 투자 신호가 아니라 현재 조회된 섹터 집합 안에서의 상대 순위이며 -100~+100 범위입니다.
 * 색 강도는 strength, 타일 크기는 turnoverShare/sizeLevel에 사용합니다.
 */
export function rankSectorStrength(sectors:Sector[]):SectorStrength[]{
 if(!sectors.length)return [];
 const changes=sectors.map(s=>Math.abs(s.change??0)).filter(Number.isFinite);
 const maxAbsChange=Math.max(0.01,...changes);
 const turnovers=sectors.map(s=>Math.max(0,s.turnoverRaw??0));
 const totalTurnover=turnovers.reduce((sum,v)=>sum+v,0);
 const maxTurnover=Math.max(1,...turnovers);

 const scored=sectors.map((sector,index)=>{
   const change=sector.change??0;
   const changeNorm=clamp(change/maxAbsChange,-1,1);
   const turnover=Math.max(0,sector.turnoverRaw??0);
   const turnoverNorm=turnover>0?Math.log1p(turnover)/Math.log1p(maxTurnover):0;
   const direction=change===0?0:Math.sign(change);
   const strength=Math.round(clamp(changeNorm*78+direction*turnoverNorm*22,-1,1)*100);
   const turnoverShare=totalTurnover>0?turnover/totalTurnover:0;
   return {...sector,strength,rank:index+1,turnoverShare,sizeLevel:1 as 1|2|3};
 });

 scored.sort((a,b)=>b.strength-a.strength||((b.turnoverRaw??0)-(a.turnoverRaw??0))||a.name.localeCompare(b.name,'ko'));
 const turnoverSorted=[...scored].sort((a,b)=>(b.turnoverRaw??0)-(a.turnoverRaw??0));
 const largeCut=Math.max(1,Math.ceil(turnoverSorted.length*0.15));
 const mediumCut=Math.max(largeCut+1,Math.ceil(turnoverSorted.length*0.4));
 const sizeMap=new Map(turnoverSorted.map((s,i)=>[`${s.market}:${s.code}`,i<largeCut?3:i<mediumCut?2:1] as const));
 return scored.map((sector,index)=>({...sector,rank:index+1,sizeLevel:(sizeMap.get(`${sector.market}:${sector.code}`)??1) as 1|2|3}));
}

export function sessionComparison(rows:MarketRow[]){
 const at=(m:number)=>rows.find(r=>r.minute===m);
 return [{label:'오전',start:540,end:720},{label:'오후',start:720,end:930}].map(s=>{
 const first=at(s.start),last=at(s.end),segment=rows.filter(r=>r.minute>=s.start&&r.minute<=s.end);
 const change=(key:'kospi'|'kosdaq')=>first?.[key]&&last?.[key]?(last[key]!/first[key]!-1)*100:null;
 const flow=(key:'foreignFlow'|'instFlow'|'indivFlow')=>first?.flowSource==='LIVE'&&last?.flowSource==='LIVE'&&first[key]!==null&&last[key]!==null?last[key]!-first[key]!:null;
 return {...s,count:segment.length,expected:s.end-s.start+1,kospi:change('kospi'),kosdaq:change('kosdaq'),breadth:first?.breadthSource==='LIVE'&&last?.breadthSource==='LIVE'?last.diff-first.diff:null,foreign:flow('foreignFlow'),inst:flow('instFlow'),indiv:flow('indivFlow')};
 });
}
export function overlayRows(days:{date:string;rows:MarketRow[]}[],key:'foreignFlow'|'instFlow'|'indivFlow'|'diff'|'kospi'|'kosdaq',relative:boolean){
 const maps=days.map(d=>new Map(d.rows.map(r=>[r.minute,r])));
 const bases=days.map(d=>d.rows.find(r=>r[key]!==null&&Number.isFinite(r[key]))?.[key]);
 return Array.from({length:391},(_,i)=>{
 const point:Record<string,number|null>={minute:540+i};
 days.forEach((d,j)=>{const row=maps[j].get(540+i);let v=row?.[key]??null;if(row&&(key==='diff'?row.breadthSource!=='LIVE':['foreignFlow','instFlow','indivFlow'].includes(key)&&row.flowSource!=='LIVE'))v=null;
 if(relative&&(key==='kospi'||key==='kosdaq'))v=v!==null&&bases[j]&&bases[j]!>0?(v/bases[j]!-1)*100:null;
 point[d.date]=v;});return point;
 });
}
export function rangeChunks(end:string,months:number){
 const d=new Date(end+'T00:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-months);const max=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,max));
 const start=d.toISOString().slice(0,10),chunks:{start:string;end:string}[]=[];
 while(d.toISOString().slice(0,10)<=end){const a=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+6);const b=d.toISOString().slice(0,10);chunks.push({start:a,end:b>end?end:b});d.setUTCDate(d.getUTCDate()+1);}
 return {start,chunks};
}
export type PanelPreference={order:string[];hidden:string[]};
export function cleanPanels(value:unknown,ids:string[]):PanelPreference{const r=record(value);const order=Array.isArray(r.order)?r.order.filter((x):x is string=>typeof x==='string'&&ids.includes(x)):[];return {order:[...new Set([...order,...ids])],hidden:Array.isArray(r.hidden)?r.hidden.filter((x):x is string=>typeof x==='string'&&ids.includes(x)):[]};}

// Use only events persisted at collection time. Chart-derived cooldowns must not
// suppress stored events during performance aggregation.
export function storedEvents(rows:MarketRow[]):MarketEvent[]{
 return rows.flatMap(row=>row.signals.filter(s=>typeof s.type==='string'&&s.type.length>0).map(s=>({id:row.date+'-'+row.time+'-'+s.type,date:row.date,time:row.time,minute:row.minute,type:String(s.type),label:signalLabel(String(s.type)),message:String(s.message??''),direction:eventDirection(String(s.type)),level:eventLevel(s.level??s.strength),source:'수집 신호' as const,diff:row.diff,marketScore:row.marketScore})));
}
