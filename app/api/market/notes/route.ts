import {hasDashboardAccess,sameOrigin} from '@/lib/balta-access';
import {requestedDate,marketError,MarketDataError} from '@/lib/balta-data';
export const dynamic='force-dynamic';
function config(){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new MarketDataError('DB 연결 설정을 확인하세요.',503);return {url:url.replace(/\/$/,'').replace(/\/rest\/v1$/,'')+'/rest/v1/market_notes',headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'}};}
export async function GET(request:Request){
 if(!hasDashboardAccess(request))return Response.json({error:'로그인이 필요합니다.'},{status:401});
 try{const date=requestedDate(request),c=config();const r=await fetch(c.url+'?trade_date=eq.'+date,{headers:c.headers,cache:'no-store',signal:AbortSignal.any([request.signal,AbortSignal.timeout(10000)])});if(!r.ok)throw new MarketDataError('메모 조회 실패: 002_market_notes.sql 적용 여부를 확인하세요.',502);const rows=await r.json();return Response.json({note:rows[0]??null},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return marketError(e);}
}
export async function PUT(request:Request){
 if(!hasDashboardAccess(request))return Response.json({error:'로그인이 필요합니다.'},{status:401});
 if(!sameOrigin(request))return Response.json({error:'허용되지 않은 요청입니다.'},{status:403});
 try{const date=requestedDate(request);if(Number(request.headers.get('content-length'))>50000)throw new MarketDataError('메모가 너무 큽니다.',400);
 const raw=await request.text();if(raw.length>15000)throw new MarketDataError('메모가 너무 큽니다.',400);let data;try{data=JSON.parse(raw);}catch{throw new MarketDataError('잘못된 메모 형식입니다.',400);}
 if(!data||typeof data.body!=='string'||data.body.length>10000||typeof data.tags!=='string'||data.tags.length>200||!Number.isSafeInteger(data.version)||data.version<0)throw new MarketDataError('메모는 10,000자, 태그는 200자 이내로 입력하세요.',400);
 const c=config(),existing=data.version>0;
 const r=await fetch(c.url+(existing?'?trade_date=eq.'+date+'&version=eq.'+data.version:''),{method:existing?'PATCH':'POST',headers:{...c.headers,Prefer:'return=representation'},body:JSON.stringify({trade_date:date,body:data.body,tags:data.tags,version:data.version+1}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(10000)])});
 if(r.status===409)throw new MarketDataError('다른 창에서 메모가 변경됐습니다. 내용을 복사한 뒤 다시 불러오세요.',409);
 if(!r.ok)throw new MarketDataError('메모 저장 실패: DB 설정을 확인하세요.',502);const values=await r.json();if(!values.length)throw new MarketDataError('다른 창에서 메모가 변경됐습니다. 내용을 복사한 뒤 다시 불러오세요.',409);
 return Response.json({note:values[0]},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return marketError(e);}
}
