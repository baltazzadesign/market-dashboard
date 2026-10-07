"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { buildChartPNG, downloadChartPNG, type ChartImageReport } from './chart-image';
import s from './ChartImageButton.module.css';

export type ChartImageJob = { content: ReactNode; plots: number; filename: string; report: (root: HTMLDivElement) => ChartImageReport };
export default function ChartImageButton({ createJob, disabled, label = '차트 이미지 저장', title }: {
  createJob: () => ChartImageJob; disabled?: boolean; label?: string; title: string;
}) {
  const [job, setJob] = useState<ChartImageJob | null>(null), [message, setMessage] = useState(''), [failed, setFailed] = useState(false);
  const stage = useRef<HTMLDivElement>(null), lock = useRef(false);
  useEffect(() => {
    if (!job) return;
    const abort = new AbortController();
    (async () => {
      try {
        const start = performance.now(); let ready = 0;
        while (ready < 3) {
          await new Promise(resolve => setTimeout(resolve, 80)); abort.signal.throwIfAborted();
          const plots = stage.current?.querySelectorAll<SVGSVGElement>('svg.recharts-surface, svg[data-stock-flow-chart], svg[data-stock-cash-chart]');
          ready = plots?.length === job.plots && Array.from(plots).every(svg => svg.getBoundingClientRect().width > 200) ? ready + 1 : 0;
          if (performance.now() - start > 10000) throw new Error('차트 준비가 지연되었습니다. 잠시 후 다시 저장해 주세요.');
        }
        if (!stage.current) return;
        // The job captures rows/options at click time; refreshes cannot mix snapshots.
        const report = job.report(stage.current);
        const blob = await buildChartPNG(report, abort.signal); abort.signal.throwIfAborted();
        downloadChartPNG(blob, job.filename); setMessage('PNG 저장을 시작했습니다. 다운로드 목록을 확인해 주세요.');
      } catch (error) {
        if (abort.signal.aborted) return;
        setFailed(true); setMessage(error instanceof Error ? error.message : '이미지 저장에 실패했습니다. 다시 시도해 주세요.');
      } finally { if (!abort.signal.aborted) { lock.current = false; setJob(null); } }
    })();
    return () => abort.abort();
  }, [job]);
  useEffect(() => { if (!message) return; const id = setTimeout(() => setMessage(''), 7000); return () => clearTimeout(id); }, [message]);
  return <div className={s.control}>
    <button type="button" className={s.button} title={title} disabled={disabled || !!job} aria-busy={!!job} onClick={() => {
      if (lock.current) return; lock.current = true; setFailed(false); setMessage('');
      try { setJob(createJob()); } catch { lock.current = false; setFailed(true); setMessage('저장할 차트를 준비하지 못했습니다. 다시 시도해 주세요.'); }
    }}><Icon name="download" size={15}/>{job ? '이미지 만드는 중…' : label}</button>
    {message && <span className={s.message} role={failed ? 'alert' : 'status'}>{message}</span>}
    {job && createPortal(<div ref={stage} className={s.stage} aria-hidden="true" inert data-image-stage>{job.content}</div>, document.body)}
  </div>;
}
