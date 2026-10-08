// Browser-only PNG composition. Reuse the rendered SVG plots; no screenshot API,
// external image, font request, or server upload is needed.
export type ImageMetric = { label: string; value: string; color: string };
export type ImagePlot = { xml: string; width: number; height: number };
export type ImagePanel = {
  title: string; subtitle: string; metrics: ImageMetric[]; plot?: ImagePlot;
  empty?: string; notes?: string[]; wide?: boolean;
};
export type ImageBriefing = { title: string; badge?: string; subtitle: string[]; headline: string; sections: { title: string; text: string }[]; notes: string[] };
export type ImageTable = {
  title: string; subtitle: string;
  columns: { label: string; weight?: number; align?: 'left' | 'right'; color?: string }[];
  rows: string[][];
};
export type ChartImageReport = { title: string; subtitle: string[]; panels: ImagePanel[]; notes: string[]; tables?: ImageTable[]; briefing?: ImageBriefing };
const FONT = 'Arial, "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const WIDTH = 1440, PAD = 32, GAP = 20;

export function snapshotPlot(svg: SVGSVGElement | null): ImagePlot | undefined {
  if (!svg) return undefined;
  const rect = svg.getBoundingClientRect(), view = svg.viewBox.baseVal;
  const width = view.width || rect.width, height = view.height || rect.height;
  if (width < 1 || height < 1) throw new Error('차트가 아직 준비되지 않았습니다. 잠시 후 다시 저장해 주세요.');
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...svg.querySelectorAll<SVGElement>('*')];
  const copies = [clone, ...clone.querySelectorAll<SVGElement>('*')];
  originals.forEach((node, i) => {
    const style = getComputedStyle(node), copy = copies[i];
    for (const key of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'fill-opacity', 'stroke-opacity', 'opacity', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'letter-spacing']) {
      // Resolve CSS colors/currentColor, while retaining local gradient references.
      const value = style.getPropertyValue(key).replace(/url\(["']?[^)#]*#([^)'" ]+)["']?\)/g, 'url(#$1)');
      if (value) copy.style.setProperty(key, value);
    }
    copy.style.setProperty('font-family', FONT);
    copy.removeAttribute('tabindex');
  });
  clone.querySelectorAll('[data-image-exclude], .recharts-tooltip-cursor, .recharts-active-dot').forEach(node => node.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
  clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  clone.style.width = `${width}px`; clone.style.height = `${height}px`;
  return { xml: new XMLSerializer().serializeToString(clone), width, height };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = []; let line = '';
  for (const letter of text) {
    if (letter === '\n' || (line && ctx.measureText(line + letter).width > width)) { lines.push(line); line = letter === '\n' ? '' : letter; }
    else line += letter;
  }
  if (line) lines.push(line);
  return lines;
}
function font(ctx: CanvasRenderingContext2D, size: number, weight = 400) { ctx.font = `${weight} ${size}px ${FONT}`; }
function measureBriefing(ctx: CanvasRenderingContext2D, briefing: ImageBriefing, width: number) {
  const inner = width - 56;
  font(ctx, 15); const subtitles = briefing.subtitle.flatMap(text => wrap(ctx, text, inner));
  font(ctx, 27, 600); const headline = wrap(ctx, briefing.headline, inner);
  font(ctx, 17); const sections = briefing.sections.map(s => ({ ...s, lines: wrap(ctx, s.text, inner - 150) }));
  font(ctx, 14); const notes = briefing.notes.flatMap(text => wrap(ctx, text, inner));
  const height = 24 + 34 + subtitles.length * 23 + 20 + headline.length * 38 + 24
    + sections.reduce((sum, s) => sum + Math.max(26, s.lines.length * 27) + 18, 0) + 18 + notes.length * 22 + 22;
  return { subtitles, headline, sections, notes, height };
}
function drawBriefing(ctx: CanvasRenderingContext2D, briefing: ImageBriefing, layout: ReturnType<typeof measureBriefing>, y: number, width: number) {
  const x = PAD + 28, inner = width - 56;
  ctx.fillStyle = '#111a10'; ctx.strokeStyle = '#947747'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(PAD, y, width, layout.height, 8); ctx.fill(); ctx.stroke();
  let top = y + 24;
  font(ctx, 23, 600); ctx.fillStyle = '#edd192'; ctx.fillText(briefing.title, x, top, inner);
  font(ctx, 12); ctx.fillStyle = '#a7b395'; ctx.textAlign = 'right'; ctx.fillText(briefing.badge ?? '차트 기록 기반 · 자동 요약', PAD + width - 28, top + 5); ctx.textAlign = 'left';
  top += 34; font(ctx, 15); ctx.fillStyle = '#a8b29d'; layout.subtitles.forEach(line => { ctx.fillText(line, x, top); top += 23; });
  top += 20; font(ctx, 27, 600); ctx.fillStyle = '#e9d7a5'; layout.headline.forEach(line => { ctx.fillText(line, x, top); top += 38; });
  top += 24;
  for (const section of layout.sections) {
    font(ctx, 16, 600); ctx.fillStyle = '#c9bf91'; ctx.fillText(section.title, x, top + 2, 132);
    font(ctx, 17); ctx.fillStyle = '#c2cbb6'; section.lines.forEach((line, i) => ctx.fillText(line, x + 150, top + i * 27));
    top += Math.max(26, section.lines.length * 27) + 18;
  }
  ctx.strokeStyle = '#3e4b33'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + inner, top); ctx.stroke();
  top += 18; font(ctx, 14); ctx.fillStyle = '#929f83'; layout.notes.forEach(line => { ctx.fillText(line, x, top); top += 22; });
}
function measureTable(ctx: CanvasRenderingContext2D, table: ImageTable, width: number) {
  const inner = width - 40, weight = table.columns.reduce((sum, c) => sum + (c.weight ?? 1), 0);
  const widths = table.columns.map(c => inner * (c.weight ?? 1) / weight);
  font(ctx, 14); const subtitles = wrap(ctx, table.subtitle, inner);
  font(ctx, 15, 600); const headings = table.columns.map((c, i) => wrap(ctx, c.label, widths[i] - 24));
  const headingHeight = Math.max(1, ...headings.map(c => c.length)) * 22 + 24;
  font(ctx, 16); const rows = table.rows.map(row => {
    const cells = table.columns.map((_, i) => wrap(ctx, row[i] ?? '—', widths[i] - 24));
    return { cells, height: Math.max(1, ...cells.map(c => c.length)) * 24 + 24 };
  });
  return { widths, subtitles, headings, headingHeight, rows, height: 72 + subtitles.length * 21 + headingHeight + rows.reduce((sum, r) => sum + r.height, 0) + 12 };
}
function drawTable(ctx: CanvasRenderingContext2D, table: ImageTable, layout: ReturnType<typeof measureTable>, y: number, width: number) {
  ctx.fillStyle = '#0d120e'; ctx.strokeStyle = '#6c512b'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(PAD, y, width, layout.height, 8); ctx.fill(); ctx.stroke();
  const x = PAD + 20;
  font(ctx, 21, 600); ctx.fillStyle = '#edd192'; ctx.fillText(table.title, x, y + 18, width - 40);
  font(ctx, 14); ctx.fillStyle = '#a1ab99'; layout.subtitles.forEach((line, i) => ctx.fillText(line, x, y + 48 + i * 21));
  let top = y + 72 + layout.subtitles.length * 21;
  function cells(lines: string[][], header: boolean) {
    let left = x;
    lines.forEach((cell, i) => {
      ctx.textAlign = table.columns[i].align ?? 'left';
      ctx.fillStyle = table.columns[i].color ?? (header ? '#c8bea1' : '#d5dbce');
      cell.forEach((line, n) => ctx.fillText(line, ctx.textAlign === 'right' ? left + layout.widths[i] - 12 : left + 12, top + 12 + n * (header ? 22 : 24)));
      left += layout.widths[i];
    });
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = '#1a2117'; ctx.fillRect(x, top, width - 40, layout.headingHeight);
  font(ctx, 15, 600); cells(layout.headings, true); top += layout.headingHeight;
  layout.rows.forEach((row, i) => {
    if (i % 2 === 1) { ctx.fillStyle = '#111910'; ctx.fillRect(x, top, width - 40, row.height); }
    font(ctx, 16); cells(row.cells, false); top += row.height;
    ctx.strokeStyle = '#2c3727'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + width - 40, top); ctx.stroke();
  });
}
function loadPlot(plot: ImagePlot, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const url = URL.createObjectURL(new Blob([plot.xml], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    const done = (error?: Error) => { clearTimeout(timer); signal.removeEventListener('abort', cancel); URL.revokeObjectURL(url); img.onload = null; img.onerror = null; if (error) reject(error); else resolve(img); };
    const cancel = () => { done(new DOMException('Cancelled', 'AbortError')); img.src = ''; };
    const timer = setTimeout(() => done(new Error('차트 이미지 변환이 지연되었습니다. 다시 시도해 주세요.')), 10000);
    signal.addEventListener('abort', cancel, { once: true });
    img.onload = () => done(); img.onerror = () => done(new Error('차트를 이미지로 변환하지 못했습니다. 다시 시도해 주세요.'));
    img.src = url;
  });
}

export async function buildChartPNG(report: ChartImageReport, signal: AbortSignal): Promise<Blob> {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서 이미지 저장을 사용할 수 없습니다.');
  const full = WIDTH - PAD * 2, half = (full - GAP) / 2;
  font(ctx, 16);
  const headerLines = report.subtitle.flatMap(text => wrap(ctx, text, full));
  const footerLines = report.notes.flatMap(text => wrap(ctx, text, full));
  let y = 128 + headerLines.length * 25, pendingHeight = 0;
  const placements: { x: number; y: number; width: number; height: number; subtitles: string[]; notes: string[]; columns: number; metricRows: number; plotHeight: number }[] = [];
  for (const panel of report.panels) {
    const width = panel.wide ? full : half, inner = width - 40;
    if (panel.wide && pendingHeight) { y += pendingHeight + GAP; pendingHeight = 0; }
    font(ctx, 14);
    const subtitles = wrap(ctx, panel.subtitle, inner), notes = (panel.notes ?? []).flatMap(text => wrap(ctx, text, inner));
    const columns = panel.wide ? 4 : 3, metricRows = Math.ceil(panel.metrics.length / columns);
    const plotHeight = panel.plot ? panel.plot.height * inner / panel.plot.width : panel.metrics.length ? 100 : 180;
    const height = 60 + subtitles.length * 21 + metricRows * 59 + plotHeight + notes.length * 21 + 24;
    const entry = { x: PAD, y, width, height, subtitles, notes, columns, metricRows, plotHeight };
    if (panel.wide) y += height + GAP;
    else if (pendingHeight) { entry.x = PAD + half + GAP; y += Math.max(height, pendingHeight) + GAP; pendingHeight = 0; }
    else pendingHeight = height;
    placements.push(entry);
  }
  if (pendingHeight) y += pendingHeight + GAP;
  const tables = (report.tables ?? []).map(table => {
    const layout = measureTable(ctx, table, full), top = y;
    y += layout.height + GAP;
    return { table, layout, top };
  });
  const briefingY = y, briefingLayout = report.briefing ? measureBriefing(ctx, report.briefing, full) : null;
  if (briefingLayout) y += briefingLayout.height + GAP;
  const height = y + 38 + footerLines.length * 23 + 44;
  // Bound memory on phones while keeping desktop exports crisp.
  const scale = Math.min(2, Math.sqrt(12_000_000 / (WIDTH * height)), 8192 / height);
  canvas.width = Math.floor(WIDTH * scale); canvas.height = Math.floor(height * scale);
  ctx.scale(scale, scale); ctx.textBaseline = 'top';
  ctx.fillStyle = '#080c09'; ctx.fillRect(0, 0, WIDTH, height);
  font(ctx, 15, 600); ctx.fillStyle = '#c7a967'; ctx.fillText('BALTATOOL  /  발타툴', PAD, 27);
  font(ctx, 13); ctx.fillStyle = '#969c8f'; ctx.textAlign = 'right'; ctx.fillText('baltatool.com', WIDTH - PAD, 29); ctx.textAlign = 'left';
  font(ctx, 30, 700); ctx.fillStyle = '#edd192'; ctx.fillText(report.title, PAD, 63, full);
  font(ctx, 16); ctx.fillStyle = '#a6afa1'; headerLines.forEach((text, i) => ctx.fillText(text, PAD, 108 + i * 25));
  try {
    for (let i = 0; i < report.panels.length; i++) {
      signal.throwIfAborted();
      const panel = report.panels[i], p = placements[i], x = p.x + 20, inner = p.width - 40;
      ctx.fillStyle = '#0d120e'; ctx.strokeStyle = '#6c512b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(p.x, p.y, p.width, p.height, 8); ctx.fill(); ctx.stroke();
      font(ctx, 21, 600); ctx.fillStyle = '#edd192'; ctx.fillText(panel.title, x, p.y + 18, inner);
      font(ctx, 14); ctx.fillStyle = '#a1ab99'; p.subtitles.forEach((text, n) => ctx.fillText(text, x, p.y + 48 + n * 21));
      let top = p.y + 57 + p.subtitles.length * 21;
      const cell = inner / p.columns;
      panel.metrics.forEach((metric, n) => {
        const mx = x + n % p.columns * cell, my = top + Math.floor(n / p.columns) * 59;
        font(ctx, 13); ctx.fillStyle = '#acb5a5'; ctx.fillText(metric.label, mx, my, cell - 12);
        font(ctx, 20, 600); ctx.fillStyle = metric.color; ctx.fillText(metric.value, mx, my + 20, cell - 12);
      });
      top += p.metricRows * 59;
      if (panel.plot) { const img = await loadPlot(panel.plot, signal); ctx.drawImage(img, x, top, inner, p.plotHeight); }
      else {
        font(ctx, 16); ctx.fillStyle = '#a4ad9d';
        const lines = wrap(ctx, panel.empty || '이 구간에 표시할 기록이 없습니다.', inner - 40);
        const offset = Math.max(12, (p.plotHeight - lines.length * 24) / 2);
        lines.forEach((text, n) => ctx.fillText(text, x + 20, top + offset + n * 24));
      }
      top += p.plotHeight + 10;
      font(ctx, 14); ctx.fillStyle = '#9ca791'; p.notes.forEach((text, n) => ctx.fillText(text, x, top + n * 21));
    }
    tables.forEach(({ table, layout, top }) => drawTable(ctx, table, layout, top, full));
    if (report.briefing && briefingLayout) drawBriefing(ctx, report.briefing, briefingLayout, briefingY, full);
    ctx.strokeStyle = '#4c422e'; ctx.beginPath(); ctx.moveTo(PAD, y + 5); ctx.lineTo(WIDTH - PAD, y + 5); ctx.stroke();
    font(ctx, 14); ctx.fillStyle = '#9ca791'; footerLines.forEach((text, i) => ctx.fillText(text, PAD, y + 24 + i * 23));
    signal.throwIfAborted();
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지 파일을 만들지 못했습니다. 다시 시도해 주세요.')), 'image/png'));
  } finally { canvas.width = 0; canvas.height = 0; }
}

export function downloadChartPNG(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-');
  document.body.appendChild(link); link.click(); link.remove();
  // Give mobile browsers enough time to consume the object URL.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
