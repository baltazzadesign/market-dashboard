'use client';
import {useState, type RefObject} from 'react';
import ChartImageButton from './ChartImageButton';
import {snapshotPlot, type ChartImageReport} from './chart-image';
import s from './PremarketWorkspace.module.css';
import f from './TerminalPriceChart.module.css';

const scopes=[['all','전체 화면'],['futures','국내 선물'],['korea','한국 관련 해외종목'],['global','글로벌 지표·환율'],['domestic','국내 지수·교차환율'],['heatmap','종목 히트맵']] as const;
const text=(node:Element|null|undefined)=>node?.textContent?.trim()||'—';

// Capture the displayed values and SVGs synchronously before any feeds refresh.
export function capturePremarketReport(root:HTMLElement,scope:string):ChartImageReport {
  const report:ChartImageReport={title:`장전 체크 · ${scopes.find(([id])=>id===scope)?.[1]??'전체 화면'}`,subtitle:[`저장 ${new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})} KST`, '표시 중인 조회 결과 · 지표별 기준일과 출처가 다릅니다.'],panels:[],tables:[],notes:['지연 시세 포함 · 장중 값은 변동할 수 있습니다.','종목 목록은 동일 크기 히트맵의 수치이며 시가총액 비중이 아닙니다.','자료: 한국투자증권 · 금융투자협회 · 미 재무부 · 업비트 · Yahoo Finance']};
  for(const section of root.querySelectorAll<HTMLElement>('[data-premarket-export]')){
    if(scope!=='all'&&section.dataset.premarketExport!==scope)continue;
    const title=text(section.querySelector('h2'));
    if(section.dataset.premarketExport==='futures'){
      for(const chart of section.querySelectorAll<HTMLElement>(`.${s.futures}>div`)){
        const plot=snapshotPlot(chart.querySelector<SVGSVGElement>('svg.terminal-candles'));
        report.panels.push({title:text(chart.querySelector(`.${f.contract} strong`)),subtitle:[text(chart.querySelector(`.${f.contract} span`)),...Array.from(chart.querySelectorAll('button[aria-pressed="true"]')).map(text),...Array.from(chart.querySelectorAll('select')).map(el=>(el as HTMLSelectElement).selectedOptions[0]?.text??''),Array.from(chart.querySelectorAll('.terminal-chart-caption span')).map(text).join(' · ')].join(' · '),
          metrics:[{label:'표시 가격',value:text(chart.querySelector('.terminal-price-readout strong')),color:'#edd192'},{label:'등락',value:text(chart.querySelector('.terminal-price-readout span')),color:'#d5dbce'},...Array.from(chart.querySelectorAll('dl>div')).map(el=>({label:text(el.querySelector('dt')),value:text(el.querySelector('dd')),color:'#d5dbce'}))],plot,empty:text(chart.querySelector('.terminal-empty')),
          notes:Array.from(chart.querySelectorAll(`.${f.observed}, .${f.warning}, .${f.notes} p`)).map(text)});
      }
      continue;
    }
    const cards=Array.from(section.querySelectorAll(`.${s.card}`));
    const tiles=Array.from(section.querySelectorAll(`.${s.tile}`));
    const status=Array.from(section.querySelectorAll('[role="alert"], [role="status"]')).map(text);
    if(cards.length)report.tables!.push({title,subtitle:status.join(' · ')||'화면에 표시된 최근값 · 금리 등락은 bp',columns:[{label:'지표',weight:2},{label:'값 / 단위',weight:2},{label:'등락',weight:1.3},{label:'기준일 · 출처 · 안내',weight:4}],rows:cards.map(card=>[text(card.querySelector('h3')),`${text(card.querySelector(`.${s.value} strong`))} ${card.querySelector(`.${s.cardTop}>span`)?.textContent??''}`,text(card.querySelector(`.${s.value} b`)),Array.from(card.querySelectorAll('p')).map(text).join(' · ')])});
    else if(tiles.length)report.tables!.push({title,subtitle:Array.from(section.querySelectorAll(`.${s.note}`)).map(text).concat(status).join(' · '),columns:[{label:'종목',weight:2},{label:'등락'},{label:'기준일 / 거래대금',weight:2}],rows:tiles.map(tile=>[text(tile.querySelector('strong'))+(tile.querySelector('span')?' · '+text(tile.querySelector('span')):''),text(tile.querySelector('b')),text(tile.querySelector('small'))])});
    else report.notes.push(`${title}: ${status.join(' · ')||'표시할 데이터가 없습니다.'}`);
  }
  const errors=Array.from(root.querySelectorAll(`.${s.error}`)).map(text);
  if(errors.length)report.notes.push(...errors.map(error=>'조회 안내: '+error));
  return report;
}

export default function PremarketImageButton({root,disabled}:{root:RefObject<HTMLElement|null>;disabled:boolean}){
  const [scope,setScope]=useState('all');
  return <div className={s.exportControls}><select aria-label="PNG 저장 범위" value={scope} onChange={e=>setScope(e.target.value)}>{scopes.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><ChartImageButton label="PNG 저장" title="현재 표시된 선물 차트와 지표·종목 수치를 이미지로 저장합니다. 구역별 저장도 가능합니다." disabled={disabled} createJob={()=>{
    if(!root.current)throw Error('화면이 준비되지 않았습니다.');
    const report=capturePremarketReport(root.current,scope);
    return {plots:0,content:null,filename:`baltatool-premarket-${scope}-${new Date().toISOString().replace(/[:.]/g,'-')}.png`,report:()=>report};
  }}/></div>;
}
