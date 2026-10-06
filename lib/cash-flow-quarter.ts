import { amount, analyze, classify, emptyYear, parseYear, type Basis, type CashFlowAnalysis, type CashFlowResponse, type CashFlowYear, type DartAccount } from './cash-flow-model';

export type Quarter = 1 | 2 | 3 | 4;
export const REPORT_CODES: Record<Quarter,string> = {1:'11013',2:'11012',3:'11014',4:'11011'};
export const quarterId = (year:number, quarter:Quarter) => `${year}-Q${quarter}`;
export const quarterLabel = (year:number, quarter:Quarter) => `${year}년 ${quarter}분기`;
export const ordinal = (year:number, quarter:Quarter) => year * 4 + quarter - 1;
export type CumulativeQuarter = { year:number; quarter:Quarter; values:CashFlowYear; };
export type CashFlowQuarter = CashFlowYear & {
  quarter:Quarter; period:string; label:string; previousReceipt:string|null;
  calculation:string; reported:boolean;
};
export type QuarterAnalysis = CashFlowAnalysis & {
  yoy:{label:string;operating:number|null;fcf:number|null;operatingPercent:number|null};
  ttm:{label:string;operating:number|null;fcf:number|null;netIncome:number|null;conversion:number|null};
};
export type QuarterCashFlowResponse = Omit<CashFlowResponse,'years'|'analysis'> & {
  period:'quarter'; quarters:CashFlowQuarter[]; analysis:QuarterAnalysis;
  expectedPeriod:string; latestPeriod:string|null;
};

// CF amounts are YTD. Interim IS/CIS thstrm_amount is three months;
// normalize IS/CIS to the documented YTD field before subtracting reports.
export function parseCumulativeQuarter(input:DartAccount[],year:number,quarter:Quarter,basis:Basis):CumulativeQuarter {
  const normalized=input.map(row=>{
    if(quarter===4 || !['IS','CIS'].includes(row.sj_div??''))return row;
    const cumulative=amount(row.thstrm_add_amount);
    return {...row,thstrm_amount:cumulative!==null?String(cumulative):quarter===1?row.thstrm_amount:undefined};
  });
  return {year,quarter,values:parseYear(normalized,year,basis,REPORT_CODES[quarter])};
}
export function emptyCumulativeQuarter(year:number,quarter:Quarter,basis:Basis,status:'missing'|'error'='missing'):CumulativeQuarter {
  const values=emptyYear(year,basis,status);
  values.warnings=[status==='error'?'해당 분기 공시 조회에 실패했습니다.':'해당 분기의 누적 공시 데이터가 없습니다.'];
  return {year,quarter,values};
}
export function quarterize(current:CumulativeQuarter,previous?:CumulativeQuarter):CashFlowQuarter {
  const {year,quarter,values:v}=current;
  const out:CashFlowQuarter={...emptyYear(year,v.basis,v.status==='error'?'error':'missing'),quarter,period:quarterId(year,quarter),label:quarterLabel(year,quarter),receipt:v.receipt,previousReceipt:null,calculation:quarter===1?'1분기 누적금액':`${quarter===4?'연간':quarter===2?'반기':'3분기'} 누적 − ${quarter-1}분기 누적`,reported:v.status==='ok',warnings:[...v.warnings]};
  if(v.status!=='ok')return out;
  const p=previous?.values;
  if(quarter>1 && (!previous || previous.year!==year || previous.quarter!==quarter-1 || p?.basis!==v.basis || p.status!=='ok')){
    out.status=p?.status==='error'?'error':'missing';out.warnings.push('직전 누적 공시가 없거나 재무제표 기준이 달라 단독 분기를 계산하지 않았습니다.');return out;
  }
  out.status='ok';
  out.previousReceipt=quarter>1?p!.receipt:null;
  const difference=(key:'operating'|'investing'|'financing'|'netIncome')=>v[key]===null || (quarter>1 && p![key]===null)?null:v[key]!-(quarter===1?0:p![key]!);
  out.operating=difference('operating');out.investing=difference('investing');out.financing=difference('financing');out.netIncome=difference('netIncome');
  if(quarter>1)out.warnings.push(...p!.warnings.map(w=>'직전 누적 공시: '+w));
  // Acquisition spending is normalized separately, never abs(current - prior).
  // A declining cumulative acquisition amount is ambiguous (restatement/sign change).
  const acquisition=(label:string)=>{
    const a=v.evidence.find(e=>e.label===label)?.value??null;
    const b=quarter===1?0:p!.evidence.find(e=>e.label===label)?.value??null;
    if(a===null||b===null)return null;
    if(quarter>1 && a!==0 && b!==0 && Math.sign(a)!==Math.sign(b)){
      out.warnings.push(label+': 누적 공시 간 부호가 달라 단독 분기 취득액을 보류합니다.');return null;
    }
    const delta=Math.abs(a)-Math.abs(b);
    if(delta<0){out.warnings.push(label+': 누적 취득액이 감소하여 정정 공시 확인이 필요합니다.');return null;}
    return delta;
  };
  const ppe=acquisition('유형자산 취득'),intangible=acquisition('무형자산 취득');
  out.capex=ppe===null||intangible===null?null:ppe+intangible;
  out.fcf=out.operating===null||out.capex===null?null:out.operating-out.capex;
  out.conversion=out.operating!==null&&out.netIncome!==null&&out.netIncome>0?out.operating/out.netIncome*100:null;
  if([out.operating,out.investing,out.financing].every(n=>n!==null)){
    const positive=Math.max(0,out.operating!)+Math.max(0,out.investing!)+Math.max(0,out.financing!);
    out.fundingShare=positive>0?Math.max(0,out.financing!)/positive*100:null;
  }
  out.regime=classify(out.operating,out.investing,out.financing);
  // Original cumulative values are labeled explicitly in the evidence panel.
  out.evidence=v.evidence.map(e=>({...e,label:'당기 누적 '+e.label}));
  if(quarter>1)out.evidence.push(...p!.evidence.map(e=>({...e,label:'직전 누적 '+e.label})));
  out.fundingItems=[];
  return out;
}
export function analyzeQuarters(quarters:CashFlowQuarter[],financial:boolean|null):QuarterAnalysis {
  const latest=quarters.at(-1);
  const base=analyze(latest?[latest]:[],financial);
  const result:QuarterAnalysis={...base,score:null,parts:[],scoreReason:'분기 화면은 단독 분기와 최근 4분기 합산을 제공합니다. 100점 평가는 연간 화면에서 확인하세요.',change:'전년 동기 비교 보류',yoy:{label:'전년 동기',operating:null,fcf:null,operatingPercent:null},ttm:{label:'최근 4분기',operating:null,fcf:null,netIncome:null,conversion:null}};
  result.risks=result.risks.filter(r=>!r.startsWith('CB·BW'));
  if(!latest)return result;
  result.risks.push('분기 현금흐름은 계절성이 있을 수 있어 전년 같은 분기와 함께 확인하세요.');
  const previous=quarters.find(q=>q.year===latest.year-1&&q.quarter===latest.quarter&&q.basis===latest.basis&&q.status==='ok');
  result.yoy.label=quarterLabel(latest.year-1,latest.quarter)+' 대비';
  if(latest.status==='ok' && previous){
    if(latest.operating!==null&&previous.operating!==null){
      result.yoy.operating=latest.operating-previous.operating;
      result.yoy.operatingPercent=previous.operating>0?result.yoy.operating/previous.operating*100:null;
      result.change=result.yoy.operating>0?'전년 동기보다 영업현금 증가':result.yoy.operating<0?'전년 동기보다 영업현금 감소':'전년 동기와 영업현금 동일';
    }
    if(latest.fcf!==null&&previous.fcf!==null)result.yoy.fcf=latest.fcf-previous.fcf;
  }
  const recent=quarters.slice(-4);
  const consecutive=recent.length===4&&recent.every((q,i)=>q.status==='ok'&&q.basis===latest.basis&&ordinal(q.year,q.quarter)===ordinal(latest.year,latest.quarter)-3+i);
  if(consecutive){
    result.ttm.label=recent[0].label+' ~ '+latest.label;
    const sum=(key:'operating'|'fcf'|'netIncome')=>recent.every(q=>q[key]!==null)?recent.reduce((total,q)=>total+q[key]!,0):null;
    result.ttm.operating=sum('operating');result.ttm.fcf=sum('fcf');result.ttm.netIncome=sum('netIncome');
    if(result.ttm.operating!==null&&result.ttm.netIncome!==null&&result.ttm.netIncome>0)result.ttm.conversion=result.ttm.operating/result.ttm.netIncome*100;
  }
  return result;
}
export function completedQuarters(now=new Date()):{year:number;quarter:Quarter}[] {
  const parts=new Intl.DateTimeFormat('en',{year:'numeric',month:'numeric',timeZone:'Asia/Seoul'}).formatToParts(now);
  const year=Number(parts.find(p=>p.type==='year')!.value),month=Number(parts.find(p=>p.type==='month')!.value);
  const end=ordinal(year,Math.ceil(month/3) as Quarter)-1;
  const result:{year:number;quarter:Quarter}[]=[];
  for(let y=Math.floor(end/4)-2;y<=year;y++)for(let q=1;q<=4;q++)if(ordinal(y,q as Quarter)<=end)result.push({year:y,quarter:q as Quarter});
  return result;
}
