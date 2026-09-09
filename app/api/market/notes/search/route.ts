import {hasDashboardAccess} from '@/lib/balta-access';
import {marketError,MarketDataError} from '@/lib/balta-data';
import {researchRequest} from '@/lib/research-data';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!hasDashboardAccess(request))return Response.json({error:'로그인이 필요합니다.'},{status:401});
 try{const q=new URL(request.url).searchParams,text=q.get('q')??'',tag=q.get('tag')??'',page=Number(q.get('page')??0);if(text.length>100||tag.length>100||!Number.isInteger(page)||page<0||page>10000)throw new MarketDataError('검색어와 페이지를 확인하세요.',400);
 const rows=await researchRequest('rpc/search_market_notes',request.signal,{search_text:text,search_tag:tag,page_offset:page*20});return Response.json({ok:true,rows:rows.slice(0,20),hasMore:rows.length>20},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return marketError(e);}
}
