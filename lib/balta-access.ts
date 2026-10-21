import {currentMember} from './member-store';
// Kept for collectors that import the name; no shared-code login is accepted.
export function accessCode(){return process.env.BALTATOOL_ACCESS_CODE??'';}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !origin||origin===new URL(request.url).origin;}
export async function hasDashboardAccess(request:Request){try{return !!(await currentMember(request));}catch{return false;}}
