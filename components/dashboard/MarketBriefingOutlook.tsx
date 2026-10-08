import { BRIEFING_RULES, type BriefingInsight } from '@/lib/market-briefing-insight';
import s from './MarketBriefing.module.css';

export default function MarketBriefingOutlook({ insight, blocked }: { insight: BriefingInsight; blocked?: string }) {
  const outlook = insight.outlook;
  const state = blocked ? 'wait' : outlook.state;
  return <section className={`${s.panel} ${s.outlookPanel}`} aria-labelledby="briefing-outlook-title" data-briefing-outlook>
    <div className={s.panelHeading}><h2 id="briefing-outlook-title">최근 변화와 다음 흐름</h2><span>조건부 전망</span></div>
    <div className={s.outlookBody}>
      <div className={s.windowLabel}>최근 구간 비교 <strong>{insight.window}</strong></div>
      <div className={s.recentMetrics}>{insight.recent.map(item => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></div>)}</div>
      <div className={s.outlookVerdict} data-state={state}>
        <div><span className={s.outlookLabel}>{blocked ? '판단 보류' : outlook.label}</span><small>{outlook.horizon}</small></div>
        <p>{blocked ?? outlook.text}</p>
      </div>
      {!blocked && outlook.scenarios.length > 0 && <div className={s.scenarios}>{outlook.scenarios.map((scenario, i) => <article key={scenario.title}><span>0{i + 1}</span><h3>{scenario.title}</h3><p>{scenario.text}</p></article>)}</div>}
      <p className={s.outlookNote}>우세 방향은 현재 조건이 유지될 때의 해석입니다. 검증된 예측 확률이나 다음 거래일 전망은 아닙니다.</p>
      <details className={s.outlookRules}><summary>판단 기준과 데이터 범위 보기</summary><ul>{[...BRIEFING_RULES.slice(0, -1), ...insight.limitations].map(text => <li key={text}>{text}</li>)}</ul></details>
    </div>
  </section>;
}
