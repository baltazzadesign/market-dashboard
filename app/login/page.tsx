"use client";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/dashboard/Icon";
import styles from "./login.module.css";
export default function LoginPage() {
  const [code, setCode] = useState(""), [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function login(event: FormEvent) {
    event.preventDefault();
    if (!code || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "로그인하지 못했습니다.");
      window.location.assign("/");
    } catch (error) { setError(error instanceof Error ? error.message : "연결 상태를 확인해 주세요."); setBusy(false); }
  }
  return <main className={styles.shell}>
    <div className={styles.ambient} aria-hidden="true"/>
    <header className={styles.header}>
      <a href="/" className={styles.brand} aria-label="발타툴 홈"><img src="/assets/balta-logo-v2.webp" alt="발타툴 BALTATOOL" width="200" height="76"/></a>
      <span className={styles.headerNote}>시장을 읽는 또 하나의 감각<span>MARKET INTELLIGENCE</span></span>
    </header>
    <div className={styles.stage}>
      <section className={styles.visual} aria-label="발바닥 타짜 브랜드 아트워크">
        <img className={styles.art} src="/assets/balta-login-art.jpg" alt="금빛 달과 산수, 화투를 든 타짜를 담은 발바닥 타짜 아트워크" width="869" height="1810" fetchPriority="high"/>
        <div className={styles.artGlow} aria-hidden="true"/>
        <span className={styles.artCaption}>THE ART OF READING THE MARKET</span>
      </section>
      <section className={styles.entry} aria-labelledby="login-title">
        <div className={styles.introduction}>
          <p className={styles.eyebrow}><span/> B A L T A T O O L</p>
          <h1>시장을 읽는 눈,<br/><span>흐름을 잡는 감각.</span></h1>
          <p className={styles.description}>흩어진 시장의 신호를 한곳에.<br/> 오늘의 흐름을 발타툴에서 만나보세요.</p>
        </div>
        <form className={styles.card} onSubmit={login} aria-busy={busy}>
          <div className={styles.cardHeading}><span className={styles.lock}><Icon name="lock" size={22}/></span><div><p className={styles.cardKicker}>YOUR MARKET WORKSPACE</p><h2 id="login-title">발타툴 입장</h2></div><span className={styles.seal} aria-hidden="true">발타</span></div>
          <p className={styles.cardDescription}>접근 코드를 입력해 대시보드를 열어주세요.</p>
          <label className={styles.label} htmlFor="access-code">접근 코드</label>
          <div className={styles.passwordField}>
            <Icon name="lock" size={17}/>
            <input id="access-code" type={visible ? "text" : "password"} value={code} onChange={e => setCode(e.target.value)} placeholder="접근 코드를 입력하세요" autoComplete="current-password" autoCapitalize="none" spellCheck={false} required aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} disabled={busy}/>
            <button className={styles.visibility} type="button" aria-label={visible ? "접근 코드 숨기기" : "접근 코드 표시"} aria-pressed={visible} onClick={() => setVisible(v => !v)}><Icon name={visible ? "eyeOff" : "eye"}/></button>
          </div>
          {error && <p className={styles.error} id="login-error" role="alert">{error}</p>}
          <button className={styles.submit} type="submit" disabled={busy || !code}>{busy ? <><Icon name="refresh" className="spin"/>확인 중</> : <>대시보드 열기<Icon name="arrow"/></>}</button>
          <div className={styles.foot}><Icon name="shield" size={15}/><span>이 브라우저에서 24시간 동안 로그인 유지</span></div>
        </form>
        <div className={styles.features} aria-label="주요 기능"><span>시장 지수</span><i/><span>투자자 수급</span><i/><span>Market Pulse</span></div>
      </section>
    </div>
    <footer className={styles.footer}><span>GOOD DATA. BETTER DECISIONS.</span><span>© {new Date().getFullYear()} BALTATOOL</span></footer>
  </main>;
}
