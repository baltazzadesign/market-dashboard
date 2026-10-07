// Presentation only. Inputs remain the original won amounts used by the model.
export function cashDisplay(value:number|null|undefined,signed=false){
  if(value==null||!Number.isFinite(value))return {value:'—',unit:'',exact:'수치 미확인'};
  const large=Math.abs(value)>=1e12,divisor=large?1e12:1e8,amount=value/divisor;
  const text=value!==0&&Math.abs(amount)<.1&&!large?(value>0?'<0.1':'>-0.1'):
    (signed&&value>0?'+':'')+amount.toLocaleString('ko-KR',{minimumFractionDigits:large?2:0,maximumFractionDigits:large?2:1});
  return {value:text,unit:large?'조원':'억원',exact:value.toLocaleString('ko-KR',{maximumFractionDigits:0})+'원'};
}
export const cashDisplayText=(value:number|null|undefined,signed=false)=>{const d=cashDisplay(value,signed);return d.value+d.unit;};
export function cashAxis(values:number[]){
  const large=values.some(v=>Math.abs(v)>=1e12);
  return {unit:large?'조원':'억원',divisor:large?1e12:1e8};
}
