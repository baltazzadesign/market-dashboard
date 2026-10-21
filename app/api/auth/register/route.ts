import {db,failure,input,output,passwordHash,reserved,text,throttle,username,MemberError} from '@/lib/member-store';
export async function POST(request:Request){try{
  const body=await input(request),id=username(body.username);
  await throttle('register:global',60);
  if(reserved(id))throw new MemberError('관리자 전용 아이디입니다.',403);
  const nickname=text(body.nickname,24,'닉네임'),password_hash=await passwordHash(body.password);
  await db('balta_members','POST',{username:id,nickname,password_hash,rank:0,role:'member',status:'active'});
  return output({ok:true},201);
}catch(e){return failure(e);}}
