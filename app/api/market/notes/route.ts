import {hasDashboardAccess,sameOrigin} from '@/lib/balta-access';
import {requestedDate,marketError,MarketDataError} from '@/lib/balta-data';
export const dynamic='force-dynamic';
function config(){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new MarketDataError('DB 연결 설정을 확인하세요.',503);return {url:url.replace(/\/$/,'').replace(/\/rest\/v1$/,'')+'/rest/v1/market_notes',headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'}};}
export async function GET(request:Request){
 if(!(await hasDashboardAccess(request)))return Response.json({error:'로그인이 필요합니다.'},{status:401});
 try{const date=requestedDate(request),c=config();const r=await fetch(c.url+'?trade_date=eq.'+date,{headers:c.headers,cache:'no-store',signal:AbortSignal.any([request.signal,AbortSignal.timeout(10000)])});if(!r.ok)throw new MarketDataError('메모 조회 실패: 002_market_notes.sql 적용 여부를 확인하세요.',502);const rows=await r.json();return Response.json({note:rows[0]??null},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return marketError(e);}
}
export async function PUT(request:Request){if(!(await hasDashboardAccess(request)))return Response.json({error:'로그인이 필요합니다.'},{status:401});return Response.json({error:'메모 작성은 게시판으로 이동했습니다.'},{status:410});}
