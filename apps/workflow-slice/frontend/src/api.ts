export class ApiError extends Error { constructor(public status:number,public code:string,message:string){super(message)} }
export async function api<T>(role:string,path:string,method='GET',body?:unknown,key?:string):Promise<T>{
 const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
 try { const response=await fetch('/api'+path,{method,signal:controller.signal,headers:{Authorization:`Bearer demo-${role}`,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>null); if(!response.ok) throw new ApiError(response.status,data?.code??'REQUEST_FAILED',data?.message??'Request failed'); return data as T;
 } finally {clearTimeout(timer)}
}
