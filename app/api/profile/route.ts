import {db,failure,input,output,requireMember,text,throttle,passwordHash,verifyPassword,sessionCookie,MemberError} from '@/lib/member-store';

export async function GET(request:Request){try{
 const member=await requireMember(request),params=new URL(request.url).searchParams;
 const kind=params.get('kind')==='comments'?'comments':'posts';
 const page=Math.max(0,Math.min(100000,Math.floor(Number(params.get('page'))||0)));
 const table=kind==='posts'?'balta_posts':'balta_comments';
 const fields=kind==='posts'?'id,title,category,created_at':'id,post_id,body,created_at,post:balta_posts!post_id(title)';
 const entries=await db<unknown[]>(table+'?author_id=eq.'+member.id+'&select='+fields+'&order=created_at.desc,id.desc&limit=21&offset='+page*20);
 return output({entries:entries.slice(0,20),hasMore:entries.length>20});
}catch(error){return failure(error);}}

export async function PATCH(request:Request){try{
 const member=await requireMember(request),body=await input(request);
 if(body.action==='nickname'){
  await throttle('profile:'+member.id,30);
  const nickname=text(body.nickname,24,'닉네임');
  await db('balta_members?id=eq.'+member.id,'PATCH',{nickname});
  return output({ok:true,nickname});
 }
 if(body.action!=='password')throw new MemberError('변경할 항목을 확인하세요.');
 await throttle('password:'+member.id,8);
 const rows=await db<{password_hash:string}[]>('balta_members?id=eq.'+member.id+'&select=password_hash');
 if(!rows[0]||!await verifyPassword(body.currentPassword,rows[0].password_hash))throw new MemberError('현재 비밀번호가 일치하지 않습니다.');
 if(body.currentPassword===body.newPassword)throw new MemberError('새 비밀번호는 현재 비밀번호와 다르게 입력하세요.');
 const hash=await passwordHash(body.newPassword);
 const changed=await db<boolean>('rpc/balta_change_password','POST',{p_member:member.id,p_old_hash:rows[0].password_hash,p_new_hash:hash});
 if(!changed)throw new MemberError('계정 정보가 변경됐습니다. 다시 로그인해 주세요.',409);
 const response=output({ok:true,loginRequired:true});response.headers.append('Set-Cookie',sessionCookie('',0));return response;
}catch(error){return failure(error);}}
