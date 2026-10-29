import {ResearchBoundaryError} from './balta-ai-run-context';
export type PaperRow = Record<string, unknown>;
export type PaperRequest = <T>(resource:string,options?:RequestInit)=>Promise<T>;
function equal(a:unknown,b:unknown):boolean {
  if(typeof a==='number') return (typeof b==='number'||typeof b==='string'&&b.trim()!=='') && Number.isFinite(Number(b)) && Math.abs(a-Number(b))<=1e-6;
  if(Array.isArray(a))return Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>equal(x,b[i]));
  if(a && typeof a==='object')return !!b&&typeof b==='object'&&Object.entries(a).every(([k,v])=>equal(v,(b as PaperRow)[k]));
  return a===b;
}
export function verifyImmutableRows(expected:PaperRow[],actual:PaperRow[],keys:string[]) {
  const key=(r:PaperRow)=>JSON.stringify(keys.map(k=>r[k]));
  const stored=new Map(actual.map(row=>[key(row),row]));
  return {missing:expected.filter(r=>!stored.has(key(r))).length,
    mismatched:expected.filter(r=>stored.has(key(r))&&!equal(r,stored.get(key(r)))).length};
}
export class ImmutablePaperStore {
  readonly planned: Record<string,number>={};
  readonly verified: Record<string,number>={};
  readonly plannedKeys: Record<string,string[]>={};
  constructor(private readonly request:PaperRequest,readonly dryRun:boolean) {}
  async insert(table:string,value:unknown,conflict:string) {
    const rows=(Array.isArray(value)?value:[value]) as PaperRow[];
    if(!rows.length)return;
    const keys=conflict.split(',');
    // Only the research tables can be written through this path.
    if(!/^balta_ai_[a-z_]+$/.test(table)||rows.some(r=>keys.some(k=>!/^[-A-Za-z0-9_.]+$/.test(String(r[k]??'')))))
      throw new ResearchBoundaryError('INVALID_IMMUTABLE_KEY');
    this.planned[table]=(this.planned[table]??0)+rows.length;
    if(this.dryRun){
      this.plannedKeys[table]??=[];
      this.plannedKeys[table].push(...rows.map(row=>keys.map(k=>String(row[k])).join(':')));
      return;
    }
    await this.request(table+'?on_conflict='+conflict,{method:'POST',
      headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(value)});
    // Read exact keys and values, not just an HTTP success or key count. Small
    // batches keep URLs bounded. A racing incompatible insert fails verification.
    for(let i=0;i<rows.length;i+=8){
      const batch=rows.slice(i,i+8);
      const q=new URLSearchParams({select:'*',limit:String(batch.length),
        or:'('+batch.map(r=>'and('+keys.map(k=>k+'.eq.'+r[k]).join(',')+')').join(',')+')'});
      const actual=await this.request<PaperRow[]>(table+'?'+q);
      if(!Array.isArray(actual))throw new ResearchBoundaryError('INVALID_STORAGE_READBACK');
      const audit=verifyImmutableRows(batch,actual,keys);
      if(audit.missing||audit.mismatched)throw new ResearchBoundaryError('IMMUTABLE_STORAGE_VERIFICATION_FAILED');
      this.verified[table]=(this.verified[table]??0)+batch.length;
    }
  }
}
