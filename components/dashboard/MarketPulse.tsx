"use client";
import { useEffect, useId, useMemo, useState } from 'react';
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
  const id = useId().replace(/:/g, '');
  const score = pulse.score === null ? null : Math.max(0, Math.min(100, pulse.score));
  const color = pulse.regime === '판정 대기' ? 'var(--muted)' : ['강세','상승 지속','반전 시도'].includes(pulse.regime) ? 'var(--up)' : ['위험','투매'].includes(pulse.regime) ? 'var(--down)' : 'var(--warning)';
  const angle = Math.PI * (1 - (score ?? 50) / 100);
  const labels = ['시장폭', '외인·기관', '지수 방향', '섹터 강도', '가속·변곡'];
  return <section className="panel briefing-panel" aria-label="Market Pulse 2.0" style={{ overflow: 'hidden' }}>
    <div style={{ padding: '18px 18px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 13, fontWeight: 650, letterSpacing: '-.02em' }}>Market Pulse <span style={{ color: 'var(--subtle)', fontSize: 10, marginLeft: 3 }}>2.0</span></h2>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color, fontSize: 11, fontWeight: 650, padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--raised)' }}><i aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: color }}/>{pulse.regime}</span>
      </div>
      <p style={{ color: 'var(--subtle)', fontSize: 10, marginTop: 5 }}>{pulse.time ? '정규장 '+pulse.time+' 기준' : '정규장 기록 대기'}</p>
      <div style={{ position: 'relative', maxWidth: 260, margin: '10px auto 0' }} role={score === null ? undefined : 'meter'} aria-label="Market Pulse 종합 점수" aria-valuemin={score === null ? undefined : 0} aria-valuemax={score === null ? undefined : 100} aria-valuenow={score ?? undefined}>
        <svg viewBox="0 0 240 145" fill="none" style={{ display: 'block', width: '100%' }} aria-hidden="true">
          <defs><linearGradient id={id+'-arc'} x1="22" y1="0" x2="218" y2="0" gradientUnits="userSpaceOnUse"><stop stopColor="#5294ff"/><stop offset=".48" stopColor="#667180"/><stop offset=".55" stopColor="#8b737a"/><stop offset="1" stopColor="#ff545f"/></linearGradient></defs>
          <path d="M22 118 A98 98 0 0 1 218 118" stroke="var(--border)" strokeWidth="8" strokeLinecap="round"/>
          <path d="M22 118 A98 98 0 0 1 218 118" stroke={'url(#'+id+'-arc)'} strokeWidth="8" strokeLinecap="round" opacity={score === null ? .2 : .85}/>
          <path d="M34 118 A86 86 0 0 1 206 118" stroke="var(--subtle)" strokeOpacity=".35" strokeWidth="3" strokeDasharray="1 12"/>
          {score !== null && <><circle cx={120+98*Math.cos(angle)} cy={118-98*Math.sin(angle)} r="11" fill="var(--foreground)" opacity=".1"/><circle cx={120+98*Math.cos(angle)} cy={118-98*Math.sin(angle)} r="5" fill="var(--foreground)" stroke="var(--surface)" strokeWidth="2"/></>}
          <text x="120" y="92" fill="var(--foreground)" textAnchor="middle" style={{ fontSize: 43, fontWeight: 700, letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums' }}>{fmt(score)}</text>
          <text x="120" y="113" fill="var(--subtle)" textAnchor="middle" fontSize="10">{pulse.regime === '판정 대기' ? '참고 점수 / 100' : '종합 점수 / 100'}</text>
          <text x="19" y="140" fill="var(--down)" fontSize="10">0 약세</text><text x="221" y="140" fill="var(--up)" textAnchor="end" fontSize="10">강세 100</text>
        </svg>
      </div>
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }} aria-label="지표별 점수">
        {pulse.factors.map((f,index) => <div key={f.name} title={f.detail} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0,1fr) 23px', alignItems: 'center', gap: 9, fontSize: 11 }}>
          <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{labels[index] ?? f.name}</span>
          <div aria-hidden="true" style={{ position: 'relative', height: 5, background: 'var(--border)', borderRadius: 2 }}><span style={{ position: 'absolute', left: '50%', top: -2, height: 9, width: 1, background: 'var(--subtle)', opacity: .5 }}/>{f.value !== null && <span style={{ position: 'absolute', left: (f.value < 0 ? 50 + f.value*50 : 50)+'%', width: Math.abs(f.value)*50+'%', top: 0, height: 5, borderRadius: 2, background: f.value >= 0 ? 'var(--up)' : 'var(--down)' }}/>}</div>
          <span className="num" style={{ textAlign: 'right', color: f.value === null ? 'var(--subtle)' : 'var(--foreground)', fontSize: 10 }}>{f.value === null ? '—' : fmt(50+f.value*50)}</span>
        </div>)}
      </div>
      <p style={{ fontSize: 11, lineHeight: 1.65, color: 'var(--muted)', marginTop: 14 }}>{pulse.reasons.join(' ')}</p>
      {warning && <p role="status" style={{ fontSize: 10, color: 'var(--warning)', marginTop: 8 }}>{warning} · 마지막 수집 기록 기준</p>}
      {sectorStatus && <p style={{ fontSize: 10, color: 'var(--subtle)', marginTop: 6 }}>{sectorStatus}</p>}
    </div>
    <details style={{ borderTop: '1px solid var(--border)' }}>
      <summary style={{ cursor: 'pointer', padding: '11px 18px', fontSize: 10, color: 'var(--muted)' }}>판정 상세 <span style={{ float: 'right', fontVariantNumeric: 'tabular-nums' }}>데이터 {pulse.coverage}%</span></summary>
      <div style={{ padding: '0 18px 16px' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>{pulse.factors.map(f => <li key={f.name}><strong style={{ fontSize: 11 }}>{f.name}</strong><span style={{ fontSize: 10, color: 'var(--subtle)' }}> · 비중 {f.weight}%{f.value === null ? ' · 제외' : ''}</span><p style={{ color: 'var(--muted)', fontSize: 10, marginTop: 3 }}>{f.detail}</p></li>)}</ul>
        <p style={{ color: 'var(--subtle)', fontSize: 10, marginTop: 14, lineHeight: 1.65 }}>데이터 충족도는 사용 가능한 항목의 가중치 합계이며 예측 확률이 아닙니다. 지수 방향은 10~15분 전 대비입니다. 장후에는 마지막 정규장 판정을 표시합니다.</p>
      </div>
    </details>
  </section>;
}
