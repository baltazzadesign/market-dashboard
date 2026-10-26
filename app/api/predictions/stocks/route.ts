import {db,requireMember,input,output,failure,MemberError,throttle} from '@/lib/member-store';
import {predictionWindow} from '@/lib/prediction-model';
import {parseAdditionalHolidays} from '@/lib/market-calendar';
import {stockDirectory} from '@/lib/kis-directory';
import {settleStockPredictions} from '@/lib/stock-prediction-service';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){try{
 const member=await requireMember(request);
 let warning='';try{await settleStockPredictions(member.id);}catch{warning='종가 확인이 지연되고 있습니다. 미판정 건은 다시 확인합니다.';}
 const state=predictionWindow(new Date(),parseAdditionalHolidays(process.env.MARKET_HOLIDAYS));
 const history=await db('balta_stock_predictions?member_id=eq.'+member.id+'&order=day.desc,created_at.asc&limit=90');
 return output({...state,history,warning,serverNow:Date.now()});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const member=await requireMember(request),body=await input(request);
 if(!body||typeof body.code!=='string'||!/^\d{6}$/.test(body.code)||!['up','down'].includes(body.direction))throw new MemberError('종목과 방향을 선택하세요.');
 if(!predictionWindow(new Date(),parseAdditionalHolidays(process.env.MARKET_HOLIDAYS)).open)throw new MemberError('참여 시간은 거래일 09:00~14:00입니다.',409);
 await throttle('stock-prediction:'+member.id,60);
 const stock=(await stockDirectory()).find(row=>row.code===body.code);
 if(!stock)throw new MemberError('조회 가능한 국내 상장 종목을 선택하세요.');
 const result=await db<{error?:string}>('rpc/balta_predict_stock','POST',{p_member:member.id,p_code:stock.code,p_name:stock.name,p_direction:body.direction});
 if(result?.error)throw new MemberError(result.error,409);
 return output({ok:true});
}catch(e){return failure(e);}}
