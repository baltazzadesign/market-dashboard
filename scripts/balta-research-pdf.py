#!/usr/bin/env python3
"""BALTA RESEARCH 16:9 archive PDF; numeric elements are deterministic evidence only."""
import json,sys,os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit

if len(sys.argv)!=3:
    raise SystemExit("Usage: script report.json report.pdf")
with open(sys.argv[1],encoding='utf8') as f: report=json.load(f)
e=report['evidence'];n=report['narrative']
W,H=960,540
D='#0d1110';P='#151e1a';P2='#1c2723';G='#e5c580';T='#f5f0e4';M='#aab5b1'
BLUE='#77aaf2';RED='#ed8790';MINT='#8dd6b8'
fonts=[
 '/usr/share/fonts/truetype/nanum/NanumGothic.ttf',
 '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf',
 '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc']
family=None
for path in fonts:
    if os.path.isfile(path):
        try: pdfmetrics.registerFont(TTFont('Korean',path,subfontIndex=0));family='Korean';break
        except Exception: pass
if not family: raise RuntimeError('Korean font missing: install fonts-nanum before PDF build')
c=canvas.Canvas(sys.argv[2],pagesize=(W,H),pageCompression=1)
c.setTitle('BALTA RESEARCH | '+e['tradeDate'])
page=0
def rgb(h):return tuple(int(h[i:i+2],16)/255 for i in (1,3,5))
def fill(h): c.setFillColorRGB(*rgb(h))
def stroke(h): c.setStrokeColorRGB(*rgb(h))
def box(x,y,w,h,color,r=8):
    fill(color);c.roundRect(x,y,w,h,r,stroke=0,fill=1)
def text(s,x,y,size=15,color=T,maxw=None,leading=None,lines=10):
    fill(color);c.setFont(family,size)
    values=simpleSplit(str(s),family,size,maxw) if maxw else [str(s)]
    for i,line in enumerate(values[:lines]):c.drawString(x,y-i*(leading or size*1.55),line)
    return y-len(values[:lines])*(leading or size*1.55)
def start(title,sub):
    global page
    page+=1;fill(D);c.rect(0,0,W,H,stroke=0,fill=1)
    text('BALTA RESEARCH  /  발타 리서치 노트',34,510,12,G)
    stroke('#3f473d');c.line(34,493,926,493)
    text(title,34,454,27,T)
    text(sub,34,424,12,M,maxw=890)
    stroke('#364238');c.line(34,37,926,37)
    text('자료 기준 '+e['tradeDate']+' · 정규장 · KIS / 발타툴 · 원천 확정 여부 미검증',34,18,9,M)
    text('%02d'%page+' / 11',884,18,9,G)
def end():c.showPage()
def card(x,y,w,h,title,value,foot=''):
    box(x,y,w,h,P);text(title,x+15,y+h-26,12,M,maxw=w-28)
    text(value,x+15,y+h-64,24,G,maxw=w-28)
    if foot:text(foot,x+15,y+18,10,M,maxw=w-28,leading=13,lines=2)
def number(v):return '—' if v is None else ('+' if v>0 else '')+f'{v:,.2f}'
def linebar(y,label,value,maxabs,width=400,color=None):
    x0=460
    text(label,47,y,14,T)
    stroke('#405047');c.line(x0-200,y+4,x0+200,y+4)
    mag=min(200,abs(value)/maxabs*200) if maxabs>0 else 0
    box(x0 if value>=0 else x0-mag,y-1,mag,11,color or (RED if value>=0 else BLUE),0)
    text(number(value),695,y,14,color or G)
def paragraph(t,x,y,w=390,size=15,nlines=8):
    return text(t,x,y,size,T,maxw=w,leading=size*1.55,lines=nlines)
def stockline(stock,y):
    fill(T);c.setFont(family,12);c.drawString(49,y,stock['name'][:16])
    text(stock['code'],205,y,11,M)
    text(number(stock['foreign']),315,y,11,BLUE)
    text(number(stock['institution']),430,y,11,RED)
    price=stock.get('price')
    text('—' if price is None else f"{price['close']:,.0f}",565,y,12,G)
    text('—' if price is None else f"{price['volume']:,.0f}",690,y,11,M)
    text('—' if price is None or price.get('volumeVs20d') is None else f"{price['volumeVs20d']:.2f}배",834,y,11,M)
    stroke('#37433b');c.line(44,y-13,920,y-13)
participants={v['key']:v for v in e['participants']}
stocks=e['stocks']
# Slide 1
start(n['headline'],'정규장 마감 기준 / 투자자별 수급 × 주가 · 거래량')
box(34,155,892,240,P)
paragraph(n['lead'],58,357,830,19,5)
card(45,54,282,87,'외국인 순매수(억원)',number(participants['foreign']['net']))
card(339,54,282,87,'기관 순매수(억원)',number(participants['institution']['net']))
card(633,54,282,87,'확인 종목 수',f"{e['coverage']['covered']:,} / {e['coverage']['expected']:,}")
end()
# Slide 2
start('확인된 자료의 범위','분석의 출발점은 데이터 완전성과 원천 기준시각입니다.')
for i,(title,val,foot) in enumerate([
 ('확인 비율',str(e['coverage']['ratio'])+'%','검증된 금액 기준'),
 ('미확인 종목',str(e['coverage']['missing'])+'개','순매수 0으로 치환 금지'),
 ('분석 주체',str(len(e['participants']))+'개','기관 세부 주체 중복 주의')
]):card(36+i*302,260,285,126,title,val,foot)
paragraph('시장 범위: 코스피·코스닥 주권의 한국투자증권 KRX 수급 자료입니다. 원천 확정 및 정정 여부는 별도로 검증해야 합니다.',50,199,845,16,5)
text('수집시각 '+e['generatedSourceAt'][:19],50,82,12,G)
end()
# Slide 3
start('시장 전체 수급 구조','확인된 종목별 순매수 합계, 매수 거래대금 전체가 아닙니다.')
maxabs=max(abs(float(z['net'])) for z in e['participants'][:4])
for i,key in enumerate(('foreign','institution','individual','otherCorporation')):
    p=participants[key];linebar(366-i*71,p['label'],p['net'],maxabs,color=[BLUE,RED,G,MINT][i])
paragraph(n['marketView'],50,89,820,13,3)
end()
# Slide 4
start('기관 내부 자금의 방향','기관 전체와 하위 주체는 중복 합산하지 않습니다.')
sub=['financialInvestment','insurance','privateEquity','pension','investmentTrust','otherFinance','bank']
m=max(abs(participants[k]['net']) for k in sub)
for i,k in enumerate(sub):
    linebar(377-i*40,participants[k]['label'],participants[k]['net'],m)
text('기관 순매수 = '+number(participants['institution']['net'])+'억원',50,72,14,G)
end()
# Slide 5
start('지수 · 시장폭 · 거래대금의 맥락','수급 금액과 가격 반응을 함께 읽는 시장 레짐 분석')
card(37,274,282,125,'KOSPI',f"{e['market']['kospi']:,.2f}",f"당일 {number(e['market']['kospiPct'])}%")
card(339,274,282,125,'KOSDAQ',f"{e['market']['kosdaq']:,.2f}",f"당일 {number(e['market']['kosdaqPct'])}%")
card(643,274,282,125,'상승 종목 비중',f"{e['market']['breadthPct']:.1f}%",'상승 / (상승 + 하락)')
paragraph('상승 '+str(e['market']['up'])+' · 하락 '+str(e['market']['down'])+' · 보합 '+str(e['market']['flat']),53,220,830,18,2)
paragraph(n['sectorView'],53,166,834,15,4)
end()
# Slide 6
start('관찰 종목과 가격 확인','당일 수급(억원) / KIS 수정주가 종가(원) / 거래량(주) / 20일 평균 거래량 대비')
headers=[('종목',49),('코드',205),('외국인',315),('기관',430),('종가',565),('거래량',690),('거래량비',834)]
for key,x in headers:text(key,x,383,11,G)
stroke('#74633e');c.line(43,368,920,368)
for i,s in enumerate(stocks[:9]):stockline(s,345-i*33)
end()
# Slide 7
start('종목별 수급과 가격 해석','관찰 우선순위는 매수 추천 순위나 적정가격이 아닙니다.')
notes={x['code']:x for x in n['stockNotes']}
for i,stock in enumerate(stocks[:3]):
    y=293-i*112
    box(37,y,886,99,P)
    text(stock['name']+'  ·  '+stock['code'],54,y+73,17,G)
    note=notes.get(stock['code'])
    if note:
        text('수급 관찰: '+note['thesis'],54,y+45,13,T,maxw=840,lines=2)
        text('확인 위험: '+note['risk'],54,y+20,11,M,maxw=840,lines=2)
    else:text('해당 종목의 수급 근거는 다음 거래일 데이터로 확인',54,y+42,13,T)
end()
# Slide 8
start('대응 후보의 조건부 검증','수급이 가격을 지지했는지, 거래량이 동반했는지 함께 확인해야 합니다.')
notes={x['code']:x for x in n['stockNotes']}
for i,s in enumerate(stocks[3:6]):
    y=293-i*112
    box(37,y,886,99,P)
    text(s['name']+'  ·  '+s['code'],54,y+73,17,G)
    note=notes.get(s['code'])
    text(note['thesis'] if note else '수급 지속성 및 가격 반응 추가 관찰',54,y+44,13,T,maxw=836,lines=2)
    text(note['risk'] if note else '확인되지 않은 가격대와 목표가는 제시하지 않음',54,y+18,11,M,maxw=836)
end()
# Slide 9
start('리스크와 반대 증거','외국인·기관 간 주도권 충돌과 특정 주체 매수의 편향에 주의합니다.')
box(40,228,881,169,P)
paragraph(n['risks'],64,364,820,19,5)
paragraph(n['institutionView'],64,205,821,15,5)
end()
# Slide 10
start('다음 거래일의 확인 항목','관찰 조건이 무효화되는 데이터까지 명확히 추적합니다.')
for i,check in enumerate(n['nextChecks'][:5]):
    y=352-i*66
    box(43,y-32,871,54,P)
    text(str(i+1).zfill(2),59,y-1,19,G)
    text(check,112,y-1,14,T,maxw=780,lines=2)
end()
# Slide 11
start('최종 판단과 계산 기준','발타 리서치의 해석은 투자 권유나 실제 체결 수익이 아닙니다.')
box(40,269,880,127,P)
paragraph(n['closingView'],60,362,830,18,4)
for i,source in enumerate(e['source']['notes'][:4]):
    text('• '+source,57,225-i*36,12,M,maxw=850,lines=2)
text(e['source']['ranking'],57,66,10,G,maxw=835)
end()
c.save()
print('BALTA_RESEARCH_PDF_OK pages=',page)
