"use client";
import { useOnlinePresence } from "./useOnlinePresence";
import styles from "./OnlinePresence.module.css";

export default function OnlinePresence() {
  const { count, loading } = useOnlinePresence();
  const status = count !== null ? "online" : loading ? "loading" : "unavailable";
  return <details className={styles.presence} data-online-presence data-state={status}>
    <summary aria-label={"현재 접속 " + (count === null ? "집계 대기" : count.toLocaleString("ko-KR")) + " · 집계 기준 보기"}>
      <i aria-hidden="true"/><span>접속</span><strong role="status" aria-live="polite">{count === null ? "—" : count.toLocaleString("ko-KR")}</strong>
    </summary>
    <div className={styles.explanation}>
      <strong>현재 접속 · 브라우저 기준</strong>
      <p>최근 90초 안에 화면이 열려 있던 브라우저를 집계하며, 30초마다 갱신합니다.</p>
      <p>같은 브라우저의 여러 탭은 하나로 집계합니다. PC·휴대폰·시크릿 창은 각각 집계됩니다.</p>
      {count === null && <p className={styles.warning}>{loading ? "접속자 수를 확인하고 있습니다." : "현재 접속자 수를 확인할 수 없습니다. 잠시 후 자동으로 다시 확인합니다."}</p>}
    </div>
  </details>;
}
