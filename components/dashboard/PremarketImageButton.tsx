'use client';
import {useEffect,useRef,useState,type RefObject} from 'react';
import {Icon} from './Icon';
import {downloadChartPNG} from './chart-image';
import s from './PremarketWorkspace.module.css';
import buttonStyle from './ChartImageButton.module.css';

const scopes=[['all','전체 화면'],['futures','국내 선물'],['korea','한국 관련 해외종목'],['etf','ETF 수급 TOP10'],['global','글로벌 지표·환율'],['domestic','국내 지수·교차환율'],['heatmap','종목 히트맵']] as const;

// Freeze the actual rendered DOM, including SVG paths, before feeds can refresh.
function snapshot(root:HTMLElement,scope:string){
  const clone=root.cloneNode(true) as HTMLElement;
  const selects=clone.querySelectorAll('select');
  root.querySelectorAll('select').forEach((select,i)=>{selects[i].value=select.value;});
  clone.querySelectorAll(`.${s.exportControls}, .${s.nav}, .${s.hero} button`).forEach(node=>node.remove());
  // SVG foreignObject rounds shrink-to-fit text widths differently. Use the
  // existing available space so centered labels keep their screen line breaks.
  clone.querySelectorAll<HTMLElement>(`.${s.tile}>*`).forEach(node=>{node.style.width='100%';});
  const heroText=clone.querySelector<HTMLElement>(`.${s.hero}>div`);
  if(heroText)heroText.style.flex='1';
  clone.querySelectorAll<HTMLElement>(`.${s.cardTop} h3`).forEach(node=>{node.style.flex='1';});
  if(scope!=='all'){
    clone.querySelectorAll<HTMLElement>('[data-premarket-export]').forEach(section=>{if(section.dataset.premarketExport!==scope)section.remove();});
    clone.querySelectorAll(`.${s.switch}`).forEach(node=>node.remove());
  }
  clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
  clone.setAttribute('aria-hidden','true');clone.inert=true;
  Object.assign(clone.style,{width:`${root.getBoundingClientRect().width}px`,maxWidth:'none',margin:'0',padding:'20px',boxSizing:'content-box',background:'#080c09'});
  const stamp=document.createElement('p');stamp.className=s.note;
  stamp.textContent=`${scopes.find(([id])=>id===scope)?.[1]} · 저장 ${new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false})} KST · baltatool.com`;
  clone.querySelector('header')?.after(stamp);
  const stage=document.createElement('div');
  Object.assign(stage.style,{position:'fixed',left:'-100000px',top:'0',pointerEvents:'none'});
  stage.append(clone);document.body.append(stage);
  return {clone,stage};
}

export default function PremarketImageButton({root,disabled}:{root:RefObject<HTMLElement|null>;disabled:boolean}){
  const [scope,setScope]=useState('all'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const lock=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{if(!message)return;const timer=setTimeout(()=>setMessage(''),9000);return()=>clearTimeout(timer);},[message]);
  async function save(){
    if(lock.current||!root.current)return;
    lock.current=true;setBusy(true);setMessage('');setFailed(false);
    let stage:HTMLElement|undefined;
    try{
      const frozen=snapshot(root.current,scope);stage=frozen.stage;
      const {toBlob}=await import('html-to-image');
      await document.fonts.ready;
      const width=Math.ceil(frozen.clone.getBoundingClientRect().width),height=Math.ceil(frozen.clone.scrollHeight);
      const pixelRatio=Math.min(2,Math.sqrt(16_000_000/(width*height)),16000/height,16000/width);
      const blob=await toBlob(frozen.clone,{backgroundColor:'#080c09',width,height,pixelRatio,preferredFontFormat:'woff2'});
      if(!blob)throw Error('이미지를 만들지 못했습니다. 구역을 선택해 다시 저장해 주세요.');
      if(mounted.current){downloadChartPNG(blob,`baltatool-premarket-${scope}-${new Date().toISOString().replace(/[:.]/g,'-')}.png`);setMessage('화면의 그래프와 카드가 포함된 PNG를 저장했습니다.');}
    }catch(error){if(mounted.current){setFailed(true);setMessage(error instanceof Error?error.message:'이미지 저장에 실패했습니다. 다시 시도해 주세요.');}}
    finally{stage?.remove();lock.current=false;if(mounted.current)setBusy(false);}
  }
  return <div className={s.exportControls}><select aria-label="PNG 저장 범위" value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}>{scopes.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><div className={buttonStyle.control}><button type="button" className={buttonStyle.button} title="현재 화면의 그래프·카드·히트맵 배치를 그대로 PNG로 저장합니다." disabled={disabled||busy} aria-busy={busy} onClick={save}><Icon name="download" size={15}/>{busy?'이미지 만드는 중…':'PNG 저장'}</button>{message&&<span className={buttonStyle.message} role={failed?'alert':'status'}>{message}</span>}</div></div>;
}
