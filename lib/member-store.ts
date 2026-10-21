import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { OWNER_USERNAME, withMembershipRank, type Member } from './member-ranks';
const scrypt = promisify(scryptCallback);
export class MemberError extends Error { constructor(message:string,public status=400){super(message);} }
export async function db<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const base=process.env.SUPABASE_URL?.replace(/\/rest\/v1\/?$/,'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!base||!key)throw new MemberError('회원 서비스 연결 설정이 필요합니다.',503);
  const response=await fetch(base+'/rest/v1/'+path,{method,headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new MemberError(response.status===409?'이미 사용 중인 아이디입니다.':'회원 서비스 요청을 처리하지 못했습니다.',response.status===409?409:503);
  const text=await response.text();return (text?JSON.parse(text):null) as T;
}
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function cookieToken(request:Request){const value=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('balta_session='))?.slice(14);return value&&/^[a-f0-9]{64}$/.test(value)?value:null;}
export async function currentMember(request:Request):Promise<Member|null>{
  const token=cookieToken(request);if(!token)return null;
  const sessions=await db<{member_id:string}[]>('balta_sessions?token_hash=eq.'+digest(token)+'&expires_at=gt.'+encodeURIComponent(new Date().toISOString())+'&select=member_id');
  if(!sessions[0])return null;
  const members=await db<Member[]>('balta_members?id=eq.'+sessions[0].member_id+'&select=id,username,nickname,rank,role,status,created_at,auto_rank');
  return members[0]?.status==='active'?withMembershipRank(members[0]):null;
}
export async function requireMember(request:Request,admin=false){
  const member=await currentMember(request);if(!member)throw new MemberError('로그인이 필요합니다.',401);
  if(admin&&member.role==='member')throw new MemberError('관리자 권한이 필요합니다.',403);return member;
}
export async function passwordHash(password:string){
  if(typeof password!=='string'||password.length<12||password.length>128)throw new MemberError('비밀번호는 12~128자로 입력하세요.');
  const salt=randomBytes(16).toString('hex'),key=await scrypt(password,salt,64) as Buffer;
  return salt+':'+key.toString('hex');
}
export async function verifyPassword(password:string,stored:string){
  if(typeof password!=='string'||password.length>128)return false;
  const [salt,hash]=stored.split(':');if(!salt||!hash||hash.length!==128)return false;
  const actual=await scrypt(password,salt,64) as Buffer;
  return timingSafeEqual(actual,Buffer.from(hash,'hex'));
}
export function username(value:unknown){
  if(typeof value!=='string'||!/^[a-zA-Z0-9_]{4,24}$/.test(value))throw new MemberError('아이디는 영문·숫자·밑줄 4~24자입니다.');
  return value.toLowerCase();
}
export function text(value:unknown,max:number,label:string){
  if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new MemberError(label+' 입력을 확인하세요. (최대 '+max+'자)');
  return value.trim();
}
export function uuid(value:unknown){if(typeof value!=='string'||!/^[0-9a-f-]{36}$/.test(value))throw new MemberError('잘못된 항목입니다.');return value;}
export async function input(request:Request){
  const origin=request.headers.get('origin');
  if(origin!==new URL(request.url).origin)throw new MemberError('허용되지 않은 요청입니다.',403);
  const raw=await request.text();if(raw.length>24000)throw new MemberError('입력 내용이 너무 깁니다.',413);
  try{return JSON.parse(raw);}catch{throw new MemberError('입력 형식을 확인하세요.');}
}
export function output(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});}
export function failure(error:unknown){return output({error:error instanceof MemberError?error.message:'요청을 처리하지 못했습니다.'},error instanceof MemberError?error.status:500);}
export async function throttle(key:string,limit:number){
  const allowed=await db<boolean>('rpc/balta_rate_limit','POST',{bucket:digest(key),maximum:limit});
  if(!allowed)throw new MemberError('요청이 많습니다. 15분 후 다시 시도하세요.',429);
}
export async function session(memberId:string){
  const token=randomBytes(32).toString('hex');
  await db('balta_sessions','POST',{token_hash:digest(token),member_id:memberId,expires_at:new Date(Date.now()+86400000).toISOString()});return token;
}
export const sessionCookie=(token:string,maxAge=86400)=>`balta_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV==='production'?'; Secure':''}`;
export const reserved=(value:string)=>value.toLowerCase()===OWNER_USERNAME.toLowerCase();
