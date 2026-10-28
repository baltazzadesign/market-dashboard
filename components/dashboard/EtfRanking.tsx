'use client';
import {useEffect,useState} from 'react';
import {etfInvestors,type EtfInvestor,type EtfResponse,type EtfEntry} from '@/lib/etf-ranking';
import s from './PremarketWorkspace.module.css';
import e from './EtfRanking.module.css';
function RankingTable({rows,sell,label}:{rows:EtfEntry[];sell:boolean;label:string}){
  return <article className={e.panel}><h3>ETF {label} {sell?'순매도':'순매수'} TOP10</h3><table><thead><tr><th scope="col">순위</th><th scope="col">ETF명</th><th scope="col">순매수대금<br/>(억원)</th></tr></thead><tbody>{rows.map((row,i)=><tr key={row.code}><td>{i+1}</td><th scope="row">{row.name}<small>{row.code}</small></th><td className={sell?e.sell:e.buy}>{row.net>0?'+':''}{row.net.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>)}</tbody></table>{!rows.length&&<p className={s.note}>해당 방향으로 확인된 ETF가 없습니다.</p>}</article>;
}
export default function EtfRanking({version}:{version:number}){
  const [date,setDate]=useState(''),[investor,setInvestor]=useState<EtfInvestor>('individual'),[data,setData]=useState<EtfResponse|null>(null),[dates,setDates]=useState<string[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();let pending=false;
    setLoading(true);setError('');setData(null);
    const refresh=async()=>{if(pending||document.hidden)return;pending=true;try{
      const response=await fetch('/api/market/etf-ranking'+(date?'?date='+date:''),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]),cache:'no-store'});
      const body=await response.json();if(!response.ok||!body.ok)throw Error(body.error||'ETF 순위 조회 실패');
      if(!controller.signal.aborted){setData(body);setDates(body.dates);setError('');}
    }catch(err){if(!controller.signal.aborted)setError(err instanceof Error?err.message:'ETF 순위 조회 실패');}finally{pending=false;if(!controller.signal.aborted)setLoading(false);}};
    void refresh();const timer=window.setInterval(()=>void refresh(),60000);const visible=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',visible);
    return()=>{controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[date,version]);
  const snapshot=data?.snapshot,group=snapshot?.groups[investor],label=etfInvestors[investor];
  return <section id="etf" data-premarket-export="etf" className={s.section}><h2>ETF 순매수 · 순매도 TOP10</h2><div className={e.controls}><label>투자 주체 <select value={investor} onChange={event=>setInvestor(event.target.value as EtfInvestor)}>{Object.entries(etfInvestors).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></label><label>기준일 <select value={date} onChange={event=>setDate(event.target.value)}><option value="">최근 수집일</option>{dates.map(d=><option key={d}>{d}</option>)}</select></label></div>
    {loading&&<p className={s.note} role="status">ETF 순위를 조회하고 있습니다…</p>}{error&&<p className={s.error} role="alert">{error}</p>}
    {snapshot&&group&&<><p className={s.note}>{snapshot.date} 기준 · {label} · {group.expected.toLocaleString('ko-KR')}개 ETF 중 {group.covered.toLocaleString('ko-KR')}개 금액 확인{group.covered<group.expected?' · 일부 미제공: 확인된 범위의 순위':''}</p><div className={e.grid}><RankingTable rows={group.buy} sell={false} label={label}/><RankingTable rows={group.sell} sell label={label}/></div><p className={s.note}>출처: 한국투자증권 · KRX 종목별 투자자매매동향(일별) · 수집 {new Date(snapshot.collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</p></>}
    {!loading&&!error&&!snapshot&&<p className={s.note}>아직 저장된 ETF 순위가 없습니다. 장후 수집이 완료되면 표시됩니다.</p>}
    <p className={s.note}>거래일 16:30·18:00 자동 수집 시작 · 화면은 1분마다 저장 결과 확인 · 수집 완료 후 기준일 변경</p><p className={s.note}>국내 상장 ETF 대상 · ETN 제외 · 순매수대금 = 매수대금 − 매도대금. 음수는 순매도입니다. 같은 기준일의 금액으로 정렬하며, 미제공 값은 0으로 취급하지 않습니다. 장후 자료는 제공처 정정에 따라 달라질 수 있습니다. 주말에는 최근 수집일을 표시합니다.</p>
  </section>;
}
