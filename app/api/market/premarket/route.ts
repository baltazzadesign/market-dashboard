import {yuanCross} from '@/lib/premarket-extra-model';
import {hasDashboardAccess} from '@/lib/balta-access';
import {kisTerminal} from '@/lib/kis-terminal';
import {kstParts,moveDate} from '@/lib/balta-model';
import {globalAssets,overseasAssets,parseMorningSeries} from '@/lib/premarket-model';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 if(!await hasDashboardAccess(request))return Response.json({ok:false,error:'로그인이 필요합니다.'},{status:401,headers});
 const group=new URL(request.url).searchParams.get('group')??'global';
 if(!['global','stocks'].includes(group))return Response.json({ok:false,error:'조회 구분을 확인하세요.'},{status:400,headers});
 const today=kstParts().date,start=moveDate(today,-60).replaceAll('-',''),end=today.replaceAll('-','');
 const jobs=group==='stocks'?overseasAssets:globalAssets;
 // Process a bounded batch; the shared KIS queue enforces request spacing.
 const rows=[];const deadline=Date.now()+25000;
 for(let i=0;i<jobs.length;i+=3){
  const batch=await Promise.all(jobs.slice(i,i+3).map(async([id,name,category,market,unit])=>{
   try{
    if(Date.now()>deadline)throw new Error("deadline");
    const body=group==='stocks'?await kisTerminal('/uapi/overseas-price/v1/quotations/dailyprice','HHDFS76240000',{AUTH:'',EXCD:market,SYMB:id,GUBN:'0',BYMD:end,MODP:'1'},300000):await kisTerminal('/uapi/overseas-price/v1/quotations/inquire-daily-chartprice','FHKST03030100',{FID_COND_MRKT_DIV_CODE:market,FID_INPUT_ISCD:id,FID_INPUT_DATE_1:start,FID_INPUT_DATE_2:end,FID_PERIOD_DIV_CODE:'D'},300000);
    return parseMorningSeries(id,name,category,unit??'USD',body.output2,group==='stocks');
   }catch{return {...parseMorningSeries(id,name,category,unit??'USD',[]),note:'제공처 조회 실패 · 다시 조회해 주세요.'};}
  }));rows.push(...batch);
 }
 if(group==='global'){const krw=rows.find(r=>r.id==='FX@KRW'),cny=rows.find(r=>r.id==='FX@CNY');if(krw&&cny)rows.push(yuanCross(krw,cny));}
 return Response.json({ok:true,rows,fetchedAt:new Date().toISOString()},{headers});
}
