import {parseCumulativeQuarter,quarterize,analyzeQuarters,REPORT_CODES,type Quarter,type QuarterCashFlowResponse} from '../../lib/cash-flow-quarter';
import {parseDisclosures} from '../../lib/cash-flow-timeline';
const ids=['CashFlowsFromUsedInOperatingActivities','CashFlowsFromUsedInInvestingActivities','CashFlowsFromUsedInFinancingActivities','ProfitLoss','PaymentsToAcquirePropertyPlantAndEquipment','PaymentsToAcquireIntangibleAssets'];
export function cashTimelineFixture(){
  const raw:{corp_code:string;report_nm:string;rcept_no:string;rcept_dt:string;rm:string}[]=[];
  const cumulative=[2024,2025,2026].flatMap(year=>([1,2,3,4] as const).filter(q=>year<2026||q<3).map(q=>{
    const date=q===4?`${year+1}0316`:`${year}${q===1?'05':q===2?'08':'11'}15`,receipt=date+'000001';
    raw.push({corp_code:'12345678',report_nm:`${q===4?'사업':q===2?'반기':'분기'}보고서 (${year}.${String(q*3).padStart(2,'0')})`,rcept_no:receipt,rcept_dt:date,rm:''});
    const scale=1+(year-2024)*.25,amounts=[(100*q+12*q*q)*scale,-60*q*scale,12*q*scale,80*q*scale,35*q*scale,5*q*scale];
    return parseCumulativeQuarter(amounts.map((v,i)=>({account_id:'ifrs-full_'+ids[i],account_nm:ids[i],sj_div:i===3?'IS':'CF',currency:'KRW',thstrm_amount:String(Math.round(v*1e8)),thstrm_add_amount:i===3&&q<4?String(Math.round(v*1e8)):undefined,reprt_code:REPORT_CODES[q],bsns_year:String(year),rcept_no:receipt})),year,q,'CFS');
  }));
  const quarters=cumulative.map((r,i)=>quarterize(r,cumulative[i-1])).slice(-8);
  const data:QuarterCashFlowResponse={ok:true,period:'quarter',code:'005930',name:'검증용 가상 기업',corpCode:'12345678',basis:'CFS',endYear:2026,fetchedAt:'2026-10-06T07:30:00Z',industry:'26110',financial:false,fiscalMonth:'12',quarters,analysis:analyzeQuarters(quarters,false),expectedPeriod:'2026-Q3',latestPeriod:'2026-Q2',warnings:['화면 검증용 가상 데이터입니다. 실제 기업 수치가 아닙니다.']};
  return {data,raw,filings:parseDisclosures(raw,data.corpCode)};
}
