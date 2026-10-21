import {withMembershipRank,type Member} from '@/lib/member-ranks';
type BoardAuthor = Pick<Member,'nickname'|'rank'|'role'|'status'|'created_at'|'auto_rank'>;
type Authored = {author:BoardAuthor|null;[key:string]:unknown};
function ranked<T extends Authored>(row:T){const author=row.author;if(!author)return row;const {nickname,rank,role}=withMembershipRank(author);return {...row,author:{nickname,rank,role}};}
import {db,failure,input,output,requireMember,text,throttle,uuid,MemberError} from '@/lib/member-store';
export async function GET(request:Request){try{
 await requireMember(request);const params=new URL(request.url).searchParams,id=params.get('id');
 if(id){const posts=await db<Authored[]>('balta_posts?id=eq.'+uuid(id)+'&select=*,author:balta_members!author_id(nickname,rank,role,status,created_at,auto_rank)');
 if(!posts[0])throw new MemberError('게시글을 찾을 수 없습니다.',404);
 const comments=await db<Authored[]>('balta_comments?post_id=eq.'+id+'&select=*,author:balta_members!author_id(nickname,rank,role,status,created_at,auto_rank)&order=created_at.asc&limit=200');
 return output({post:ranked(posts[0]),comments:comments.map(ranked)});}
 const page=Math.max(0,Math.floor(Number(params.get('page'))||0)),q=(params.get('q')??'').replace(/[*,().%\\]/g,'').slice(0,80);
 const posts=await db<Authored[]>('balta_posts?select=id,title,category,author_id,created_at,author:balta_members!author_id(nickname,rank,role,status,created_at,auto_rank)&order=created_at.desc&limit=21&offset='+Math.min(page,100000)*20+(q?'&title=ilike.*'+encodeURIComponent(q)+'*':'')+(params.get('category')==='notice'?'&category=eq.notice':''));
 return output({posts:posts.slice(0,20).map(ranked),hasMore:posts.length>20});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 const member=await requireMember(request),body=await input(request);await throttle('write:'+member.id,60);
 if(body.kind==='comment'){const rows=await db('balta_comments','POST',{post_id:uuid(body.post_id),author_id:member.id,body:text(body.body,2000,'댓글')});return output({ok:true,rows},201);}
 if(body.category==='notice'&&member.role==='member')throw new MemberError('공지 작성은 관리자만 가능합니다.',403);
 const posts=await db<{id:string}[]>('balta_posts','POST',{title:text(body.title,120,'제목'),body:text(body.body,10000,'본문'),category:body.category==='notice'?'notice':'free',author_id:member.id});
 return output({id:posts[0].id},201);
}catch(e){return failure(e);}}
async function mutate(request:Request,remove:boolean){try{
 const member=await requireMember(request),body=await input(request),id=uuid(body.id),table=body.kind==='comment'?'balta_comments':'balta_posts';
 const rows=await db<{author_id:string;category?:string}[]>(table+'?id=eq.'+id+'&select=author_id'+(table==='balta_posts'?',category':''));
 if(!rows[0])throw new MemberError('항목을 찾을 수 없습니다.',404);
 if(rows[0].author_id!==member.id&&member.role==='member')throw new MemberError('작성자 또는 관리자만 변경할 수 있습니다.',403);
 if(rows[0].category==='notice'&&member.role==='member')throw new MemberError('공지 변경은 관리자만 가능합니다.',403);
 const update=remove?undefined:table==='balta_posts'?{title:text(body.title,120,'제목'),body:text(body.body,10000,'본문')}:{body:text(body.body,2000,'댓글')};
 await db(table+'?id=eq.'+id,remove?'DELETE':'PATCH',remove?undefined:update);
 return output({ok:true});
}catch(e){return failure(e);}}
export const PATCH=(request:Request)=>mutate(request,false);
export const DELETE=(request:Request)=>mutate(request,true);
