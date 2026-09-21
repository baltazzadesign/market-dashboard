"use client";
import { useEffect, useState } from 'react';
import { isValidDate, kstParts } from '@/lib/balta-model';
import { NoteSearch } from './ResearchWorkspace';
type Note = { body: string; tags: string; version: number };
export default function TerminalNotes() {
  const [date, setDate] = useState(''), [note, setNote] = useState<Note>({ body: '', tags: '', version: 0 }), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [reload, setReload] = useState(0), [dirty, setDirty] = useState(false);
  useEffect(() => { setDate(kstParts().date); }, []);
  useEffect(() => {
    if (!date) return;
    const controller = new AbortController(); setLoading(true); setError(''); setMessage('');
    fetch('/api/market/notes?date=' + date, { signal: controller.signal, cache: 'no-store' }).then(async r => { if (r.status === 401) { window.location.assign('/login'); return; } const body = await r.json(); if (!r.ok) throw new Error(body.error || '메모를 조회하지 못했습니다.'); if (!controller.signal.aborted) { setNote(body.note ?? { body: '', tags: '', version: 0 }); setDirty(false); } }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [date, reload]);
  useEffect(() => { if (!dirty) return; const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') as HTMLAnchorElement | null : null;
      if (!link || link.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (!window.confirm('저장하지 않은 메모가 있습니다. 변경사항을 버리고 이동할까요?')) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener('click', guard, true);
    return () => document.removeEventListener('click', guard, true);
  }, [dirty]);
  async function save() {
    setSaving(true); setMessage('');
    try { const response = await fetch('/api/market/notes?date=' + date, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(note) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || '저장하지 못했습니다.'); setNote(body.note); setDirty(false); setMessage('메모를 저장했습니다.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.'); }
    finally { setSaving(false); }
  }
  return <main className="terminal-detail-page"><div className="terminal-detail-title"><div><h1>내 메모</h1><p>날짜별 시장 기록 · 웹과 앱에서 함께 사용하는 메모</p></div><input type="date" aria-label="메모 날짜" value={date} max={kstParts().date} disabled={dirty || saving} onChange={e => { if (isValidDate(e.target.value)) setDate(e.target.value); }}/></div>
    <section className="terminal-panel terminal-note-editor"><div className="terminal-panel-heading"><h2>{date} 시장 기록</h2><span className="terminal-source">{dirty ? '저장하지 않은 변경사항' : '날짜별 공유 메모'}</span></div>{error && <div className="terminal-notice" role="alert">{error}<button className="button small" onClick={() => setReload(v => v + 1)}>다시 조회</button></div>}<textarea aria-label="메모 내용" maxLength={10000} value={note.body} disabled={loading || saving || !!error} placeholder={loading ? '메모를 불러오는 중…' : '오늘 시장의 흐름과 판단을 기록하세요.'} onChange={e => { setNote(v => ({ ...v, body: e.target.value })); setDirty(true); }}/><input aria-label="메모 태그" value={note.tags} maxLength={200} disabled={loading || saving || !!error} onChange={e => { setNote(v => ({ ...v, tags: e.target.value })); setDirty(true); }} placeholder="태그를 쉼표로 구분하세요. 예: 외인 전환, 반도체"/><div className="toolbar"><button className="button primary" disabled={loading || saving || !!error} onClick={() => void save()}>{saving ? '저장 중…' : '메모 저장'}</button><span role="status">{message}</span></div></section><div className="terminal-note-search"><NoteSearch key={message}/></div></main>;
}
