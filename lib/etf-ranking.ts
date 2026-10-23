import {stockDate,stockNumber,stockRows} from './stock-flow-model';
export const etfInvestors={individual:'개인',foreign:'외국인',institution:'기관'} as const;
export type EtfInvestor=keyof typeof etfInvestors;
export type EtfStock={code:string;name:string};
export type EtfObservation=EtfStock&{values:Record<EtfInvestor,number|null>};
export type EtfEntry=EtfStock&{net:number};
export type EtfGroup={expected:number;covered:number;buy:EtfEntry[];sell:EtfEntry[]};
export type EtfSnapshot={version:1;date:string;collectedAt:string;groups:Record<EtfInvestor,EtfGroup>};
export type EtfResponse={ok:true;dates:string[];snapshot:EtfSnapshot|null};
export function parseEtfMaster(text:string):EtfStock[]{
  return [...new Map(text.split(/\r?\n/).flatMap(raw=>{const line=raw+'\n',prefix=line.slice(0,-228),tail=line.slice(-228),code=prefix.slice(0,9).trim(),name=prefix.slice(21).trim();return tail.slice(0,2)==='EF'&&/^[0-9A-Z]{6}$/.test(code)&&name?[{code,name}]:[];}).map(row=>[row.code,row])).values()];
}
export function parseEtfObservation(stock:EtfStock,input:unknown,date:string):EtfObservation{
  const row=stockRows(input).find(row=>stockDate(row.stck_bsop_date)===date);
  const fields={individual:'prsn_ntby_tr_pbmn',foreign:'frgn_ntby_tr_pbmn',institution:'orgn_ntby_tr_pbmn'};
  return {...stock,values:Object.fromEntries(Object.entries(fields).map(([key,field])=>{const n=stockNumber(row?.[field]);return [key,n===null?null:n/100];})) as EtfObservation['values']};
}
export function buildEtfSnapshot(universe:EtfStock[],observations:EtfObservation[],date:string,collectedAt:string):EtfSnapshot{
  const stocks=[...new Map(universe.map(row=>[row.code,row])).values()],values=new Map(observations.map(row=>[row.code,row.values]));
  const groups=Object.fromEntries((Object.keys(etfInvestors) as EtfInvestor[]).map(investor=>{
    const entries=stocks.flatMap(stock=>{const net=values.get(stock.code)?.[investor];return net!=null&&Number.isFinite(net)?[{...stock,net}]:[];});
    return [investor,{expected:stocks.length,covered:entries.length,buy:entries.filter(row=>row.net>0).sort((a,b)=>b.net-a.net||a.code.localeCompare(b.code)).slice(0,10),sell:entries.filter(row=>row.net<0).sort((a,b)=>a.net-b.net||a.code.localeCompare(b.code)).slice(0,10)}];
  })) as EtfSnapshot['groups'];
  return {version:1,date,collectedAt,groups};
}
