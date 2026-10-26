import {db,requireMember,input,output,failure,MemberError,throttle} from '@/lib/member-store';
import {predictionWindow} from '@/lib/prediction-model';
import {parseAdditionalHolidays} from '@/lib/market-calendar';
import {settlePredictions} from '@/lib/prediction-service';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){try{
 const member=await requireMember(request);
 let warning='';try{await settlePredictions();}catch{warning='종가 확인이 지연되어 미판정 결과는 대기 중입니다.';}
 const state=predictionWindow(new Date(),parseAdditionalHolidays(process.env.MARKET_HOLIDAYS));
 const history=await db<{day:string;market:string;[key:string]:unknown}[]>('balta_predictions?member_id=eq.'+member.id+'&order=day.desc,market.asc&limit=60');
 const [poll,results]=await Promise.all([db('rpc/balta_prediction_poll','POST',{p_member:member.id,p_day:state.day}),history.length?db<{day:string;market:string;close:number;previous_close:number}[]>('balta_prediction_results?day=gte.'+history[history.length-1].day+'&select=day,market,close,previous_close'):Promise.resolve([])]);
 return output({...state,serverNow:Date.now(),poll,history:history.map(r=>({...r,...results.find(x=>x.day===r.day&&x.market===r.market)})),warning});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const member=await requireMember(request),body=await input(request);
 if(!['kospi','kosdaq'].includes(body.market)||!['up','down'].includes(body.direction))throw new MemberError('지수와 방향을 선택하세요.');
 if(!predictionWindow(new Date(),parseAdditionalHolidays(process.env.MARKET_HOLIDAYS)).open)throw new MemberError('참여 시간은 거래일 09:00~14:00입니다.',409);
 await throttle('prediction:'+member.id,60);
 const result=await db<{error?:string}>('rpc/balta_predict','POST',{p_member:member.id,p_market:body.market,p_direction:body.direction});
 if(result?.error)throw new MemberError(result.error,409);
 return output({ok:true});
}catch(e){return failure(e);}}
