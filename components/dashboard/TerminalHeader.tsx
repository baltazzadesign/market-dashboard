"use client";
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Brand, Icon } from './Icon';
import { Modal } from './Modal';
import OnlinePresence from './OnlinePresence';
import styles from './TerminalHeader.module.css';

type NavigationLink = { href: string; label: string };
const groups = [
  { id: 'market', label: '시장 분석', links: [
    { href: '/briefing', label: '시장 브리핑' }, { href: '/daily', label: '일별 분석' },
    { href: '/breadth', label: '시장폭' }, { href: '/pulse', label: 'Market Pulse' },
  ] },
  { id: 'flow', label: '수급 분석', links: [
    { href: '/flow', label: '시장 수급' }, { href: '/stock-flow', label: '종목 수급 분석' },
    { href: '/investor-ranking', label: '투자자 매매 순위' },
  ] },
  { id: 'stock', label: '종목 분석', links: [
    { href: '/ai-research', label: 'AI 종목 연구소' }, { href: '/cash-flow', label: '기업 현금흐름' },
  ] },
  { id: 'research', label: '리서치', links: [
    { href: '/research', label: '시장리서치' }, { href: '/balta-research', label: '발타리서치' },
  ] },
];
const utilityLinks: NavigationLink[] = [
  { href: '/notes', label: '내 메모' }, { href: '/replay', label: '시장 복기' },
  { href: '/baltagyeong.html', label: '발타경' }, { href: '/balta-jungyong', label: '발타 중용' },
  { href: '/disclaimer', label: '책임면책 고지' },
];
function isCurrent(path: string, href: string) {
  return path === href || (href !== '/' && path.startsWith(href + '/'));
}

export default function TerminalHeader() {
  const path = usePathname(), router = useRouter();
  const header = useRef<HTMLElement>(null), navigation = useRef<HTMLElement>(null), subnavigation = useRef<HTMLElement>(null);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});
  const [menu, setMenu] = useState(false), [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState(''), [soft, setSoft] = useState(false), [message, setMessage] = useState('');
  const activeGroup = groups.find(group => group.links.some(link => isCurrent(path, link.href)));

  useEffect(() => { try { const value = localStorage.getItem('balta.soft-dark') === '1'; setSoft(value); document.documentElement.dataset.terminalContrast = value ? 'soft' : 'black'; } catch {} }, []);
  useEffect(() => {
    setMenu(false); setExpanded(null);
    for (const nav of [navigation.current, subnavigation.current]) {
      const active = nav?.querySelector('[aria-current]');
      if (nav && active && nav.scrollWidth > nav.clientWidth) {
        nav.scrollLeft += active.getBoundingClientRect().left - nav.getBoundingClientRect().left - (nav.clientWidth - active.getBoundingClientRect().width) / 2;
      }
    }
  }, [path]);
  useEffect(() => {
    if (!expanded) return;
    function dismissOutside(event: Event) {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setExpanded(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setExpanded(null); triggers.current[expanded!]?.focus(); }
    }
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('focusin', dismissOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('focusin', dismissOutside);
      document.removeEventListener('keydown', escape);
    };
  }, [expanded]);

  if (path === '/login' || path.startsWith('/balta-jungyong')) return null;
  function closeNavigation() { setMenu(false); setExpanded(null); }
  function search(event: FormEvent) { event.preventDefault(); router.push('/stock-flow' + (query.trim() ? '?q=' + encodeURIComponent(query.trim()) : '')); closeNavigation(); }
  function theme() { const next = !soft; setSoft(next); document.documentElement.dataset.terminalContrast = next ? 'soft' : 'black'; try { localStorage.setItem('balta.soft-dark', next ? '1' : '0'); } catch {} }
  async function logout() { try { const response = await fetch('/api/auth/logout', { method: 'POST' }); if (!response.ok) throw new Error(); window.location.assign('/login'); } catch { setMessage('로그아웃하지 못했습니다. 다시 시도해 주세요.'); } }
  function pageLink(link: NavigationLink) {
    return <Link key={link.href} href={link.href} aria-current={isCurrent(path, link.href) ? 'page' : undefined} onClick={closeNavigation}>{link.label}</Link>;
  }

  return <>
    <header ref={header} className={'terminal-header ' + styles.header}>
      <div className={'terminal-header-inner ' + styles.frame}>
        <Link href="/" className="terminal-brand-link" aria-label="발타툴 대시보드" onClick={closeNavigation}><Brand /></Link>
        <nav ref={navigation} className={styles.navigation} aria-label="주요 메뉴">
          {pageLink({ href: '/', label: '대시보드' })}
          {groups.map(group => <button key={group.id} ref={node => { triggers.current[group.id] = node; }}
            id={'nav-trigger-' + group.id} type="button" aria-expanded={expanded === group.id} aria-controls={'nav-panel-' + group.id}
            aria-current={activeGroup?.id === group.id ? 'true' : undefined}
            onClick={() => setExpanded(current => current === group.id ? null : group.id)}>
            {group.label}<svg className={styles.chevron} viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>
          </button>)}
          {pageLink({ href: '/history', label: '캘린더' })}
        </nav>
        <form className="terminal-search" role="search" onSubmit={search}><input aria-label="종목명 또는 코드 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="종목명 또는 코드 검색..." maxLength={60}/><button aria-label="검색"><Icon name="search" size={17}/></button></form>
        <div className="terminal-header-actions">
          <Link href="/notes" className={styles.notes} aria-label="내 메모" aria-current={isCurrent(path, '/notes') ? 'page' : undefined} onClick={closeNavigation}><Icon name="book" size={18}/><span>내 메모</span></Link>
          <OnlinePresence/>
          <button className="terminal-icon-button terminal-mobile-search" aria-label="종목 검색" onClick={() => { closeNavigation(); router.push('/stock-flow'); }}><Icon name="search"/></button>
          <button className="terminal-icon-button terminal-theme-button" onClick={theme} aria-label="화면 밝기 변경" aria-pressed={soft}><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M20.8 14.4A9.1 9.1 0 0 1 9.6 3.2a9.2 9.2 0 1 0 11.2 11.2Z"/></svg></button>
          <button className="terminal-icon-button terminal-menu-button" onClick={() => { setExpanded(null); setMenu(true); }} aria-label="전체 메뉴 및 계정" aria-expanded={menu}><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
        </div>
      </div>
      {activeGroup && <div className={styles.subbar}><div className={styles.subbarInner}><span className={styles.sectionLabel}>{activeGroup.label}</span><nav ref={subnavigation} className={styles.subnavigation} aria-label={activeGroup.label + ' 세부 메뉴'}>{activeGroup.links.map(pageLink)}</nav></div></div>}
      {groups.map(group => <div key={group.id} id={'nav-panel-' + group.id} className={styles.dropdown} hidden={expanded !== group.id}>
        <nav className={styles.dropdownInner} aria-labelledby={'nav-trigger-' + group.id}>
          <span className={styles.sectionLabel}>{group.label}</span>
          <div className={styles.dropdownLinks}>{group.links.map(pageLink)}</div>
          <button className={'terminal-icon-button ' + styles.closeDropdown} aria-label="하위 메뉴 닫기" onClick={() => { setExpanded(null); triggers.current[group.id]?.focus(); }}><Icon name="close" size={17}/></button>
        </nav>
      </div>)}
    </header>
    <Modal open={menu} onClose={() => setMenu(false)} title="발타툴 메뉴" className={styles.menuDialog}>
      <div className={"terminal-menu-content " + styles.menuContent}>
        <form className="terminal-search" onSubmit={search}><input aria-label="메뉴 종목 검색" value={query} onChange={e => setQuery(e.target.value)} placeholder="종목명 또는 코드" maxLength={60}/><button aria-label="검색"><Icon name="search"/></button></form>
        <nav aria-label="전체 메뉴" className={styles.menuGroups}>
          <div className={styles.quickLinks}>{pageLink({ href: '/', label: '대시보드' })}{pageLink({ href: '/history', label: '캘린더' })}</div>
          {groups.map(group => <section key={group.id} className={styles.menuGroup}><h3>{group.label}</h3><div>{group.links.map(pageLink)}</div></section>)}
          <section className={styles.menuGroup}><h3>개인 도구 · 더보기</h3><div>{utilityLinks.map(link => link.href.endsWith('.html') ? <a key={link.href} href={link.href}>{link.label}</a> : pageLink(link))}</div></section>
        </nav>
        <button className={"button " + styles.logout} onClick={logout}><Icon name="logout"/>로그아웃</button>{message && <p role="alert">{message}</p>}
      </div>
    </Modal>
  </>;
}
