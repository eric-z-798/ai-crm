<script setup lang="ts">
import {computed,nextTick,onMounted,onBeforeUnmount,reactive,ref,watch} from 'vue';
import {api,ApiError} from './api';
import {copy} from './i18n';
import {followupCopy} from './followup-i18n';
import VisitHistory from './VisitHistory.vue';
import {correctionCopy} from './correction-i18n';
import HandoffResultEditor from './HandoffResultEditor.vue';
import {handoffCopy} from './handoff-i18n';
import {type Handoff,type HandoffDraft,type ResultType,emptyHandoffDraft,validHandoff,validHandoffDraft,copyHandoff,handoffChanged,handoffCommand,permittedActions,validHandoffReceipt,jsonBytes} from './handoff-contract';
import DeadlineEvidence from './DeadlineEvidence.vue';
import {emptyEventDraft,bindTarget,validEventDraft,restoreEventDraft,targetChanged,contentScopes} from './event-draft';
import {emptyReview,validReview,recordCommand,type Review} from './record-contract';
import {projectCommitment,type Commitment,type CommitmentView} from './domain/commitment';
type Visit={id:string;revision:number;status:'DRAFT'|'RECORDED';organization:string;occurredOn:string|null;organizationId?:null;notes:string;ownerId:string;createdAt:string;updatedAt:string};
type Pending={key:string;path:string;method:string;body:any;kind:'correction'|'handoff-event'|'save'|'confirm'|'handoff'|'receive'|'accept'|'record'|'commitment-event';role:string};
type RecoveryTarget={kind:'commitment'|'visit'|'handoff';id:string};
type ErrorState=({source:'ui';key:keyof typeof copy.zh;detail?:string}|{source:'followup';key:keyof typeof followupCopy.zh})&{recoveryTarget?:RecoveryTarget;handoffConflict?:{id:string;identity:string;expectedRevision:number}};
const lang=ref<'zh'|'en'>('zh'),t=computed(()=>copy[lang.value]),role=ref('rep'),visits=ref<Visit[]>([]),handoffs=ref<Handoff[]>([]),current=ref<Visit|null>(null),editing=ref(false),form=reactive({organization:'',occurredOn:'',notes:''}),request=ref(''),pending=ref<Pending|null>(null),busy=ref(false),loading=ref(false),error=ref<ErrorState|null>(null),notice=ref<''|'retained'|'success'|'handoffSuccess'|'localSaved'|'localFail'|'review'|'legacy'>(''),listError=ref(false),aiOpen=ref(false),latest=ref<Visit|null>(null),localOk=ref(true),composing=ref(false),context=ref<{id:string;role:string;tenant:string}|null>(null),tab=ref('visits');
const correcting=ref(false),correctionReviewed=ref(false),cc=computed(()=>correctionCopy[lang.value]);
const handoffDraft=reactive(emptyHandoffDraft()),upgradeRequired=ref(false),ht=computed(()=>handoffCopy[lang.value]);
const accessAllowed=ref(false); let accessEpoch=0;
const storageKey='aicrm-synthetic-slice-v2',legacyStorageKey='aicrm-synthetic-slice-v1';
const savedReview=ref<any|null>(null),savedReviewLoaded=ref(false);
const ft=computed(()=>followupCopy[lang.value]),review=ref<Review>(emptyReview()),commitments=ref<Commitment[]>([]),showCompleted=ref(false);
const eventDraft=reactive(emptyEventDraft());
const commitmentViews=computed(()=>commitments.value.map(c=>projectCommitment(c)).filter((r):r is {ok:true;value:CommitmentView}=>r.ok).map(r=>r.value));
const visibleCommitments=computed(()=>commitmentViews.value.filter(c=>showCompleted.value||c.completionStatus==='open'));
const relatedCommitments=computed(()=>current.value?.status==='RECORDED'&&context.value?commitmentViews.value.filter(c=>c.source.visitId===current.value!.id&&c.ownerId===context.value!.id):[]);
type SourcePanel={commitmentId:string;visitId:string;state:'loading'|'loaded'|'missing'|'failed';visit:Visit|null};
const sourcePanel=ref<SourcePanel|null>(null);let sourceReadSequence=0;
function closeSource(returnFocus=true){const id=sourcePanel.value?.commitmentId;sourceReadSequence++;sourcePanel.value=null;if(returnFocus&&id)nextTick(()=>document.getElementById('source-button-'+id)?.focus());}
watch([tab,role],()=>closeSource(false));
async function viewSource(id:string){
 if(!accessAllowed.value||!context.value||role.value!=='rep'||loading.value||listError.value)return;
 const c=commitmentViews.value.find(item=>item.id===id&&item.ownerId===context.value!.id);if(!c)return;
 const sequence=++sourceReadSequence,epoch=accessEpoch,identity=context.value.id;
 sourcePanel.value={commitmentId:id,visitId:c.source.visitId,state:c.source.visitId?'loading':'missing',visit:null};
 if(!c.source.visitId)return;
 try{
  const value=await api<Visit>(role.value,`/v2/visits/${encodeURIComponent(c.source.visitId)}`);
  if(sequence!==sourceReadSequence||epoch!==accessEpoch||!accessAllowed.value||context.value?.id!==identity)return;
  if(!value||value.id!==c.source.visitId||value.ownerId!==identity||value.status!=='RECORDED'||typeof value.organization!=='string'||typeof value.notes!=='string'||(value.occurredOn!==null&&typeof value.occurredOn!=='string'))throw Error('WRONG_SOURCE_RESULT');
  sourcePanel.value={commitmentId:id,visitId:c.source.visitId,state:'loaded',visit:value};
 }catch(e){
  if(sequence!==sourceReadSequence||epoch!==accessEpoch||!accessAllowed.value||context.value?.id!==identity)return;
  if(isAccessError(e)){revokeAccess();return;}
  sourcePanel.value={commitmentId:id,visitId:c.source.visitId,state:e instanceof ApiError&&e.status===404?'missing':'failed',visit:null};
 }
}
async function continueRelated(id:string){
 if(!accessAllowed.value||loading.value||listError.value||busy.value||pending.value||!relatedCommitments.value.some(c=>c.id===id))return;
 if(!selectCommitment(id))return;
 if(selectedCommitment.value?.completionStatus==='completed')showCompleted.value=true;
 tab.value='commitments';await nextTick();const history=document.getElementById('commitment-history-'+id) as HTMLDetailsElement|null;if(history)history.open=true;document.getElementById('commitment-action-'+id)?.focus();
}
const selectedCommitment=computed(()=>commitmentViews.value.find(c=>c.id===eventDraft.commitmentId));
const reviewDirty=computed(()=>review.value.checked||review.value.rows.length>0);
const eventDirty=computed(()=>!!eventDraft.commitmentId);
let legacyImported=false;const recoveryInitializing=ref(true);
const eventTargetChanged=computed(()=>targetChanged(eventDraft,selectedCommitment.value));
const replyScopes=computed(()=>contentScopes(selectedCommitment.value));
// Store system notice meaning, never a translation captured at response time.
const noticeText=computed(()=>notice.value==='handoffSuccess'?(request.value.trim()?t.value.handoffPreviousSaved:t.value.handoffSaved):notice.value==='localSaved'?ft.value.localSaved:notice.value==='legacy'?ft.value.legacy:notice.value?t.value[notice.value]:'');
// Translate only application-owned semantic keys; preserve external diagnostic codes verbatim.
const errorText=computed(()=>{const value=error.value;if(!value)return '';if(value.source==='followup')return ft.value[value.key];return t.value[value.key]+(value.detail===undefined?'':` (${value.detail})`);});
let alive=true,pageActive=true,lookupTimer:ReturnType<typeof setTimeout>|undefined;
let lookupController:AbortController|undefined,lookupDelay=1000;
const checkingReceipt=ref(false),receiptLookupScheduled=ref(false);
function clearLookupTimer(){if(lookupTimer!==undefined)clearTimeout(lookupTimer);lookupTimer=undefined;receiptLookupScheduled.value=false;}
function stopReceiptLookup(){clearLookupTimer();lookupController?.abort();}
function canLookup(){return alive&&pageActive&&document.visibilityState!=='hidden'&&accessAllowed.value&&!!pending.value&&!recoveryInitializing.value&&!upgradeRequired.value;}
function samePending(p:Pending,identity:string|undefined){return alive&&accessAllowed.value&&role.value===p.role&&context.value?.id===identity&&pending.value?.key===p.key;}
function scheduleReceiptLookup(delay=lookupDelay){
 clearLookupTimer();if(!canLookup())return;
 receiptLookupScheduled.value=true;
 lookupTimer=setTimeout(()=>{lookupTimer=undefined;receiptLookupScheduled.value=false;if(!canLookup())return;if(busy.value){scheduleReceiptLookup();return;}void checkResult(false,false);},delay);
}
watch([()=>pending.value?.key,accessAllowed,upgradeRequired],()=>{stopReceiptLookup();lookupDelay=1000;if(canLookup())scheduleReceiptLookup(0);},{flush:'sync'});
function pauseRecovery(){pageActive=false;stopReceiptLookup();}
function resumeRecovery(){pageActive=true;if(canLookup())scheduleReceiptLookup(0);}
function visibilityChanged(){if(document.visibilityState==='hidden')pauseRecovery();else resumeRecovery();}

const entryDay=computed(()=>new Intl.DateTimeFormat(lang.value==='zh'?'zh-CN':'en',{dateStyle:'medium'}).format(new Date()));

const recoveryIssue=ref<'preserved'|'blocked'|null>(null);
const unpreservedRecovery:{key:string;raw:string}[]=[];
const recoveryCopies=ref<{key:string;raw:string}[]>([]);
const recoveryReadFailed=ref(false);
const exportStatus=ref<'requested'|'failed'|null>(null);
// Never infer ownership from the currently selected role for unparseable text.
function mayExportRecovery(raw:string){
 if(!accessAllowed.value||!context.value||loading.value)return false;
 try{
  const value=JSON.parse(raw);
  if(!isObject(value)||value.identity!==context.value.id||value.role!==role.value)return false;
  if(value.current!==null&&(!isObject(value.current)||value.current.ownerId!==context.value.id||!visits.value.some(v=>v.id===value.current.id)))return false;
  if(value.pending!==null)return false;
  return true;
 }catch{return false}
}
const exportableRecovery=computed(()=>recoveryCopies.value.filter(entry=>mayExportRecovery(entry.raw)));
function collectRecoveryCopies(){
 const copies=new Map<string,string>();
 recoveryReadFailed.value=false;
 try{
  for(let i=0;i<sessionStorage.length;i++){
   const key=sessionStorage.key(i);
   if(key&&(key.startsWith(legacyStorageKey+'-')||key.startsWith(storageKey+'-legacy-')||key.startsWith(storageKey+'-invalid-')||key.startsWith(storageKey+'-held-rep-invalid-')||key.startsWith(storageKey+'-held-manager-invalid-'))){
    const raw=sessionStorage.getItem(key);if(raw!==null)copies.set(key,raw);
   }
  }
 }catch{localOk.value=false;recoveryReadFailed.value=true}
 for(const entry of unpreservedRecovery)copies.set(entry.key,entry.raw);
 recoveryCopies.value=[...copies].map(([key,raw])=>({key,raw}));
}
function exportRecovery(key:string){
 exportStatus.value=null;
 const entry=recoveryCopies.value.find(item=>item.key===key);
 if(!entry||!mayExportRecovery(entry.raw)){exportStatus.value='failed';return}
 let url:string|undefined;
 let anchor:HTMLAnchorElement|undefined;
 try{
  url=URL.createObjectURL(new Blob([entry.raw],{type:'text/plain;charset=utf-8'}));
  anchor=document.createElement('a');anchor.href=url;
  anchor.download='aicrm-recovery-'+key.replace(/[^a-zA-Z0-9-]/g,'_')+'.txt';
  document.body.appendChild(anchor);anchor.click();
  exportStatus.value='requested';
 }catch{exportStatus.value='failed'}
 finally{anchor?.remove();if(url)setTimeout(()=>URL.revokeObjectURL(url!),1000)}
}
const isObject=(value:any):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const validTime=(value:any)=>typeof value==='string'&&value.length>0&&Number.isFinite(Date.parse(value));
function recoveryVariant(value:any):'legacy'|'p23'|'p45'|'combined'|'invalid'{
 if(!isObject(value))return 'invalid';
 const correction=Object.hasOwn(value,'correcting'),handoff=Object.hasOwn(value,'handoffDraft');
 if(value.schemaVersion===5)return correction&&handoff?'combined':'invalid';
 if(value.schemaVersion===4)return correction!==handoff?(correction?'p23':'p45'):'invalid';
 return [undefined,1,2,3].includes(value.schemaVersion)&&!correction&&!handoff?'legacy':'invalid';
}
function validRecovery(value:any){
 const variant=recoveryVariant(value),hasCorrection=variant==='p23'||variant==='combined',hasHandoff=variant==='p45'||variant==='combined';
 if(variant==='invalid'||!['rep','manager'].includes(value.role)||typeof value.identity!=='string'||!['zh','en'].includes(value.lang)||typeof value.editing!=='boolean'||!['visits','handoffs','commitments'].includes(value.tab)||typeof value.request!=='string')return false;
 const fields=['organization','occurredOn','notes'];
 if(!isObject(value.form)||Object.keys(value.form).length!==fields.length||!fields.every(key=>typeof value.form[key]==='string'))return false;
 const record=value.current;
 if(record!==null&&(!isObject(record)||!['id','organization','notes','ownerId'].every(key=>typeof record[key]==='string')||(typeof record.occurredOn!=='string'&&record.occurredOn!==null)||!Number.isSafeInteger(record.revision)||record.revision<1||!['DRAFT','RECORDED'].includes(record.status)||!validTime(record.createdAt)||!validTime(record.updatedAt)))return false;
 if(!value.editing&&(record!==null||Object.values(value.form).some(Boolean)||value.request))return false;
 if([2,3,4,5].includes(value.schemaVersion)){if(!validReview(value.review)||!validEventDraft(value.eventDraft,value.schemaVersion===2))return false;const known=[...(hasCorrection?['correcting']:[]),...(hasHandoff?['handoffDraft']:[]),'schemaVersion','role','identity','lang','current','editing','form','request','pending','tab','review','eventDraft'];if(Object.keys(value).some(key=>!known.includes(key)))return false;}
 if(hasCorrection&&(typeof value.correcting!=='boolean'||value.correcting&&(!record||record.status!=='RECORDED'||record.ownerId!==value.identity||value.role!=='rep')))return false;
 if(hasHandoff&&(!validHandoffDraft(value.handoffDraft)||value.handoffDraft.target&&(value.role==='rep'?value.handoffDraft.target.ownerId!==value.identity:value.handoffDraft.target.recipientId!==value.identity)))return false;
 const command=value.pending;
 if(command?.kind==='correction'&&(!hasCorrection||!value.correcting||command.role!==value.role||command.method!=='POST'||command.path!==`/v2/visits/${encodeURIComponent(record.id)}/corrections`||command.body?.expectedRevision!==record.revision||typeof command.body.organization!=='string'||typeof command.body.notes!=='string'||command.body.occurredOn!==null&&typeof command.body.occurredOn!=='string'))return false;
 if(command?.kind==='handoff-event'){if(!hasHandoff||!value.handoffDraft.target||command.role!==value.role||command.method!=='POST'||command.path!==`/v2/handoffs/${encodeURIComponent(value.handoffDraft.target.id)}/events`)return false;try{const body=handoffCommand(value.handoffDraft,value.handoffDraft.target,value.identity,value.role);if(JSON.stringify(command.body)!==JSON.stringify(body))return false;}catch{return false;}}
 return command===null||(isObject(command)&&['key','path','method','role','kind'].every(key=>typeof command[key]==='string')&&isObject(command.body));
}
function preserveRejectedRecovery(){
 while(unpreservedRecovery.length){
  const entry=unpreservedRecovery[0];
  try{
   const prefix=entry.key+'-invalid-'+Date.now();let key=prefix,index=0;
   while(sessionStorage.getItem(key)!==null)key=prefix+'-'+(++index);
   sessionStorage.setItem(key,entry.raw);
   unpreservedRecovery.shift();
  }catch{recoveryIssue.value='blocked';localOk.value=false;collectRecoveryCopies();return false}
 }
 if(recoveryIssue.value)recoveryIssue.value='preserved';
 collectRecoveryCopies();
 return true;
}
function readRecovery(raw:string,key:string){
 try{const value=JSON.parse(raw);if(validRecovery(value))return value}catch{/* Preserve malformed bytes without interpreting or rewriting them. */}
 if(!unpreservedRecovery.some(entry=>entry.key===key&&entry.raw===raw))unpreservedRecovery.push({key,raw});
 recoveryIssue.value='blocked';preserveRejectedRecovery();return null;
}
const heldInMemory=new Map<string,any>();
const snapshot=()=>({organization:form.organization,occurredOn:form.occurredOn,notes:form.notes});
const dirty=computed(()=>!!handoffDraft.target||reviewDirty.value||eventDirty.value||editing.value&&(!current.value?Object.values(snapshot()).some(Boolean):JSON.stringify(snapshot())!==JSON.stringify({organization:current.value.organization,occurredOn:current.value.occurredOn??'',notes:current.value.notes})));
const editable=computed(()=>accessAllowed.value&&role.value==='rep'&&current.value?.status!=='RECORDED');
const statusText=computed(()=>(pending.value?.kind==='handoff-event'||pending.value?.kind==='correction')?t.value.pending:dirty.value?t.value.unsaved:current.value?.status==='RECORDED'?t.value.immutable:current.value?t.value.saved:t.value.fresh);
const formatTime=(date:unknown)=>validTime(date)?new Intl.DateTimeFormat(lang.value==='zh'?'zh-CN':'en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(date as string)):t.value.timeUnavailable;
const formatReplyTime=(date:unknown)=>validTime(date)?new Date(date as string).toISOString()+' (UTC)':t.value.timeUnavailable;
function recoverySnapshot(){return {schemaVersion:5,correcting:correcting.value,handoffDraft:{...handoffDraft},review:review.value,eventDraft:{...eventDraft},role:role.value,identity:context.value?.id,lang:lang.value,current:current.value,editing:editing.value,form:snapshot(),request:request.value,pending:pending.value,tab:tab.value}}
function persist():boolean{if(!alive||recoveryInitializing.value||!accessAllowed.value)return false;if(!preserveRejectedRecovery())return false;try{const raw=JSON.stringify(recoverySnapshot());sessionStorage.setItem(storageKey,raw);if(sessionStorage.getItem(storageKey)!==raw)throw Error('STORAGE_READBACK_MISMATCH');localOk.value=true;return true}catch{localOk.value=false;return false}}
function restoreCandidate(s:any){if(!validRecovery(s))return false;if(!accessAllowed.value||s.role!==role.value||s.identity!==context.value?.id||s.current&&!visits.value.some(v=>v.id===s.current.id))return false;const variant=recoveryVariant(s),hasHandoff=variant==='p45'||variant==='combined';if(hasHandoff&&s.handoffDraft.target&&!handoffs.value.some(h=>h.id===s.handoffDraft.target.id))return false;correcting.value=(variant==='p23'||variant==='combined')&&s.correcting;Object.assign(handoffDraft,hasHandoff?s.handoffDraft:emptyHandoffDraft());current.value=s.current;editing.value=s.editing;Object.assign(form,s.form);request.value=s.request;pending.value=s.pending;review.value=[2,3,4,5].includes(s.schemaVersion)?s.review:emptyReview();Object.assign(eventDraft,[2,3,4,5].includes(s.schemaVersion)?restoreEventDraft(s.eventDraft):emptyEventDraft());tab.value=s.tab;notice.value='retained';return true}
function protectLegacy(raw:string,key:string){try{const target=storageKey+'-legacy-'+key;const previous=sessionStorage.getItem(target);if(previous===null)sessionStorage.setItem(target,raw);else if(previous!==raw)sessionStorage.setItem(target+'-'+Date.now(),raw);}catch{if(!unpreservedRecovery.some(e=>e.key===key&&e.raw===raw))unpreservedRecovery.push({key,raw});recoveryIssue.value='blocked';localOk.value=false;}}
function restoreQuarantine(){if(recoveryInitializing.value||editing.value||pending.value||dirty.value)return;try{let key=storageKey+'-held-'+role.value;let raw=sessionStorage.getItem(key);if(raw===null){key=legacyStorageKey+'-held-'+role.value;raw=sessionStorage.getItem(key);if(raw!==null)protectLegacy(raw,key);}if(raw!==null)protectLegacy(raw,key);const held=heldInMemory.get(role.value)??(raw?readRecovery(raw,key):null);if(held&&restoreCandidate(held)){heldInMemory.delete(role.value)}}catch{localOk.value=false}}
watch(()=>selectedCommitment.value?.revision,()=>{eventDraft.scopeReviewed=false;});
watch([correcting,handoffDraft,form,current,editing,request,pending,role,lang,tab,review,eventDraft],persist,{deep:true});
watch([()=>current.value?.id,()=>current.value?.status,accessAllowed],async()=>{savedReview.value=null;savedReviewLoaded.value=false;const id=current.value?.id;if(!id||current.value?.status!=='RECORDED'||!accessAllowed.value)return;try{const result=await api<any>(role.value,`/v2/visits/${id}/review`);if(accessAllowed.value&&current.value?.id===id){if(result.objectType!=='record-review'||result.visitId!==id)throw Error('WRONG_REVIEW_RESULT');savedReview.value=result.followUpReview;savedReviewLoaded.value=true;}}catch(e){if(isAccessError(e))revokeAccess();else if(current.value?.id===id)error.value=explain(e);}});
watch(lang,()=>{document.documentElement.lang=lang.value==='zh'?'zh-CN':'en';document.title='AICRM · '+t.value.workspace});
function isolateEditor(){if(!alive)return;if(dirty.value||request.value.trim()||pending.value){const held=recoverySnapshot();heldInMemory.set(role.value,held);try{sessionStorage.setItem(storageKey+'-held-'+role.value,JSON.stringify(held))}catch{localOk.value=false}}correcting.value=false;Object.assign(handoffDraft,emptyHandoffDraft());closeHandoffBackground();current.value=null;latest.value=null;editing.value=false;pending.value=null;request.value='';Object.assign(form,{organization:'',occurredOn:'',notes:''});review.value=emptyReview();Object.assign(eventDraft,emptyEventDraft());notice.value='';try{sessionStorage.removeItem(storageKey)}catch{localOk.value=false}}
function revokeAccess(){if(!alive)return;closeSource(false);if(dirty.value||request.value.trim()||pending.value)heldInMemory.set(role.value,recoverySnapshot());try{if(heldInMemory.has(role.value))sessionStorage.setItem(storageKey+'-held-'+role.value,JSON.stringify(heldInMemory.get(role.value)))}catch{localOk.value=false}accessEpoch++;correcting.value=false;Object.assign(handoffDraft,emptyHandoffDraft());closeHandoffBackground();accessAllowed.value=false;visits.value=[];handoffs.value=[];commitments.value=[];current.value=null;latest.value=null;context.value=null;editing.value=false;pending.value=null;request.value='';Object.assign(form,{organization:'',occurredOn:'',notes:''});review.value=emptyReview();Object.assign(eventDraft,emptyEventDraft());notice.value='';error.value={source:'ui',key:'accessChanged'};try{sessionStorage.removeItem(storageKey)}catch{localOk.value=false}}
function isAccessError(e:unknown){return e instanceof ApiError&&(e.status===401||e.status===403)}
function blockUpgrade(){upgradeRequired.value=true;stopReceiptLookup();error.value={source:'ui',key:'upgradeRequired'};}
function explain(e:unknown):ErrorState{if(e instanceof ApiError){if(e.status===426)return {source:'ui',key:'upgradeRequired'};if(e.status===409)return {source:'ui',key:'conflict'};return {source:'ui',key:'error',detail:e.status===401||e.status===403?`${e.status}: ${e.code}`:e.code}}return {source:'ui',key:'unknown'}}
async function load(){closeSource(false);closeHandoffBackground();const epoch=++accessEpoch,refreshError=error.value,refreshIdentity=context.value?.id;loading.value=true;listError.value=false;try{const ctx=await api<{id:string;role:string;tenant:string}>(role.value,'/context');const [v,h,c]=await Promise.all([api<Visit[]>(role.value,'/v2/visits'),api<Handoff[]>(role.value,'/v2/handoffs'),role.value==='rep'?api<Commitment[]>(role.value,'/v2/commitments'):Promise.resolve([])]);if(!Array.isArray(h)||h.some(item=>!validHandoff(item)||(ctx.role==='REP'?item.ownerId!==ctx.id:item.recipientId!==ctx.id)))throw Error('INVALID_HANDOFF_RESULT');if(c.some(item=>!projectCommitment(item).ok))throw Error('INVALID_COMMITMENT_RESULT');if(!alive||epoch!==accessEpoch)return;const identityChanged=!!context.value&&context.value.id!==ctx.id;const selectedUnavailable=!!current.value&&!v.some(item=>item.id===current.value!.id)||!!handoffDraft.target&&!h.some(item=>item.id===handoffDraft.target!.id);if(identityChanged||selectedUnavailable){isolateEditor();error.value={source:'ui',key:'scopeChanged'}}if(latest.value&&!v.some(item=>item.id===latest.value!.id))latest.value=null;upgradeRequired.value=false;context.value=ctx;visits.value=v;handoffs.value=h;commitments.value=c;accessAllowed.value=true;if(error.value===refreshError&&refreshIdentity===ctx.id&&ctx.role==='MANAGER'&&refreshError?.handoffConflict){const target=refreshError.handoffConflict;const found=h.find(item=>item.id===target.id);if(target.identity===ctx.id&&found&&Number.isSafeInteger(found.revision)&&found.revision>target.expectedRevision&&['SENT','RECEIVED','ACCEPTED'].includes(found.status))error.value=null;}restoreQuarantine()}catch(e){if(!alive||epoch!==accessEpoch)return;if(isAccessError(e))revokeAccess();if(e instanceof ApiError&&e.status===426)blockUpgrade();listError.value=true}finally{if(alive&&epoch===accessEpoch){loading.value=false;exportStatus.value=null;collectRecoveryCopies()}}}
function leaveAllowed(){return !pending.value&&!busy.value&&(!(dirty.value||request.value.trim())||window.confirm(t.value.discard))}
function open(v:Visit){if(!accessAllowed.value||!leaveAllowed())return;correcting.value=false;Object.assign(handoffDraft,emptyHandoffDraft());review.value=emptyReview();Object.assign(eventDraft,emptyEventDraft());current.value={...v};Object.assign(form,{organization:v.organization,occurredOn:v.occurredOn??'',notes:v.notes});editing.value=true;error.value=null;notice.value='';latest.value=null;request.value=''}
function fresh(){if(!accessAllowed.value||!leaveAllowed())return;correcting.value=false;Object.assign(handoffDraft,emptyHandoffDraft());review.value=emptyReview();Object.assign(eventDraft,emptyEventDraft());current.value=null;Object.assign(form,{organization:'',occurredOn:'',notes:''});editing.value=true;request.value='';error.value=null;notice.value='';latest.value=null;tab.value='visits';nextTick(()=>document.getElementById('organization')?.focus())}
async function switchRole(event:Event){const target=event.target as HTMLSelectElement;if(!leaveAllowed()){target.value=role.value;return}accessAllowed.value=false;accessEpoch++;review.value=emptyReview();Object.assign(eventDraft,emptyEventDraft());correcting.value=false;Object.assign(handoffDraft,emptyHandoffDraft());closeHandoffBackground();role.value=target.value;current.value=null;editing.value=false;Object.assign(form,{organization:'',occurredOn:'',notes:''});request.value='';visits.value=[];handoffs.value=[];commitments.value=[];context.value=null;error.value=null;notice.value='';latest.value=null;tab.value=role.value==='manager'?'handoffs':'visits';await load()}
function updateResult(p:Pending,result:any){
 if(!accessAllowed.value)return;
 if(p.kind==='correction'){
  const id=decodeURIComponent(p.path.split('/')[3]??'');
  if(!validCorrectedVisit(result,id,context.value?.id)||result.revision!==p.body.expectedRevision+1||result.organization!==p.body.organization||result.notes!==p.body.notes||result.occurredOn!==p.body.occurredOn)throw Error('WRONG_CORRECTION_RESULT');
  if(current.value?.id!==id||!correcting.value)throw Error('CORRECTION_TARGET_CHANGED');
  const newer=visits.value.find(v=>v.id===id&&v.revision>result.revision);
  const resolved=newer??result;current.value=resolved;Object.assign(form,{organization:resolved.organization,occurredOn:resolved.occurredOn??'',notes:resolved.notes});correcting.value=false;
 }
 if(p.kind==='handoff-event'){
  const id=decodeURIComponent(p.path.split('/')[3]??''),identity=context.value?.id;if(!identity||!validHandoffReceipt(result,p.body,id,identity)||!handoffDraft.target||handoffDraft.target.id!==id||result.handoff.ownerId!==handoffDraft.target.ownerId||result.handoff.recipientId!==handoffDraft.target.recipientId||result.handoff.visitId!==handoffDraft.target.visitId||result.handoff.request!==handoffDraft.target.request)throw Error('WRONG_HANDOFF_RESULT');
  const index=handoffs.value.findIndex(h=>h.id===id);if(index>=0&&handoffs.value[index]!.revision<=result.handoff.revision)handoffs.value[index]=result.handoff;
  if(handoffDraft.target?.id===id&&handoffDraft.target.revision===p.body.expectedRevision){try{const submitted=handoffCommand(handoffDraft,handoffDraft.target,identity,p.role);if(JSON.stringify(submitted)===JSON.stringify(p.body))Object.assign(handoffDraft,emptyHandoffDraft());}catch{/* Keep a changed draft. */}}
 }
 if(p.kind==='record'){
  if(result?.schemaVersion!==2||result?.objectType!=='record-with-commitments'||!result.visit||!Array.isArray(result.commitments)||result.commitments.some((c:any)=>!projectCommitment(c).ok))throw Error('WRONG_RESULT_TYPE');
  current.value=result.visit;editing.value=true;Object.assign(form,{organization:result.visit.organization,occurredOn:result.visit.occurredOn??'',notes:result.visit.notes});review.value=emptyReview();
 }
 if(p.kind==='commitment-event'){if(!projectCommitment(result).ok)throw Error('WRONG_RESULT_TYPE');const idx=commitments.value.findIndex(c=>c.id===result.id);if(idx<0)commitments.value.push(result);else commitments.value[idx]=result;Object.assign(eventDraft,emptyEventDraft());}
 if(p.kind==='save'||p.kind==='confirm'){
  current.value=result; editing.value=true;
  // The receipt describes the submitted snapshot; never overwrite newer input.
  if(p.kind==='confirm')Object.assign(form,{organization:result.organization,occurredOn:result.occurredOn??'',notes:result.notes});
 }
 if(p.kind==='handoff'&&request.value===p.body.request)request.value='';
 pending.value=null;notice.value=p.kind==='handoff'?'handoffSuccess':'success';error.value=null;latest.value=null;persist();
}
function refreshCorrectedProjection(p:Pending,identity:string|undefined){if(p.kind!=='correction'||!alive||!accessAllowed.value||context.value?.id!==identity||correcting.value||current.value?.id!==decodeURIComponent(p.path.split('/')[3]??''))return;const value=visits.value.find(v=>v.id===current.value!.id);if(value&&validCorrectedVisit(value,current.value.id,identity)&&value.revision>current.value.revision){current.value=value;Object.assign(form,{organization:value.organization,occurredOn:value.occurredOn??'',notes:value.notes});persist();}}
async function perform(p:Pending){
 if(!alive||!accessAllowed.value||pending.value?.key!==p.key||upgradeRequired.value)return;
 if(!persist()){clearLookupTimer();error.value={source:'followup',key:'persistRequired'};return;}
 clearLookupTimer();const identity=context.value?.id;busy.value=true;error.value=null;notice.value='';
 try{const result=await api(p.role,p.path,p.method,p.body,p.key);if(!samePending(p,identity))return;updateResult(p,result);await load();refreshCorrectedProjection(p,identity);}
 catch(e){if(!samePending(p,identity))return;if(isAccessError(e)){revokeAccess();return;}if(e instanceof ApiError&&e.status===426){blockUpgrade();return;}error.value=explain(e);if(e instanceof ApiError&&e.status===409&&p.kind==='handoff-event'){error.value.recoveryTarget={kind:'handoff',id:decodeURIComponent(p.path.split('/')[3]??'')};}else if(e instanceof ApiError&&e.status===409){const handoffMatch=p.path.match(/^\/handoffs\/([^/]+)\/(receive|accept)$/);if((p.kind==='receive'||p.kind==='accept')&&handoffMatch&&handoffMatch[2]===p.kind&&identity&&Number.isSafeInteger(p.body?.expectedRevision)&&p.body.expectedRevision>0&&['REVISION_CONFLICT','INVALID_TRANSITION'].includes(e.code)){error.value={source:'ui',key:'handoffConflict',handoffConflict:{id:decodeURIComponent(handoffMatch[1]!),identity,expectedRevision:p.body.expectedRevision}};}else {const match=p.path.match(/^\/v2\/commitments\/([^/]+)\/events$/);if(p.kind==='commitment-event'&&match)error.value.recoveryTarget={kind:'commitment',id:decodeURIComponent(match[1]!)};else if(current.value)error.value.recoveryTarget={kind:'visit',id:current.value.id};}}if(e instanceof ApiError&&e.status<500){pending.value=null;persist();}}
 finally{busy.value=false;if(canLookup())scheduleReceiptLookup(0);}
}
async function mutate(kind:Pending['kind'],path:string,method:string,body:any){if(!accessAllowed.value||busy.value||pending.value||upgradeRequired.value)return;if(jsonBytes(body)>16384){error.value={source:'ui',key:'bodyTooLarge'};return;}const p={kind,path,method,body,key:crypto.randomUUID(),role:role.value};pending.value=p;if(!persist()){clearLookupTimer();error.value={source:'followup',key:'persistRequired'};return;}await perform(p)}
async function save(){if(composing.value)return;if(!['organization','occurredOn','notes'].every(key=>typeof form[key as keyof typeof form]==='string')){error.value={source:'ui',key:'invalidDraft'};return}persist();notice.value=localOk.value?'localSaved':'localFail';}
async function confirmRecord(){if(!accessAllowed.value||!editable.value||!context.value)return;try{const body=recordCommand(snapshot(),review.value,current.value,context.value.id);await mutate('record','/v2/visits/record','POST',body)}catch{error.value={source:'followup',key:'invalid'}}}
function historicalWording(c:CommitmentView,index:number){
 let text='';for(const event of c.history.slice(0,index+1))if((event.type==='created'||event.type==='amended')&&event.commitmentText!==undefined)text=event.commitmentText;
 return text;
}
function addReview(){review.value.rows.push({id:crypto.randomUUID(),kind:'unconfirmed',text:'',confirmed:false,deadlineKind:'unknown',deadlineValue:''});review.value.checked=false;}
function removeReview(index:number){if(window.confirm(ft.value.removeConfirm)){review.value.rows.splice(index,1);review.value.checked=false}}
function selectCommitment(id:string){if(!accessAllowed.value||busy.value||pending.value)return false;if(eventDraft.commitmentId===id)return true;if(eventDirty.value&&!window.confirm(ft.value.editDiscard))return false;const selected=commitmentViews.value.find(c=>c.id===id);if(!selected)return false;Object.assign(eventDraft,emptyEventDraft(),{commitmentId:id,type:selected.completionStatus==='completed'?'reply-recorded':'progress-recorded',target:bindTarget(selected)});return true;}
function cancelEvent(){if(!window.confirm(ft.value.editDiscard))return;Object.assign(eventDraft,emptyEventDraft());}
function rebindEventTarget(){if(!selectedCommitment.value||!eventDraft.scopeReviewed)return;eventDraft.target=bindTarget(selectedCommitment.value);eventDraft.scopeReviewed=false;eventDraft.confirmed=false;error.value=null;}
function eventTypeChanged(){eventDraft.confirmed=false;eventDraft.replyScope='';}
async function appendEvent(){const selected=selectedCommitment.value,target=eventDraft.target;if(!selected||!accessAllowed.value)return;if(!target||eventTargetChanged.value){error.value={source:'followup',key:'targetConflict'};return;}let event:any={eventId:crypto.randomUUID(),type:eventDraft.type,contentRevision:target.contentRevision};
 if(event.type==='progress-recorded')Object.assign(event,{status:eventDraft.status,text:eventDraft.text});
 else if(event.type==='reply-recorded'){const scope=Number(eventDraft.replyScope);if(!eventDraft.replyScope||!replyScopes.value.some(s=>s.contentRevision===scope)){error.value={source:'followup',key:'replyScopeRequired'};return;}Object.assign(event,{contentRevision:scope,direction:eventDraft.direction,occurredAt:eventDraft.occurredAt,text:eventDraft.text});}
 else if(event.type==='completed'){if(!eventDraft.confirmed){error.value={source:'followup',key:'invalid'};return}Object.assign(event,{confirmation:'person-confirmed-complete',text:eventDraft.text});}
 else if(event.type==='reopened')Object.assign(event,{reason:eventDraft.reason});
 else if(event.type==='amended'){Object.assign(event,{reason:eventDraft.reason});if(eventDraft.newText){event.commitmentText=eventDraft.newText;if(eventDraft.newText!==target.commitmentText)event.contentRevision++;}if(eventDraft.changeDeadline)event.deadline=eventDraft.deadlineKind==='unknown'?{kind:'unknown'}:eventDraft.deadlineKind==='date'?{kind:'date',date:eventDraft.deadlineValue}:{kind:'instant',at:eventDraft.deadlineValue};}
 await mutate('commitment-event',`/v2/commitments/${selected.id}/events`,'POST',{schemaVersion:2,expectedRevision:target.revision,event});
}
function eventTitle(type:string){return ({created:ft.value.explicit,amended:ft.value.amend,'progress-recorded':ft.value.progress,'reply-recorded':ft.value.reply,completed:ft.value.complete,reopened:ft.value.reopen} as Record<string,string>)[type]??type;}
function verificationLabel(status:string){return status==='verified'?ft.value.verified:status==='in-progress'?ft.value.inProgress:ft.value.notStarted;}

async function sendHandoff(){if(request.value.length>2000){error.value={source:'ui',key:'requestLengthError'};return}if(!current.value||!request.value.trim())return;await mutate('handoff',`/visits/${current.value.id}/handoffs`,'POST',{expectedRevision:current.value.revision,request:request.value})}
async function checkResult(retryIfMissing=false,manual=true){
 if(manual&&upgradeRequired.value)upgradeRequired.value=false;
 if(!canLookup()||busy.value)return;
 clearLookupTimer();const original=pending.value!,identity=context.value?.id,controller=new AbortController();
 lookupController=controller;checkingReceipt.value=true;busy.value=true;let retry=false;
 try{
  const result=await api(original.role,`/commands/${original.key}`,'GET',undefined,undefined,controller.signal);
  if(controller.signal.aborted||!samePending(original,identity))return;
  updateResult(original,result);await load();refreshCorrectedProjection(original,identity);
 }catch(e){
  if(controller.signal.aborted||!samePending(original,identity))return;
  if(isAccessError(e)){revokeAccess();return;}
  if(e instanceof ApiError&&e.status===426){blockUpgrade();return;}
  if(e instanceof ApiError&&e.status===404){error.value={source:'ui',key:'notFound'};retry=retryIfMissing;}else error.value=explain(e);
 }finally{
  if(lookupController===controller)lookupController=undefined;
  checkingReceipt.value=false;busy.value=false;
  if(!retry&&canLookup()){scheduleReceiptLookup();lookupDelay=Math.min(lookupDelay*2,10000);}
 }
 // Only an explicit user retry may write, and it reuses the complete original command.
 if(retry&&!controller.signal.aborted&&samePending(original,identity)&&pageActive)await perform(original);
}
async function showLatest(){
 const failure=error.value,target=failure?.recoveryTarget??(current.value?{kind:'visit' as const,id:current.value.id}:null);
 if(!target||!accessAllowed.value||busy.value||pending.value)return;
 if(target.kind==='handoff'){await refreshHandoff(target.id);return;}
 const epoch=accessEpoch,identity=context.value?.id;
 const stillCurrent=()=>alive&&accessAllowed.value&&epoch===accessEpoch&&context.value?.id===identity&&error.value===failure&&(target.kind==='commitment'?eventDraft.commitmentId===target.id:current.value?.id===target.id);
 busy.value=true;
 try{
  if(target.kind==='commitment'){
   const all=await api<Commitment[]>(role.value,'/v2/commitments');
   if(!stillCurrent())return;
   const value=all.find(c=>c.id===target.id),projected=value&&projectCommitment(value);
   if(!projected?.ok||projected.value.ownerId!==identity){error.value={source:'ui',key:'scopeChanged',recoveryTarget:target};return;}
   // Refresh only the server projection. The draft and its old binding stay intact
   // until the user explicitly compares and rebinds through the existing controls.
   const index=commitments.value.findIndex(c=>c.id===target.id);
   if(index<0)commitments.value.push(value!);else commitments.value[index]=value!;
   latest.value=null;
  }else{
   const all=await api<Visit[]>(role.value,'/v2/visits');
   if(!stillCurrent())return;
   const found=all.find(v=>v.id===target.id)??null;if(correcting.value&&found&&!validCorrectedVisit(found,target.id,identity)){error.value={source:'ui',key:'scopeChanged',recoveryTarget:target};return;}latest.value=found;visits.value=all;
   if(!latest.value){isolateEditor();error.value={source:'ui',key:'scopeChanged'}}
  }
 }catch(e){if(!stillCurrent())return;if(isAccessError(e))revokeAccess();else error.value={...explain(e),recoveryTarget:target};}
 finally{busy.value=false}
}
function rebase(){if(!latest.value)return;if(correcting.value){if(!correctionReviewed.value||!validCorrectedVisit(latest.value,current.value?.id,context.value?.id))return;current.value=latest.value;latest.value=null;correctionReviewed.value=false;error.value=null;persist();return;}if(latest.value.status==='RECORDED'){error.value={source:'ui',key:'serverRecorded'};return}current.value=latest.value;latest.value=null;error.value=null;notice.value='review'}

function validCorrectedVisit(v:any,id:string|undefined,owner:string|undefined):v is Visit{return !!v&&v.id===id&&v.ownerId===owner&&v.status==='RECORDED'&&Number.isSafeInteger(v.revision)&&v.revision>0&&typeof v.organization==='string'&&typeof v.notes==='string'&&(v.occurredOn===null||typeof v.occurredOn==='string')&&validTime(v.createdAt)&&validTime(v.updatedAt);}
const canCorrect=computed(()=>accessAllowed.value&&role.value==='rep'&&context.value?.role==='REP'&&current.value?.ownerId===context.value?.id&&current.value?.status==='RECORDED');
function beginCorrection(){if(!canCorrect.value||busy.value||pending.value||loading.value||listError.value||upgradeRequired.value)return;correcting.value=true;correctionReviewed.value=false;latest.value=null;error.value=null;nextTick(()=>document.getElementById('organization')?.focus());}
function cancelCorrection(){if(busy.value||pending.value||!current.value)return;if(dirty.value&&!window.confirm(t.value.discard))return;Object.assign(form,{organization:current.value.organization,occurredOn:current.value.occurredOn??'',notes:current.value.notes});correcting.value=false;latest.value=null;error.value=null;}
async function saveCorrection(){if(!canCorrect.value||!correcting.value||!current.value||composing.value||latest.value||loading.value||listError.value||upgradeRequired.value)return;const value=snapshot();if(!value.organization.trim()||!value.notes.trim()||value.organization.length>200||value.notes.length>4000||value.occurredOn&&(!/^\d{4}-\d{2}-\d{2}$/.test(value.occurredOn)||!Number.isFinite(Date.parse(value.occurredOn+'T00:00:00Z'))||new Date(value.occurredOn+'T00:00:00Z').toISOString().slice(0,10)!==value.occurredOn)){error.value={source:'followup',key:'invalid'};return;}await mutate('correction',`/v2/visits/${encodeURIComponent(current.value.id)}/corrections`,'POST',{expectedRevision:current.value.revision,...value,occurredOn:value.occurredOn||null});}
watch([latest,()=>current.value?.id],()=>{correctionReviewed.value=false;});


const selectedHandoff=computed(()=>handoffs.value.find(h=>h.id===handoffDraft.target?.id));
function selectHandoffAction(id:string,type:ResultType){if(!accessAllowed.value||busy.value||pending.value||upgradeRequired.value||loading.value||listError.value)return;const h=handoffs.value.find(v=>v.id===id);if(!h||!context.value||!permittedActions(h,context.value.id,role.value).includes(type))return;if(handoffDraft.target&&handoffDraft.target.id!==id&&!window.confirm(t.value.discard))return;Object.assign(handoffDraft,emptyHandoffDraft(),{target:copyHandoff(h),type});notice.value='';error.value=null;}
function patchHandoff(value:Partial<HandoffDraft>){if(busy.value||pending.value)return;Object.assign(handoffDraft,value);}
function cancelHandoff(){if(busy.value||pending.value||!window.confirm(t.value.discard))return;Object.assign(handoffDraft,emptyHandoffDraft());error.value=null;}
function rebindHandoff(){const h=selectedHandoff.value;if(!h||!handoffDraft.scopeReviewed||busy.value||pending.value)return;handoffDraft.target=copyHandoff(h);handoffDraft.scopeReviewed=false;handoffDraft.confirmed=false;error.value=null;}
async function submitHandoff(){if(!selectedHandoff.value||!context.value)return;try{const body=handoffCommand(handoffDraft,selectedHandoff.value,context.value.id,role.value);await mutate('handoff-event',`/v2/handoffs/${encodeURIComponent(selectedHandoff.value.id)}/events`,'POST',body);}catch(e){error.value={source:'ui',key:e instanceof Error&&e.message==='bodyTooLarge'?'bodyTooLarge':'handoffInvalid'};}}
let handoffReadSequence=0;
async function refreshHandoff(id:string){if(!accessAllowed.value||busy.value||pending.value||!context.value)return;const n=++handoffReadSequence,epoch=accessEpoch,identity=context.value.id,currentRole=role.value;busy.value=true;try{const h=await api<Handoff>(currentRole,`/v2/handoffs/${encodeURIComponent(id)}`);if(!alive||n!==handoffReadSequence||epoch!==accessEpoch||!accessAllowed.value||identity!==context.value?.id||role.value!==currentRole)return;if(!validHandoff(h)||h.id!==id||(currentRole==='rep'?h.ownerId!==identity:h.recipientId!==identity))throw Error('WRONG_HANDOFF_RESULT');const i=handoffs.value.findIndex(v=>v.id===id);if(i>=0&&handoffs.value[i]!.revision<=h.revision)handoffs.value[i]=h;handoffDraft.scopeReviewed=false;handoffDraft.confirmed=false;}catch(e){if(!alive||n!==handoffReadSequence||epoch!==accessEpoch||identity!==context.value?.id)return;if(isAccessError(e))revokeAccess();else if(e instanceof ApiError&&e.status===426)blockUpgrade();else error.value={...explain(e),recoveryTarget:{kind:'handoff',id}};}finally{busy.value=false;}}
const handoffBackground=ref<{id:string;state:'loading'|'loaded'|'failed';visit:Visit|null}|null>(null);let backgroundSequence=0;
function closeHandoffBackground(){backgroundSequence++;handoffBackground.value=null;}
watch([role,tab],()=>closeHandoffBackground());
async function viewHandoffBackground(id:string){if(!accessAllowed.value||busy.value||pending.value||loading.value||listError.value)return;const h=handoffs.value.find(v=>v.id===id);if(!h)return;const n=++backgroundSequence,epoch=accessEpoch,identity=context.value?.id;handoffBackground.value={id,state:'loading',visit:null};try{const v=await api<Visit>(role.value,`/v2/visits/${encodeURIComponent(h.visitId)}`);if(!alive||n!==backgroundSequence||epoch!==accessEpoch||identity!==context.value?.id||!accessAllowed.value)return;if(!v||v.id!==h.visitId||v.ownerId!==h.ownerId||v.status!=='RECORDED'||typeof v.notes!=='string'||typeof v.organization!=='string')throw Error('WRONG_BACKGROUND');handoffBackground.value={id,state:'loaded',visit:v};}catch(e){if(!alive||n!==backgroundSequence||epoch!==accessEpoch||identity!==context.value?.id)return;if(isAccessError(e))revokeAccess();else if(e instanceof ApiError&&e.status===426)blockUpgrade();else handoffBackground.value={id,state:'failed',visit:null};}}
function goHandoff(id:string){if(busy.value||pending.value)return;tab.value='handoffs';nextTick(()=>document.getElementById('handoff-card-'+id)?.scrollIntoView?.());}

function changeLanguage(){if(composing.value)return;const focused=document.activeElement as HTMLElement;lang.value=lang.value==='zh'?'en':'zh';nextTick(()=>focused?.focus())}
onMounted(async()=>{
 let recovered:any=null;
 try{
  let sourceKey=storageKey,raw=sessionStorage.getItem(storageKey);
  if(raw===null){sourceKey=legacyStorageKey;raw=sessionStorage.getItem(legacyStorageKey);if(raw!==null)legacyImported=true;}
  // Preserve exact main bytes before any watcher can serialize a replacement or restore an older held draft.
  if(raw!==null){protectLegacy(raw,sourceKey);recovered=readRecovery(raw,sourceKey);if(recovered){role.value=recovered.role;lang.value=recovered.lang;}}
 }catch{localOk.value=false;}
 await load();
 if(!alive)return;
 let restored=false;
 if(accessAllowed.value&&recovered)restored=restoreCandidate(recovered);else if(recovered)heldInMemory.set(recovered.role,recovered);
 // Main recovery has priority. Other held originals remain separately available; startup cannot consume them first.
 recoveryInitializing.value=false;
 if(accessAllowed.value&&!restored)restoreQuarantine();
 if(legacyImported&&restored)notice.value='legacy';
 if(accessAllowed.value)persist();
 if(accessAllowed.value&&pending.value)await checkResult();
});
function beforeUnload(e:BeforeUnloadEvent){if(dirty.value||pending.value||request.value.trim()){e.preventDefault();e.returnValue=''}}
window.addEventListener('aicrm-contract-required',blockUpgrade);
window.addEventListener('beforeunload',beforeUnload);
window.addEventListener('pagehide',pauseRecovery);
window.addEventListener('pageshow',resumeRecovery);
document.addEventListener('visibilitychange',visibilityChanged);
onBeforeUnmount(()=>{alive=false;handoffReadSequence++;closeHandoffBackground();stopReceiptLookup();closeSource(false);window.removeEventListener('aicrm-contract-required',blockUpgrade);window.removeEventListener('beforeunload',beforeUnload);window.removeEventListener('pagehide',pauseRecovery);window.removeEventListener('pageshow',resumeRecovery);document.removeEventListener('visibilitychange',visibilityChanged);});
</script>

<template>
<div class="app-shell">
 <aside class="sidebar"><div class="brand"><span class="brand-mark">A</span><strong>AICRM</strong></div><span class="workspace-label">{{t.workspace}}</span><nav aria-label="Workspace"><button :class="{active:tab==='visits'}" @click="tab='visits'"><span aria-hidden="true">▤</span>{{t.visits}}</button><button :class="{active:tab==='handoffs'}" @click="tab='handoffs'"><span aria-hidden="true">↗</span>{{t.handoffs}}<span class="nav-count">{{handoffs.length}}</span></button><button v-if="role==='rep'" :class="{active:tab==='commitments'}" @click="tab='commitments'"><span aria-hidden="true">✓</span>{{ft.title}}<span class="nav-count">{{commitmentViews.filter(c=>c.completionStatus==='open').length}}</span></button></nav><div class="sidebar-foot"><span class="tiny-dot"></span>{{t.synthetic}}<small>AICRM / integration candidate</small></div></aside>
 <div class="main-shell"><header class="topbar"><span>{{t.today}}</span><div class="top-actions"><label class="sr-only" for="role">{{t.scope}}</label><select id="role" :value="role" :disabled="busy||!!pending" @change="switchRole"><option value="rep">{{t.representative}}</option><option value="manager">{{t.manager}}</option></select><button class="language" :disabled="composing" :aria-label="t.language" @click="changeLanguage">{{lang==='zh'?'English':'简体中文'}}</button></div></header>
 <main><div class="demo-banner"><strong>{{t.demo}}</strong><span>{{t.demoInfo}}</span></div><section class="page-heading"><div><p class="eyebrow">{{role==='rep'?t.representative:t.manager}} · {{context?.tenant??'—'}}</p><h1>{{role==='rep'?t.title:t.managerTitle}}</h1><p>{{role==='rep'?t.subtitle:t.managerSub}}</p></div><button v-if="role==='rep'" class="primary" :disabled="!accessAllowed||busy||!!pending" @click="fresh">＋ {{t.new}}</button></section>
 <div v-if="accessAllowed" class="summary-grid"><div><span>{{t.drafts}}</span><strong>{{loading&&!context?'—':visits.filter(v=>v.status==='DRAFT').length}}</strong></div><div><span>{{t.recorded}}</span><strong>{{loading&&!context?'—':visits.filter(v=>v.status==='RECORDED').length}}</strong></div><div><span>{{t.handoffCount}}</span><strong>{{loading&&!context?'—':handoffs.length}}</strong></div></div>
 <div v-if="recoveryIssue" class="alert warning" role="alert">{{recoveryIssue==='blocked'?t.recoveryBlocked:t.recoveryInvalid}}</div>
 <section v-if="accessAllowed&&(recoveryCopies.length||recoveryIssue||recoveryReadFailed)" class="alert warning" aria-labelledby="recovery-title">
  <h2 id="recovery-title">{{t.recoveryTitle}}</h2><p>{{t.recoveryExportHint}}</p><p v-if="recoveryReadFailed" role="status">{{t.recoveryReadFailed}}</p><p v-else-if="!exportableRecovery.length">{{t.recoveryNoExport}}</p>
  <div v-for="(entry,index) in exportableRecovery" :key="entry.key" class="button-row"><button type="button" :disabled="loading||busy" @click="exportRecovery(entry.key)">{{t.recoveryExport}} {{index+1}}</button></div>
  <p v-if="exportStatus" role="status">{{exportStatus==='requested'?t.recoveryExportRequested:t.recoveryExportFailed}}</p>
 </section>
 <div v-if="!localOk&&!recoveryIssue"  class="alert warning" role="alert">{{t.localFail}}</div>
 <div v-if="upgradeRequired" class="alert error" role="alert">{{t.upgradeRequired}} <button type="button" :disabled="busy||loading" @click="load">{{t.refresh}}</button></div>
 <div v-if="listError" class="alert error" role="alert">{{t.listError}} <button @click="load" :disabled="loading">{{t.refresh}}</button></div>
 <div v-if="noticeText" class="alert success" role="status">{{noticeText}}</div>
 <div v-if="errorText" class="alert error" role="alert">{{errorText}}<button v-if="(error?.recoveryTarget||current)&&!pending" @click="showLatest" :disabled="busy">{{t.loadLatest}}</button></div>
 <div v-if="pending" class="alert warning" role="status"><strong>{{t.pending}}</strong><p role="status">{{upgradeRequired?t.upgradeRequired:checkingReceipt?t.checking:busy?t.busy:receiptLookupScheduled?t.autoChecking:t.lookupIdle}}</p><div class="button-row"><button :disabled="busy" @click="checkResult()">{{t.check}}</button><button :disabled="busy" @click="checkResult(true)">{{t.retry}}</button></div></div>
 <div v-if="loading" class="loading" role="status">{{t.loading}}</div>
 <section v-if="accessAllowed&&tab==='visits'" class="work-grid">
 <div class="record-list panel"><div class="panel-heading"><h2>{{t.visits}}</h2><button class="icon-button" :disabled="loading" @click="load" :aria-label="t.refresh">↻</button></div><div v-if="!visits.length&&!loading&&!listError" class="empty"><div class="empty-icon" aria-hidden="true">▤</div><h3>{{t.empty}}</h3><p>{{t.emptyHint}}</p></div><button v-for="v in visits" :key="v.id" class="record-item" :class="{selected:current?.id===v.id}" @click="open(v)" :disabled="busy||!!pending"><span class="record-item-top"><strong>{{v.organization}}</strong><span class="badge" :class="v.status.toLowerCase()">{{t[v.status]}}</span></span><span class="record-preview">{{v.notes}}</span><span class="record-meta">{{v.occurredOn||ft.unknown}} · {{t.revision}} {{v.revision}}</span></button></div>
 <article class="editor panel"><div v-if="!editing" class="empty editor-empty"><div class="empty-icon" aria-hidden="true">✎</div><h2>{{t.select}}</h2><p>{{t.copyNote}}</p></div><template v-else><div class="panel-heading"><div><p class="eyebrow">{{t.record}}</p><h2>{{current?.organization||t.new}}</h2></div><button @click="aiOpen=!aiOpen" :aria-expanded="aiOpen">{{t.assist}}</button></div>
 <div class="save-state" :class="{dirty}"><span aria-hidden="true">{{dirty?'○':'●'}}</span>{{statusText}}<span v-if="current" class="revision">{{t.revision}} {{current.revision}}</span></div>
 <aside v-if="aiOpen" class="ai-panel"><div class="panel-heading"><strong>{{t.aiUnavailable}}</strong><button @click="aiOpen=false">{{t.close}}</button></div><p>{{t.aiHint}}</p></aside>
 <div v-if="canCorrect&&!correcting" class="button-row"><button id="begin-correction" type="button" :disabled="busy||!!pending||loading||listError||upgradeRequired" @click="beginCorrection">{{cc.begin}}</button></div><p v-if="current?.status==='RECORDED'" class="field-hint">{{cc.boundary}}</p>
 <form @submit.prevent="correcting?saveCorrection():save()" @compositionstart="composing=true" @compositionend="composing=false"><fieldset :disabled="!(editable||correcting&&canCorrect)||!!pending||busy"><div class="field-row"><label for="organization">{{t.organization}}<input id="organization" v-model="form.organization" @input="review.checked=false" :placeholder="t.orgHint" required maxlength="200" autocomplete="off"></label><label for="date">{{t.date}}<input id="date" v-model="form.occurredOn" @input="review.checked=false" type="date"></label></div><p class="field-hint">{{ft.unknownDay}} {{ft.org}}</p><label for="notes">{{t.notes}}<textarea id="notes" v-model="form.notes" @input="review.checked=false" rows="9" required maxlength="4000" aria-describedby="notes-help"></textarea></label><p id="notes-help" class="field-hint">{{t.notesHint}} {{t.visitLimits}}</p>
 <section v-if="editable" class="followup-review" aria-labelledby="review-title"><h3 id="review-title">{{ft.review}}</h3><p>{{ft.manual}}</p><p class="field-hint">{{ft.relativeDayHint}} {{ft.entryDay}}: {{entryDay}}</p>
 <article v-for="(row,index) in review.rows" :key="row.id" class="review-row"><label :for="'review-kind-'+index">{{ft.type}}<select :id="'review-kind-'+index" v-model="row.kind" @change="row.confirmed=false;review.checked=false"><option value="unconfirmed">{{ft.unconfirmed}}</option><option value="customer-request">{{ft.request}}</option><option value="explicit-self-commitment">{{ft.explicit}}</option></select></label><label :for="'review-text-'+index">{{ft.statement}}<textarea :id="'review-text-'+index" v-model="row.text" rows="3" @input="row.confirmed=false;review.checked=false"></textarea></label><template v-if="row.kind==='explicit-self-commitment'"><label :for="'review-deadline-'+index">{{ft.deadline}}<select :id="'review-deadline-'+index" v-model="row.deadlineKind" @change="row.confirmed=false;review.checked=false"><option value="unknown">{{ft.unknown}}</option><option value="date">{{ft.date}}</option><option value="instant">{{ft.instant}}</option></select></label><input v-if="row.deadlineKind!=='unknown'" v-model="row.deadlineValue" :type="row.deadlineKind==='date'?'date':'text'" :aria-label="ft.deadline" placeholder="2026-10-20T15:00:00+08:00" @input="row.confirmed=false;review.checked=false"><DeadlineEvidence :deadline="row.deadlineKind==='unknown'?{kind:'unknown'}:row.deadlineKind==='date'?{kind:'date',date:row.deadlineValue}:{kind:'instant',at:row.deadlineValue}" :text="row.text" :lang="lang"/><label class="check-label"><input type="checkbox" v-model="row.confirmed">{{ft.confirm}}</label></template><button type="button" @click="removeReview(index)">{{ft.remove}}</button></article>
 <button type="button" @click="addReview">＋ {{ft.add}}</button><label class="check-label"><input id="reviewed" type="checkbox" v-model="review.checked">{{ft.reviewed}}</label></section></fieldset>
 <div v-if="editable" class="form-footer"><p class="local-note">{{localOk?t.local:t.localFail}}</p><div class="button-row"><button type="button" class="primary" :disabled="busy||!!pending||composing" @click="save">{{busy?t.busy:ft.localSave}}</button><button type="button" :disabled="busy||!!pending||composing||!review.checked" @click="confirmRecord">{{ft.record}}</button></div><p class="field-hint">{{ft.manual}}</p></div><div v-if="correcting" class="form-footer"><h3>{{cc.title}}</h3><p>{{cc.hint}}</p><div class="button-row"><button id="save-correction" type="button" :disabled="busy||!!pending||composing||!!latest||!canCorrect||loading||listError||upgradeRequired" @click="saveCorrection">{{cc.save}}</button><button id="cancel-correction" type="button" :disabled="busy||!!pending" @click="cancelCorrection">{{cc.cancel}}</button><button type="button" :disabled="busy||!!pending" @click="save">{{ft.localSave}}</button></div></div></form>
 <VisitHistory v-if="current?.status==='RECORDED'" :visit="current" :role="role" :lang="lang" :epoch="accessEpoch" @denied="revokeAccess"/>
 <section v-if="current?.status==='RECORDED'&&savedReviewLoaded" class="followup-review"><h3>{{cc.originalReview}}</h3><p class="field-hint">{{cc.reviewHint}}</p><p v-if="savedReview===null">{{ft.legacyUnreviewed}}</p><p v-else-if="!savedReview.decisions.length">{{ft.noCommitments}}</p><article v-else v-for="(decision,index) in savedReview.decisions" :key="index"><strong>{{decision.kind==='explicit-self-commitment'?ft.explicit:decision.kind==='customer-request'?ft.request:decision.kind==='unconfirmed'?ft.unconfirmed:ft.noCommitments}}</strong><DeadlineEvidence v-if="decision.deadline" :deadline="decision.deadline" :text="decision.commitmentText??''" :lang="lang"/><p v-else class="preserve-text">{{decision.requestText??decision.candidateText??''}}</p></article></section>
 <section v-if="current?.status==='RECORDED'&&role==='rep'" class="related-commitments followup-review" aria-labelledby="related-title"><h3 id="related-title">{{ft.relatedTitle}}</h3><p class="field-hint">{{ft.relatedHint}}</p><p v-if="loading" role="status">{{ft.relatedLoading}}</p><p v-else-if="listError" role="alert">{{ft.relatedFailed}}</p><template v-else><p v-if="!relatedCommitments.length">{{savedReviewLoaded&&savedReview!==null?ft.relatedEmpty:ft.relatedUnknown}}</p><article v-for="c in relatedCommitments" :key="c.id" class="related-commitment"><h4 class="preserve-text">{{c.commitmentText}}</h4><p>{{ft.owner}}: {{ft.me}} · {{c.completionStatus==='completed'?ft.completed:ft.open}}</p><DeadlineEvidence :deadline="c.deadline" :text="c.commitmentText" :lang="lang"/><p>{{ft.progress}}: {{verificationLabel(c.verificationStatus)}} · {{ft.toCustomer}}: {{c.replyToCustomer==='recorded'?ft.recorded:ft.notRecorded}} · {{ft.fromCustomer}}: {{c.replyFromCustomer==='recorded'?ft.recorded:ft.notRecorded}}</p><button type="button" :data-related-id="c.id" :disabled="busy||!!pending" @click="continueRelated(c.id)">{{ft.continueRelated}}</button></article></template></section>
 <dl v-if="current" class="time-meta"><div><dt>{{t.created}}</dt><dd>{{formatTime(current.createdAt)}}</dd></div><div><dt>{{t.updated}}</dt><dd>{{formatTime(current.updatedAt)}}</dd></div><small>{{t.timeZone}}</small></dl>
 <section v-if="current?.status==='RECORDED'&&role==='rep'" class="handoff-form"><h3>{{t.optional}}</h3><p>{{t.optionalHint}}</p><p class="target">{{t.manager}} · manager-a · {{t.synthetic}}</p><label for="request">{{t.request}}<textarea id="request" v-model="request" rows="3" maxlength="2000"></textarea></label><p class="field-hint">{{t.requestLimit}}</p><p v-if="request.trim()&&!pending" class="field-hint" role="status">{{t.handoffDraft}}</p><button :disabled="!request.trim()||busy||!!pending" @click="sendHandoff">{{t.send}}</button><div v-for="h in handoffs.filter(h=>h.visitId===current?.id)" :key="h.id" class="handoff-receipt"><span class="badge">{{t[h.status]}}</span><p>{{h.request}}</p><p>{{h.result.completion?ht.complete:ht.open}}</p><button type="button" :disabled="busy||!!pending" @click="goHandoff(h.id)">{{ht.title}}</button></div></section>
 </template></article></section>
 <section v-else-if="accessAllowed&&tab==='handoffs'" class="handoff-list panel"><div class="panel-heading"><h2>{{t.handoffs}}</h2><button @click="load" :disabled="loading">{{t.refresh}}</button></div><div v-if="!handoffs.length&&!loading&&!listError" class="empty"><h3>{{t.handoffEmpty}}</h3><p>{{t.managerSub}}</p></div><article v-for="h in handoffs" :key="h.id" class="handoff-card" :id="'handoff-card-'+h.id"><div class="panel-heading"><h3>{{visits.find(v=>v.id===h.visitId)?.organization||t.record}}</h3><span class="badge" :class="h.status.toLowerCase()">{{ht.stage}}: {{t[h.status]}}</span></div><p class="preserve-text">{{h.request}}</p><p class="field-hint">{{t.revision}} {{h.revision}} · {{t.manager}} manager-a</p><div v-if="role==='manager'" class="button-row"><button v-if="h.status==='SENT'" class="primary" :disabled="busy||!!pending" @click="mutate('receive',`/handoffs/${h.id}/receive`,'POST',{expectedRevision:h.revision})">{{t.receive}}</button><button v-if="h.status==='RECEIVED'" class="primary" :disabled="busy||!!pending" @click="mutate('accept',`/handoffs/${h.id}/accept`,'POST',{expectedRevision:h.revision})">{{t.accept}}</button></div><HandoffResultEditor :handoff="h" :draft="handoffDraft" :lang="lang" :identity="context?.id??''" :role="role" :disabled="busy||!!pending||loading||listError||upgradeRequired" :pending="pending?.kind==='handoff-event'&&handoffDraft.target?.id===h.id" @select="selectHandoffAction" @patch="patchHandoff" @submit="submitHandoff" @cancel="cancelHandoff" @rebind="rebindHandoff" @refresh="refreshHandoff" @background="viewHandoffBackground"/><section v-if="handoffBackground?.id===h.id" class="handoff-background"><h4>{{ht.background}}</h4><p>{{ht.readOnly}}</p><p v-if="handoffBackground.state==='loading'">{{ht.loading}}</p><template v-else-if="handoffBackground.visit"><p>{{handoffBackground.visit.organization}} · {{handoffBackground.visit.occurredOn||ft.unknown}}</p><p class="preserve-text">{{handoffBackground.visit.notes}}</p></template><p v-else role="alert">{{ht.missing}}</p><button type="button" @click="closeHandoffBackground">{{ht.back}}</button></section></article></section>
 <section v-if="accessAllowed&&role==='rep'&&tab==='commitments'" class="commitment-list panel"><div class="panel-heading"><div><h2>{{ft.list}}</h2><p>{{ft.listHint}}</p></div><button :disabled="loading" @click="load">{{t.refresh}}</button></div><label class="check-label"><input type="checkbox" v-model="showCompleted">{{ft.showCompleted}}</label><p v-if="loading" role="status" data-list-state="loading">{{ft.listLoading}}</p><p v-else-if="listError" role="alert" data-list-state="failed">{{ft.listFailed}}</p><p v-else-if="!visibleCommitments.length" data-list-state="empty">{{showCompleted?ft.emptyAll:ft.empty}}</p>
 <article v-for="c in visibleCommitments" :key="c.id" class="commitment-card"><div class="panel-heading"><h3 class="preserve-text">{{c.commitmentText}}</h3><span class="badge">{{c.completionStatus==='open'?ft.open:ft.completed}}</span></div><p>{{c.source.organizationText||c.source.organizationId}} · {{ft.source}}: {{c.source.occurredOn||ft.unknown}}</p><DeadlineEvidence :deadline="c.deadline" :text="c.commitmentText" :lang="lang"/><dl class="commitment-status"><div><dt>{{ft.progress}}</dt><dd>{{c.verificationStatus==='verified'?ft.verified:c.verificationStatus==='in-progress'?ft.inProgress:ft.notStarted}}</dd></div><div><dt>{{ft.toCustomer}}</dt><dd>{{c.replyToCustomer==='recorded'?ft.recorded:ft.notRecorded}}</dd></div><div><dt>{{ft.fromCustomer}}</dt><dd>{{c.replyFromCustomer==='recorded'?ft.recorded:ft.notRecorded}}</dd></div></dl><p class="field-hint">{{ft.scope}} {{c.contentRevision}} · {{ft.scopeHint}}</p><details :id="'commitment-history-'+c.id"><summary>{{ft.history}}</summary><h4>{{cc.sourceSnapshot}}</h4><p class="field-hint">{{cc.snapshotHint}}</p><p class="preserve-text">{{c.source.originalText}}</p><ol><li v-for="(e,eventIndex) in c.history" :key="e.eventId"><div class="event-history"><strong>{{eventTitle(e.type)}}</strong><p class="field-hint">{{ft.scope}} {{e.contentRevision}} · {{ft.recordedTime}} {{formatTime(e.recordedAt)}}</p><p v-if="e.type==='created'||e.type==='amended'" class="preserve-text">{{e.commitmentText??''}}</p><p v-if="e.type==='amended'||e.type==='reopened'" class="preserve-text">{{ft.reason}}: {{e.reason}}</p><p v-if="e.type==='progress-recorded'">{{verificationLabel(e.status)}}</p><p v-if="e.type==='reply-recorded'">{{e.direction==='from-customer'?ft.fromCustomer:ft.toCustomer}} · {{ft.replyAt}} {{formatReplyTime(e.occurredAt)}}</p><p v-if="e.type==='reply-recorded'||e.type==='progress-recorded'||e.type==='completed'" class="preserve-text">{{e.text}}</p><DeadlineEvidence v-if="(e.type==='created'||e.type==='amended')&&e.deadline" :deadline="e.deadline" :text="historicalWording(c,eventIndex)" :lang="lang"/></div></li></ol></details><div class="button-row"><button :id="'commitment-action-'+c.id" :disabled="busy||!!pending" @click="selectCommitment(c.id)">{{ft.select}}</button><button type="button" :id="'source-button-'+c.id" :disabled="loading||listError" :aria-expanded="sourcePanel?.commitmentId===c.id" :aria-controls="'source-panel-'+c.id" @click="viewSource(c.id)">{{ft.viewSource}}</button></div><section v-if="sourcePanel?.commitmentId===c.id" :id="'source-panel-'+c.id" class="source-panel" :aria-labelledby="'source-title-'+c.id"><div class="panel-heading"><h4 :id="'source-title-'+c.id">{{cc.currentSource}}</h4><button type="button" @click="closeSource()">{{ft.backToFollowup}}</button></div><p class="field-hint">{{ft.sourceReadOnly}}</p><p v-if="sourcePanel.state==='loading'" role="status">{{ft.sourceLoading}}</p><template v-else-if="sourcePanel.state==='loaded'&&sourcePanel.visit"><p><strong>{{sourcePanel.visit.organization}}</strong> · {{sourcePanel.visit.occurredOn||ft.unknown}}</p><p class="preserve-text source-record-notes">{{sourcePanel.visit.notes}}</p><p>{{t.recorded}} · {{t.revision}} {{sourcePanel.visit.revision}} · {{ft.recordedTime}} {{formatTime(sourcePanel.visit.updatedAt)}}</p><p class="field-hint">{{cc.sourceHint}}</p><h5>{{cc.sourceSnapshot}}</h5><p>{{c.source.organizationText}} · {{c.source.occurredOn||ft.unknown}}</p><p class="preserve-text">{{c.source.originalText}}</p><VisitHistory :visit="sourcePanel.visit" :role="role" :lang="lang" :epoch="accessEpoch" @denied="revokeAccess"/></template><p v-else role="alert">{{sourcePanel.state==='missing'?ft.sourceMissing:ft.sourceFailed}}</p><button v-if="sourcePanel.state==='failed'||sourcePanel.state==='missing'" type="button" @click="viewSource(c.id)">{{t.refresh}}</button></section></article>
 <form v-if="selectedCommitment" class="followup-review" @submit.prevent="appendEvent"><fieldset :disabled="busy||!!pending"><h3>{{ft.action}}</h3><p class="field-hint">{{ft.boundScope}} {{eventDraft.target?.contentRevision??ft.unbound}} · {{t.revision}} {{eventDraft.target?.revision??'—'}}</p><p class="preserve-text">{{eventDraft.target?.commitmentText??ft.unbound}}</p><template v-if="eventDraft.target"><DeadlineEvidence :deadline="eventDraft.target.deadline" :text="eventDraft.target.commitmentText" :lang="lang"/><p>{{eventDraft.target.completionStatus==='completed'?ft.completed:ft.open}}</p></template><div v-if="eventTargetChanged" class="alert warning"><strong>{{ft.targetConflict}}</strong><p>{{ft.latestScope}} {{selectedCommitment.contentRevision}} · {{t.revision}} {{selectedCommitment.revision}}</p><p class="preserve-text">{{selectedCommitment.commitmentText}}</p><DeadlineEvidence :deadline="selectedCommitment.deadline" :text="selectedCommitment.commitmentText" :lang="lang"/><label class="check-label"><input id="scope-reviewed" type="checkbox" v-model="eventDraft.scopeReviewed">{{ft.scopeReviewConfirm}}</label><button type="button" :disabled="!eventDraft.scopeReviewed" @click="rebindEventTarget">{{ft.rebind}}</button></div><label for="event-type">{{ft.type}}<select id="event-type" v-model="eventDraft.type" @change="eventTypeChanged"><option value="progress-recorded" :disabled="selectedCommitment.completionStatus==='completed'">{{ft.progress}}</option><option value="reply-recorded">{{ft.reply}}</option><option value="completed" :disabled="selectedCommitment.completionStatus==='completed'">{{ft.complete}}</option><option value="amended" :disabled="selectedCommitment.completionStatus==='completed'">{{ft.amend}}</option><option value="reopened" :disabled="selectedCommitment.completionStatus==='open'">{{ft.reopen}}</option></select></label><label v-if="eventDraft.type==='progress-recorded'">{{ft.progress}}<select v-model="eventDraft.status"><option value="not-started">{{ft.notStarted}}</option><option value="in-progress">{{ft.inProgress}}</option><option value="verified">{{ft.verified}}</option></select></label><template v-if="eventDraft.type==='reply-recorded'"><p>{{ft.replyHint}}</p><label for="reply-scope">{{ft.replyScope}}<select id="reply-scope" v-model="eventDraft.replyScope" required><option value="" disabled>{{ft.chooseScope}}</option><option v-for="scope in replyScopes" :key="scope.contentRevision" :value="String(scope.contentRevision)">{{ft.scope}} {{scope.contentRevision}} · {{scope.commitmentText}}</option></select></label><label>{{ft.direction}}<select v-model="eventDraft.direction"><option value="from-customer">{{ft.fromCustomer}}</option><option value="to-customer">{{ft.toCustomer}}</option></select></label><label>{{ft.replyAt}}<input v-model="eventDraft.occurredAt" placeholder="2026-10-20T15:00:00+08:00" required></label></template><label v-if="['progress-recorded','reply-recorded','completed'].includes(eventDraft.type)">{{ft.text}}<textarea v-model="eventDraft.text" rows="3" required></textarea></label><label v-if="['amended','reopened'].includes(eventDraft.type)">{{ft.reason}}<textarea v-model="eventDraft.reason" rows="2" required></textarea></label><template v-if="eventDraft.type==='amended'"><label>{{ft.newText}}<textarea v-model="eventDraft.newText" rows="3"></textarea></label><label class="check-label"><input type="checkbox" v-model="eventDraft.changeDeadline">{{ft.changeDeadline}}</label><template v-if="eventDraft.changeDeadline"><label>{{ft.deadline}}<select v-model="eventDraft.deadlineKind"><option value="unknown">{{ft.unknown}}</option><option value="date">{{ft.date}}</option><option value="instant">{{ft.instant}}</option></select></label><input v-if="eventDraft.deadlineKind!=='unknown'" v-model="eventDraft.deadlineValue" :type="eventDraft.deadlineKind==='date'?'date':'text'" :aria-label="ft.deadline"></template></template><label v-if="eventDraft.type==='completed'" class="check-label"><input type="checkbox" v-model="eventDraft.confirmed">{{ft.completeConfirm}}</label><div class="button-row"><button type="submit" class="primary">{{ft.append}}</button><button type="button" @click="cancelEvent">{{ft.cancel}}</button></div></fieldset></form></section>
 <section v-if="latest" class="panel conflict-panel"><h2>{{t.serverVersion}} · {{t.revision}} {{latest.revision}}</h2><p><strong>{{latest.organization}}</strong> · {{latest.occurredOn||ft.unknown}} · {{t[latest.status]}}</p><p class="preserve-text">{{latest.notes}}</p><template v-if="correcting&&current"><h3>{{cc.boundVersion}} {{current.revision}}</h3><p class="preserve-text">{{current.organization}} · {{current.occurredOn||ft.unknown}}</p><p class="preserve-text">{{current.notes}}</p><h3>{{cc.localInput}}</h3><p class="preserve-text">{{form.organization}} · {{form.occurredOn||ft.unknown}}</p><p class="preserve-text">{{form.notes}}</p><label class="check-label"><input id="correction-reviewed" type="checkbox" v-model="correctionReviewed">{{cc.compareConfirm}}</label></template><button :disabled="correcting?!correctionReviewed:latest.status==='RECORDED'" @click="rebase">{{t.useLatest}}</button></section>
 <footer class="page-footer">AICRM · {{t.synthetic}} · {{t.copyNote}}</footer></main></div>
</div>
</template>
