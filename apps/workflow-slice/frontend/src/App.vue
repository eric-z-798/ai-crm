<script setup lang="ts">
import {computed,nextTick,onMounted,reactive,ref,watch} from 'vue';
import {api,ApiError} from './api';
import {copy} from './i18n';
import {followupCopy} from './followup-i18n';
import {emptyEventDraft,bindTarget,validEventDraft,restoreEventDraft,targetChanged,contentScopes} from './event-draft';
import {emptyReview,validReview,recordCommand,type Review} from './record-contract';
import {projectCommitment,type Commitment,type CommitmentView} from './domain/commitment';
type Visit={id:string;revision:number;status:'DRAFT'|'RECORDED';organization:string;occurredOn:string|null;organizationId?:null;notes:string;ownerId:string;createdAt:string;updatedAt:string};
type Handoff={id:string;visitId:string;revision:number;status:'SENT'|'RECEIVED'|'ACCEPTED';request:string};
type Pending={key:string;path:string;method:string;body:any;kind:'save'|'confirm'|'handoff'|'receive'|'accept'|'record'|'commitment-event';role:string};
const lang=ref<'zh'|'en'>('zh'),t=computed(()=>copy[lang.value]),role=ref('rep'),visits=ref<Visit[]>([]),handoffs=ref<Handoff[]>([]),current=ref<Visit|null>(null),editing=ref(false),form=reactive({organization:'',occurredOn:'',notes:''}),request=ref(''),pending=ref<Pending|null>(null),busy=ref(false),loading=ref(false),error=ref(''),notice=ref(''),listError=ref(false),aiOpen=ref(false),latest=ref<Visit|null>(null),localOk=ref(true),composing=ref(false),context=ref<{id:string;role:string;tenant:string}|null>(null),tab=ref('visits');
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
function validRecovery(value:any){
 if(!isObject(value)||(value.schemaVersion!==undefined&&value.schemaVersion!==1&&value.schemaVersion!==2&&value.schemaVersion!==3)||!['rep','manager'].includes(value.role)||typeof value.identity!=='string'||!['zh','en'].includes(value.lang)||typeof value.editing!=='boolean'||!['visits','handoffs','commitments'].includes(value.tab)||typeof value.request!=='string')return false;
 const fields=['organization','occurredOn','notes'];
 if(!isObject(value.form)||Object.keys(value.form).length!==fields.length||!fields.every(key=>typeof value.form[key]==='string'))return false;
 const record=value.current;
 if(record!==null&&(!isObject(record)||!['id','organization','notes','ownerId'].every(key=>typeof record[key]==='string')||(typeof record.occurredOn!=='string'&&record.occurredOn!==null)||!Number.isSafeInteger(record.revision)||record.revision<1||!['DRAFT','RECORDED'].includes(record.status)||!validTime(record.createdAt)||!validTime(record.updatedAt)))return false;
 if(!value.editing&&(record!==null||Object.values(value.form).some(Boolean)||value.request))return false;
 if(value.schemaVersion===2||value.schemaVersion===3){if(!validReview(value.review)||!validEventDraft(value.eventDraft,value.schemaVersion===2))return false;const known=['schemaVersion','role','identity','lang','current','editing','form','request','pending','tab','review','eventDraft'];if(Object.keys(value).some(key=>!known.includes(key)))return false;}
 const command=value.pending;
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
const dirty=computed(()=>reviewDirty.value||eventDirty.value||editing.value&&(!current.value?Object.values(snapshot()).some(Boolean):JSON.stringify(snapshot())!==JSON.stringify({organization:current.value.organization,occurredOn:current.value.occurredOn??'',notes:current.value.notes})));
const editable=computed(()=>accessAllowed.value&&role.value==='rep'&&current.value?.status!=='RECORDED');
const statusText=computed(()=>dirty.value?t.value.unsaved:current.value?.status==='RECORDED'?t.value.immutable:current.value?t.value.saved:t.value.fresh);
const formatTime=(date:unknown)=>validTime(date)?new Intl.DateTimeFormat(lang.value==='zh'?'zh-CN':'en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(date as string)):t.value.timeUnavailable;
function recoverySnapshot(){return {schemaVersion:3,review:review.value,eventDraft:{...eventDraft},role:role.value,identity:context.value?.id,lang:lang.value,current:current.value,editing:editing.value,form:snapshot(),request:request.value,pending:pending.value,tab:tab.value}}
function persist():boolean{if(recoveryInitializing.value||!accessAllowed.value)return false;if(!preserveRejectedRecovery())return false;try{const raw=JSON.stringify(recoverySnapshot());sessionStorage.setItem(storageKey,raw);if(sessionStorage.getItem(storageKey)!==raw)throw Error('STORAGE_READBACK_MISMATCH');localOk.value=true;return true}catch{localOk.value=false;return false}}
function restoreCandidate(s:any){if(!validRecovery(s))return false;if(!accessAllowed.value||!s||s.role!==role.value||s.identity!==context.value?.id||s.current&&!visits.value.some(v=>v.id===s.current.id))return false;current.value=s.current;editing.value=!!s.editing;Object.assign(form,s.form);request.value=s.request??'';pending.value=s.pending;review.value=s.schemaVersion===2||s.schemaVersion===3?s.review:emptyReview();Object.assign(eventDraft,s.schemaVersion===2||s.schemaVersion===3?restoreEventDraft(s.eventDraft):emptyEventDraft());tab.value=s.tab??'visits';notice.value=t.value.retained;return true}
function protectLegacy(raw:string,key:string){try{const target=storageKey+'-legacy-'+key;const previous=sessionStorage.getItem(target);if(previous===null)sessionStorage.setItem(target,raw);else if(previous!==raw)sessionStorage.setItem(target+'-'+Date.now(),raw);}catch{if(!unpreservedRecovery.some(e=>e.key===key&&e.raw===raw))unpreservedRecovery.push({key,raw});recoveryIssue.value='blocked';localOk.value=false;}}
function restoreQuarantine(){if(recoveryInitializing.value||editing.value||pending.value||dirty.value)return;try{let key=storageKey+'-held-'+role.value;let raw=sessionStorage.getItem(key);if(raw===null){key=legacyStorageKey+'-held-'+role.value;raw=sessionStorage.getItem(key);if(raw!==null)protectLegacy(raw,key);}if(raw!==null)protectLegacy(raw,key);const held=heldInMemory.get(role.value)??(raw?readRecovery(raw,key):null);if(held&&restoreCandidate(held)){heldInMemory.delete(role.value)}}catch{localOk.value=false}}
watch(()=>selectedCommitment.value?.revision,()=>{eventDraft.scopeReviewed=false;});
watch([form,current,editing,request,pending,role,lang,tab,review,eventDraft],persist,{deep:true});
watch([()=>current.value?.id,()=>current.value?.status,accessAllowed],async()=>{savedReview.value=null;savedReviewLoaded.value=false;const id=current.value?.id;if(!id||current.value?.status!=='RECORDED'||!accessAllowed.value)return;try{const result=await api<any>(role.value,`/v2/visits/${id}/review`);if(accessAllowed.value&&current.value?.id===id){if(result.objectType!=='record-review'||result.visitId!==id)throw Error('WRONG_REVIEW_RESULT');savedReview.value=result.followUpReview;savedReviewLoaded.value=true;}}catch(e){if(isAccessError(e))revokeAccess();else if(current.value?.id===id)error.value=explain(e);}});
watch(lang,()=>{document.documentElement.lang=lang.value==='zh'?'zh-CN':'en';document.title='AICRM · '+t.value.workspace});
function isolateEditor(){if(dirty.value||request.value.trim()||pending.value){const held=recoverySnapshot();heldInMemory.set(role.value,held);try{sessionStorage.setItem(storageKey+'-held-'+role.value,JSON.stringify(held))}catch{localOk.value=false}}current.value=null;latest.value=null;editing.value=false;pending.value=null;request.value='';Object.assign(form,{organization:'',occurredOn:'',notes:''});review.value=emptyReview();Object.assign(eventDraft,emptyEventDraft());notice.value='';try{sessionStorage.removeItem(storageKey)}catch{localOk.value=false}}
function revokeAccess(){closeSource(false);if(dirty.value||request.value.trim()||pending.value)heldInMemory.set(role.value,recoverySnapshot());try{if(heldInMemory.has(role.value))sessionStorage.setItem(storageKey+'-held-'+role.value,JSON.stringify(heldInMemory.get(role.value)))}catch{localOk.value=false}accessEpoch++;accessAllowed.value=false;visits.value=[];handoffs.value=[];commitments.value=[];current.value=null;latest.value=null;context.value=null;editing.value=false;pending.value=null;request.value='';Object.assign(form,{organization:'',occurredOn:'',notes:''});review.value=emptyReview();Object.assign(eventDraft,emptyEventDraft());notice.value='';error.value=t.value.accessChanged;try{sessionStorage.removeItem(storageKey)}catch{localOk.value=false}}
function isAccessError(e:unknown){return e instanceof ApiError&&(e.status===401||e.status===403)}
function explain(e:unknown){if(e instanceof ApiError){if(e.status===409)return t.value.conflict; if(e.status===401||e.status===403)return `${t.value.error} (${e.status}: ${e.code})`;return `${t.value.error} (${e.code})`}return t.value.unknown}
async function load(){closeSource(false);const epoch=++accessEpoch;loading.value=true;listError.value=false;try{const ctx=await api<{id:string;role:string;tenant:string}>(role.value,'/context');const [v,h,c]=await Promise.all([api<Visit[]>(role.value,'/v2/visits'),api<Handoff[]>(role.value,'/handoffs'),role.value==='rep'?api<Commitment[]>(role.value,'/v2/commitments'):Promise.resolve([])]);if(c.some(item=>!projectCommitment(item).ok))throw Error('INVALID_COMMITMENT_RESULT');if(epoch!==accessEpoch)return;const identityChanged=!!context.value&&context.value.id!==ctx.id;const selectedUnavailable=!!current.value&&!v.some(item=>item.id===current.value!.id);if(identityChanged||selectedUnavailable){isolateEditor();error.value=t.value.scopeChanged}if(latest.value&&!v.some(item=>item.id===latest.value!.id))latest.value=null;context.value=ctx;visits.value=v;handoffs.value=h;commitments.value=c;accessAllowed.value=true;restoreQuarantine()}catch(e){if(isAccessError(e))revokeAccess();listError.value=true}finally{loading.value=false;exportStatus.value=null;collectRecoveryCopies()}}
function leaveAllowed(){return !pending.value&&!busy.value&&(!(dirty.value||request.value.trim())||window.confirm(t.value.discard))}
function open(v:Visit){if(!accessAllowed.value||!leaveAllowed())return;review.value=emptyReview();Object.assign(eventDraft,emptyEventDraft());current.value={...v};Object.assign(form,{organization:v.organization,occurredOn:v.occurredOn??'',notes:v.notes});editing.value=true;error.value='';notice.value='';latest.value=null;request.value=''}
function fresh(){if(!accessAllowed.value||!leaveAllowed())return;review.value=emptyReview();Object.assign(eventDraft,emptyEventDraft());current.value=null;Object.assign(form,{organization:'',occurredOn:'',notes:''});editing.value=true;request.value='';error.value='';notice.value='';latest.value=null;tab.value='visits';nextTick(()=>document.getElementById('organization')?.focus())}
async function switchRole(event:Event){const target=event.target as HTMLSelectElement;if(!leaveAllowed()){target.value=role.value;return}accessAllowed.value=false;accessEpoch++;review.value=emptyReview();Object.assign(eventDraft,emptyEventDraft());role.value=target.value;current.value=null;editing.value=false;Object.assign(form,{organization:'',occurredOn:'',notes:''});request.value='';visits.value=[];handoffs.value=[];commitments.value=[];context.value=null;error.value='';notice.value='';latest.value=null;tab.value=role.value==='manager'?'handoffs':'visits';await load()}
function updateResult(p:Pending,result:any){
 if(!accessAllowed.value)return;
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
 pending.value=null;notice.value=t.value.success;error.value='';latest.value=null;persist();
}
async function perform(p:Pending){if(!accessAllowed.value)return;if(!persist()){error.value=ft.value.persistRequired;return;}const epoch=accessEpoch;busy.value=true;error.value='';notice.value='';try{const result=await api(p.role,p.path,p.method,p.body,p.key);if(!accessAllowed.value||epoch!==accessEpoch)return;updateResult(p,result);await load()}catch(e){if(isAccessError(e)){revokeAccess();return}error.value=explain(e);if(e instanceof ApiError&&e.status<500){pending.value=null;persist()}}finally{busy.value=false}}
async function mutate(kind:Pending['kind'],path:string,method:string,body:any){if(!accessAllowed.value||busy.value||pending.value)return;const p={kind,path,method,body,key:crypto.randomUUID(),role:role.value};pending.value=p;if(!persist()){error.value=ft.value.persistRequired;return;}await perform(p)}
async function save(){if(composing.value)return;if(!['organization','occurredOn','notes'].every(key=>typeof form[key as keyof typeof form]==='string')){error.value=t.value.invalidDraft;return}persist();notice.value=localOk.value?ft.value.localSaved:t.value.localFail;}
async function confirmRecord(){if(!accessAllowed.value||!editable.value||!context.value)return;try{const body=recordCommand(snapshot(),review.value,current.value,context.value.id);await mutate('record','/v2/visits/record','POST',body)}catch{error.value=ft.value.invalid}}
function addReview(){review.value.rows.push({id:crypto.randomUUID(),kind:'unconfirmed',text:'',confirmed:false,deadlineKind:'unknown',deadlineValue:''});review.value.checked=false;}
function removeReview(index:number){if(window.confirm(ft.value.removeConfirm)){review.value.rows.splice(index,1);review.value.checked=false}}
function selectCommitment(id:string){if(!accessAllowed.value||busy.value||pending.value)return false;if(eventDraft.commitmentId===id)return true;if(eventDirty.value&&!window.confirm(ft.value.editDiscard))return false;const selected=commitmentViews.value.find(c=>c.id===id);if(!selected)return false;Object.assign(eventDraft,emptyEventDraft(),{commitmentId:id,type:selected.completionStatus==='completed'?'reply-recorded':'progress-recorded',target:bindTarget(selected)});return true;}
function cancelEvent(){if(!window.confirm(ft.value.editDiscard))return;Object.assign(eventDraft,emptyEventDraft());}
function rebindEventTarget(){if(!selectedCommitment.value||!eventDraft.scopeReviewed)return;eventDraft.target=bindTarget(selectedCommitment.value);eventDraft.scopeReviewed=false;eventDraft.confirmed=false;error.value='';}
function eventTypeChanged(){eventDraft.confirmed=false;eventDraft.replyScope='';}
async function appendEvent(){const selected=selectedCommitment.value,target=eventDraft.target;if(!selected||!accessAllowed.value)return;if(!target||eventTargetChanged.value){error.value=ft.value.targetConflict;return;}let event:any={eventId:crypto.randomUUID(),type:eventDraft.type,contentRevision:target.contentRevision};
 if(event.type==='progress-recorded')Object.assign(event,{status:eventDraft.status,text:eventDraft.text});
 else if(event.type==='reply-recorded'){const scope=Number(eventDraft.replyScope);if(!eventDraft.replyScope||!replyScopes.value.some(s=>s.contentRevision===scope)){error.value=ft.value.replyScopeRequired;return;}Object.assign(event,{contentRevision:scope,direction:eventDraft.direction,occurredAt:eventDraft.occurredAt,text:eventDraft.text});}
 else if(event.type==='completed'){if(!eventDraft.confirmed){error.value=ft.value.invalid;return}Object.assign(event,{confirmation:'person-confirmed-complete',text:eventDraft.text});}
 else if(event.type==='reopened')Object.assign(event,{reason:eventDraft.reason});
 else if(event.type==='amended'){Object.assign(event,{reason:eventDraft.reason});if(eventDraft.newText){event.commitmentText=eventDraft.newText;if(eventDraft.newText!==target.commitmentText)event.contentRevision++;}if(eventDraft.changeDeadline)event.deadline=eventDraft.deadlineKind==='unknown'?{kind:'unknown'}:eventDraft.deadlineKind==='date'?{kind:'date',date:eventDraft.deadlineValue}:{kind:'instant',at:eventDraft.deadlineValue};}
 await mutate('commitment-event',`/v2/commitments/${selected.id}/events`,'POST',{schemaVersion:2,expectedRevision:target.revision,event});
}
function eventTitle(type:string){return ({created:ft.value.explicit,amended:ft.value.amend,'progress-recorded':ft.value.progress,'reply-recorded':ft.value.reply,completed:ft.value.complete,reopened:ft.value.reopen} as Record<string,string>)[type]??type;}
function verificationLabel(status:string){return status==='verified'?ft.value.verified:status==='in-progress'?ft.value.inProgress:ft.value.notStarted;}

async function sendHandoff(){if(request.value.length>2000){error.value=t.value.requestLengthError;return}if(!current.value||!request.value.trim())return;await mutate('handoff',`/visits/${current.value.id}/handoffs`,'POST',{expectedRevision:current.value.revision,request:request.value})}
async function checkResult(retryIfMissing=false){if(!accessAllowed.value||!pending.value||busy.value)return;const original=pending.value;busy.value=true;let retry=false;try{const result=await api(original.role,`/commands/${original.key}`);updateResult(original,result);await load()}catch(e){if(isAccessError(e)){revokeAccess();return}if(e instanceof ApiError&&e.status===404){error.value=t.value.notFound;retry=retryIfMissing}else error.value=explain(e)}finally{busy.value=false}if(retry&&accessAllowed.value&&pending.value?.key===original.key)await perform(original)}
async function showLatest(){if(!current.value||!accessAllowed.value)return;const epoch=accessEpoch;busy.value=true;try{const all=await api<Visit[]>(role.value,'/v2/visits');if(!accessAllowed.value||epoch!==accessEpoch)return;latest.value=all.find(v=>v.id===current.value!.id)??null;visits.value=all;if(!latest.value){isolateEditor();error.value=t.value.scopeChanged}}catch(e){if(isAccessError(e))revokeAccess();else error.value=explain(e)}finally{busy.value=false}}
function rebase(){if(!latest.value)return;if(latest.value.status==='RECORDED'){error.value=t.value.serverRecorded;return}current.value=latest.value;latest.value=null;error.value='';notice.value=t.value.review}
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
 let restored=false;
 if(accessAllowed.value&&recovered)restored=restoreCandidate(recovered);
 // Main recovery has priority. Other held originals remain separately available; startup cannot consume them first.
 recoveryInitializing.value=false;
 if(accessAllowed.value&&!restored)restoreQuarantine();
 if(legacyImported&&restored)notice.value=ft.value.legacy;
 if(accessAllowed.value)persist();
 if(accessAllowed.value&&pending.value)await checkResult();
});
window.addEventListener('beforeunload',e=>{if(dirty.value||pending.value||request.value.trim()){e.preventDefault();e.returnValue=''}});
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
 <div v-if="listError" class="alert error" role="alert">{{t.listError}} <button @click="load" :disabled="loading">{{t.refresh}}</button></div>
 <div v-if="notice" class="alert success" role="status">{{notice}}</div>
 <div v-if="error" class="alert error" role="alert">{{error}}<button v-if="current&&!pending" @click="showLatest" :disabled="busy">{{t.loadLatest}}</button></div>
 <div v-if="pending" class="alert warning" role="status"><strong>{{t.pending}}</strong><p>{{t.unknown}}</p><div class="button-row"><button :disabled="busy" @click="checkResult()">{{t.check}}</button><button :disabled="busy" @click="checkResult(true)">{{t.retry}}</button></div></div>
 <div v-if="loading" class="loading" role="status">{{t.loading}}</div>
 <section v-if="accessAllowed&&tab==='visits'" class="work-grid">
 <div class="record-list panel"><div class="panel-heading"><h2>{{t.visits}}</h2><button class="icon-button" :disabled="loading" @click="load" :aria-label="t.refresh">↻</button></div><div v-if="!visits.length&&!loading&&!listError" class="empty"><div class="empty-icon" aria-hidden="true">▤</div><h3>{{t.empty}}</h3><p>{{t.emptyHint}}</p></div><button v-for="v in visits" :key="v.id" class="record-item" :class="{selected:current?.id===v.id}" @click="open(v)" :disabled="busy||!!pending"><span class="record-item-top"><strong>{{v.organization}}</strong><span class="badge" :class="v.status.toLowerCase()">{{t[v.status]}}</span></span><span class="record-preview">{{v.notes}}</span><span class="record-meta">{{v.occurredOn||ft.unknown}} · {{t.revision}} {{v.revision}}</span></button></div>
 <article class="editor panel"><div v-if="!editing" class="empty editor-empty"><div class="empty-icon" aria-hidden="true">✎</div><h2>{{t.select}}</h2><p>{{t.copyNote}}</p></div><template v-else><div class="panel-heading"><div><p class="eyebrow">{{t.record}}</p><h2>{{current?.organization||t.new}}</h2></div><button @click="aiOpen=!aiOpen" :aria-expanded="aiOpen">{{t.assist}}</button></div>
 <div class="save-state" :class="{dirty}"><span aria-hidden="true">{{dirty?'○':'●'}}</span>{{statusText}}<span v-if="current" class="revision">{{t.revision}} {{current.revision}}</span></div>
 <aside v-if="aiOpen" class="ai-panel"><div class="panel-heading"><strong>{{t.aiUnavailable}}</strong><button @click="aiOpen=false">{{t.close}}</button></div><p>{{t.aiHint}}</p></aside>
 <form @submit.prevent="save" @compositionstart="composing=true" @compositionend="composing=false"><fieldset :disabled="!editable||!!pending||busy"><div class="field-row"><label for="organization">{{t.organization}}<input id="organization" v-model="form.organization" @input="review.checked=false" :placeholder="t.orgHint" required maxlength="200" autocomplete="off"></label><label for="date">{{t.date}}<input id="date" v-model="form.occurredOn" @input="review.checked=false" type="date"></label></div><p class="field-hint">{{ft.unknownDay}} {{ft.org}}</p><label for="notes">{{t.notes}}<textarea id="notes" v-model="form.notes" @input="review.checked=false" rows="9" required maxlength="4000" aria-describedby="notes-help"></textarea></label><p id="notes-help" class="field-hint">{{t.notesHint}} {{t.visitLimits}}</p>
 <section v-if="editable" class="followup-review" aria-labelledby="review-title"><h3 id="review-title">{{ft.review}}</h3><p>{{ft.manual}}</p><p class="field-hint">{{ft.relativeDayHint}} {{ft.entryDay}}: {{entryDay}}</p>
 <article v-for="(row,index) in review.rows" :key="row.id" class="review-row"><label :for="'review-kind-'+index">{{ft.type}}<select :id="'review-kind-'+index" v-model="row.kind" @change="row.confirmed=false;review.checked=false"><option value="unconfirmed">{{ft.unconfirmed}}</option><option value="customer-request">{{ft.request}}</option><option value="explicit-self-commitment">{{ft.explicit}}</option></select></label><label :for="'review-text-'+index">{{ft.statement}}<textarea :id="'review-text-'+index" v-model="row.text" rows="3" @input="row.confirmed=false;review.checked=false"></textarea></label><template v-if="row.kind==='explicit-self-commitment'"><label :for="'review-deadline-'+index">{{ft.deadline}}<select :id="'review-deadline-'+index" v-model="row.deadlineKind" @change="row.confirmed=false;review.checked=false"><option value="unknown">{{ft.unknown}}</option><option value="date">{{ft.date}}</option><option value="instant">{{ft.instant}}</option></select></label><input v-if="row.deadlineKind!=='unknown'" v-model="row.deadlineValue" :type="row.deadlineKind==='date'?'date':'text'" :aria-label="ft.deadline" placeholder="2026-10-20T15:00:00+08:00" @input="row.confirmed=false;review.checked=false"><label class="check-label"><input type="checkbox" v-model="row.confirmed">{{ft.confirm}}</label></template><button type="button" @click="removeReview(index)">{{ft.remove}}</button></article>
 <button type="button" @click="addReview">＋ {{ft.add}}</button><label class="check-label"><input id="reviewed" type="checkbox" v-model="review.checked">{{ft.reviewed}}</label></section></fieldset>
 <div v-if="editable" class="form-footer"><p class="local-note">{{localOk?t.local:t.localFail}}</p><div class="button-row"><button type="button" class="primary" :disabled="busy||!!pending||composing" @click="save">{{busy?t.busy:ft.localSave}}</button><button type="button" :disabled="busy||!!pending||composing||!review.checked" @click="confirmRecord">{{ft.record}}</button></div><p class="field-hint">{{ft.manual}}</p></div></form>
 <section v-if="current?.status==='RECORDED'&&savedReviewLoaded" class="followup-review"><h3>{{ft.savedReview}}</h3><p v-if="savedReview===null">{{ft.legacyUnreviewed}}</p><p v-else-if="!savedReview.decisions.length">{{ft.noCommitments}}</p><article v-else v-for="(decision,index) in savedReview.decisions" :key="index"><strong>{{decision.kind==='explicit-self-commitment'?ft.explicit:decision.kind==='customer-request'?ft.request:decision.kind==='unconfirmed'?ft.unconfirmed:ft.noCommitments}}</strong><p class="preserve-text">{{decision.commitmentText??decision.requestText??decision.candidateText??''}}</p><p v-if="decision.deadline">{{ft.deadline}}: {{decision.deadline.kind==='unknown'?ft.unknown:decision.deadline.date??decision.deadline.at}}</p></article></section>
 <section v-if="current?.status==='RECORDED'&&role==='rep'" class="related-commitments followup-review" aria-labelledby="related-title"><h3 id="related-title">{{ft.relatedTitle}}</h3><p class="field-hint">{{ft.relatedHint}}</p><p v-if="loading" role="status">{{ft.relatedLoading}}</p><p v-else-if="listError" role="alert">{{ft.relatedFailed}}</p><template v-else><p v-if="!relatedCommitments.length">{{savedReviewLoaded&&savedReview!==null?ft.relatedEmpty:ft.relatedUnknown}}</p><article v-for="c in relatedCommitments" :key="c.id" class="related-commitment"><h4 class="preserve-text">{{c.commitmentText}}</h4><p>{{ft.owner}}: {{ft.me}} · {{c.completionStatus==='completed'?ft.completed:ft.open}}</p><p>{{ft.deadline}}: {{c.deadline.kind==='unknown'?ft.unknown:c.deadline.kind==='date'?c.deadline.date:c.deadline.at}}</p><p>{{ft.progress}}: {{verificationLabel(c.verificationStatus)}} · {{ft.toCustomer}}: {{c.replyToCustomer==='recorded'?ft.recorded:ft.notRecorded}} · {{ft.fromCustomer}}: {{c.replyFromCustomer==='recorded'?ft.recorded:ft.notRecorded}}</p><button type="button" :data-related-id="c.id" :disabled="busy||!!pending" @click="continueRelated(c.id)">{{ft.continueRelated}}</button></article></template></section>
 <dl v-if="current" class="time-meta"><div><dt>{{t.created}}</dt><dd>{{formatTime(current.createdAt)}}</dd></div><div><dt>{{t.updated}}</dt><dd>{{formatTime(current.updatedAt)}}</dd></div><small>{{t.timeZone}}</small></dl>
 <section v-if="current?.status==='RECORDED'&&role==='rep'" class="handoff-form"><h3>{{t.optional}}</h3><p>{{t.optionalHint}}</p><p class="target">{{t.manager}} · manager-a · {{t.synthetic}}</p><label for="request">{{t.request}}<textarea id="request" v-model="request" rows="3" maxlength="2000"></textarea></label><p class="field-hint">{{t.requestLimit}}</p><button :disabled="!request.trim()||busy||!!pending" @click="sendHandoff">{{t.send}}</button><div v-for="h in handoffs.filter(h=>h.visitId===current?.id)" :key="h.id" class="handoff-receipt"><span class="badge">{{t[h.status]}}</span><p>{{h.request}}</p></div></section>
 </template></article></section>
 <section v-else-if="accessAllowed&&tab==='handoffs'" class="handoff-list panel"><div class="panel-heading"><h2>{{t.handoffs}}</h2><button @click="load" :disabled="loading">{{t.refresh}}</button></div><div v-if="!handoffs.length&&!loading&&!listError" class="empty"><h3>{{t.handoffEmpty}}</h3><p>{{t.managerSub}}</p></div><article v-for="h in handoffs" :key="h.id" class="handoff-card"><div class="panel-heading"><h3>{{visits.find(v=>v.id===h.visitId)?.organization||t.record}}</h3><span class="badge" :class="h.status.toLowerCase()">{{t[h.status]}}</span></div><p class="preserve-text">{{h.request}}</p><p class="field-hint">{{t.revision}} {{h.revision}} · {{t.manager}} manager-a</p><div v-if="role==='manager'" class="button-row"><button v-if="h.status==='SENT'" class="primary" :disabled="busy||!!pending" @click="mutate('receive',`/handoffs/${h.id}/receive`,'POST',{expectedRevision:h.revision})">{{t.receive}}</button><button v-if="h.status==='RECEIVED'" class="primary" :disabled="busy||!!pending" @click="mutate('accept',`/handoffs/${h.id}/accept`,'POST',{expectedRevision:h.revision})">{{t.accept}}</button></div></article></section>
 <section v-if="accessAllowed&&role==='rep'&&tab==='commitments'" class="commitment-list panel"><div class="panel-heading"><div><h2>{{ft.list}}</h2><p>{{ft.listHint}}</p></div><button :disabled="loading" @click="load">{{t.refresh}}</button></div><label class="check-label"><input type="checkbox" v-model="showCompleted">{{ft.showCompleted}}</label><p v-if="loading" role="status" data-list-state="loading">{{ft.listLoading}}</p><p v-else-if="listError" role="alert" data-list-state="failed">{{ft.listFailed}}</p><p v-else-if="!visibleCommitments.length" data-list-state="empty">{{showCompleted?ft.emptyAll:ft.empty}}</p>
 <article v-for="c in visibleCommitments" :key="c.id" class="commitment-card"><div class="panel-heading"><h3 class="preserve-text">{{c.commitmentText}}</h3><span class="badge">{{c.completionStatus==='open'?ft.open:ft.completed}}</span></div><p>{{c.source.organizationText||c.source.organizationId}} · {{ft.source}}: {{c.source.occurredOn||ft.unknown}}</p><p>{{ft.deadline}}: {{c.deadline.kind==='unknown'?ft.unknown:c.deadline.kind==='date'?c.deadline.date:c.deadline.at}}</p><dl class="commitment-status"><div><dt>{{ft.progress}}</dt><dd>{{c.verificationStatus==='verified'?ft.verified:c.verificationStatus==='in-progress'?ft.inProgress:ft.notStarted}}</dd></div><div><dt>{{ft.toCustomer}}</dt><dd>{{c.replyToCustomer==='recorded'?ft.recorded:ft.notRecorded}}</dd></div><div><dt>{{ft.fromCustomer}}</dt><dd>{{c.replyFromCustomer==='recorded'?ft.recorded:ft.notRecorded}}</dd></div></dl><p class="field-hint">{{ft.scope}} {{c.contentRevision}} · {{ft.scopeHint}}</p><details :id="'commitment-history-'+c.id"><summary>{{ft.history}}</summary><p class="preserve-text">{{c.source.originalText}}</p><ol><li v-for="e in c.history" :key="e.eventId"><div class="event-history"><strong>{{eventTitle(e.type)}}</strong><p class="field-hint">{{ft.scope}} {{e.contentRevision}} · {{ft.recordedTime}} {{formatTime(e.recordedAt)}}</p><p v-if="e.type==='created'||e.type==='amended'" class="preserve-text">{{e.commitmentText??''}}</p><p v-if="e.type==='amended'||e.type==='reopened'" class="preserve-text">{{ft.reason}}: {{e.reason}}</p><p v-if="e.type==='progress-recorded'">{{verificationLabel(e.status)}}</p><p v-if="e.type==='reply-recorded'">{{e.direction==='from-customer'?ft.fromCustomer:ft.toCustomer}} · {{ft.replyAt}} {{formatTime(e.occurredAt)}}</p><p v-if="e.type==='reply-recorded'||e.type==='progress-recorded'||e.type==='completed'" class="preserve-text">{{e.text}}</p><p v-if="(e.type==='created'||e.type==='amended')&&e.deadline">{{ft.deadline}}: {{e.deadline.kind==='unknown'?ft.unknown:e.deadline.kind==='date'?e.deadline.date:e.deadline.at}}</p></div></li></ol></details><div class="button-row"><button :id="'commitment-action-'+c.id" :disabled="busy||!!pending" @click="selectCommitment(c.id)">{{ft.select}}</button><button type="button" :id="'source-button-'+c.id" :disabled="loading||listError" :aria-expanded="sourcePanel?.commitmentId===c.id" :aria-controls="'source-panel-'+c.id" @click="viewSource(c.id)">{{ft.viewSource}}</button></div><section v-if="sourcePanel?.commitmentId===c.id" :id="'source-panel-'+c.id" class="source-panel" :aria-labelledby="'source-title-'+c.id"><div class="panel-heading"><h4 :id="'source-title-'+c.id">{{ft.sourceRecord}}</h4><button type="button" @click="closeSource()">{{ft.backToFollowup}}</button></div><p class="field-hint">{{ft.sourceReadOnly}}</p><p v-if="sourcePanel.state==='loading'" role="status">{{ft.sourceLoading}}</p><template v-else-if="sourcePanel.state==='loaded'&&sourcePanel.visit"><p><strong>{{sourcePanel.visit.organization}}</strong> · {{sourcePanel.visit.occurredOn||ft.unknown}}</p><p class="preserve-text source-record-notes">{{sourcePanel.visit.notes}}</p><p>{{t.recorded}} · {{ft.recordedTime}} {{formatTime(sourcePanel.visit.updatedAt)}}</p></template><p v-else role="alert">{{sourcePanel.state==='missing'?ft.sourceMissing:ft.sourceFailed}}</p><button v-if="sourcePanel.state==='failed'||sourcePanel.state==='missing'" type="button" @click="viewSource(c.id)">{{t.refresh}}</button></section></article>
 <form v-if="selectedCommitment" class="followup-review" @submit.prevent="appendEvent"><fieldset :disabled="busy||!!pending"><h3>{{ft.action}}</h3><p class="field-hint">{{ft.boundScope}} {{eventDraft.target?.contentRevision??ft.unbound}} · {{t.revision}} {{eventDraft.target?.revision??'—'}}</p><p class="preserve-text">{{eventDraft.target?.commitmentText??ft.unbound}}</p><p v-if="eventDraft.target">{{ft.deadline}}: {{eventDraft.target.deadline.kind==='unknown'?ft.unknown:eventDraft.target.deadline.kind==='date'?eventDraft.target.deadline.date:eventDraft.target.deadline.at}} · {{eventDraft.target.completionStatus==='completed'?ft.completed:ft.open}}</p><div v-if="eventTargetChanged" class="alert warning"><strong>{{ft.targetConflict}}</strong><p>{{ft.latestScope}} {{selectedCommitment.contentRevision}} · {{t.revision}} {{selectedCommitment.revision}}</p><p class="preserve-text">{{selectedCommitment.commitmentText}}</p><p>{{ft.deadline}}: {{selectedCommitment.deadline.kind==='unknown'?ft.unknown:selectedCommitment.deadline.kind==='date'?selectedCommitment.deadline.date:selectedCommitment.deadline.at}}</p><label class="check-label"><input id="scope-reviewed" type="checkbox" v-model="eventDraft.scopeReviewed">{{ft.scopeReviewConfirm}}</label><button type="button" :disabled="!eventDraft.scopeReviewed" @click="rebindEventTarget">{{ft.rebind}}</button></div><label for="event-type">{{ft.type}}<select id="event-type" v-model="eventDraft.type" @change="eventTypeChanged"><option value="progress-recorded" :disabled="selectedCommitment.completionStatus==='completed'">{{ft.progress}}</option><option value="reply-recorded">{{ft.reply}}</option><option value="completed" :disabled="selectedCommitment.completionStatus==='completed'">{{ft.complete}}</option><option value="amended" :disabled="selectedCommitment.completionStatus==='completed'">{{ft.amend}}</option><option value="reopened" :disabled="selectedCommitment.completionStatus==='open'">{{ft.reopen}}</option></select></label><label v-if="eventDraft.type==='progress-recorded'">{{ft.progress}}<select v-model="eventDraft.status"><option value="not-started">{{ft.notStarted}}</option><option value="in-progress">{{ft.inProgress}}</option><option value="verified">{{ft.verified}}</option></select></label><template v-if="eventDraft.type==='reply-recorded'"><p>{{ft.replyHint}}</p><label for="reply-scope">{{ft.replyScope}}<select id="reply-scope" v-model="eventDraft.replyScope" required><option value="" disabled>{{ft.chooseScope}}</option><option v-for="scope in replyScopes" :key="scope.contentRevision" :value="String(scope.contentRevision)">{{ft.scope}} {{scope.contentRevision}} · {{scope.commitmentText}}</option></select></label><label>{{ft.direction}}<select v-model="eventDraft.direction"><option value="from-customer">{{ft.fromCustomer}}</option><option value="to-customer">{{ft.toCustomer}}</option></select></label><label>{{ft.replyAt}}<input v-model="eventDraft.occurredAt" placeholder="2026-10-20T15:00:00+08:00" required></label></template><label v-if="['progress-recorded','reply-recorded','completed'].includes(eventDraft.type)">{{ft.text}}<textarea v-model="eventDraft.text" rows="3" required></textarea></label><label v-if="['amended','reopened'].includes(eventDraft.type)">{{ft.reason}}<textarea v-model="eventDraft.reason" rows="2" required></textarea></label><template v-if="eventDraft.type==='amended'"><label>{{ft.newText}}<textarea v-model="eventDraft.newText" rows="3"></textarea></label><label class="check-label"><input type="checkbox" v-model="eventDraft.changeDeadline">{{ft.changeDeadline}}</label><template v-if="eventDraft.changeDeadline"><label>{{ft.deadline}}<select v-model="eventDraft.deadlineKind"><option value="unknown">{{ft.unknown}}</option><option value="date">{{ft.date}}</option><option value="instant">{{ft.instant}}</option></select></label><input v-if="eventDraft.deadlineKind!=='unknown'" v-model="eventDraft.deadlineValue" :type="eventDraft.deadlineKind==='date'?'date':'text'" :aria-label="ft.deadline"></template></template><label v-if="eventDraft.type==='completed'" class="check-label"><input type="checkbox" v-model="eventDraft.confirmed">{{ft.completeConfirm}}</label><div class="button-row"><button type="submit" class="primary">{{ft.append}}</button><button type="button" @click="cancelEvent">{{ft.cancel}}</button></div></fieldset></form></section>
 <section v-if="latest" class="panel conflict-panel"><h2>{{t.serverVersion}} · {{t.revision}} {{latest.revision}}</h2><p><strong>{{latest.organization}}</strong> · {{latest.occurredOn}} · {{t[latest.status]}}</p><p class="preserve-text">{{latest.notes}}</p><button :disabled="latest.status==='RECORDED'" @click="rebase">{{t.useLatest}}</button></section>
 <footer class="page-footer">AICRM · {{t.synthetic}} · {{t.copyNote}}</footer></main></div>
</div>
</template>
