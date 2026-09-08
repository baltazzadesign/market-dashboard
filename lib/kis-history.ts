import { numeric, record } from "./balta-model";
import type { IndexSnapshot } from "./market-history-model";
export function indexSnapshot(raw: unknown, flow: {foreign:number;inst:number;indiv:number;source:string}|undefined, breadthLive: boolean): IndexSnapshot & {turnoverRaw:number|null;turnoverUnit:string} {
  const body=record(raw),output=body.output1??body.output??{},out=record(Array.isArray(output)?output[0]:output);
  const price=numeric(out.bstp_nmix_prpr),rawAmount=numeric(out.acml_tr_pbmn);
  const unit=process.env.KIS_INDEX_TURNOVER_UNIT||"million_krw";
  const divisor=unit==="million_krw"?100:unit==="krw"?100000000:unit==="eok_krw"?1:null;
  const live=String(body.rt_cd)==="0"&&price!==null&&price>0;
  let change=live?numeric(out.bstp_nmix_prdy_ctrt):null;
  const sign=String(out.prdy_vrss_sign??"");
  if(change!==null && ["4","5"].includes(sign))change=-Math.abs(change);
  if(change!==null && ["1","2"].includes(sign))change=Math.abs(change);
  return {price:live?price:null,changePct:change,priceSource:live?"LIVE":"ERROR",
    turnover:live&&rawAmount!==null&&rawAmount>=0&&divisor!==null?rawAmount/divisor:null,
    turnoverRaw:rawAmount,turnoverUnit:unit,
    up:breadthLive?numeric(out.ascn_issu_cnt):null,down:breadthLive?numeric(out.down_issu_cnt):null,flat:breadthLive?numeric(out.stnr_issu_cnt):null,
    flows:{foreign:flow?.source==="LIVE"?flow.foreign:null,institution:flow?.source==="LIVE"?flow.inst:null,individual:flow?.source==="LIVE"?flow.indiv:null},
    flowSource:flow?.source??"ERROR"};
}
