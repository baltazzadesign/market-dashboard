import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "투자 정보 이용 안내 · 책임면책고지 | 발타툴",
  description: "발타툴의 시장 데이터, 지표, 신호 및 콘텐츠 이용에 관한 투자 책임과 면책 안내",
};

const highlights = [
  ["01", "투자권유 아님", "발타툴의 정보는 매수·매도 권유나 개인별 투자자문을 목적으로 하지 않습니다."],
  ["02", "수익 보장 아님", "점수·신호·백테스트·추정치는 미래 수익이나 가격 방향을 보장하지 않습니다."],
  ["03", "최종 판단은 이용자", "투자 판단, 주문 실행 및 그 결과에 대한 책임은 이용자 본인에게 있습니다."],
] as const;

const sections = [
  ["정보 제공 목적", "발타툴에서 제공하는 시장 데이터, 차트, 시장폭, 투자자 수급, Market Pulse, 신호, 리서치 및 발타경·발타 중용 등의 콘텐츠는 정보 제공과 분석 보조를 목적으로 합니다. 특정 금융상품의 매수·매도 권유나 개인별 투자자문을 목적으로 하지 않습니다."],
  ["투자 판단과 책임", "모든 투자 판단과 주문 실행은 이용자 본인의 독립적인 판단으로 이루어져야 하며, 투자 결과와 손익에 대한 책임은 이용자 본인에게 있습니다. 발타툴의 지표, 신호 또는 콘텐츠는 수익, 손실 회피, 미래 가격이나 방향을 보장하지 않습니다."],
  ["데이터의 정확성·지연", "발타툴은 외부 데이터 제공처와 자체 저장 기록을 이용합니다. 통신 지연, 제공처 장애, 시장 운영 변경, 데이터 누락·정정 또는 계산 시점 차이로 실제 시장 정보와 차이가 발생할 수 있습니다. 중요한 판단 전에는 거래소와 증권사 등 공식 정보를 함께 확인하시기 바랍니다."],
  ["지표·점수·신호", "Market Pulse, 시장폭, 투자자 수급, 자동 신호, 변곡점 및 기타 계산 지표는 수집된 데이터를 일정한 규칙으로 가공한 분석 결과입니다. 각 지표는 시장의 일부 특성만 표현하므로 단독으로 투자 결정을 대신할 수 없습니다."],
  ["과거 성과와 추정치", "과거 데이터, 백테스트, 신호 성과, 추정 포지션, 평균매입단가 및 각종 점수는 특정 가정과 수집 가능한 데이터에 따른 분석 결과입니다. 과거 결과가 미래 성과를 보장하지 않으며 실제 체결 가격, 수수료, 세금, 유동성 및 슬리피지를 모두 반영하지 못할 수 있습니다."],
  ["발타경·발타 중용 콘텐츠", "발타경과 발타 중용 등 투자 철학 콘텐츠는 학습·기록·읽기 목적의 편집 또는 창작 콘텐츠입니다. 이를 개별 이용자에게 적합한 재무·법률·세무 자문이나 투자 권유로 해석해서는 안 됩니다."],
  ["서비스와 외부 시스템", "서비스는 운영·점검, 외부 시스템 장애, 시장 제도 변경 또는 데이터 제공 정책 변경으로 일시 중단되거나 표시 방식이 변경될 수 있습니다. 이용자는 화면에 표시된 데이터 시각, 출처, 세션 및 상태 표시를 함께 확인해야 합니다."],
  ["고지의 성격", "본 페이지는 발타툴이 제공하는 정보의 성격과 이용상 유의사항을 명확히 하기 위한 기본 안내입니다. 개별 상황에 필요한 법률·세무·재무 판단은 관련 전문가 또는 공식 기관의 안내를 확인하시기 바랍니다."],
] as const;

export default function DisclaimerPage() {
  return (
    <main className="legal-page">
      <header className="legal-hero">
        <Link className="legal-back" href="/">← 발타툴로 돌아가기</Link>
        <p>RESPONSIBILITY NOTICE</p>
        <h1>투자 정보 이용 안내</h1>
        <span>좋은 데이터는 판단을 돕지만, 판단을 대신하지 않습니다.</span>
        <div className="legal-updated">최종 수정 · 2026년 9월 16일</div>
      </header>

      <section className="legal-highlights" aria-label="핵심 안내">
        {highlights.map(([no, title, body]) => (
          <article className="legal-highlight" key={title}>
            <span>{no}</span><h2>{title}</h2><p>{body}</p>
          </article>
        ))}
      </section>

      <div className="legal-section-heading">
        <span>DETAILS</span><h2>상세 고지</h2><p>서비스 이용 전 아래 내용을 확인해 주세요.</p>
      </div>
      <div className="legal-grid">
        {sections.map(([title, body], index) => (
          <section className="legal-card" key={title}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><h2>{title}</h2><p>{body}</p></div>
          </section>
        ))}
      </div>
      <footer className="legal-footer">
        <div><strong>발타툴 · BALTATOOL</strong><p>Market Intelligence Terminal</p></div>
        <Link href="/">시장 대시보드로 돌아가기 →</Link>
      </footer>
    </main>
  );
}
