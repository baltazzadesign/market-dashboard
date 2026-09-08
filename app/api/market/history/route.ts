import { readHistory } from "@/lib/market-history-data";
import { validMonth, shiftMonth, monthEnd } from "@/lib/market-history-model";
import { marketError, MarketDataError } from "@/lib/balta-data";
import { kstParts } from "@/lib/balta-model";
import { hasDashboardAccess } from "@/lib/balta-access";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  if(!hasDashboardAccess(request))return Response.json({ok:false,error:"로그인이 필요합니다."},{status:401});
  try{
    const query=new URL(request.url).searchParams,month=query.get("month")||kstParts().date.slice(0,7);
    if(!validMonth(month)||month>kstParts().date.slice(0,7))throw new MarketDataError("조회 월을 확인해 주세요.",400);
    const months=Number(query.get("months")??3);
    if(!Number.isInteger(months)||months<3||months>24)throw new MarketDataError("조회 기간은 3~24개월입니다.",400);
    const start=shiftMonth(month,-months)+"-01",end=monthEnd(month);
    const days=await readHistory(start,end,request.signal);
    return Response.json({ok:true,month,start,end,days,asOf:kstParts().clock},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return marketError(error);}
}
