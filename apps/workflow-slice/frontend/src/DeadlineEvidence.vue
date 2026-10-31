<script setup lang="ts">
import {computed} from 'vue';
import type {Deadline} from './domain/commitment';
const props=defineProps<{deadline:Deadline;text:string;lang:'zh'|'en'}>();
const labels=computed(()=>props.lang==='zh'?{
 field:'单独填写的结构化期限',unknown:'未单独记录（未知）',
 scope:'此字段不概括各个动作的期限，也不表示条件已满足。各动作、条件、日期及更正请对应下方原文核对；原文尚未逐项结构化。',
 wording:'本项原文 / 本人确认内容（动作、条件、日期及更正）',empty:'本项文字尚未填写。'
}:{
 field:'Separately entered structured deadline',unknown:'Not separately recorded (unknown)',
 scope:'This field does not summarize the deadlines of every action or establish that conditions are met. Check each action, condition, date and correction against the wording below; these have not been individually structured.',
 wording:'Item wording / personally confirmed content (actions, conditions, dates and corrections)',empty:'No wording entered for this item yet.'
});
</script>

<template>
 <section class="deadline-evidence">
  <p class="deadline-field"><strong>{{labels.field}}:</strong> {{deadline.kind==='unknown'?labels.unknown:deadline.kind==='date'?deadline.date:deadline.at}}</p>
  <p class="deadline-scope">{{labels.scope}}</p>
  <p class="deadline-wording-label"><strong>{{labels.wording}}</strong></p>
  <p class="preserve-text deadline-wording">{{text||labels.empty}}</p>
 </section>
</template>

<style scoped>
.deadline-evidence{border-inline-start:3px solid #627a83;background:#f4f7f7;padding:12px 14px;margin:12px 0;overflow-wrap:anywhere;}
.deadline-evidence p{margin:0 0 8px;}
.deadline-evidence p:last-child{margin-bottom:0;}
.deadline-scope{font-size:.9rem;color:#42565e;line-height:1.5;}
.deadline-wording{white-space:pre-wrap;line-height:1.6;}
</style>
