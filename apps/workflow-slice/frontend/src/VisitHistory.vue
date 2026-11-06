<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import {api,ApiError} from './api';
import {correctionCopy} from './correction-i18n';
type Visit={id:string;ownerId:string;revision:number;status:'DRAFT'|'RECORDED';organization:string;occurredOn:string|null;notes:string;createdAt:string;updatedAt:string};
const props=defineProps<{visit:Visit;role:string;lang:'zh'|'en';epoch:number}>();
const emit=defineEmits<{denied:[]}>();
const text=computed(()=>correctionCopy[props.lang]);
const versions=ref<Visit[]>([]),state=ref<'idle'|'loading'|'loaded'|'failed'>('idle');
let sequence=0,alive=true;
watch(()=>[props.visit.id,props.visit.revision,props.role,props.epoch],()=>{sequence++;state.value='idle';versions.value=[];});
onBeforeUnmount(()=>{alive=false;sequence++;});
async function load(){
 const n=++sequence,id=props.visit.id,owner=props.visit.ownerId,role=props.role,epoch=props.epoch;
 state.value='loading';versions.value=[];
 const active=()=>alive&&n===sequence&&id===props.visit.id&&role===props.role&&epoch===props.epoch;
 try{
  const result=await api<{visitId:string;versions:Visit[]}>(role,`/v2/visits/${encodeURIComponent(id)}/history`);
  if(!active())return;
  if(result?.visitId!==id||!Array.isArray(result.versions)||!result.versions.length||result.versions.some((v,i,a)=>v.id!==id||v.ownerId!==owner||!Number.isSafeInteger(v.revision)||v.revision<1||i>0&&v.revision<=a[i-1]!.revision||!['DRAFT','RECORDED'].includes(v.status)||typeof v.organization!=='string'||typeof v.notes!=='string'||v.occurredOn!==null&&typeof v.occurredOn!=='string'||!Number.isFinite(Date.parse(v.createdAt))||!Number.isFinite(Date.parse(v.updatedAt))))throw Error('INVALID_HISTORY');
  versions.value=result.versions;state.value='loaded';
 }catch(e){if(!active())return;if(e instanceof ApiError&&(e.status===401||e.status===403)){emit('denied');return;}state.value='failed';}
}
</script>
<template>
<details class="visit-history" @toggle="(e)=>{if((e.target as HTMLDetailsElement).open&&state==='idle')load()}"><summary>{{text.history}}</summary><p class="field-hint">{{text.historyHint}}</p><p v-if="state==='idle'" role="status">{{text.idle}}</p><p v-if="state==='loading'" role="status">{{text.loading}}</p><p v-if="state==='failed'" role="alert">{{text.failed}}</p><button type="button" :disabled="state==='loading'" @click="load">{{text.retry}}</button><ol v-if="state==='loaded'"><li v-for="(v,index) in versions" :key="v.revision"><h4>{{text.version}} {{v.revision}} · {{index===versions.length-1?text.current:text.earlier}}</h4><p>{{v.status==='DRAFT'?text.draft:text.recorded}}</p><p class="preserve-text">{{v.organization}}</p><p>{{text.date}}: {{v.occurredOn||text.unknown}}</p><p class="preserve-text">{{v.notes}}</p><p>{{text.time}}: {{v.updatedAt}}</p><p>{{text.created}}: {{v.createdAt}}</p></li></ol></details>

</template>
