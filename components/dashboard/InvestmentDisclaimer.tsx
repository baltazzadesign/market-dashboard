"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import "./WorkspaceFooter.css";

const KEY = "baltatool.disclaimer.hiddenDate";
function kstDate(){
  try{return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
  catch{return "";}
}

export default function InvestmentDisclaimer() {
  const [hidden,setHidden]=useState(false);
  const [hideToday,setHideToday]=useState(false);
  useEffect(()=>{try{setHidden(localStorage.getItem(KEY)===kstDate());}catch{}},[]);
  if(hidden)return <div className="disclaimer-collapsed"><Icon name="shield" size={13}/><span>투자 정보 이용 안내</span><Link href="/disclaimer">책임면책고지 보기</Link></div>;
  function confirm(){
    if(hideToday){try{localStorage.setItem(KEY,kstDate());}catch{}}
    setHidden(true);
  }
  return (
    <section className="investment-disclaimer mockup-disclaimer" aria-labelledby="investment-disclaimer-title">
      <div className="investment-disclaimer-icon"><Icon name="warning" size={25}/></div>
      <div className="investment-disclaimer-copy">
        <div className="investment-disclaimer-heading">
          <span>DISCLAIMER</span>
          <h2 id="investment-disclaimer-title">책임면책 고지</h2>
        </div>
        <p><strong>발타툴에서 제공하는 모든 정보는 투자 참고용 자료이며 투자 권유, 자문, 매수·매도 추천이 아닙니다.</strong> 시장 데이터와 지표·점수·신호·분석은 정보 제공을 위한 것이며 정확성·실시간성·완전성이나 수익을 보장하지 않습니다. 투자에 따른 모든 판단과 결과에 대한 책임은 이용자 본인에게 있습니다.</p>
        <div className="investment-disclaimer-tags" aria-label="핵심 면책 안내">
          <span>투자권유 아님</span><span>수익 보장 아님</span><span>데이터 지연 가능</span><span>최종 판단은 이용자</span>
        </div>
      </div>
      <div className="disclaimer-actions">
        <label><input type="checkbox" checked={hideToday} onChange={e=>setHideToday(e.target.checked)}/><span>오늘 하루 보지 않기</span></label>
        <button type="button" onClick={confirm}>확인했습니다</button>
        <Link href="/disclaimer">전체 고지</Link>
      </div>
    </section>
  );
}
