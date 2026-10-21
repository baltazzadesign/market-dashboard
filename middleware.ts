import {NextResponse,type NextRequest} from 'next/server';
import {currentMember} from './lib/member-store';
export async function middleware(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(path.startsWith('/api')||path==='/login'||path==='/setup')return NextResponse.next();
 try{
 const member=await currentMember(request);
 if(member){if(path.startsWith('/admin')&&member.role==='member')return NextResponse.redirect(new URL('/board',request.url));return NextResponse.next();}
 }catch{return new NextResponse('회원 서비스 연결을 확인하고 잠시 후 다시 시도하세요.',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});}
 return NextResponse.redirect(new URL('/login',request.url));
}
export const config={runtime:'nodejs',matcher:['/((?!api|_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)']};
