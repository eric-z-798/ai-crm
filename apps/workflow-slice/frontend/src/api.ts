export class ApiError extends Error { constructor(public status:number,public code:string,message:string){super(message)} }
export async function api<T>(role:string,path:string,method='GET',body?:unknown,key?:string,signal?:AbortSignal):Promise<T>{
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
 const cancel=()=>controller.abort(); signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)controller.abort();
 try { const response=await fetch('/api'+path,{method,signal:controller.signal,headers:{'X-AICRM-Contract':'record-corrections-handoff-results-1',Authorization:`Bearer demo-${role}`,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});
 if(response.status===426&&typeof window!=='undefined')window.dispatchEvent(new Event('aicrm-contract-required'));
 const data=await response.json().catch(()=>null); if(!response.ok) throw new ApiError(response.status,data?.code??'REQUEST_FAILED',data?.message??'Request failed'); return data as T;
 } finally {clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
}
