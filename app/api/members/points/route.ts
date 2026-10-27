import {db,requireMember,input,output,failure,MemberError,throttle} from '@/lib/member-store';
import type {Member} from '@/lib/member-ranks';
export const dynamic='force-dynamic';
const validId=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function target(actor:Member,id:unknown){
 if(!validId(id))throw new MemberError('회원을 확인하세요.');
 const rows=await db<Member[]>('balta_members?id=eq.'+id+'&select=id,role,activity_points');const member=rows[0];
 if(!member)throw new MemberError('회원을 찾을 수 없습니다.',404);
 if(member.role==='owner'||actor.id===id||(actor.role!=='owner'&&member.role!=='member'))throw new MemberError('이 회원의 포인트를 변경할 권한이 없습니다.',403);
 return member;
}
export async function GET(request:Request){try{
 const actor=await requireMember(request,true),member=await target(actor,new URL(request.url).searchParams.get('id'));
 const history=await db('balta_point_adjustments?member_id=eq.'+member.id+'&select=id,actor_name,delta,reason,balance_after,created_at&order=created_at.desc&limit=30');
 return output({balance:member.activity_points,history});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const actor=await requireMember(request,true),body=await input(request);
 if(!body||!Number.isInteger(body.delta)||body.delta===0||Math.abs(body.delta)>10000||typeof body.reason!=='string'||body.reason.trim().length<2||body.reason.trim().length>200||!validId(body.requestId))throw new MemberError('포인트는 1~10,000P, 사유는 2~200자로 입력하세요.');
 const member=await target(actor,body.id);await throttle('admin-points:'+actor.id,60);
 const result=await db<{error?:string;balance:number}>('rpc/balta_adjust_points','POST',{p_actor:actor.id,p_member:member.id,p_delta:body.delta,p_reason:body.reason.trim(),p_request:body.requestId});
 if(result.error)throw new MemberError(result.error,409);
 return output(result);
}catch(e){return failure(e);}}
