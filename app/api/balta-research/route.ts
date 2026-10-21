import {hasDashboardAccess} from '@/lib/balta-access';
import {researchAdmin,dateValid} from '@/lib/balta-research-auth';
import {researchRequest} from '@/lib/research-data';
import {MarketDataError,marketError} from '@/lib/balta-data';

export const dynamic='force-dynamic';
function json(data:unknown,status=200){
 return Response.json(data,{status,headers:{'Cache-Control':'private,no-store'}});
}
export async function GET(request:Request){
 if(!(await hasDashboardAccess(request)))return json({error:'접근 권한이 필요합니다.'},401);
 const u=new URL(request.url),admin=u.searchParams.get('admin')==='1',
  date=u.searchParams.get('date')??'';
 if(admin&&!(await researchAdmin(request)))return json({error:'운영자 인증이 필요합니다.'},403);
 if(date&&!dateValid(date))return json({error:'날짜를 확인하세요.'},400);
 const query=new URLSearchParams({
  select:'trade_date,status,version,generated_at,approved_at,model,narrative,evidence',
  order:'trade_date.desc',limit:date?'1':'45'});
 if(date)query.set('trade_date','eq.'+date);
 if(!admin)query.set('status','eq.published');
 try{
  const rows=await researchRequest('balta_research_reports?'+query.toString(),request.signal);
  return json({ok:true,items:rows});
 }catch(e){return marketError(e);}
}
export async function POST(request:Request){
 if(!(await researchAdmin(request)))return json({error:'운영자 인증이 필요합니다.'},403);
 try{
  const value=await request.json() as {date?:string;action?:string};
  if(!value||!value.date||!dateValid(value.date)||value.action!=='publish')
   throw new MarketDataError('발행 날짜·명령을 확인하세요.',400);
  const base=process.env.SUPABASE_URL?.replace(/\/$/,'').replace(/\/rest\/v1$/,'');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw new MarketDataError('보고서 저장 연결이 필요합니다.',503);
  const filter='trade_date=eq.'+value.date+'&status=eq.draft';
  const result=await fetch(base+'/rest/v1/balta_research_reports?'+filter,{
   method:'PATCH',headers:{apikey:key,authorization:'Bearer '+key,
    'Content-Type':'application/json',Prefer:'return=representation'},
   body:JSON.stringify({status:'published',approved_at:new Date().toISOString()}),
   signal:AbortSignal.timeout(12000),cache:'no-store'});
  if(!result.ok)throw new MarketDataError('승인 반영 실패',502);
  const rows=await result.json();
  if(!Array.isArray(rows)||rows.length!==1)throw new MarketDataError('이미 승인됐거나 초안이 없습니다.',409);
  // Operational status is secondary; the published report above is authoritative.
  await fetch(base+'/rest/v1/balta_research_runs?trade_date=eq.'+value.date,{
   method:'PATCH',headers:{apikey:key,authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({status:'published',stage:'published',detail:'Operator approved PDF and note'}),
   signal:AbortSignal.timeout(8000)}).catch(()=>{});
  return json({ok:true,tradeDate:value.date});
 }catch(e){return marketError(e);}
}
