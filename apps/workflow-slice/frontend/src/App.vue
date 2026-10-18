<script setup lang="ts">
import {computed,nextTick,onMounted,reactive,ref,watch} from 'vue';
import {api,ApiError} from './api';
import {copy} from './i18n';
type Visit={id:string;revision:number;status:'DRAFT'|'RECORDED';organization:string;occurredOn:string;notes:string;ownerId:string;createdAt:string;updatedAt:string};
type Handoff={id:string;visitId:string;revision:number;status:'SENT'|'RECEIVED'|'ACCEPTED';request:string};
type Pending={key:string;path:string;method:string;body:any;kind:'save'|'confirm'|'handoff'|'receive'|'accept';role:string};
const lang=ref<'zh'|'en'>('zh'),t=computed(()=>copy[lang.value]),role=ref('rep'),visits=ref<Visit[]>([]),handoffs=ref<Handoff[]>([]),current=ref<Visit|null>(null),editing=ref(false),form=reactive({organization:'',occurredOn:'',notes:''}),request=ref(''),pending=ref<Pending|null>(null),busy=ref(false),loading=ref(false),error=ref(''),notice=ref(''),listError=ref(false),aiOpen=ref(false),latest=ref<Visit|null>(null),localOk=ref(true),composing=ref(false),context=ref<{id:string;role:string;tenant:string}|null>(null),tab=ref('visits');
const accessAllowed=ref(false); let accessEpoch=0;
const storageKey='aicrm-synthetic-slice-v1';
const recoveryIssue=ref<'preserved'|'blocked'|null>(null);
const unpreservedRecovery:{key:string;raw:string}[]=[];
const isObject=(value:any):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const validTime=(value:any)=>typeof value==='string'&&value.length>0&&Number.isFinite(Date.parse(value));
function validRecovery(value:any){
 if(!isObject(value)||(value.schemaVersion!==undefined&&value.schemaVersion!==1)||!['rep','manager'].includes(value.role)||typeof value.identity!=='string'||!['zh','en'].includes(value.lang)||typeof value.editing!=='boolean'||!['visits','handoffs'].includes(value.tab)||typeof value.request!=='string')return false;
 const fields=['organization','occurredOn','notes'];
 if(!isObject(value.form)||Object.keys(value.form).length!==fields.length||!fields.every(key=>typeof value.form[key]==='string'))return false;
 const record=value.current;
 if(record!==null&&(!isObject(record)||!['id','organization','occurredOn','notes','ownerId'].every(key=>typeof record[key]==='string')||!Number.isSafeInteger(record.revision)||record.revision<1||!['DRAFT','RECORDED'].includes(record.status)||!validTime(record.createdAt)||!validTime(record.updatedAt)))return false;
 if(!value.editing&&(record!==null||Object.values(value.form).some(Boolean)||value.request))return false;
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
  }catch{recoveryIssue.value='blocked';localOk.value=false;return false}
 }
 if(recoveryIssue.value)recoveryIssue.value='preserved';
 return true;
}
function readRecovery(raw:string,key:string){
 try{const value=JSON.parse(raw);if(validRecovery(value))return value}catch{/* Preserve malformed bytes without interpreting or rewriting them. */}
 if(!unpreservedRecovery.some(entry=>entry.key===key&&entry.raw===raw))unpreservedRecovery.push({key,raw});
 recoveryIssue.value='blocked';preserveRejectedRecovery();return null;
}
const heldInMemory=new Map<string,any>();
const snapshot=()=>({organization:form.organization,occurredOn:form.occurredOn,notes:form.notes});
const dirty=computed(()=>editing.value&&(!current.value?Object.values(snapshot()).some(Boolean):JSON.stringify(snapshot())!==JSON.stringify({organization:current.value.organization,occurredOn:current.value.occurredOn,notes:current.value.notes})));
const editable=computed(()=>accessAllowed.value&&role.value==='rep'&&current.value?.status!=='RECORDED');
const statusText=computed(()=>dirty.value?t.value.unsaved:current.value?.status==='RECORDED'?t.value.immutable:current.value?t.value.saved:t.value.fresh);
const formatTime=(date:unknown)=>validTime(date)?new Intl.DateTimeFormat(lang.value==='zh'?'zh-CN':'en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(date as string)):t.value.timeUnavailable;
function recoverySnapshot(){return {schemaVersion:1,role:role.value,identity:context.value?.id,lang:lang.value,current:current.value,editing:editing.value,form:snapshot(),request:request.value,pending:pending.value,tab:tab.value}}
function persist(){if(!preserveRejectedRecovery())return;try { if(!accessAllowed.value){sessionStorage.removeItem(storageKey);return}sessionStorage.setItem(storageKey,JSON.stringify(recoverySnapshot()));localOk.value=true}catch{localOk.value=false}}
function restoreCandidate(s:any){if(!validRecovery(s))return false;if(!accessAllowed.value||!s||s.role!==role.value||s.identity!==context.value?.id||s.current&&!visits.value.some(v=>v.id===s.current.id))return false;current.value=s.current;editing.value=!!s.editing;Object.assign(form,s.form);request.value=s.request??'';pending.value=s.pending;tab.value=s.tab??'visits';notice.value=t.value.retained;return true}
function restoreQuarantine(){if(editing.value||pending.value)return;try{const key=storageKey+'-held-'+role.value;const raw=sessionStorage.getItem(key);const held=heldInMemory.get(role.value)??(raw?readRecovery(raw,key):null);if(held&&restoreCandidate(held)){sessionStorage.removeItem(key);heldInMemory.delete(role.value)}}catch{localOk.value=false}}
watch([form,current,editing,request,pending,role,lang,tab],persist,{deep:true});
watch(lang,()=>{document.documentElement.lang=lang.value==='zh'?'zh-CN':'en';document.title='AICRM · '+t.value.workspace});
function isolateEditor(){if(dirty.value||request.value.trim()||pending.value){const held=recoverySnapshot();heldInMemory.set(role.value,held);try{sessionStorage.setItem(storageKey+'-held-'+role.value,JSON.stringify(held))}catch{localOk.value=false}}current.value=null;latest.value=null;editing.value=false;pending.value=null;request.value='';Object.assign(form,{organization:'',occurredOn:'',notes:''});notice.value='';try{sessionStorage.removeItem(storageKey)}catch{localOk.value=false}}
function revokeAccess(){if(dirty.value||request.value.trim()||pending.value)heldInMemory.set(role.value,recoverySnapshot());try{if(heldInMemory.has(role.value))sessionStorage.setItem(storageKey+'-held-'+role.value,JSON.stringify(heldInMemory.get(role.value)))}catch{localOk.value=false}accessEpoch++;accessAllowed.value=false;visits.value=[];handoffs.value=[];current.value=null;latest.value=null;context.value=null;editing.value=false;pending.value=null;request.value='';Object.assign(form,{organization:'',occurredOn:'',notes:''});notice.value='';error.value=t.value.accessChanged;try{sessionStorage.removeItem(storageKey)}catch{localOk.value=false}}
function isAccessError(e:unknown){return e instanceof ApiError&&(e.status===401||e.status===403)}
function explain(e:unknown){if(e instanceof ApiError){if(e.status===409)return t.value.conflict; if(e.status===401||e.status===403)return `${t.value.error} (${e.status}: ${e.code})`;return `${t.value.error} (${e.code})`}return t.value.unknown}
async function load(){const epoch=++accessEpoch;loading.value=true;listError.value=false;try{const ctx=await api<{id:string;role:string;tenant:string}>(role.value,'/context');const [v,h]=await Promise.all([api<Visit[]>(role.value,'/visits'),api<Handoff[]>(role.value,'/handoffs')]);if(epoch!==accessEpoch)return;const identityChanged=!!context.value&&context.value.id!==ctx.id;const selectedUnavailable=!!current.value&&!v.some(item=>item.id===current.value!.id);if(identityChanged||selectedUnavailable){isolateEditor();error.value=t.value.scopeChanged}if(latest.value&&!v.some(item=>item.id===latest.value!.id))latest.value=null;context.value=ctx;visits.value=v;handoffs.value=h;accessAllowed.value=true;restoreQuarantine()}catch(e){if(isAccessError(e))revokeAccess();listError.value=true}finally{loading.value=false}}
function leaveAllowed(){return !pending.value&&!busy.value&&(!(dirty.value||request.value.trim())||window.confirm(t.value.discard))}
function open(v:Visit){if(!accessAllowed.value||!leaveAllowed())return;current.value={...v};Object.assign(form,{organization:v.organization,occurredOn:v.occurredOn,notes:v.notes});editing.value=true;error.value='';notice.value='';latest.value=null;request.value=''}
function fresh(){if(!accessAllowed.value||!leaveAllowed())return;current.value=null;Object.assign(form,{organization:'',occurredOn:'',notes:''});editing.value=true;request.value='';error.value='';notice.value='';latest.value=null;tab.value='visits';nextTick(()=>document.getElementById('organization')?.focus())}
async function switchRole(event:Event){const target=event.target as HTMLSelectElement;if(!leaveAllowed()){target.value=role.value;return}accessAllowed.value=false;accessEpoch++;role.value=target.value;current.value=null;editing.value=false;Object.assign(form,{organization:'',occurredOn:'',notes:''});request.value='';visits.value=[];handoffs.value=[];context.value=null;error.value='';notice.value='';latest.value=null;tab.value=role.value==='manager'?'handoffs':'visits';await load()}
function updateResult(p:Pending,result:any){
 if(!accessAllowed.value)return;
 if(p.kind==='save'||p.kind==='confirm'){
  current.value=result; editing.value=true;
  // The receipt describes the submitted snapshot; never overwrite newer input.
  if(p.kind==='confirm')Object.assign(form,{organization:result.organization,occurredOn:result.occurredOn,notes:result.notes});
 }
 if(p.kind==='handoff'&&request.value===p.body.request)request.value='';
 pending.value=null;notice.value=t.value.success;error.value='';latest.value=null;persist();
}
async function perform(p:Pending){if(!accessAllowed.value)return;const epoch=accessEpoch;busy.value=true;error.value='';notice.value='';try{const result=await api(p.role,p.path,p.method,p.body,p.key);if(!accessAllowed.value||epoch!==accessEpoch)return;updateResult(p,result);await load()}catch(e){if(isAccessError(e)){revokeAccess();return}error.value=explain(e);if(e instanceof ApiError&&e.status<500){pending.value=null;persist()}}finally{busy.value=false}}
async function mutate(kind:Pending['kind'],path:string,method:string,body:any){if(!accessAllowed.value||busy.value||pending.value)return;const p={kind,path,method,body,key:crypto.randomUUID(),role:role.value};pending.value=p;persist();await perform(p)}
async function save(){if(composing.value||current.value&&!dirty.value)return;if(!['organization','occurredOn','notes'].every(key=>typeof form[key as keyof typeof form]==='string')){error.value=t.value.invalidDraft;return}if(form.organization.length>200||form.notes.length>4000){error.value=t.value.visitLengthError;return}if(!form.organization.trim()||!form.occurredOn||!form.notes.trim()){error.value=t.value.required;return}if(current.value){await mutate('save',`/visits/${current.value.id}`,'PUT',{...snapshot(),expectedRevision:current.value.revision})}else await mutate('save','/visits','POST',snapshot())}
async function confirmRecord(){if(!current.value||dirty.value||current.value.status!=='DRAFT'){error.value=t.value.cannotConfirm;return}await mutate('confirm',`/visits/${current.value.id}/confirm`,'POST',{expectedRevision:current.value.revision})}
async function sendHandoff(){if(request.value.length>2000){error.value=t.value.requestLengthError;return}if(!current.value||!request.value.trim())return;await mutate('handoff',`/visits/${current.value.id}/handoffs`,'POST',{expectedRevision:current.value.revision,request:request.value})}
async function checkResult(retryIfMissing=false){if(!accessAllowed.value||!pending.value||busy.value)return;const original=pending.value;busy.value=true;let retry=false;try{const result=await api(original.role,`/commands/${original.key}`);updateResult(original,result);await load()}catch(e){if(isAccessError(e)){revokeAccess();return}if(e instanceof ApiError&&e.status===404){error.value=t.value.notFound;retry=retryIfMissing}else error.value=explain(e)}finally{busy.value=false}if(retry&&accessAllowed.value&&pending.value?.key===original.key)await perform(original)}
async function showLatest(){if(!current.value||!accessAllowed.value)return;const epoch=accessEpoch;busy.value=true;try{const all=await api<Visit[]>(role.value,'/visits');if(!accessAllowed.value||epoch!==accessEpoch)return;latest.value=all.find(v=>v.id===current.value!.id)??null;visits.value=all;if(!latest.value){isolateEditor();error.value=t.value.scopeChanged}}catch(e){if(isAccessError(e))revokeAccess();else error.value=explain(e)}finally{busy.value=false}}
function rebase(){if(!latest.value)return;if(latest.value.status==='RECORDED'){error.value=t.value.serverRecorded;return}current.value=latest.value;latest.value=null;error.value='';notice.value=t.value.review}
function changeLanguage(){if(composing.value)return;const focused=document.activeElement as HTMLElement;lang.value=lang.value==='zh'?'en':'zh';nextTick(()=>focused?.focus())}
onMounted(async()=>{let recovered:any=null;try{const raw=sessionStorage.getItem(storageKey);if(raw){recovered=readRecovery(raw,storageKey);if(recovered&&['rep','manager'].includes(recovered.role))role.value=recovered.role;if(recovered&&['zh','en'].includes(recovered.lang))lang.value=recovered.lang}}catch{localOk.value=false}await load();if(accessAllowed.value&&recovered&&!editing.value){if(!restoreCandidate(recovered)){try{sessionStorage.setItem(storageKey+'-held-'+role.value,JSON.stringify(recovered))}catch{localOk.value=false}}}if(accessAllowed.value&&pending.value)await checkResult()});
window.addEventListener('beforeunload',e=>{if(dirty.value||pending.value||request.value.trim()){e.preventDefault();e.returnValue=''}});
</script>

<template>
<div class="app-shell">
 <aside class="sidebar"><div class="brand"><span class="brand-mark">A</span><strong>AICRM</strong></div><span class="workspace-label">{{t.workspace}}</span><nav aria-label="Workspace"><button :class="{active:tab==='visits'}" @click="tab='visits'"><span aria-hidden="true">▤</span>{{t.visits}}</button><button :class="{active:tab==='handoffs'}" @click="tab='handoffs'"><span aria-hidden="true">↗</span>{{t.handoffs}}<span class="nav-count">{{handoffs.length}}</span></button></nav><div class="sidebar-foot"><span class="tiny-dot"></span>{{t.synthetic}}<small>AICRM / 0.1</small></div></aside>
 <div class="main-shell"><header class="topbar"><span>{{t.today}}</span><div class="top-actions"><label class="sr-only" for="role">{{t.scope}}</label><select id="role" :value="role" :disabled="busy||!!pending" @change="switchRole"><option value="rep">{{t.representative}}</option><option value="manager">{{t.manager}}</option></select><button class="language" :disabled="composing" :aria-label="t.language" @click="changeLanguage">{{lang==='zh'?'English':'简体中文'}}</button></div></header>
 <main><div class="demo-banner"><strong>{{t.demo}}</strong><span>{{t.demoInfo}}</span></div><section class="page-heading"><div><p class="eyebrow">{{role==='rep'?t.representative:t.manager}} · {{context?.tenant??'—'}}</p><h1>{{role==='rep'?t.title:t.managerTitle}}</h1><p>{{role==='rep'?t.subtitle:t.managerSub}}</p></div><button v-if="role==='rep'" class="primary" :disabled="!accessAllowed||busy||!!pending" @click="fresh">＋ {{t.new}}</button></section>
 <div v-if="accessAllowed" class="summary-grid"><div><span>{{t.drafts}}</span><strong>{{loading&&!context?'—':visits.filter(v=>v.status==='DRAFT').length}}</strong></div><div><span>{{t.recorded}}</span><strong>{{loading&&!context?'—':visits.filter(v=>v.status==='RECORDED').length}}</strong></div><div><span>{{t.handoffCount}}</span><strong>{{loading&&!context?'—':handoffs.length}}</strong></div></div>
 <div v-if="recoveryIssue" class="alert warning" role="alert">{{recoveryIssue==='blocked'?t.recoveryBlocked:t.recoveryInvalid}}</div>
 <div v-if="!localOk&&!recoveryIssue" class="alert warning" role="alert">{{t.localFail}}</div>
 <div v-if="listError" class="alert error" role="alert">{{t.listError}} <button @click="load" :disabled="loading">{{t.refresh}}</button></div>
 <div v-if="notice" class="alert success" role="status">{{notice}}</div>
 <div v-if="error" class="alert error" role="alert">{{error}}<button v-if="current&&!pending" @click="showLatest" :disabled="busy">{{t.loadLatest}}</button></div>
 <div v-if="pending" class="alert warning" role="status"><strong>{{t.pending}}</strong><p>{{t.unknown}}</p><div class="button-row"><button :disabled="busy" @click="checkResult()">{{t.check}}</button><button :disabled="busy" @click="checkResult(true)">{{t.retry}}</button></div></div>
 <div v-if="loading" class="loading" role="status">{{t.loading}}</div>
 <section v-if="accessAllowed&&tab==='visits'" class="work-grid">
 <div class="record-list panel"><div class="panel-heading"><h2>{{t.visits}}</h2><button class="icon-button" :disabled="loading" @click="load" :aria-label="t.refresh">↻</button></div><div v-if="!visits.length&&!loading&&!listError" class="empty"><div class="empty-icon" aria-hidden="true">▤</div><h3>{{t.empty}}</h3><p>{{t.emptyHint}}</p></div><button v-for="v in visits" :key="v.id" class="record-item" :class="{selected:current?.id===v.id}" @click="open(v)" :disabled="busy||!!pending"><span class="record-item-top"><strong>{{v.organization}}</strong><span class="badge" :class="v.status.toLowerCase()">{{t[v.status]}}</span></span><span class="record-preview">{{v.notes}}</span><span class="record-meta">{{v.occurredOn}} · {{t.revision}} {{v.revision}}</span></button></div>
 <article class="editor panel"><div v-if="!editing" class="empty editor-empty"><div class="empty-icon" aria-hidden="true">✎</div><h2>{{t.select}}</h2><p>{{t.copyNote}}</p></div><template v-else><div class="panel-heading"><div><p class="eyebrow">{{t.record}}</p><h2>{{current?.organization||t.new}}</h2></div><button @click="aiOpen=!aiOpen" :aria-expanded="aiOpen">{{t.assist}}</button></div>
 <div class="save-state" :class="{dirty}"><span aria-hidden="true">{{dirty?'○':'●'}}</span>{{statusText}}<span v-if="current" class="revision">{{t.revision}} {{current.revision}}</span></div>
 <aside v-if="aiOpen" class="ai-panel"><div class="panel-heading"><strong>{{t.aiUnavailable}}</strong><button @click="aiOpen=false">{{t.close}}</button></div><p>{{t.aiHint}}</p></aside>
 <form @submit.prevent="save" @compositionstart="composing=true" @compositionend="composing=false"><fieldset :disabled="!editable||pending?.kind==='confirm'"><div class="field-row"><label for="organization">{{t.organization}}<input id="organization" v-model="form.organization" :placeholder="t.orgHint" required maxlength="200" autocomplete="off"></label><label for="date">{{t.date}}<input id="date" v-model="form.occurredOn" type="date" required></label></div><label for="notes">{{t.notes}}<textarea id="notes" v-model="form.notes" rows="9" required maxlength="4000" aria-describedby="notes-help"></textarea></label><p id="notes-help" class="field-hint">{{t.notesHint}} {{t.visitLimits}}</p></fieldset>
 <div v-if="editable" class="form-footer"><p class="local-note">{{localOk?t.local:t.localFail}}</p><div class="button-row"><button type="button" class="primary" :disabled="busy||!!pending||composing||!!current&&!dirty" @click="save">{{busy?t.busy:t.save}}</button><button type="button" :disabled="busy||!!pending||dirty||!current||composing" @click="confirmRecord">{{t.confirm}}</button></div><p class="field-hint">{{dirty?t.review:t.confirmHint}}</p></div></form>
 <dl v-if="current" class="time-meta"><div><dt>{{t.created}}</dt><dd>{{formatTime(current.createdAt)}}</dd></div><div><dt>{{t.updated}}</dt><dd>{{formatTime(current.updatedAt)}}</dd></div><small>{{t.timeZone}}</small></dl>
 <section v-if="current?.status==='RECORDED'&&role==='rep'" class="handoff-form"><h3>{{t.optional}}</h3><p>{{t.optionalHint}}</p><p class="target">{{t.manager}} · manager-a · {{t.synthetic}}</p><label for="request">{{t.request}}<textarea id="request" v-model="request" rows="3" maxlength="2000"></textarea></label><p class="field-hint">{{t.requestLimit}}</p><button :disabled="!request.trim()||busy||!!pending" @click="sendHandoff">{{t.send}}</button><div v-for="h in handoffs.filter(h=>h.visitId===current?.id)" :key="h.id" class="handoff-receipt"><span class="badge">{{t[h.status]}}</span><p>{{h.request}}</p></div></section>
 </template></article></section>
 <section v-else-if="accessAllowed" class="handoff-list panel"><div class="panel-heading"><h2>{{t.handoffs}}</h2><button @click="load" :disabled="loading">{{t.refresh}}</button></div><div v-if="!handoffs.length&&!loading&&!listError" class="empty"><h3>{{t.handoffEmpty}}</h3><p>{{t.managerSub}}</p></div><article v-for="h in handoffs" :key="h.id" class="handoff-card"><div class="panel-heading"><h3>{{visits.find(v=>v.id===h.visitId)?.organization||t.record}}</h3><span class="badge" :class="h.status.toLowerCase()">{{t[h.status]}}</span></div><p class="preserve-text">{{h.request}}</p><p class="field-hint">{{t.revision}} {{h.revision}} · {{t.manager}} manager-a</p><div v-if="role==='manager'" class="button-row"><button v-if="h.status==='SENT'" class="primary" :disabled="busy||!!pending" @click="mutate('receive',`/handoffs/${h.id}/receive`,'POST',{expectedRevision:h.revision})">{{t.receive}}</button><button v-if="h.status==='RECEIVED'" class="primary" :disabled="busy||!!pending" @click="mutate('accept',`/handoffs/${h.id}/accept`,'POST',{expectedRevision:h.revision})">{{t.accept}}</button></div></article></section>
 <section v-if="latest" class="panel conflict-panel"><h2>{{t.serverVersion}} · {{t.revision}} {{latest.revision}}</h2><p><strong>{{latest.organization}}</strong> · {{latest.occurredOn}} · {{t[latest.status]}}</p><p class="preserve-text">{{latest.notes}}</p><button :disabled="latest.status==='RECORDED'" @click="rebase">{{t.useLatest}}</button></section>
 <footer class="page-footer">AICRM · {{t.synthetic}} · {{t.copyNote}}</footer></main></div>
</div>
</template>
