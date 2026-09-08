"use client";
import { useState, type FormEvent } from "react";
import { Brand, Icon } from "@/components/dashboard/Icon";
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
  return <main className="login-shell">
    <section className="login-intro"><Brand/><div className="login-message"><div className="login-kicker">MARKET WORKSPACE</div><h1>시장의 흐름을,<br/>한눈에.</h1><p>시장 폭부터 투자자 수급까지.<br/>매일 쌓이는 기록으로 흐름을 확인하세요.</p><div className="login-stat-grid"><div><strong>KOSPI</strong><span>코스피 지수</span></div><div><strong>KOSDAQ</strong><span>코스닥 지수</span></div><div><strong>1분</strong><span>기록 갱신 간격</span></div></div></div><p className="muted" style={{ fontSize: 12 }}>baltatool · Market intelligence workspace</p></section>
    <section className="login-form-side"><form className="login-card" onSubmit={login}><span className="login-icon"><Icon name="lock" size={24}/></span><h2>워크스페이스 입장</h2><p>접근 코드를 입력해 시장 대시보드를 열어주세요.</p><label htmlFor="access-code">접근 코드</label><div className="password-field"><input id="access-code" type={visible ? "text" : "password"} value={code} onChange={e => setCode(e.target.value)} placeholder="접근 코드 입력" autoComplete="current-password" autoCapitalize="none" spellCheck={false} required aria-invalid={Boolean(error)} aria-describedby={error ? "login-error" : undefined} disabled={busy}/><button className="button ghost icon" type="button" aria-label={visible ? "접근 코드 숨기기" : "접근 코드 표시"} aria-pressed={visible} onClick={() => setVisible(v => !v)}><Icon name={visible ? "eyeOff" : "eye"}/></button></div>{error && <p className="login-error" id="login-error" role="alert">{error}</p>}<button className="button primary login-submit" type="submit" disabled={busy || !code}>{busy ? <><Icon name="refresh" className="spin"/>확인 중</> : <>대시보드 열기<Icon name="arrow"/></>}</button><div className="login-foot"><Icon name="shield" size={15}/>이 브라우저에서 24시간 동안 로그인 유지</div></form></section>
  </main>;
}
