import {marketClosedReason} from './market-calendar';
export function predictionWindow(now=new Date(),holidays:string[]=[]){
 const local=new Date(now.getTime()+9*3600000).toISOString(),day=local.slice(0,10),time=local.slice(11,16),closed=marketClosedReason(day,holidays);
 return {day,time,closed,open:!closed&&time>='09:00'&&time<'14:00'};
}
export function closingPair(rows:Record<string,unknown>[],day:string){
 const points=rows.map(r=>({day:String(r.stck_bsop_date??''),close:Number(r.bstp_nmix_prpr)})).filter(r=>/^\d{8}$/.test(r.day)&&Number.isFinite(r.close)&&r.close>0).sort((a,b)=>b.day.localeCompare(a.day));
 const date=day.replaceAll('-',''),current=points.find(r=>r.day===date),previous=points.find(r=>r.day<date);
 return current&&previous?{close:current.close,previous:previous.close}:null;
}
