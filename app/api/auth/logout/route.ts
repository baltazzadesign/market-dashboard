import {cookieToken,db,digest,failure,output,sessionCookie,MemberError} from '@/lib/member-store';
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new MemberError('허용되지 않은 요청입니다.',403);
 const token=cookieToken(request);if(token)await db('balta_sessions?token_hash=eq.'+digest(token),'DELETE');
 const response=output({ok:true});response.headers.append('Set-Cookie',sessionCookie('',0));response.headers.append('Set-Cookie','access=; Path=/; Max-Age=0');return response;
}catch(e){return failure(e);}}
