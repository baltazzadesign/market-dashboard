import {db,failure,input,output,session,sessionCookie,throttle,username,verifyPassword,MemberError} from '@/lib/member-store';
export async function POST(request:Request){try{
 const body=await input(request),id=username(body.username);
 await throttle('login:'+id,12);await throttle('login:global',300);
 const rows=await db<{id:string;password_hash:string;status:string}[]>('balta_members?username=eq.'+encodeURIComponent(id)+'&select=id,password_hash,status');
 const row=rows[0],valid=await verifyPassword(body.password,row?.password_hash??('0'.repeat(32)+':'+ '0'.repeat(128)));
 if(!row||!valid||row.status!=='active')throw new MemberError('아이디·비밀번호 또는 이용 상태를 확인하세요.',401);
 const response=output({ok:true});response.headers.append('Set-Cookie',sessionCookie(await session(row.id)));response.headers.append('Set-Cookie','access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');return response;
}catch(e){return failure(e);}}
