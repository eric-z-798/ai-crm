<script setup lang="ts">
import {computed,nextTick,reactive,ref,watch} from 'vue';
import {defaultCriteria,selectVisits,validCriteria,fallbackAnchor,type ListVisit} from './visit-list';
import {preferenceKey,readPreferences,savePreferences,type PreferenceStatus} from './list-preferences';
import {preferenceCopy} from './list-preferences-i18n';
import {listCopy} from './visit-list-i18n';
type Row=ListVisit&{occurredOn:string|null;revision:number};
const props=defineProps<{visits:Row[];lang:'zh'|'en';disabled:boolean;loading:boolean;loadError:boolean;active:boolean;currentId:string|null;scope:string}>();
const emit=defineEmits<{select:[id:string];refresh:[]}>();
const text=computed(()=>listCopy[props.lang]),draft=reactive(defaultCriteria()),applied=ref(defaultCriteria());
const preferenceStatus=ref<PreferenceStatus>(''),preferenceText=computed(()=>preferenceCopy[props.lang]);
const preferenceDisabled=computed(()=>props.disabled||props.loading||props.loadError||!preferenceKey(props.scope));
function saveSettings(){if(preferenceDisabled.value||unapplied.value)return;preferenceStatus.value=savePreferences(props.scope,applied.value,()=>localStorage);}
function restoreSettings(){if(preferenceDisabled.value)return;const result=readPreferences(props.scope,()=>localStorage);preferenceStatus.value=result.status;if(result.criteria){Object.assign(draft,result.criteria);applied.value={...result.criteria};inputError.value=false;resetPosition();}}
const rows=computed(()=>selectVisits(props.visits,applied.value));
const unapplied=computed(()=>JSON.stringify(draft)!==JSON.stringify(applied.value));
const inputError=ref(false),positionChanged=ref(false),scroll=ref<HTMLElement|null>(null);
let bookmark:{id:string|null;offset:number;order:string[]}|null=null,opener:string|null=null;
function elements(){return scroll.value?Array.from(scroll.value.querySelectorAll<HTMLButtonElement>('[data-visit-id]')):[];}
function capture(){
 const box=scroll.value;if(!box||!props.active)return;
 const all=elements(),top=box.getBoundingClientRect().top;
 const first=all.find(e=>e.getBoundingClientRect().bottom>top)||all[0];
 bookmark={id:first?.dataset.visitId??null,offset:first?first.getBoundingClientRect().top-top:0,order:all.map(e=>e.dataset.visitId!)};
}
async function restore(focus=false){
 await nextTick();const box=scroll.value;if(!box||!props.active)return;
 const all=elements(),ids=all.map(e=>e.dataset.visitId!);
 if(bookmark){const targetId=fallbackAnchor(bookmark.order,ids,bookmark.id);const node=all.find(e=>e.dataset.visitId===targetId);
  if(targetId!==bookmark.id)positionChanged.value=true;
  if(node)box.scrollTop+=node.getBoundingClientRect().top-box.getBoundingClientRect().top-bookmark.offset;
  else box.scrollTop=0;
 }
 if(focus){const target=all.find(e=>e.dataset.visitId===opener);if(target)target.focus({preventScroll:true});else box.focus({preventScroll:true});}
}
function apply(){if(props.disabled)return;inputError.value=!validCriteria(draft);if(inputError.value)return;applied.value={...draft};resetPosition();}
function cancel(){if(props.disabled)return;Object.assign(draft,applied.value);inputError.value=false;}
function reset(){if(props.disabled)return;Object.assign(draft,defaultCriteria());applied.value=defaultCriteria();inputError.value=false;resetPosition();}
function resetPosition(){bookmark=null;positionChanged.value=false;nextTick(()=>{if(scroll.value)scroll.value.scrollTop=0});}
function select(id:string){if(props.disabled)return;capture();opener=id;emit('select',id);}
function refresh(){if(props.disabled)return;capture();emit('refresh');}
function returnToList(){if(props.disabled)return;restore(true);}
watch(()=>props.visits,()=>{capture();restore();},{flush:'pre'});
watch(()=>props.active,(active,was)=>{if(!active&&was){ // v-show has not hidden the element yet.
 const box=scroll.value;if(box){const all=elements(),top=box.getBoundingClientRect().top,first=all.find(e=>e.getBoundingClientRect().bottom>top)||all[0];bookmark={id:first?.dataset.visitId??null,offset:first?first.getBoundingClientRect().top-top:0,order:all.map(e=>e.dataset.visitId!)};}
 }else if(active)restore(true);
},{flush:'pre'});
watch(()=>props.lang,()=>{capture();restore();},{flush:'pre'});
watch(()=>props.scope,()=>{preferenceStatus.value='';opener=null;Object.assign(draft,defaultCriteria());applied.value=defaultCriteria();inputError.value=false;resetPosition();});
defineExpose({returnToList});
</script>
<template>
 <div class="record-list panel visit-list-panel">
  <div class="panel-heading"><h2>{{text.title}}</h2><button id="visit-list-refresh" class="icon-button" :disabled="disabled" @click="refresh" :aria-label="text.refresh">↻</button></div>
  <form class="visit-list-controls" @submit.prevent="apply"><fieldset :disabled="disabled">
   <label for="visit-list-query">{{text.search}}<input id="visit-list-query" v-model="draft.query" :aria-invalid="inputError" :aria-describedby="inputError?'visit-list-error':undefined" @input="inputError=false"></label>
   <label for="visit-list-sort">{{text.sort}}<select id="visit-list-sort" v-model="draft.sort"><option value="newest">{{text.newest}}</option><option value="oldest">{{text.oldest}}</option></select></label>
   <label for="visit-list-status">{{text.status}}<select id="visit-list-status" v-model="draft.status"><option value="ALL">{{text.all}}</option><option value="DRAFT">{{text.draft}}</option><option value="RECORDED">{{text.recorded}}</option></select></label>
   <div class="button-row"><button id="visit-list-apply" type="submit">{{text.apply}}</button><button id="visit-list-cancel" type="button" @click="cancel">{{text.cancel}}</button><button id="visit-list-reset" type="button" @click="reset">{{text.reset}}</button></div>
  </fieldset><p v-if="inputError" id="visit-list-error" role="alert">{{text.length}}</p><p v-if="unapplied" id="visit-list-unapplied" role="status">{{text.unapplied}}</p></form>
  <div class="visit-list-preferences"><p class="field-hint">{{preferenceText.local}}</p><div class="button-row"><button id="visit-list-save-settings" :disabled="preferenceDisabled||unapplied" @click="saveSettings">{{preferenceText.save}}</button><button id="visit-list-restore-settings" :disabled="preferenceDisabled" @click="restoreSettings">{{preferenceText.restore}}</button></div><p class="field-hint">{{preferenceText.replaces}}</p><p v-if="unapplied" class="field-hint">{{preferenceText.applyFirst}}</p><p v-if="preferenceStatus" id="visit-list-preference-status" role="status">{{preferenceText[preferenceStatus]}}</p></div>
  <div class="visit-list-summary"><p id="visit-list-applied">{{text.applied}}: {{applied.query.trim()||text.noQuery}} · {{applied.status==='ALL'?text.all:applied.status==='DRAFT'?text.draft:text.recorded}} · {{applied.sort==='newest'?text.newest:text.oldest}}</p><p id="visit-list-count">{{text.count}}: {{rows.length}} / {{visits.length}}</p><p class="field-hint">{{text.session}}</p>
   <p v-if="currentId&&visits.some(v=>v.id===currentId)&&!rows.some(v=>v.id===currentId)" id="visit-list-current-hidden" role="status">{{text.outside}}</p>
   <p v-if="positionChanged" id="visit-list-position-changed" role="status">{{text.changed}}</p>
   <p v-if="loading" role="status">{{text.loading}}</p><p v-else-if="loadError" id="visit-list-load-error" role="alert">{{text.error}}</p>
  </div>
  <div id="visit-list-scroll" ref="scroll" class="visit-list-scroll" tabindex="-1" :aria-label="text.title">
   <div v-if="!loading&&!loadError&&!visits.length" class="empty"><h3>{{text.empty}}</h3></div>
   <div v-else-if="!loading&&!loadError&&!rows.length" id="visit-list-no-match" class="empty"><h3>{{text.noMatch}}</h3><p>{{text.noMatchHint}}</p></div>
   <button v-for="v in rows" :key="v.id" :data-visit-id="v.id" class="record-item" :class="{selected:currentId===v.id}" @click="select(v.id)" :disabled="disabled"><span class="record-item-top"><strong>{{v.organization}}</strong><span class="badge" :class="v.status.toLowerCase()">{{v.status==='DRAFT'?text.draft:text.recorded}}</span></span><span class="record-preview">{{v.notes}}</span><span class="record-meta">{{v.occurredOn||text.unknown}} · {{lang==='zh'?'版本':'Revision'}} {{v.revision}}</span></button>
  </div>
 </div>
</template>
<style scoped>
.visit-list-panel{max-height:none;overflow:visible;min-width:0;align-self:start}.visit-list-controls,.visit-list-summary,.visit-list-preferences{padding:0 16px 14px;overflow-wrap:anywhere}.visit-list-controls label{margin:0 0 10px}.visit-list-controls select{display:block;width:100%;margin-top:6px;min-height:44px}.visit-list-controls .button-row{gap:6px}.visit-list-controls .button-row button{min-width:0;flex:1;padding:9px 6px}.visit-list-summary p{font-size:12px;line-height:1.6;margin:5px 0}.visit-list-scroll{max-height:65vh;overflow-y:auto;overflow-anchor:none;min-height:60px}.visit-list-scroll:focus{outline:2px solid #3b82f6;outline-offset:2px}.record-item{width:100%;text-align:left}.record-preview{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:800px){.visit-list-scroll{max-height:300px}}
</style>
