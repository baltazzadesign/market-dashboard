"use client";
import { useEffect, useMemo, useState } from 'react';
import { type MarketRow, record, formatNumber as fmt } from '@/lib/balta-model';
import { calculateMarketPulse, type MarketPulse, type PulseSectorSnapshot } from '@/lib/market-pulse';

export function useMarketPulse(rows: MarketRow[], date: string, refreshedAt: string) {
  const [snapshot, setSnapshot] = useState<PulseSectorSnapshot | null>(null);
  const [status, setStatus] = useState({ date: '', text: '섹터 조회 대기' });
  useEffect(() => {
    if (!date || !refreshedAt) return;
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/market/sectors?date=' + encodeURIComponent(date), {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        if (response.status === 401) { window.location.assign('/login'); return; }
        const body = record(await response.json());
        if (!response.ok || body.ok !== true || body.date !== date) throw new Error('섹터 조회 실패');
        const saved = record(body.snapshot), data = record(saved.market_data);
        if (active) {
          setSnapshot({ date, time: String(saved.time ?? ''), sectors: Array.isArray(data.sectors) ? data.sectors : [] });
          setStatus({ date, text: '' });
        }
      } catch {
        if (active) { setSnapshot(null); setStatus({ date, text: '섹터 조회 실패 · 나머지 지표로 계산' }); }
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [date, refreshedAt]);
  const pulse = useMemo(() => calculateMarketPulse(rows.filter(r => r.date === date), snapshot?.date === date ? snapshot : null), [rows, date, snapshot]);
  return { pulse, sectorStatus: status.date === date ? status.text : '섹터 조회 대기' };
}

export default function MarketPulsePanel({ pulse, sectorStatus, warning = '' }: { pulse: MarketPulse; sectorStatus: string; warning?: string }) {
  const color = pulse.regime === '판정 대기' ? 'var(--muted)' : ['강세','상승 지속','반전 시도'].includes(pulse.regime) ? 'var(--up)' : ['위험','투매'].includes(pulse.regime) ? 'var(--down)' : 'var(--text)';
  return <section className="panel briefing-panel" aria-label="Market Pulse 2.0">
    <div className="market-summary">
      <div className="summary-eyebrow"><span>Market Pulse 2.0</span><span>{pulse.time ? '정규장 ' + pulse.time + ' 기준' : '정규장 기록 대기'}</span></div>
      <h2 className="summary-tone" style={{ color }}>{pulse.regime}</h2>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '12px 0' }}><strong className="num" style={{ fontSize: 42 }}>{fmt(pulse.score)}</strong><span className="muted">/ 100{pulse.regime === '판정 대기' && pulse.score !== null ? ' · 참고 점수' : ''}</span></div>
      {pulse.score !== null && <div role="meter" aria-label="Market Pulse 종합 점수" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pulse.score} style={{ height: 6, background: '#30343a', borderRadius: 4 }}><div style={{ width: pulse.score + '%', height: '100%', background: color, borderRadius: 4 }}/></div>}
      <p className="summary-copy" style={{ marginTop: 14 }}>{pulse.reasons.join(' ')}</p>
      <p className="panel-subtitle">데이터 충족도 {pulse.coverage}% · 사용 가능한 항목의 가중치 합계</p>
      {warning && <p className="panel-subtitle" role="status">{warning} · 마지막 수집 기록 기준</p>}
      {sectorStatus && <p className="panel-subtitle">{sectorStatus}</p>}
      <details style={{ marginTop: 14 }}><summary style={{ cursor: 'pointer' }}>5가지 판정 근거</summary>
        <ul style={{ paddingLeft: 18, marginTop: 12, display: 'grid', gap: 12 }}>{pulse.factors.map(f => <li key={f.name}><strong>{f.name}</strong><span className="muted"> · 비중 {f.weight}% · {f.value === null ? '제외' : fmt(50 + f.value * 50) + '점'}</span><div className="panel-subtitle" style={{ marginTop: 3 }}>{f.detail}</div></li>)}</ul>
        <p className="panel-subtitle">국면은 규칙 기반 요약입니다. 지수 방향은 10~15분 전 대비이며, 충족도는 예측 확률이 아닙니다. 장후에는 마지막 정규장 판정을 표시합니다.</p>
      </details>
    </div>
  </section>;
}
