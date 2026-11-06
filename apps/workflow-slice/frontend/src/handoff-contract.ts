export type ResultType='result-recorded'|'completed'|'correction-requested'|'result-corrected'|'completion-withdrawn';
export type ResultEvent={eventId:string;type:ResultType;actorId:string;recordedAt:string;revision:number;text?:string;reason?:string;targetEventId?:string;resultEventId?:string;confirmation?:'person-confirmed-internal-complete'};
export type Handoff={schemaVersion:1;objectType:'internal-handoff';id:string;visitId:string;ownerId:string;recipientId:string;request:string;revision:number;status:'SENT'|'RECEIVED'|'ACCEPTED';createdAt:string;updatedAt:string;acceptedBy:string|null;acceptanceEvidence:'verified'|'unverified'|'not-accepted';result:{latestResult:ResultEvent|null;completion:ResultEvent|null;correctionRequests:ResultEvent[];history:ResultEvent[]}};
export type HandoffDraft={target:Handoff|null;type:ResultType;text:string;reason:string;confirmed:boolean;scopeReviewed:boolean};
const object=(v:any)=>!!v&&typeof v==='object'&&!Array.isArray(v);
const str=(v:any)=>typeof v==='string'&&v.length>0;
const time=(v:any)=>str(v)&&Number.isFinite(Date.parse(v));
const revision=(v:any)=>Number.isSafeInteger(v)&&v>0;
const keys=(v:any,k:string[])=>object(v)&&Object.keys(v).sort().join('|')===[...k].sort().join('|');
export const resultTypes:ResultType[]=['result-recorded','completed','correction-requested','result-corrected','completion-withdrawn'];
const fields:Record<ResultType,string[]>={'result-recorded':['text'],completed:['resultEventId','confirmation'],'correction-requested':['targetEventId','text'],'result-corrected':['targetEventId','text','reason'],'completion-withdrawn':['targetEventId','reason']};
export function validResultEvent(e:any):e is ResultEvent{
 if(!object(e)||!resultTypes.includes(e.type)||!keys(e,['eventId','type','actorId','recordedAt','revision',...fields[e.type as ResultType]])||!str(e.eventId)||!str(e.actorId)||!time(e.recordedAt)||!revision(e.revision))return false;
 if('text'in e&&(typeof e.text!=='string'||!e.text.trim()||e.text.length>4000))return false;
 if('reason'in e&&(typeof e.reason!=='string'||!e.reason.trim()||e.reason.length>1000))return false;
 if('targetEventId'in e&&!str(e.targetEventId)||'resultEventId'in e&&!str(e.resultEventId))return false;
 return e.type!=='completed'||e.confirmation==='person-confirmed-internal-complete';
}
const equalEvent=(a:any,b:any)=>a===null&&b===null||validResultEvent(a)&&validResultEvent(b)&&Object.keys(a).every(k=>(a as any)[k]===(b as any)[k]);
export function validHandoff(h:any):h is Handoff{
 if(!object(h)||h.schemaVersion!==1||h.objectType!=='internal-handoff'||!['id','visitId','ownerId','recipientId','request'].every(k=>str(h[k]))||!revision(h.revision)||!time(h.createdAt)||!time(h.updatedAt)||!['SENT','RECEIVED','ACCEPTED'].includes(h.status)||!['verified','unverified','not-accepted'].includes(h.acceptanceEvidence)||h.acceptedBy!==null&&!str(h.acceptedBy)||!object(h.result)||!Array.isArray(h.result.history)||!Array.isArray(h.result.correctionRequests))return false;
 if(h.acceptanceEvidence==='verified'&&(h.acceptedBy!==h.recipientId||h.status!=='ACCEPTED'))return false;
 let latest:ResultEvent|null=null,completion:ResultEvent|null=null;const requests:ResultEvent[]=[],seen=new Set<string>();let prev=0;
 for(const e of h.result.history){
  if(!validResultEvent(e)||e.revision<=prev||e.revision>h.revision||seen.has(e.eventId))return false;
  if(e.type==='result-corrected'&&e.targetEventId!==latest?.eventId||e.type==='correction-requested'&&e.targetEventId!==latest?.eventId||e.type==='completed'&&(completion||e.resultEventId!==latest?.eventId)||e.type==='completion-withdrawn'&&e.targetEventId!==completion?.eventId)return false;
  if(e.type==='result-recorded'||e.type==='result-corrected')latest=e;
  if(e.type==='completed')completion=e;
  if(e.type==='completion-withdrawn')completion=null;
  if(e.type==='correction-requested')requests.push(e);
  seen.add(e.eventId);prev=e.revision;
 }
 return equalEvent(h.result.latestResult,latest)&&equalEvent(h.result.completion,completion)&&requests.length===h.result.correctionRequests.length&&requests.every((e,i)=>equalEvent(e,h.result.correctionRequests[i]));
}
export const emptyHandoffDraft=():HandoffDraft=>({target:null,type:'result-recorded',text:'',reason:'',confirmed:false,scopeReviewed:false});
export function validHandoffDraft(d:any):d is HandoffDraft{return keys(d,['target','type','text','reason','confirmed','scopeReviewed'])&&(d.target===null||validHandoff(d.target))&&resultTypes.includes(d.type)&&typeof d.text==='string'&&typeof d.reason==='string'&&typeof d.confirmed==='boolean'&&typeof d.scopeReviewed==='boolean';}
export const copyHandoff=(h:Handoff):Handoff=>JSON.parse(JSON.stringify(h));
export function handoffChanged(d:HandoffDraft,h:Handoff|undefined){return !d.target||!h||d.target.id!==h.id||d.target.revision!==h.revision||d.target.ownerId!==h.ownerId||d.target.recipientId!==h.recipientId||d.target.acceptedBy!==h.acceptedBy||d.target.acceptanceEvidence!==h.acceptanceEvidence;}
export function permittedActions(h:Handoff,actor:string,role:string):ResultType[]{
 if(role==='rep'&&actor===h.ownerId)return h.result.latestResult?['correction-requested']:[];
 if(role!=='manager'||actor!==h.recipientId||actor!==h.acceptedBy||h.acceptanceEvidence!=='verified'||h.status!=='ACCEPTED')return [];
 const actions:ResultType[]=[];if(!h.result.completion)actions.push('result-recorded');if(h.result.latestResult)actions.push('result-corrected');
 const withdrawal=h.result.history.filter(e=>e.type==='completion-withdrawn').at(-1);
 if(!h.result.completion&&h.result.latestResult&&(!withdrawal||h.result.latestResult.revision>withdrawal.revision))actions.push('completed');
 if(h.result.completion)actions.push('completion-withdrawn');return actions;
}
export function jsonBytes(v:unknown){return new Blob([JSON.stringify(v)]).size;}
export function handoffCommand(d:HandoffDraft,h:Handoff,actor:string,role:string){
 if(!validHandoffDraft(d)||handoffChanged(d,h)||!permittedActions(h,actor,role).includes(d.type))throw Error('handoffInvalid');
 const event:any={type:d.type};
 if(['result-recorded','result-corrected','correction-requested'].includes(d.type)){if(!d.text.trim()||d.text.length>4000)throw Error('handoffInvalid');event.text=d.text;}
 if(['result-corrected','completion-withdrawn'].includes(d.type)){if(!d.reason.trim()||d.reason.length>1000)throw Error('handoffInvalid');event.reason=d.reason;}
 if(d.type==='completed'){if(!d.confirmed)throw Error('handoffInvalid');event.resultEventId=h.result.latestResult!.eventId;event.confirmation='person-confirmed-internal-complete';}
 if(d.type==='result-corrected'||d.type==='correction-requested')event.targetEventId=h.result.latestResult!.eventId;
 if(d.type==='completion-withdrawn')event.targetEventId=h.result.completion!.eventId;
 const body={expectedRevision:d.target!.revision,event};if(jsonBytes(body)>16384)throw Error('bodyTooLarge');return body;
}
export function validHandoffReceipt(result:any,body:any,id:string,actor:string):boolean{
 if(result?.schemaVersion!==1||result.objectType!=='handoff-result-event'||!validHandoff(result.handoff)||!validResultEvent(result.event)||result.handoff.id!==id||result.handoff.revision!==body.expectedRevision+1||result.event.revision!==result.handoff.revision||result.event.actorId!==actor)return false;
 const e=result.event;return Object.keys(body.event).every(k=>e[k as keyof ResultEvent]===body.event[k])&&equalEvent(result.handoff.result.history.at(-1),e);
}
