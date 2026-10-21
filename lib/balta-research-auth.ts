import {timingSafeEqual} from 'node:crypto';
import {hasDashboardAccess,sameOrigin} from './balta-access';

export async function researchAdmin(request:Request):Promise<boolean>{
 if(!(await hasDashboardAccess(request))||!sameOrigin(request))return false;
 const configured=process.env.BALTA_RESEARCH_ADMIN_KEY;
 const submitted=request.headers.get('x-balta-research-admin-key');
 if(!configured||configured.length<20||!submitted)return false;
 const a=Buffer.from(configured),b=Buffer.from(submitted);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export const dateValid=(value:string)=>/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
