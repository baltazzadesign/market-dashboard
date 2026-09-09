import { MarketDataError } from './balta-data';
export async function researchRequest(path:string,signal?:AbortSignal,body?:unknown){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new MarketDataError('저장 데이터 연결 설정을 확인하세요.',503);
 const r=await fetch(url.replace(/\/$/,'').replace(/\/rest\/v1$/,'')+'/rest/v1/'+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,authorization:'Bearer '+key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
 if(!r.ok)throw new MarketDataError('조회 실패: DB 연결 및 003_market_research.sql 적용 여부를 확인하세요.',502);
 const values:unknown=await r.json();if(!Array.isArray(values))throw new MarketDataError('저장 데이터 응답 형식을 확인하세요.',502);return values as Record<string,unknown>[];
}
