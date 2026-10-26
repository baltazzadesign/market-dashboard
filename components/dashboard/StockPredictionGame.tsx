'use client';
import {useCallback,useEffect,useState} from 'react';
import s from './PredictionGame.module.css';
import c from './StockPredictionGame.module.css';
type Stock={code:string;name:string};
type Entry=Stock&{id:string;day:string;direction:'up'|'down';result:'win'|'lose'|'flat'|null;reward:number;opening:number|null;closing:number|null};
type State={day:string;time:string;open:boolean;closed:string|null;serverNow:number;history:Entry[];warning:string};
const outcome=(r:Entry)=>r.result==='win'?'+100 P 지급 완료':r.result==='lose'?'미적중 · 차감 없음':r.result==='flat'?'시가 = 종가 · 0 P':'판정 대기';
export default function StockPredictionGame(){
 const [data,setData]=useState<State|null>(null),[query,setQuery]=useState(''),[stocks,setStocks]=useState<Stock[]>([]),[selected,setSelected]=useState<Stock|null>(null);
 const [error,setError]=useState(''),[searchError,setSearchError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[searching,setSearching]=useState(false),[clock,setClock]=useState(0);
 const load=useCallback(async()=>{try{const response=await fetch('/api/predictions/stocks',{cache:'no-store'}),body=await response.json();if(!response.ok)throw Error(body.error);setData(body);setClock(body.serverNow);setError('');}catch(e){setError(e instanceof Error?e.message:'조회 실패');}},[]);
 useEffect(()=>{void load();const id=setInterval(()=>{if(!document.hidden)void load();},30000);return()=>clearInterval(id);},[load]);
 useEffect(()=>{const id=setInterval(()=>setClock(n=>n+1000),1000);return()=>clearInterval(id);},[]);
 useEffect(()=>{
  const controller=new AbortController();
  if(!query.trim())return;
  const timer=setTimeout(async()=>{setSearching(true);setSearchError('');try{
   const response=await fetch('/api/market/stocks?q='+encodeURIComponent(query.trim()),{signal:controller.signal}),body=await response.json();
   if(!response.ok||!body.ok)throw Error('종목을 검색하지 못했습니다. 다시 시도해 주세요.');
   setStocks(body.rows??[]);
  }catch(e){if(!controller.signal.aborted)setSearchError(e instanceof Error?e.message:'검색 실패');}finally{if(!controller.signal.aborted)setSearching(false);}},300);
  return()=>{clearTimeout(timer);controller.abort();};
 },[query]);
 const today=data?.history.filter(r=>r.day===data.day)??[];
 const canChoose=Boolean(data?.open&&clock<Date.parse(data.day+'T14:00:00+09:00'));
 async function choose(stock:Stock,direction:'up'|'down'){
  setBusy(true);setError('');setMessage('');
  try{const response=await fetch('/api/predictions/stocks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:stock.code,direction})}),body=await response.json();if(!response.ok)throw Error(body.error);
   setMessage(stock.name+' · '+(direction==='up'?'양봉':'음봉')+' 선택이 저장되었습니다.');setSelected(null);setQuery('');setStocks([]);await load();
  }catch(e){setError(e instanceof Error?e.message:'저장 실패');}finally{setBusy(false);}
 }
 return <section id="stocks" className={`${s.panel} ${c.section}`} aria-labelledby="stock-game-title">
  <div className={s.heading}><div><small>BALTATOOL · STOCK CHALLENGE</small><h2 id="stock-game-title">종목 양봉·음봉 맞히기</h2><p>시가보다 높게 마감하면 양봉, 낮게 마감하면 음봉</p></div><span className={s.badge}>오늘 {today.length} / 3종목</span></div>
  <p>09:00~14:00 참여 · 적중당 +100 P · 하루 최대 300 P · 오답 패널티 없음</p>
  <p className={s.note}>선택한 종목은 당일 교체·취소할 수 없으며, 방향은 오후 2시 전까지 변경할 수 있습니다. 전일 종가 대비 상승·하락과는 다릅니다.</p>
  {error&&<p role="alert">{error} <button className={s.save} onClick={()=>void load()}>다시 조회</button></p>}
  {message&&<p role="status">{message}</p>}{data?.warning&&<p role="status">{data.warning}</p>}
  {!data?<p>참여 정보를 불러오는 중…</p>:!canChoose&&<p className={s.countdown}>{data.closed?'휴장 · '+data.closed:data.time<'09:00'?'오전 9시부터 참여할 수 있습니다.':'오늘 참여가 마감되었습니다.'}</p>}
  {canChoose&&today.length<3&&<div className={c.search}>
   <label htmlFor="prediction-stock-search">종목명 또는 종목코드 검색</label>
   <input id="prediction-stock-search" value={query} maxLength={60} placeholder="예: 삼성전자, 005930" autoComplete="off" onChange={e=>{setQuery(e.target.value);setSelected(null);setStocks([]);setSearchError('');setSearching(false);}}/>
   {query.trim()&&!selected&&<div className={c.results}>{searching?<p>검색 중…</p>:searchError?<p role="alert">{searchError}</p>:stocks.length?stocks.map(stock=><button key={stock.code} disabled={today.some(r=>r.code===stock.code)} onClick={()=>{setSelected(stock);setStocks([]);}}>{stock.name}<small>{stock.code}{today.some(r=>r.code===stock.code)?' · 이미 선택':''}</small></button>):<p>종목명을 입력해 검색 결과를 선택하세요.</p>}</div>}
   {selected&&<article className={s.card}><h3>{selected.name} <small>{selected.code}</small></h3><div className={s.choices}><button className={s.up} disabled={busy} onClick={()=>void choose(selected,'up')}>▲ 양봉 선택</button><button className={s.down} disabled={busy} onClick={()=>void choose(selected,'down')}>▼ 음봉 선택</button></div></article>}
  </div>}
  <div className={c.picks}>{today.map(r=><article className={s.card} key={r.id}><small>{r.code}</small><h3>{r.name}</h3><p>내 선택: {r.direction==='up'?'양봉 ▲':'음봉 ▼'}</p><div className={s.choices}>{(['up','down'] as const).map(direction=><button className={direction==='up'?s.up:s.down} key={direction} aria-pressed={r.direction===direction} disabled={!canChoose||busy||Boolean(r.result)} onClick={()=>void choose(r,direction)}>{direction==='up'?'▲ 양봉':'▼ 음봉'}</button>)}</div><strong>{outcome(r)}</strong></article>)}</div>
  {data&&today.length===0&&<p>오늘 선택한 종목이 없습니다.</p>}
  <p className={s.note}>KRX 정규장 시가·종가 기준입니다. 오후 4시 이후 이 페이지 조회와 오후 6시 예약 확인에서 판정합니다. 시가와 종가가 같으면 0 P로 종료하며, 거래정지·데이터 누락은 판정 대기로 유지합니다.</p>
  <details className={c.history}><summary>종목 참여 기록 · 최근 90건</summary>{data?.history.length?data.history.map(r=><div className={s.row} key={r.id}><span>{r.day} · {r.name}<small>{r.code} · {r.direction==='up'?'양봉':'음봉'} 선택{r.opening!=null&&r.closing!=null?' · 시가 '+Number(r.opening).toLocaleString()+' → 종가 '+Number(r.closing).toLocaleString():''}</small></span><strong>{outcome(r)}</strong></div>):<p>참여 기록이 없습니다.</p>}</details>
 </section>;
}
