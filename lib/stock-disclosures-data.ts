// OpenDART 공시검색: https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001
// Server adapter. API credentials stay on the server.
import {CashFlowError,resolveDartCorporation} from './cash-flow-data';
import {parseStockDisclosures,type StockDisclosureResponse} from './stock-disclosures';
const cache=new Map<string,{until:number;promise:Promise<StockDisclosureResponse>}>();
const errors:Record<string,string>={'010':'OpenDART 인증키를 확인해 주세요.','011':'OpenDART 인증키가 중지된 상태입니다.','012':'OpenDART 허용 IP 설정을 확인해 주세요.','020':'OpenDART 요청 한도를 초과했습니다. 잠시 후 다시 조회해 주세요.','800':'OpenDART 점검 중입니다.','901':'OpenDART 인증키의 이용 상태를 확인해 주세요.'};
export async function loadStockDisclosures(code:string,start:string,end:string,fetcher:typeof fetch=fetch):Promise<StockDisclosureResponse>{
  const key=process.env.DART_API_KEY?.trim();
  if(!key)throw new CashFlowError('공시 연결이 설정되지 않았습니다. DART_API_KEY를 확인해 주세요.','DART_NOT_CONFIGURED');
  const deadline=Date.now()+48000,corp=await resolveDartCorporation(code,deadline,fetcher);
  const raw:unknown[]=[],warnings:string[]=[];let pages=1,total=0,partial=false;
  for(let page=1;page<=Math.min(pages,10);page++){
    try{
      const remaining=deadline-Date.now();if(remaining<100)throw new CashFlowError('공시 조회 시간이 초과됐습니다. 다시 조회해 주세요.','TIMEOUT');
      const url=new URL('https://opendart.fss.or.kr/api/list.json');
      url.search=new URLSearchParams({crtfc_key:key,corp_code:corp.code,bgn_de:start.replaceAll('-',''),end_de:end.replaceAll('-',''),last_reprt_at:'N',sort:'date',sort_mth:'desc',page_count:'100',page_no:String(page)}).toString();
      let body:{status?:string;list?:unknown[];total_page?:unknown;total_count?:unknown;page_no?:unknown};
      try{const r=await fetcher(url,{cache:'no-store',signal:AbortSignal.timeout(Math.min(10000,remaining))});if(!r.ok)throw new Error();body=await r.json();}
      catch{throw new CashFlowError('공시 목록을 불러오지 못했습니다. 다시 조회해 주세요.');}
      if(body.status==='013'&&page===1)return {ok:true,code,corpCode:corp.code,name:corp.name,start,end,fetchedAt:new Date().toISOString(),items:[],total:0,partial:false,warnings:[]};
      if(body.status!=='000')throw new CashFlowError(errors[body.status??'']||'공시 목록 조회에 실패했습니다.',body.status||'UPSTREAM_ERROR');
      const nextPages=Number(body.total_page),nextTotal=Number(body.total_count);
      if(!Array.isArray(body.list)||!body.list.length||!Number.isInteger(nextPages)||nextPages<1||!Number.isInteger(nextTotal)||nextTotal<1||Number(body.page_no)!==page)throw new CashFlowError('공시 목록 응답을 확인하지 못했습니다. 다시 조회해 주세요.');
      if(page>1&&(nextPages!==pages||nextTotal!==total))throw new CashFlowError('조회 중 공시 목록이 변경됐습니다. 다시 조회해 주세요.');
      pages=nextPages;total=nextTotal;raw.push(...body.list);
    }catch(e){
      if(page===1)throw e;
      partial=true;warnings.push(e instanceof CashFlowError?e.message:'공시 목록 일부를 받지 못했습니다.');break;
    }
  }
  const items=parseStockDisclosures(raw,corp.code,start,end);
  if(items.length<total){partial=true;warnings.push(`공시 ${total.toLocaleString('ko-KR')}건 중 ${items.length.toLocaleString('ko-KR')}건만 확인했습니다. ${pages>10?'한 번에 최신 1,000건까지 조회하므로 기간을 줄여 주세요.':'다시 조회해 주세요.'}`);}
  return {ok:true,code,corpCode:corp.code,name:corp.name,start,end,fetchedAt:new Date().toISOString(),items,total,partial,warnings};
}
export function cachedStockDisclosures(code:string,start:string,end:string):Promise<StockDisclosureResponse>{
  const key=[code,start,end].join(':'),hit=cache.get(key);
  if(hit&&hit.until>Date.now())return hit.promise;
  for(const [k,v] of cache)if(v.until<Date.now())cache.delete(k);
  if(cache.size>=100)cache.delete(cache.keys().next().value!);
  const promise=loadStockDisclosures(code,start,end);cache.set(key,{until:Date.now()+60000,promise});
  promise.then(data=>{const item=cache.get(key);if(item?.promise===promise)item.until=Date.now()+(data.partial?5000:60000);},()=>{if(cache.get(key)?.promise===promise)cache.delete(key);});
  return promise;
}
