export async function api(path:string,method='GET',body?:unknown){
 const r=await fetch(path,{method,cache:'no-store',headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const j=await r.json();if(!r.ok){if(r.status===401)location.assign('/login');throw Error(j.error||'요청을 처리하지 못했습니다.');}return j;
}
