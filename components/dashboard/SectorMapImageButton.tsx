'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Icon } from './Icon';
import { downloadChartPNG } from './chart-image';
import styles from './ChartImageButton.module.css';

export default function SectorMapImageButton({ root, date, caption, view, disabled }: {
  root: RefObject<HTMLElement | null>; date: string; caption: string; view: string; disabled: boolean;
}) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failed, setFailed] = useState(false);
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save() {
    if (disabled || lock.current || !root.current) return;
    lock.current = true; setBusy(true); setMessage(''); setFailed(false);
    let stage: HTMLElement | undefined;
    try {
      // Freeze the visible quote/selection state before any asynchronous work.
      const source = root.current, clone = source.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[data-sector-export-ignore]').forEach(node => node.remove());
      clone.removeAttribute('id'); clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      clone.setAttribute('aria-hidden', 'true'); clone.inert = true;
      Object.assign(clone.style, { width: `${source.getBoundingClientRect().width}px`, maxWidth: 'none', margin: '0', boxSizing: 'border-box' });
      const note = document.createElement('p');
      note.textContent = `BALTATOOL / 발타툴 · ${caption} · baltatool.com`;
      Object.assign(note.style, { margin: '0', padding: '14px 20px', color: '#c5bc9f', background: '#0c100e', borderBottom: '1px solid #e5cf8c22', fontSize: '11px', lineHeight: '1.7', overflowWrap: 'anywhere' });
      clone.querySelector('header')?.after(note);
      stage = document.createElement('div'); stage.className = 'research-workspace';
      stage.dataset.sectorExportStage = 'true';
      Object.assign(stage.style, { position: 'fixed', left: '-100000px', top: '0', margin: '0', padding: '0', maxWidth: 'none', pointerEvents: 'none' });
      stage.append(clone); document.body.append(stage);
      const { toBlob } = await import('html-to-image');
      await document.fonts.ready;
      const width = Math.ceil(clone.getBoundingClientRect().width), height = Math.ceil(clone.scrollHeight);
      // Bound canvas memory for the full-index list and long mobile layouts.
      const pixelRatio = Math.min(2, Math.sqrt(16_000_000 / (width * height)), 16000 / width, 16000 / height);
      const blob = await toBlob(clone, { width, height, pixelRatio, backgroundColor: '#0c100e', preferredFontFormat: 'woff2' });
      if (!blob) throw new Error('이미지를 만들지 못했습니다. 다시 시도해 주세요.');
      if (mounted.current) { downloadChartPNG(blob, `baltatool-sector-${date}-${view}.png`); setMessage('현재 지도와 그래프를 PNG로 저장했습니다.'); }
    } catch { if (mounted.current) { setFailed(true); setMessage('PNG 저장에 실패했습니다. 다시 시도해 주세요.'); } }
    finally { stage?.remove(); lock.current = false; if (mounted.current) setBusy(false); }
  }
  return <div className={styles.control}><button type="button" className={styles.button} disabled={disabled || busy} aria-busy={busy} onClick={save} title="현재 필터와 지도·목록, 분포 그래프를 그대로 저장합니다."><Icon name="download" size={15}/>{busy ? '이미지 만드는 중…' : 'PNG 저장'}</button>{message && <span className={styles.message} role={failed ? 'alert' : 'status'}>{message}</span>}</div>;
}
