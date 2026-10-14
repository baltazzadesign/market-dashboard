import {hasDashboardAccess} from '@/lib/balta-access';
import {researchAdmin,dateValid} from '@/lib/balta-research-auth';
import {researchRequest} from '@/lib/research-data';
import {marketError} from '@/lib/balta-data';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){
 if(!hasDashboardAccess(request))return Response.json({error:'접근 권한이 필요합니다.'},{status:401});
 const u=new URL(request.url),date=u.searchParams.get('date')??'';
 if(!dateValid(date))return Response.json({error:'날짜 오류'},{status:400});
 const admin=researchAdmin(request);
 try{
  const q=new URLSearchParams({select:'pdf_path,status',trade_date:'eq.'+date,limit:'1'});
  if(!admin)q.set('status','eq.published');
  const rows=await researchRequest('balta_research_reports?'+q.toString(),request.signal);
  const path=rows[0]?.pdf_path;
  if(typeof path!=='string'||path!==date+'/daily-v1.pdf')
   return Response.json({error:'공개된 PDF가 없습니다.'},{status:404});
  const base=process.env.SUPABASE_URL?.replace(/\/$/,'').replace(/\/rest\/v1$/,'');
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw Error('Storage configuration missing');
  const remote=await fetch(base+'/storage/v1/object/balta-research/'+path,{
   headers:{apikey:key,authorization:'Bearer '+key},cache:'no-store',
   signal:AbortSignal.timeout(18000)});
  if(!remote.ok||!remote.body)throw Error('Private report not found');
  return new Response(remote.body,{
   headers:{'Content-Type':'application/pdf',
    'Content-Disposition':'inline; filename="BALTA_RESEARCH_'+date+'.pdf"',
    'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}
  });
 }catch(e){return marketError(e);}
}
