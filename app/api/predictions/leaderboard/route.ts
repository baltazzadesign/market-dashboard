import {db,requireMember,output,failure,MemberError} from '@/lib/member-store';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const member=await requireMember(request),period=new URL(request.url).searchParams.get('period')??'week';
 if(!['week','month','all'].includes(period))throw new MemberError('조회 기간을 확인하세요.');
 return output(await db('rpc/balta_prediction_leaderboard','POST',{p_member:member.id,p_period:period}));
}catch(e){return failure(e);}}
