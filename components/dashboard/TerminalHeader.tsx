"use client";
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Brand, Icon } from './Icon';
import { Modal } from './Modal';

const links = [['/', '대시보드'], ['/daily', '일별 분석'], ['/flow', '시장 수급'], ['/breadth', '시장폭'], ['/pulse', 'Market Pulse'], ['/research', '시장리서치'], ['/history', '캘린더'], ['/notes', '내 메모']];
export default function TerminalHeader() {
  const path = usePathname(), router = useRouter();
  const [menu, setMenu] = useState(false), [query, setQuery] = useState(''), [soft, setSoft] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { try { const value = localStorage.getItem('balta.soft-dark') === '1'; setSoft(value); document.documentElement.dataset.terminalContrast = value ? 'soft' : 'black'; } catch {} }, []);
  useEffect(() => { setMenu(false); }, [path]);
  if (path === '/login' || path.startsWith('/balta-jungyong')) return null;
  function search(event: FormEvent) { event.preventDefault(); router.push('/research?tab=scanner' + (query.trim() ? '&q=' + encodeURIComponent(query.trim()) : '')); setMenu(false); }
  function theme() { const next = !soft; setSoft(next); document.documentElement.dataset.terminalContrast = next ? 'soft' : 'black'; try { localStorage.setItem('balta.soft-dark', next ? '1' : '0'); } catch {} }
  async function logout() { try { const response = await fetch('/api/auth/logout', { method: 'POST' }); if (!response.ok) throw new Error(); window.location.assign('/login'); } catch { setMessage('로그아웃하지 못했습니다. 다시 시도해 주세요.'); } }
  return <><header className="terminal-header"><div className="terminal-header-inner">
    <Link href="/" className="terminal-brand-link" aria-label="발타툴 대시보드"><Brand /></Link>
    <nav className="terminal-navigation" aria-label="주요 메뉴">{links.map(([url, label]) => <Link href={url} key={url} className={path === url ? 'active' : ''} aria-current={path === url ? 'page' : undefined}>{label}</Link>)}</nav>
    <form className="terminal-search" role="search" onSubmit={search}><input aria-label="종목명 또는 코드 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="종목명 또는 코드 검색..." maxLength={60}/><button aria-label="검색"><Icon name="search" size={17}/></button></form>
    <div className="terminal-header-actions"><button className="terminal-icon-button terminal-mobile-search" aria-label="종목 검색" onClick={() => router.push('/research?tab=scanner')}><Icon name="search"/></button><button className="terminal-icon-button terminal-theme-button" onClick={theme} aria-label="화면 밝기 변경" aria-pressed={soft}><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M20.8 14.4A9.1 9.1 0 0 1 9.6 3.2a9.2 9.2 0 1 0 11.2 11.2Z"/></svg></button><button className="terminal-icon-button terminal-menu-button" onClick={() => setMenu(true)} aria-label="전체 메뉴 및 계정" aria-expanded={menu}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button></div>
  </div></header>
  <Modal open={menu} onClose={() => setMenu(false)} title="발타툴 메뉴"><div className="terminal-menu-content"><form className="terminal-search" onSubmit={search}><input aria-label="메뉴 종목 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="종목명 또는 코드"/><button aria-label="검색"><Icon name="search"/></button></form><div className="terminal-menu-links">{[...links, ['/replay', '시장 복기'], ['/baltagyeong.html', '발타경'], ['/balta-jungyong', '발타 중용'], ['/disclaimer', '책임면책 고지']].map(([href, label]) => <a key={href} href={href}>{label}<Icon name="right" size={14}/></a>)}</div><button className="button" onClick={logout}><Icon name="logout"/>로그아웃</button>{message && <p role="alert">{message}</p>}</div></Modal></>;
}
