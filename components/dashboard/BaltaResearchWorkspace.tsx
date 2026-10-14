"use client";
import {useCallback,useEffect,useState} from 'react';
import type {ResearchEvidence,ResearchNarrative} from '@/lib/balta-daily-research';
import styles from './BaltaResearchWorkspace.module.css';
type Report={trade_date:string;status:'draft'|'published';version:string;generated_at:string;
 approved_at:string|null;model:string;narrative:ResearchNarrative;evidence:ResearchEvidence};
type Reply={ok?:boolean;items?:Report[];error?:string};
const nf=(n:number|null,d=2)=>n===null?'—':(n>0?'+':'')+
 n.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d});
const tone=(n:number|null)=>n===null?'':n>0?styles.plus:n<0?styles.minus:'';
const flowLabels:Record<string,string>={foreign:'외국인',institution:'기관',individual:'개인',
 otherCorporation:'기타법인',financialInvestment:'금융투자',investmentTrust:'투신',
 pension:'연기금',insurance:'보험',privateEquity:'사모',otherFinance:'기타금융',bank:'은행'};
const sig=(n:number|null)=>n===null?'—':nf(n);
export default function BaltaResearchWorkspace({admin=false}:{admin?:boolean}){
 const [key,setKey]=useState(''),[rows,setRows]=useState<Report[]>([]),[date,setDate]=useState('');
 const [error,setError]=useState(''),[loading,setLoading]=useState(!admin),[busy,setBusy]=useState(false);
 const load=useCallback(async(secret:string)=>{
  setLoading(true);setError('');
  try{
   const r=await fetch('/api/balta-research'+(admin?'?admin=1':''),{
    headers:admin?{'x-balta-research-admin-key':secret}:{},cache:'no-store'});
   const result:Reply=await r.json();
   if(!r.ok||!result.ok||!Array.isArray(result.items))throw Error(result.error??'리서치를 불러올 수 없습니다.');
   setRows(result.items);setDate(d=>result.items?.some(x=>x.trade_date===d)?d:result.items?.[0]?.trade_date??'');
  }catch(e){setError(e instanceof Error?e.message:'리서치를 불러올 수 없습니다.');}
  finally{setLoading(false);}
 },[admin]);
 useEffect(()=>{if(!admin)void load('');},[admin,load]);
 const report=rows.find(r=>r.trade_date===date);
 const ev=report?.evidence,n=report?.narrative;
 async function publish(){
  if(!report||report.status!=='draft')return;
  if(!window.confirm(report.trade_date+' 리서치 내용을 검토하고 공개하시겠습니까?'))return;
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/balta-research',{method:'POST',
    headers:{'Content-Type':'application/json','x-balta-research-admin-key':key},
    body:JSON.stringify({date:report.trade_date,action:'publish'})});
   const result=await r.json();
   if(!r.ok||!result.ok)throw Error(result.error??'공개 실패');
   await load(key);
  }catch(e){setError(e instanceof Error?e.message:'공개 실패');}
  finally{setBusy(false);}
 }
 async function openPdf(){
  if(!report)return;
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/balta-research/pdf?date='+report.trade_date,{headers:
    admin?{'x-balta-research-admin-key':key}:{}});
   if(!r.ok)throw Error('PDF 열기 실패');
   const url=URL.createObjectURL(await r.blob());
   const a=document.createElement('a');a.href=url;a.download='BALTA_RESEARCH_'+report.trade_date+'.pdf';
   document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(e){setError(e instanceof Error?e.message:'PDF 다운로드 실패');}
  finally{setBusy(false);}
 }
 return <main className={'terminal-detail-page '+styles.root}>
  <header className={styles.hero}>
   <div><span className={styles.brand}>BALTA RESEARCH · 일간 투자자 수급 분석</span>
    <h1>발타리서치</h1><p>장 마감 시장 수급에 종목별 가격·거래량을 결합한 전문 리서치 노트</p></div>
   {admin&&<span className={styles.adminTag}>운영자 승인 관리</span>}
  </header>
  {admin&&<div className={styles.adminAccess}>
   <label htmlFor="researchAdminKey">운영자 별도 발행 키</label>
   <input id="researchAdminKey" type="password" autoComplete="off"
    placeholder="BALTA_RESEARCH_ADMIN_KEY" value={key} onChange={e=>setKey(e.target.value)}/>
   <button onClick={()=>void load(key)} disabled={loading||!key}>초안 조회</button>
   <p>키는 브라우저 저장소에 보관하지 않습니다. 승인된 보고서만 일반 이용자 화면에 표시됩니다.</p>
  </div>}
  <div className={styles.selector}>
   <span>날짜별 리서치</span>
   <select aria-label="보고서 기준일" value={date} onChange={e=>setDate(e.target.value)} disabled={!rows.length}>
    {!rows.length&&<option value="">공개된 보고서 없음</option>}
    {rows.map(r=><option key={r.trade_date} value={r.trade_date}>{r.trade_date}{admin?' · '+(r.status==='draft'?'검토 초안':'공개') :''}</option>)}
   </select>
   {report&&<button className={styles.pdf} onClick={()=>void openPdf()} disabled={busy}>PDF 저장 <span aria-hidden>↗</span></button>}
   {admin&&report?.status==='draft'&&<button className={styles.approve} onClick={()=>void publish()} disabled={busy}>검토 완료 · 공개 승인</button>}
  </div>
  {error&&<div role="alert" className={styles.error}>{error}</div>}
  {loading&&<div className={styles.empty}>발타리서치를 확인하고 있습니다…</div>}
  {!loading&&!report&&<div className={styles.empty}>
   <strong>{admin?'생성된 초안이 없거나 운영자 인증이 필요합니다.':'아직 공개된 발타 리서치 노트가 없습니다.'}</strong>
   <p>자료 수집과 분석 검증 후 초안이 생성되며, 운영자가 승인한 보고서만 이곳에 게시됩니다.</p>
  </div>}
  {report&&ev&&n&&<div className={styles.slides}>
    <section className={styles.slide}>
     <div className={styles.slideTop}>BALTA RESEARCH · 발타 리서치 노트 <span>{report.trade_date} / 종합 판단</span></div>
     <span className={styles.kicker}>DAILY INVESTOR FLOW</span>
     <h2>{n.headline}</h2><p className={styles.lead}>{n.lead}</p>
     <div className={styles.trio}>
      <div><small>외국인 순매수 합계 (억원)</small><strong className={tone(ev.market.foreign)}>{sig(ev.market.foreign)}</strong></div>
      <div><small>기관 순매수 합계 (억원)</small><strong className={tone(ev.market.institution)}>{sig(ev.market.institution)}</strong></div>
      <div><small>수급 확인 종목 수</small><strong>{ev.coverage.covered.toLocaleString()}</strong><small>전체 {ev.coverage.expected.toLocaleString()}종목</small></div>
     </div>
     <div className={styles.statement}>{n.closingView}</div>
     <div className={styles.slideFoot}>발타툴 내부 자료 · KRX 정규장 · 원천 확정 여부 미검증 <span>01</span></div>
    </section>
    <section className={styles.slide}>
     <div className={styles.slideTop}>BALTA RESEARCH · 자료 범위 <span>{report.trade_date}</span></div>
     <h2>수급 수치는 확인된 범위에서만 해석한다</h2>
     <div className={styles.trio}>
      <div><small>수급 확인 비율</small><strong>{ev.coverage.ratio.toFixed(1)}%</strong></div>
      <div><small>미확인 종목</small><strong>{ev.coverage.missing}개</strong><small>0원으로 처리하지 않음</small></div>
      <div><small>분석 주체</small><strong>{ev.participants.length}개</strong></div>
     </div>
     <div className={styles.infoBlock}>기관 하위 주체는 기관 전체 금액에 포함되므로 다시 합산할 수 없습니다. 종목별 순매수 합계는 총 매수·매도 거래대금과 다릅니다.</div>
     <div className={styles.source}>수집 시점: {ev.generatedSourceAt} · {ev.source.ranking}</div>
     <div className={styles.slideFoot}>수치의 단위 및 데이터 완전성 <span>02</span></div>
    </section>
    <section className={styles.slide}>
     <div className={styles.slideTop}>BALTA RESEARCH · 전체 수급 구조 <span>{report.trade_date}</span></div>
     <h2>누가 사고, 누가 시장에 공급했는가</h2>
     <div className={styles.flows}>
      {ev.participants.slice(0,11).map(p=><div key={p.key} className={styles.flow}>
       <b>{flowLabels[p.key]??p.label}</b><div className={styles.barTrack}>
        <div className={p.net>=0?styles.barUp:styles.barDown} style={{width:Math.max(1,Math.min(100,Math.abs(p.net)/Math.max(1,...ev.participants.map(x=>Math.abs(x.net)))*100))+'%'}}/>
       </div><strong className={tone(p.net)}>{nf(p.net)}억</strong>
      </div>)}
     </div>
     <p className={styles.analysis}>{n.marketView}</p>
     <div className={styles.slideFoot}>확인 종목 순매수의 방향별 합계 · 단위 억원 <span>03</span></div>
    </section>
    <section className={styles.slide}>
     <div className={styles.slideTop}>BALTA RESEARCH · 시장 판단 <span>{report.trade_date}</span></div>
     <h2>수급의 규모와 가격 움직임을 함께 본다</h2>
     <div className={styles.trio}>
      <div><small>KOSPI</small><strong>{ev.market.kospi.toLocaleString()}</strong><small>{nf(ev.market.kospiPct)}%</small></div>
      <div><small>KOSDAQ</small><strong>{ev.market.kosdaq.toLocaleString()}</strong><small>{nf(ev.market.kosdaqPct)}%</small></div>
      <div><small>상승 종목 비중</small><strong>{ev.market.breadthPct.toFixed(1)}%</strong>
       <small>상승 {ev.market.up} · 하락 {ev.market.down}</small></div>
     </div>
     <div className={styles.statement}>{n.institutionView}</div><p className={styles.analysis}>{n.sectorView}</p>
     <div className={styles.slideFoot}>정규장 15:30 지수·시장폭 관측 <span>04</span></div>
    </section>
    <section className={styles.slide}>
     <div className={styles.slideTop}>BALTA RESEARCH · 관찰 종목 <span>{report.trade_date}</span></div>
     <h2>수급과 가격·거래량의 교차 확인</h2>
     <div className={styles.tableWrap}><table><thead><tr>
      <th>종목</th><th>외국인 (억)</th><th>기관 (억)</th><th>종가 (원)</th><th>거래량 (주)</th><th>거래량/20일</th>
     </tr></thead><tbody>{ev.stocks.map(s=><tr key={s.code}>
      <td><b>{s.name}</b><small>{s.code}</small></td><td className={tone(s.foreign)}>{sig(s.foreign)}</td>
      <td className={tone(s.institution)}>{sig(s.institution)}</td>
      <td>{s.price?.close.toLocaleString()??'미확인'}</td>
      <td>{s.price?.volume.toLocaleString()??'미확인'}</td>
      <td>{s.price?.volumeVs20d==null?'—':s.price.volumeVs20d.toFixed(2)+'배'}</td>
     </tr>)}</tbody></table></div>
     <div className={styles.slideFoot}>가격·거래량은 KIS 개별 종목 일별 시세 · 수정주가 <span>05</span></div>
    </section>
    <section className={styles.slide}>
     <div className={styles.slideTop}>BALTA RESEARCH · 종목 심층 관찰 <span>{report.trade_date}</span></div>
     <h2>수급의 지속성과 반대 근거를 분리한다</h2>
     <div className={styles.stockCards}>{n.stockNotes.map(note=>{
      const stock=ev.stocks.find(s=>s.code===note.code);return <article key={note.code}>
       <strong>{stock?.name??note.code}</strong><small>{note.code}</small>
       <p>{note.thesis}</p><p className={styles.riskText}>{note.risk}</p>
      </article>;
     })}</div>
     <div className={styles.slideFoot}>확정 계약·목표주가·매매 권유 없음 <span>06</span></div>
    </section>
    <section className={styles.slide}>
     <div className={styles.slideTop}>BALTA RESEARCH · 리스크와 대응 <span>{report.trade_date}</span></div>
     <h2>다음 거래일에는 어떤 데이터가 바뀌어야 하는가</h2>
     <div className={styles.infoBlock}>{n.risks}</div>
     <ol className={styles.checks}>{n.nextChecks.map((s,i)=><li key={i}>{s}</li>)}</ol>
     <div className={styles.slideFoot}>기존 관찰 판단을 무효화할 조건을 함께 검증 <span>07</span></div>
    </section>
    <section className={styles.slide}>
     <div className={styles.slideTop}>BALTA RESEARCH · 자료와 계산 근거 <span>{report.trade_date}</span></div>
     <h2>결론보다 재현 가능한 근거를 우선한다</h2>
     <div className={styles.references}>{Object.entries(ev.source).filter(([key])=>key!=='notes').map(([key,value])=>
      <div key={key}><strong>{key.toUpperCase()}</strong><span>{value as string}</span></div>)}</div>
     <ul className={styles.cautions}>{ev.source.notes.map((s,i)=><li key={i}>{s}</li>)}</ul>
     <div className={styles.slideFoot}>발타 리서치 노트 · 자동 초안/승인 후 게시 <span>08</span></div>
    </section>
   </div>}
  <footer className={styles.disclaimer}>
   본 자료는 수집된 데이터에 근거한 자동 리서치이며 투자 권유가 아닙니다. 주가 예측과 매매 결정은 별도 검증이 필요하며, 수급 잠정치·원천 정정 및 가격 조정에 따라 해석이 달라질 수 있습니다.
  </footer>
 </main>;
}
