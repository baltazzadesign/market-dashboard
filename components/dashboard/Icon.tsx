import type { CSSProperties } from "react";
const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  chart: "M3 3v18h18 M7 14l4-4 4 3 6-8",
  calendar: "M8 2v4 M16 2v4 M3 9h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M7 13h2 M12 13h2 M7 17h2 M12 17h2",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  settings: "M4 7h16 M4 17h16 M9 4v6 M15 14v6",
  refresh: "M20 7v5h-5 M4 17v-5h5 M5.5 7a7.5 7.5 0 0 1 12.4-2L20 8 M4 16l2.1 3A7.5 7.5 0 0 0 18.5 17",
  download: "M12 3v12 M7 10l5 5 5-5 M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  left: "M15 6l-6 6 6 6", right: "M9 6l6 6-6 6",
  up: "M5 17l7-10 7 10 M12 7v14", down: "M5 7l7 10 7-10 M12 3v14",
  expand: "M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5",
  close: "M6 6l12 12 M6 18L18 6",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5",
  help: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 16v.5",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M12 6v6l4 2",
  activity: "M2 12h4l3-8 6 16 3-8h4",
  shield: "M12 2L3 6v6c0 5 9 10 9 10s9-5 9-10V6z M8 12l3 3 5-6",
  lock: "M6 11V8a6 6 0 0 1 12 0v3 M5 11h14v11H5z M12 15v3",
  eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  eyeOff: "M3 3l18 18 M10 5c8-1 13 7 13 7l-3 4 M6 6c-3 2-5 6-5 6s4 7 11 7l5-1 M9 9a4 4 0 0 0 6 6",
  logout: "M9 3H4v18h5 M9 12h12 M16 7l5 5-5 5",
  layers: "M12 3L2 8l10 5 10-5z M2 12l10 5 10-5 M2 16l10 5 10-5",
  warning: "M12 3L2 21h20z M12 9v5 M12 17v.5",
  pause: "M7 4h3v16H7z M14 4h3v16h-3z", play: "M7 3l14 9-14 9z",
  check: "M4 12l5 5L20 6", table: "M3 4h18v16H3z M3 9h18 M9 9v11", minus: "M5 12h14",
};
export type IconName = keyof typeof paths;
export function Icon({ name, size = 18, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}><path d={paths[name]} /></svg>;
}
export function Brand() {
  return <span className="brand"><svg className="brand-mark" viewBox="0 0 32 34" fill="none" aria-hidden="true"><path d="M5 5v24h11a7 7 0 0 0 0-14H5M5 5h10a5 5 0 0 1 0 10" stroke="currentColor" strokeWidth="4" strokeLinecap="square"/><path d="M24 3v9" stroke="currentColor" strokeWidth="4"/></svg><span className="brand-word">baltatool</span><span className="brand-version">2.0</span></span>;
}
