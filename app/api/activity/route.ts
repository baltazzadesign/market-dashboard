import {db,failure,input,output,requireMember,throttle,MemberError} from '@/lib/member-store';
import {activityDays} from '@/lib/member-ranks';
function kstDay(now=Date.now()){return new Date(now+9*3600000).toISOString().slice(0,10);}
export async function GET(request:Request){try{
 const member=await requireMember(request),now=Date.now(),today=kstDay(now),yesterday=kstDay(now-86400000);
 const page=Math.max(0,Math.min(100000,Math.floor(Number(new URL(request.url).searchParams.get('page')))||0));
 const [attendance,history]=await Promise.all([
  db<{day:string;streak:number}[]>('balta_attendance?member_id=eq.'+member.id+'&day=gte.'+yesterday+'&day=lte.'+today+'&select=day,streak&order=day.desc&limit=2'),
  db<unknown[]>('balta_activity_ledger?member_id=eq.'+member.id+'&select=id,kind,points,created_at&order=created_at.desc,id.desc&limit=21&offset='+page*20)
 ]);
 return output({points:member.activity_points??0,checked:attendance.some(row=>row.day===today),streak:attendance[0]?.streak??0,day:today,...activityDays(member,now),history:history.slice(0,20),hasMore:history.length>20});
}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const member=await requireMember(request),body=await input(request);
 if(body.action!=='checkin')throw new MemberError('출석 요청을 확인하세요.');
 await throttle('attendance:'+member.id,30);
 const result=await db('rpc/balta_check_in','POST',{p_member:member.id});
 return output(result);
}catch(error){return failure(error);}}
