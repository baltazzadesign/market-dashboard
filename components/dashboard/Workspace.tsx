"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { OPEN_MINUTE, CLOSE_MINUTE, type MarketEvent, type MarketRow, kstParts, isValidDate, moveDate, minuteLabel, formatNumber, dataStatus, rowsCsv, sourceLabel, breadthLabel } from "@/lib/balta-model";
import { buildMarketEvents } from "@/lib/balta-signals";
import { Brand, Icon } from "./Icon";
import { useMarketFeed } from "./useMarketFeed";
import { Modal } from "./Modal";
import { Metrics, MarketSummary, FlowPanel, SignalPanel, SessionSummary } from "./Insights";
import RecordsPanel, { downloadCsv, type RecordView } from "./RecordsPanel";
import { chartNames as chartLabels, fitDomain as fit, type ChartKind, type Domain } from "./chart-model";

const MarketChart = dynamic(() => import("./MarketCharts"), { ssr: false, loading: () => <div className="chart-loading"><Icon name="refresh" className="spin"/>차트 준비 중</div> });
const chartKeys = Object.keys(chartLabels) as ChartKind[];
type Settings = { autoRefresh: boolean; markers: boolean; compare: boolean; autoScale: boolean; notifications: boolean };
const defaults: Settings = { autoRefresh:true,markers:true,compare:true,autoScale:true,notifications:false };
export default function Workspace({ mode }: { mode:"overview" | "daily" }) {
  const [date,setDate] = useState(""),[today,setToday] = useState(""),[clock,setClock] = useState(""),[now,setNow] = useState<Date | null>(null),[followToday,setFollowToday] = useState(true);
  const [settings,setSettings] = useState<Settings>(defaults),[settingsLoaded,setSettingsLoaded] = useState(false);
  const [kind,setKind] = useState<ChartKind>("flow"),[range,setRange] = useState("all"),[customDomain,setCustomDomain] = useState<Domain>([OPEN_MINUTE,CLOSE_MINUTE]);
  const [selectedMinute,setSelectedMinute] = useState<number | null>(null),[modal,setModal] = useState<"settings" | "guide" | "chart" | null>(null);
  const [hoverMinute,setHoverMinute] = useState<number | null>(null),[expandedKind,setExpandedKind] = useState<ChartKind>("flow");
  const [tableView,setTableView] = useState<RecordView>(mode==="daily"?"records":"signals");
  const [toast,setToast] = useState(""),[loggingOut,setLoggingOut] = useState(false);
  const dateInitialized = useRef(false);
  const seen = useRef<{date:string;ids:Set<string>;armed:boolean}>({date:"",ids:new Set(),armed:false});
  useEffect(()=>{
    const tick=()=>{const dateNow=new Date(),parts=kstParts(dateNow);setToday(parts.date);setClock(parts.clock);setNow(dateNow);if(!dateInitialized.current){dateInitialized.current=true;const requested=new URLSearchParams(window.location.search).get("date");if(requested&&isValidDate(requested)&&requested<=parts.date){setDate(requested);setFollowToday(requested===parts.date);return;}}if(followToday)setDate(parts.date);};
    tick();const id=setInterval(tick,15000);return()=>clearInterval(id);
  },[followToday]);
  useEffect(()=>{
    try {
      const saved=JSON.parse(localStorage.getItem("baltatool.preferences.v2")??"{}") as Record<string,unknown>;
      setSettings(old=>({...old,...Object.fromEntries(Object.keys(defaults).filter(key=>typeof saved[key]==="boolean").map(key=>[key,saved[key]])),notifications: saved.notifications===true && "Notification" in window && Notification.permission==="granted"}));
    } catch {}
    setSettingsLoaded(true);
  },[]);
  useEffect(()=>{if(settingsLoaded){try{localStorage.setItem("baltatool.preferences.v2",JSON.stringify(settings));}catch{}}},[settings,settingsLoaded]);
  useEffect(()=>{setSelectedMinute(null);setHoverMinute(null);setRange("all");},[date]);
  useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(""),5500);return()=>clearTimeout(id);},[toast]);
  const feed=useMarketFeed(date,mode==="overview"&&date===today,settings.autoRefresh);
  const rows=feed.rows,last=rows.at(-1);
  const events=useMemo(()=>buildMarketEvents(rows),[rows]);
  const status=useMemo(()=>dataStatus(last,date,feed.error,now??new Date(0)),[last,date,feed.error,now]);
  const domain=useMemo<Domain>(()=>range==="custom"?customDomain:range==="all"?[OPEN_MINUTE,CLOSE_MINUTE]:fit((last?.minute??CLOSE_MINUTE)-Number(range),last?.minute??CLOSE_MINUTE),[range,customDomain,last?.minute]);
  const overviewKinds: ChartKind[] = ["breadth", "ratio"];
  const comparisonKinds: ChartKind[] = mode === "daily" ? ["kospi", "kosdaq", "score", "accel"] : ["kospi", "kosdaq"];
  useEffect(()=>{
    if(!date||!rows.length)return;
    const state=seen.current;
    if(!settings.notifications||date!==today||feed.loading||feed.error||feed.warning){
      seen.current={date,ids:new Set(events.map(e=>e.id)),armed:false};return;
    }
    if(state.date!==date||!state.armed){seen.current={date,ids:new Set(events.map(e=>e.id)),armed:true};return;}
    const minute=kstParts().minute;
    const latest=events.find(e=>e.level==="강"&&!state.ids.has(e.id)&&minute>=e.minute&&minute-e.minute<=3);
    events.forEach(event=>state.ids.add(event.id));
    if(latest){
      setToast(latest.time+" · "+latest.label);
      if("Notification" in window&&Notification.permission==="granted"){
        try{new Notification("baltatool · "+latest.label,{body:latest.time+" / "+latest.message,tag:latest.id});}catch{}
      }
    }
  },[date,today,rows.length,events,settings.notifications,feed.loading,feed.error,feed.warning]);
  function changeDate(value:string){if(!isValidDate(value)||value>today)return;setFollowToday(value===today);setDate(value);}
  function focusMinute(minute:number){setSelectedMinute(minute);setCustomDomain(fit(minute-30,minute+30));setRange("custom");document.getElementById("market-charts")?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"start"});}
  function showRecords(){setTableView("signals");document.getElementById("records")?.scrollIntoView({behavior:"smooth",block:"start"});}
  function changeDomain(value:Domain){setRange("custom");setCustomDomain(fit(...value));}
  function resetCharts(){setRange("all");setSelectedMinute(null);setHoverMinute(null);}
  function latestCharts(){setRange("60");setSelectedMinute(null);setHoverMinute(null);}
  function openChart(key:ChartKind){setExpandedKind(key);setHoverMinute(null);setModal("chart");}
  function exportDay(){if(!rows.length)return;downloadCsv("baltatool-"+date+".csv",rowsCsv(rows));setToast(date+" 전체 기록을 CSV로 저장했어요.");}
  async function toggleNotifications(enabled:boolean){
    if(!enabled){setSettings(old=>({...old,notifications:false}));return;}
    if(!("Notification" in window)){setToast("이 브라우저에서는 데스크톱 알림을 지원하지 않아요.");return;}
    try{const permission=await Notification.requestPermission();setSettings(old=>({...old,notifications:permission==="granted"}));if(permission!=="granted")setToast("브라우저 알림 권한을 허용해야 사용할 수 있어요.");}catch{setToast("브라우저 알림 설정을 확인해 주세요.");}
  }
  async function logout(){
    setLoggingOut(true);
    try{const response=await fetch("/api/auth/logout",{method:"POST"});if(!response.ok)throw new Error();window.location.assign("/login");}
    catch{setLoggingOut(false);setToast("로그아웃하지 못했어요. 다시 시도해 주세요.");}
  }
  const chartProps={rows,kind,domain,selectedMinute,events,showMarkers:settings.markers,autoScale:settings.autoScale,onDomainChange:changeDomain,hoverMinute,onHoverMinute:setHoverMinute,onReset:resetCharts,onLatest:latestCharts,refreshing:feed.refreshing,dataCaption:feed.warning?"수집 상태 확인":status.tone?status.label:settings.autoRefresh?"60초 자동 갱신":"자동 갱신 일시정지"};
  function comparisonChart(key:ChartKind){return <section className="panel comparison-panel" key={key}><div className="panel-header"><h2 className="panel-title">{chartLabels[key]}</h2><span className="panel-subtitle">{date}</span></div><MarketChart {...chartProps} kind={key} compact onExpand={()=>openChart(key)}/></section>;}
  function ranges(){return <div className="segmented" aria-label="차트 시간 범위">{[{value:"all",label:"전체"},{value:"60",label:"1시간"},{value:"30",label:"30분"}].map(item=><button key={item.value} className={range===item.value?"active":""} aria-pressed={range===item.value} onClick={()=>{setRange(item.value);setSelectedMinute(null);}}>{item.label}</button>)}</div>;}
  return <div className="workspace">
    <a className="skip-link" href="#main-content">본문으로 이동</a>
    <aside className="sidebar" aria-label="주 메뉴"><Link href="/" aria-label="baltatool 대시보드"><Brand/></Link><div className="workspace-label">WORKSPACE</div><nav className="nav-list"><Link href="/" className={"nav-link"+(mode==="overview"?" active":"")} aria-current={mode==="overview"?"page":undefined} title="시장 대시보드"><Icon name="grid"/><span className="nav-label">시장 대시보드</span></Link><Link href="/daily" className={"nav-link"+(mode==="daily"?" active":"")} aria-current={mode==="daily"?"page":undefined} title="일별 분석"><Icon name="chart"/><span className="nav-label">일별 분석</span></Link><Link href="/history" className="nav-link" title="시장 캘린더 · 월간 평가"><Icon name="calendar"/><span className="nav-label">시장 캘린더</span></Link><button className="nav-link" onClick={showRecords} title="신호 기록"><Icon name="bell"/><span className="nav-label">신호 기록</span><span className="nav-end tag">{events.length}</span></button></nav><div className="sidebar-bottom"><button className="nav-link" onClick={()=>setModal("guide")} title="지표 가이드"><Icon name="help"/><span className="nav-label">지표 가이드</span></button><button className="nav-link" onClick={()=>setModal("settings")} title="화면 설정"><Icon name="settings"/><span className="nav-label">화면 설정</span></button><button className="nav-link" onClick={logout} disabled={loggingOut} title="로그아웃"><Icon name="logout"/><span className="nav-label">{loggingOut?"로그아웃 중":"로그아웃"}</span></button><div className="sidebar-note"><Icon name="layers"/><span><strong>KR MARKET</strong>KOSPI · KOSDAQ</span></div></div></aside>
    <header className="topbar"><div className="mobile-brand"><Link href="/"><Brand/></Link></div><div className="breadcrumb"><Icon name="layers" size={15}/><span>워크스페이스</span><Icon name="right" size={12}/><strong>{mode==="overview"?"시장 대시보드":"일별 분석"}</strong></div><div className="topbar-meta"><span className="clock-label num">{clock||"—"} KST</span><span className={"status "+status.tone}><span className="status-dot"/>{feed.loading?"불러오는 중":status.label}</span><button className="button ghost icon" aria-label="화면 설정" onClick={()=>setModal("settings")}><Icon name="settings"/></button></div></header>
    <main id="main-content" className="main-content">
      <div className="page-heading"><div><h1>{mode==="overview"?"시장 대시보드":"일별 분석"}</h1><p>{mode==="overview"?"시장 폭과 수급, 지금의 흐름을 한눈에.":"시간대별 흐름과 주요 신호를 다시 살펴보세요."}</p></div><div className="toolbar"><button className="button icon" aria-label="이전 날짜" disabled={!date} onClick={()=>changeDate(moveDate(date,-1))}><Icon name="left" size={16}/></button><label className="date-control"><Icon name="calendar" size={16}/><span className="sr-only">조회 날짜</span><input type="date" value={date} max={today||undefined} onChange={e=>changeDate(e.target.value)} /></label><button className="button icon" aria-label="다음 날짜" disabled={!date||date>=today} onClick={()=>changeDate(moveDate(date,1))}><Icon name="right" size={16}/></button>{date&&date!==today&&<button className="button" onClick={()=>changeDate(today)}>오늘</button>}<button className="button icon" onClick={()=>void feed.refresh(true)} disabled={feed.refreshing||!date} aria-label="데이터 새로고침" title="데이터 새로고침"><Icon name="refresh" className={feed.refreshing?"spin":""}/></button><button className="button primary" onClick={exportDay} disabled={!rows.length}><Icon name="download" size={16}/><span>내보내기</span></button></div></div>
      {feed.error&&<div className="notice" role="alert"><Icon name="warning"/><span>{feed.error}{rows.length>0?" 마지막으로 조회한 기록을 유지하고 있어요.":""}</span><button className="button small" onClick={()=>void feed.refresh(true)} disabled={feed.refreshing}>다시 시도</button></div>}
      {!feed.error&&feed.warning&&<div className="notice" role="status"><Icon name="warning"/><span>{feed.warning}</span></div>}
      {!feed.error&&!feed.warning&&!feed.loading&&status.tone==="warn"&&<div className="notice" role="status"><Icon name="clock"/><span>{status.detail} · {sourceLabel(last?.flowSource)} · {breadthLabel(last?.breadthSource)}</span></div>}
      <Metrics rows={rows} loading={feed.loading}/>
      <div className="dashboard-grid"><div className="main-column">
        {settings.compare&&rows.length>0&&<div className="mini-chart-grid overview-chart-grid">{overviewKinds.filter(key=>key!==kind).map(comparisonChart)}</div>}
        <section className="panel" id="market-charts" style={{scrollMarginTop:24}} aria-labelledby="chart-heading"><div className="panel-header"><div><h2 className="panel-title" id="chart-heading">장중 흐름</h2><p className="panel-subtitle">{date||"선택 날짜"} · {rows.length}개 기록{selectedMinute!==null?" · "+minuteLabel(selectedMinute)+" 선택":""}</p></div><div className="toolbar">{ranges()}<button className="button icon small" onClick={()=>openChart(kind)} aria-label="차트 크게 보기" disabled={!rows.length}><Icon name="expand" size={16}/></button></div></div>
          <div className="chart-tabs" aria-label="차트 지표">{chartKeys.map(key=><button key={key} className={"chart-tab"+(kind===key?" active":"")} aria-pressed={kind===key} onClick={()=>setKind(key)}>{chartLabels[key]}</button>)}</div>
          {feed.loading?<div className="chart-loading"><Icon name="refresh" className="spin"/>시장 기록을 불러오는 중</div>:!rows.length?<div className="empty-state" style={{minHeight:320}}><Icon name={feed.error?"warning":"chart"} size={34}/><strong>{feed.error?"시장 기록을 불러오지 못했어요":"선택한 날짜의 기록이 없어요"}</strong><p>{feed.error?"데이터 연결을 확인한 뒤 다시 시도해 주세요.":"주말·휴장일이거나 아직 기록이 수집되지 않았을 수 있어요. 다른 날짜를 선택해 보세요."}</p><button className="button" onClick={()=>void feed.refresh(true)} disabled={feed.refreshing}><Icon name="refresh" size={15}/>다시 조회</button></div>:<MarketChart {...chartProps}/>}
          <div className="chart-footer"><span className="num">{minuteLabel(domain[0])}–{minuteLabel(domain[1])}</span><span className="desktop-hint">5분까지 확대 · 모든 차트 시간축 연동</span><button className="button ghost small" onClick={()=>{setRange("all");setSelectedMinute(null);}}>확대 초기화</button></div>
        </section>
        {settings.compare&&rows.length>0&&<div className="mini-chart-grid">{comparisonKinds.filter(key=>key!==kind).map(comparisonChart)}</div>}
        {mode==="daily"&&<SessionSummary rows={rows} events={events}/>}
        <RecordsPanel rows={rows} events={events} date={date} selectedMinute={selectedMinute} onSelect={focusMinute} view={tableView} onViewChange={setTableView}/>
      </div><aside className="insight-column" aria-label="시장 요약"><MarketSummary row={last}/><FlowPanel row={last}/><SignalPanel events={events} onSelect={focusMinute} onAll={showRecords}/></aside></div>
      <footer className="workspace-footer"><span><Icon name="clock" size={13}/>{feed.fetchedAt?"마지막 조회 "+feed.fetchedAt:"조회 대기"} · {last?"데이터 "+last.time+" 기준":"저장 기록 없음"} · KST</span><span>{date&&date===today?(settings.autoRefresh?"60초 자동 갱신":"자동 갱신 일시정지"):"과거 기록 조회"}<button className="button ghost small" onClick={()=>setModal("guide")}>지표 읽는 법<Icon name="help" size={13}/></button></span></footer>
    </main>
    <nav className="mobile-nav" aria-label="모바일 메뉴"><Link href="/" className={mode==="overview"?"active":""} aria-current={mode==="overview"?"page":undefined}><Icon name="grid"/><span>대시보드</span></Link><Link href="/daily" className={mode==="daily"?"active":""} aria-current={mode==="daily"?"page":undefined}><Icon name="chart"/><span>일별 분석</span></Link><Link href="/history"><Icon name="calendar"/><span>캘린더</span></Link><button onClick={()=>setModal("settings")}><Icon name="settings"/><span>설정</span></button></nav>
    <Modal open={modal==="settings"} onClose={()=>setModal(null)} title="화면 설정"><div className="modal-content">
      {([{key:"autoRefresh",title:"자동 갱신",text:"오늘 기록을 60초마다 갱신합니다. 숨겨진 탭에서는 잠시 쉽니다."},{key:"compare",title:"비교 차트",text:"시장 폭·비율과 개별 지수 차트를 함께 확인합니다."},{key:"markers",title:"차트 신호 표시",text:"시장 폭·시장점수 차트에 강한 신호 지점을 표시합니다."},{key:"autoScale",title:"세로축 자동 조절",text:"끄면 시장 폭·수급 차트를 0 중심의 대칭 범위로 표시합니다."}] as const).map(item=><label className="settings-row" key={item.key}><span><strong>{item.title}</strong><p>{item.text}</p></span><input className="switch" type="checkbox" checked={settings[item.key]} onChange={e=>setSettings(old=>({...old,[item.key]:e.target.checked}))}/></label>)}
      <label className="settings-row"><span><strong>새 강한 신호 알림</strong><p>화면 갱신 중 새로 감지한 강한 신호만 알립니다. 과거 기록에는 알리지 않습니다.</p></span><input className="switch" type="checkbox" checked={settings.notifications} onChange={e=>void toggleNotifications(e.target.checked)}/></label><div className="settings-row"><span><strong>설정 저장</strong><p>선택한 화면 설정은 이 브라우저에 저장됩니다.</p></span><button className="button small" onClick={()=>setSettings(defaults)}>초기화</button></div><div className="toolbar" style={{marginTop:20,justifyContent:"space-between"}}><button className="button" onClick={()=>setModal("guide")}><Icon name="help" size={16}/>지표 가이드</button><button className="button ghost" onClick={logout} disabled={loggingOut}><Icon name="logout" size={16}/>로그아웃</button></div>
    </div></Modal>
    <Modal open={modal==="guide"} onClose={()=>setModal(null)} title="지표 읽는 법"><div className="modal-content">{[
      ["시장 폭과 시장점수","시장 폭은 상승 종목 수에서 하락 종목 수를 뺀 값입니다. 시장점수는 기존 계산식을 사용해 −100부터 +100까지 표시합니다."],
      ["지수 등락 기준","상단 KOSPI·KOSDAQ 등락률은 직전 기록과의 비교입니다. 전일 종가 대비 수치가 아닙니다. 지수 차트는 왼쪽 축 KOSPI, 오른쪽 축 KOSDAQ을 사용합니다."],
      ["투자자 수급","외국인·기관·개인 순매수는 모두 억원 단위입니다. 양수는 순매수, 음수는 순매도입니다. 수급을 받지 못한 값은 대시(—)로 표시합니다."],
      ["직전값과 누락 구간","직전 수급 유지로 표시된 값은 새로 받은 수급이 아닙니다. 없는 시간대는 차트를 끊어 표시하며, 기록을 보간해 만들지 않습니다."],
      ["수집 신호와 차트 분석","수집 신호는 서버에 저장된 신호, 차트 분석은 기존 일별 분석 규칙으로 기록에서 계산한 신호입니다. 같은 종류의 반복 신호는 10분 간격으로 정리합니다."],
      ["조건 충족률","기존의 신뢰도 %를 조건 충족률로 바꿨습니다. 여러 조건 중 충족한 비율이며, 상승 확률이나 수익 확률을 뜻하지 않습니다."],
      ["차트와 기록 탐색","차트 상단 수치는 최신 수신 기록입니다. 커서를 올리면 해당 시각의 값이 별도로 표시됩니다. 외인은 파랑, 기관은 빨강, 개인은 노랑으로 구분합니다. 수급 부호는 순매수·순매도를 뜻합니다."],
      ["확대와 구간 탐색","+/− 버튼, Ctrl/⌘+휠, 구간 드래그로 5분까지 확대합니다. 이동 모드에서는 끌어서 시간대를 이동할 수 있습니다. 하단 탐색 막대나 시작·끝 슬라이더를 사용해도 됩니다. 더블클릭·전체 버튼으로 초기화하고, 최근 1시간 버튼으로 최신 구간을 따라갑니다. 확대 아이콘은 큰 차트 창을 엽니다. 모든 차트의 시간 범위가 함께 변경됩니다."],
      ["CSV 다운로드","상단 내보내기는 선택 날짜의 전체 지표를 저장합니다. 기록 탐색의 CSV는 현재 검색·강도 필터와 정렬을 반영합니다."]
    ].map(([title,text])=><div className="guide-item" key={title}><strong>{title}</strong><p>{text}</p></div>)}</div></Modal>
    <Modal open={modal==="chart"} onClose={()=>setModal(null)} title={chartLabels[expandedKind]+" · "+date} wide><div className="panel-header"><div className="chart-legend"><span className="panel-subtitle">연결된 시간 범위</span><strong className="num" style={{fontSize:14}}>{minuteLabel(domain[0])}–{minuteLabel(domain[1])}</strong></div>{ranges()}</div><MarketChart {...chartProps} kind={expandedKind} syncGroup="balta-fullscreen"/><div className="chart-footer"><span>Ctrl/⌘ + 휠 확대 · Esc로 닫기</span><button className="button small" onClick={()=>{setRange("all");setSelectedMinute(null);}}>전체 구간</button></div></Modal>
    {toast&&<div className="toast" role="status"><Icon name="check" size={16}/><span>{toast}</span><button className="button ghost small icon" onClick={()=>setToast("")} aria-label="메시지 닫기"><Icon name="close" size={14}/></button></div>}
  </div>;
}
