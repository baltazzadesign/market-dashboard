import {db,digest,failure,input,output,passwordHash,throttle,MemberError} from '@/lib/member-store';
export async function POST(request:Request){try{
 const body=await input(request);await throttle('owner-setup',10);
 if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))throw new MemberError('초기 설정 키를 확인하세요.',403);
 const hash=await passwordHash(body.password);
 const ok=await db<boolean>('rpc/balta_activate_owner','POST',{setup_hash:digest(body.token),new_password_hash:hash});
 if(!ok)throw new MemberError('설정 키가 유효하지 않거나 이미 설정되었습니다.',403);
 return output({ok:true});
}catch(e){return failure(e);}}
