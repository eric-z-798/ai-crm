// Fixed public synthetic catalog. No business/recovery storage is accessed here.
export const MATERIAL_RESPONSE_LIMIT=985;
// Exact compact ASCII-escaped JSON string payload, excluding its two quotes.
export function escapedIdBytes(id:string){return JSON.stringify(id).replace(/[\u0080-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).length-2;}
export function materialResponseLimit(cid:string,pid:string){return MATERIAL_RESPONSE_LIMIT-72+escapedIdBytes(cid)+escapedIdBytes(pid);}
export const MATERIALS=[{versionId:'v1',sha256:'4e57fd4fd837c5e0d3467f6ed658db7fd85b4af1a543e964f4439428a8ef6692',bytes:261},{versionId:'v2',sha256:'3a9a277b80690d0c4a574bba0e4d076a686bf0dc9489a1d6e0e39b0e330e8d4e',bytes:309}] as const;
export type MaterialEntry={materialId:string;versionId:string;title:string;sourceType:string;buildSource:string;sha256:string;plainText?:string};
function keys(v:any,fields:string[]){return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===fields.sort().join('|');}
export function validEntry(v:any,body=false):v is MaterialEntry{return keys(v,['materialId','versionId','title','sourceType','buildSource','sha256',...(body?['plainText']:[])])&&v.materialId==='synthetic-reading'&&v.title==='合成阅读流程 / Synthetic reading workflow'&&v.sourceType==='synthetic'&&v.buildSource==='p13-catalog-1'&&MATERIALS.some(x=>x.versionId===v.versionId&&x.sha256===v.sha256&&(!body||(typeof v.plainText==='string'&&new TextEncoder().encode(v.plainText).length===x.bytes)));}
export function validResponse(v:any,cid:string,pid:string,version?:string){return keys(v,['schemaVersion','context',version?'material':'entries'])&&v.schemaVersion===1&&keys(v.context,['cid','pid','preparationRevision'])&&v.context.cid===cid&&v.context.pid===pid&&Number.isInteger(v.context.preparationRevision)&&v.context.preparationRevision>0&&v.context.preparationRevision<=2147483647&&(version?validEntry(v.material,true)&&v.material.versionId===version:Array.isArray(v.entries)&&v.entries.length===2&&v.entries.every((x:any,i:number)=>validEntry(x)&&x.versionId===MATERIALS[i]?.versionId));}
export async function verifyText(v:MaterialEntry){if(!validEntry(v,true))return false;const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v.plainText!));return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')===v.sha256;}

export type ReaderReturnToken={scope:string;epoch:number;cid:string;pid:string};
export function sameReaderWork(opened:ReaderReturnToken|null,current:ReaderReturnToken,allowed:boolean,upgrade:boolean){return !!opened&&allowed&&!upgrade&&opened.scope===current.scope&&opened.epoch===current.epoch&&opened.cid===current.cid&&opened.pid===current.pid;}
