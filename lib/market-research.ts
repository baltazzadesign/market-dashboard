import {type MarketRow, type MarketEvent, numeric, record,signalLabel,eventDirection,eventLevel} from './balta-model';
export type Sector={code:string;name:string;market:'kospi'|'kosdaq';price:number;change:number|null;turnoverRaw:number|null};
// TR066 output2 fields: KIS official inquire_index_category_price sample.
export function parseSectors(raw:unknown,market:Sector['market']):Sector[]{
 const body=record(raw);if(String(body.rt_cd)!=='0'||!Array.isArray(body.output2))return [];
 const found=new Map<string,Sector>();
 for(const value of body.output2){const r=record(value),code=String(r.bstp_cls_code??'').trim(),name=String(r.hts_kor_isnm??'').trim(),price=numeric(r.bstp_nmix_prpr);if(!code||!name||!price||price<=0)continue;
 let change=numeric(r.bstp_nmix_prdy_ctrt);const sign=String(r.prdy_vrss_sign??'');if(change!==null&&['4','5'].includes(sign))change=-Math.abs(change);if(change!==null&&['1','2'].includes(sign))change=Math.abs(change);
 found.set(code,{code,name,market,price,change,turnoverRaw:numeric(r.acml_tr_pbmn)});
 }return [...found.values()];
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
