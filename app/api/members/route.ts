import {db,failure,input,output,requireMember,uuid,MemberError} from '@/lib/member-store';
import {RANKS,withMembershipRank,type Member} from '@/lib/member-ranks';
export async function GET(request:Request){try{
 await requireMember(request,true);const p=new URL(request.url).searchParams;
 const page=Math.max(0,Math.min(100000,Number(p.get('page'))||0)),q=(p.get('q')??'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,24);
 const members=await db<Member[]>('balta_members?select=id,username,nickname,rank,role,status,created_at,auto_rank&order=created_at.desc&limit=51&offset='+Math.floor(page)*50+(q?'&username=ilike.*'+q+'*':''));
 return output({members:members.slice(0,50).map(m=>withMembershipRank(m)),hasMore:members.length>50});
}catch(e){return failure(e);}}
export async function PATCH(request:Request){try{
 const actor=await requireMember(request,true),body=await input(request),id=uuid(body.id);
 const rows=await db<Member[]>('balta_members?id=eq.'+id+'&select=id,role,auto_rank');const target=rows[0];
 if(!target)throw new MemberError('회원을 찾을 수 없습니다.',404);
 if(target.role==='owner'||actor.id===id||(actor.role!=='owner'&&target.role!=='member'))throw new MemberError('이 계정은 변경할 수 없습니다.',403);
 if(body.auto_rank!==undefined&&typeof body.auto_rank!=='boolean')throw new MemberError('자동 진급 설정을 확인하세요.');
 if(!Number.isInteger(body.rank)||body.rank<0||body.rank>=RANKS.length||!['active','suspended'].includes(body.status)||!['member','admin'].includes(body.role))throw new MemberError('회원 설정을 확인하세요.');
 if(actor.role!=='owner'&&body.role!==target.role)throw new MemberError('관리자 지정은 최고 관리자만 가능합니다.',403);
 await db('balta_members?id=eq.'+id,'PATCH',{rank:body.rank,status:body.status,role:body.role,auto_rank:body.auto_rank??target.auto_rank});
 if(body.status==='suspended')await db('balta_sessions?member_id=eq.'+id,'DELETE');
 return output({ok:true});
}catch(e){return failure(e);}}
