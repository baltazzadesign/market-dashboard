export const RANKS = ['훈련병','이병','일병','상병','병장','하사','중사','상사','원사','준위','소위','중위','대위','소령','중령','대령','준장','소장','중장','대장','원수'] as const;
export const OWNER_USERNAME = 'KLTbaltatool';
export type Member = {id:string;username:string;nickname:string;rank:number;role:'member'|'admin'|'owner';status:'active'|'suspended';created_at:string;auto_rank?:boolean;activity_points?:number};

// Elapsed 24-hour days from registration; the final automatic rank is 원사.
export const AUTO_RANK_DAYS = [0,7,30,60,90,180,270,365,540] as const;
type RankMember = Pick<Member,'rank'|'role'|'status'|'created_at'|'auto_rank'|'activity_points'>;
export function membershipRank(member:RankMember, now=Date.now()):number {
  if(member.auto_rank!==true || member.role!=='member' || member.status!=='active') return member.rank;
  const joined=Date.parse(member.created_at);
  if(!Number.isFinite(joined)) return member.rank;
  const days=activityDays(member,now).effectiveDays;
  let rank=0;
  for(let i=1;i<AUTO_RANK_DAYS.length;i++) if(days>=AUTO_RANK_DAYS[i]) rank=i;
  return Math.max(member.rank,rank);
}
export function withMembershipRank<T extends RankMember>(member:T,now=Date.now()):T {
  return {...member,rank:membershipRank(member,now)};
}

export function rankProgress(member:RankMember,now=Date.now()) {
 const rank=membershipRank(member,now);
 if(member.role!=='member'||member.auto_rank!==true||member.status!=='active') return {rank,percent:0,label:'관리자 지정 계급',detail:'수동 지정 · 자동 경험치 미적용'};
 if(rank>=AUTO_RANK_DAYS.length-1) return {rank,percent:100,label:'자동 진급 최고 계급',detail:'MAX · 원사까지 자동 진급 완료'};
 const rawAge=Math.max(0,(now-Date.parse(member.created_at))/86400000);
 const {elapsedDays,bonusDays}=activityDays(member,now);
 const age=rawAge+bonusDays;
 if(!Number.isFinite(age))return {rank,percent:0,label:'가입일 확인 필요',detail:'경험치 정보를 확인할 수 없습니다.'};
 const start=AUTO_RANK_DAYS[rank],end=AUTO_RANK_DAYS[rank+1];
 const earned=Math.max(0,Math.min(end-start,Math.floor(age)-start));
 const percent=Math.max(0,Math.min(100,Math.floor((age-start)/(end-start)*100)));
 return {rank,percent,label:RANKS[rank+1]+'까지 '+Math.max(0,Math.ceil(end-age))+'일분',detail:'가입 '+elapsedDays+'일 + 활동 '+bonusDays+'일 · EXP '+earned+'/'+(end-start)};
}

export function activityDays(member:RankMember,now=Date.now()) {
 const joined=Date.parse(member.created_at);
 const elapsedDays=Number.isFinite(joined)?Math.max(0,Math.floor((now-joined)/86400000)):0;
 const points=Math.max(0,Number.isFinite(member.activity_points)?member.activity_points!:0);
 const eligible=member.auto_rank===true&&member.role==='member'&&member.status==='active';
 const bonusDays=eligible?Math.min(Math.floor(points/100),Math.floor(elapsedDays/2)):0;
 return {elapsedDays,bonusDays,effectiveDays:elapsedDays+bonusDays};
}
