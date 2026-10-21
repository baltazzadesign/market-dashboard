import {failure,output,requireMember} from '@/lib/member-store';
export async function GET(request:Request){try{return output({member:await requireMember(request)});}catch(e){return failure(e);}}
