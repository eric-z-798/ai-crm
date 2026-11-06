import {validCriteria,type ListCriteria} from './visit-list.ts';
export type PreferenceStatus=''|'saved'|'restored'|'missing'|'invalid'|'readFailed'|'writeFailed'|'unconfirmed';
type Store=Pick<Storage,'getItem'|'setItem'>;
export function preferenceKey(scope:string):string|null{
 try{const tuple=JSON.parse(scope);return Array.isArray(tuple)&&tuple.length===3&&tuple.every(v=>typeof v==='string'&&v.trim().length>0)&&['REP','MANAGER'].includes(tuple[2])?'aicrm-list-preferences-v1:'+JSON.stringify(tuple):null;}catch{return null;}
}
function criteria(value:unknown):value is ListCriteria{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as ListCriteria;return Object.keys(v).sort().join(',')==='query,sort,status'&&typeof v.query==='string'&&validCriteria(v);
}
export function savePreferences(scope:string,value:ListCriteria,storage:()=>Store):PreferenceStatus{
 const key=preferenceKey(scope);if(!key||!criteria(value))return 'invalid';
 const raw=JSON.stringify({version:1,scope:JSON.parse(scope),criteria:{query:value.query,status:value.status,sort:value.sort}});
 let store:Store;try{store=storage();store.setItem(key,raw);}catch{return 'writeFailed';}
 try{return store.getItem(key)===raw?'saved':'unconfirmed';}catch{return 'unconfirmed';}
}
export function readPreferences(scope:string,storage:()=>Store):{status:PreferenceStatus;criteria?:ListCriteria}{
 const key=preferenceKey(scope);if(!key)return {status:'invalid'};
 let raw:string|null;try{raw=storage().getItem(key);}catch{return {status:'readFailed'};}
 if(raw===null)return {status:'missing'};
 try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='criteria,scope,version'||value.version!==1||JSON.stringify(value.scope)!==JSON.stringify(JSON.parse(scope))||!criteria(value.criteria))return {status:'invalid'};
 return {status:'restored',criteria:{...value.criteria}};
 }catch{return {status:'invalid'};}
}
