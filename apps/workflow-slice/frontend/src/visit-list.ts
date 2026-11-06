export type ListVisit={id:string;status:'DRAFT'|'RECORDED';organization:string;notes:string;updatedAt:string};
export type ListCriteria={query:string;status:'ALL'|'DRAFT'|'RECORDED';sort:'newest'|'oldest'};
export const defaultCriteria=():ListCriteria=>({query:'',status:'ALL',sort:'newest'});
export function validCriteria(c:ListCriteria){return [...c.query].length<=200&&['ALL','DRAFT','RECORDED'].includes(c.status)&&['newest','oldest'].includes(c.sort);}
// Keep sub-millisecond server precision; Date.parse alone can collapse distinct updates.
export function timestampKey(value:string):bigint|null{
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!m)return null;
 const [,y,mo,d,h,mi,s,f='',zone]=m;
 const year=Number(y),month=Number(mo),day=Number(d);
 if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()||Number(h)>23||Number(mi)>59||Number(s)>59)return null;
 if(zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(4))>59))return null;
 const ms=Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}${zone}`);if(!Number.isFinite(ms))return null;
 return BigInt(ms)*1000000n+BigInt(f.padEnd(9,'0'));
}
export function validListVisits(value:unknown):value is ListVisit[]{
 if(!Array.isArray(value))return false;const ids=new Set<string>();
 return value.every(v=>v&&typeof v.id==='string'&&v.id.length>0&&!ids.has(v.id)&&!!ids.add(v.id)&&['DRAFT','RECORDED'].includes(v.status)&&typeof v.organization==='string'&&typeof v.notes==='string'&&typeof v.updatedAt==='string'&&timestampKey(v.updatedAt)!==null);
}
export function selectVisits<T extends ListVisit>(visits:readonly T[],criteria:ListCriteria):T[]{
 const q=criteria.query.trim().toLowerCase();
 return visits.filter(v=>(criteria.status==='ALL'||v.status===criteria.status)&&(!q||v.organization.toLowerCase().includes(q)||v.notes.toLowerCase().includes(q))).sort((a,b)=>{
  const at=timestampKey(a.updatedAt)!,bt=timestampKey(b.updatedAt)!;
  if(at!==bt)return (at<bt?-1:1)*(criteria.sort==='newest'?-1:1);
  return a.id<b.id?-1:a.id>b.id?1:0;
 });
}
export function fallbackAnchor(oldIds:readonly string[],newIds:readonly string[],id:string|null):string|null{
 if(id&&newIds.includes(id))return id;
 const index=id?oldIds.indexOf(id):-1;
 if(index>=0){const next=oldIds.slice(index+1).find(v=>newIds.includes(v));if(next)return next;}
 return newIds.at(-1)??null;
}
