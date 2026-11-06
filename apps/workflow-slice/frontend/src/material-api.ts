import {ApiError} from './api';
import {materialResponseLimit} from './material-reader';
export async function materialGet(path:string,signal:AbortSignal,cid:string,pid:string){
 const limit=materialResponseLimit(cid,pid);
 const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,12000);signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 try{
  const r=await fetch('/api'+path,{method:'GET',signal:controller.signal,headers:{Authorization:'Bearer demo-rep','X-AICRM-Contract':'record-corrections-handoff-results-1','X-AICRM-Preparation-Contract':'preparation-1'}});
  if(r.status===426)window.dispatchEvent(new Event('aicrm-contract-required'));
  if(!r.ok){await r.body?.cancel();throw new ApiError(r.status,'MATERIAL_READ_FAILED','Material read failed');}
  if(Number(r.headers.get('Content-Length')??0)>limit){await r.body?.cancel();throw Error('MATERIAL_BUDGET');}
  const reader=r.body?.getReader();if(!reader)throw Error('MATERIAL_BODY');let length=0;const chunks:Uint8Array[]=[];
  try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>limit)throw Error('MATERIAL_BUDGET');chunks.push(part.value);}}catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}
  const data=new Uint8Array(length);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));
 }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
}
