import {db,failure,input,output,requireMember,throttle,MemberError} from '@/lib/member-store';
import {stockDirectory} from '@/lib/kis-directory';
function code(value:unknown){if(typeof value!=='string'||!/^\d{6}$/.test(value))throw new MemberError('6자리 종목코드를 확인하세요.');return value;}
export async function GET(request:Request){try{
 const member=await requireMember(request);
 const rows=await db<unknown[]>('balta_watchlist?member_id=eq.'+member.id+'&select=code,name,market,created_at&order=created_at.desc,code.asc&limit=100');
 return output({rows});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const member=await requireMember(request),body=await input(request),stockCode=code(body.code);
 await throttle('watchlist:'+member.id,120);
 const stock=(await stockDirectory()).find(stock=>stock.code===stockCode);
 if(!stock)throw new MemberError('종목 목록에서 찾을 수 없는 코드입니다.');
 const saved=await db<boolean>('rpc/balta_save_watchlist','POST',{p_member:member.id,p_code:stock.code,p_name:stock.name,p_market:stock.market});
 if(!saved)throw new MemberError('관심 종목은 최대 100개까지 저장할 수 있습니다.');
 return output({ok:true,stock});
}catch(error){return failure(error);}}
export async function DELETE(request:Request){try{
 const member=await requireMember(request),body=await input(request);
 await db('balta_watchlist?member_id=eq.'+member.id+'&code=eq.'+code(body.code),'DELETE');
 return output({ok:true});
}catch(error){return failure(error);}}
