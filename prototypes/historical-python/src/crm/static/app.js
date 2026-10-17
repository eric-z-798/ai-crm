'use strict';
const $=id=>document.getElementById(id);
let data=null,token='',selectedHco='',selectedMission='',view='mission',generation=0,formHandler=null,formKey=null;
const pendingKeys=new Map();
const statuses={ACTIVE:'进行中',WAITING_APPROVAL:'待你确认',WAITING_OUTCOME:'等待结果核验',PAUSED:'已暂停',CANCELLED:'已结束',EXPIRED:'已到期',SUCCEEDED:'已核验',AWAITING_CONFIRMATION:'尚未执行',EXECUTED:'已执行',REJECTED:'已拒绝',STALE:'已被新提案替代',OPEN:'待办',COMPLETED:'内部任务已完成'};
const actionNames={'mission.activated':'启用目标','mission.status_changed':'调整目标状态','visit.recorded':'记录拜访','visit.corrected':'更正拜访','proposal.created':'生成待确认提案','proposal.confirmed':'确认提案','proposal.rejected':'拒绝提案','proposal.revised':'修订提案','task.created':'创建内部任务','task.completed':'记录内部完成结果'};
const fmt=value=>value?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'';
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function append(parent,...children){children.filter(Boolean).forEach(c=>parent.append(c));return parent;}
function button(label,cls,fn){const e=el('button',cls,label);e.type='button';e.addEventListener('click',()=>safe(fn));return e;}
function empty(parent,text){parent.append(el('p','empty',text));}
function notice(text,error=false){$('notice').hidden=false;$('notice').className='notice'+(error?' error':'');$('notice').textContent=text;}
async function safe(fn){try{await fn();}catch(e){notice(e.message,true);}}
function key(name){if(!pendingKeys.has(name))pendingKeys.set(name,crypto.randomUUID());return pendingKeys.get(name);}
async function api(path,{method='GET',body,idem,auth=token}={}){
 const headers={Authorization:'Bearer '+auth};if(body!==undefined)headers['Content-Type']='application/json';if(idem)headers['Idempotency-Key']=idem;
 let res;try{res=await fetch('/api/v1'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});}catch{throw Error('网络中断，结果未知。请先刷新查看提案回执；重试会复用幂等键，不会重复创建。');}
 let result;try{result=await res.json();}catch{throw Error('未收到有效回执，请刷新核对。');}
 if(!res.ok)throw Error((result.detail||result.title||'操作未完成')+' ['+(result.code||res.status)+']');
 return result;
}
async function mutate(path,method,body,label,success){
 const auth=token,gen=generation,idem=key(auth+':'+label);
 const result=await api(path,{method,body,idem,auth});pendingKeys.delete(auth+':'+label);
 if(gen===generation){await load();notice(typeof success==='function'?success(result):success);}
 return result;
}
function hco(){return data?.hcos.find(x=>x.id===selectedHco);}
function mission(){return data?.missions.find(x=>x.id===selectedMission);}
function scoped(table){return data[table].filter(x=>table==='visits'?x.hcoId===selectedHco:x.missionId===selectedMission);}
function writer(){return data&&['sales_rep','sales_manager'].includes(data.actor.role);}
function active(){return mission()&&!['PAUSED','CANCELLED','EXPIRED','SUCCEEDED'].includes(mission().status)&&Date.parse(mission().deadlineAt)>Date.now();}
function latestVisit(){return scoped('visits').at(-1);}
function ownerName(id){return id===data.actor.id?data.actor.name:id;}
function options(select,items,getLabel,selected){select.replaceChildren();for(const item of items){const o=el('option','',getLabel(item));o.value=item.id;select.append(o);}if(items.some(x=>x.id===selected))select.value=selected;return select.value;}
async function load(){
 const auth=token,gen=generation;const fresh=await api('/bootstrap',{auth});if(gen!==generation||auth!==token)return;
 data=fresh;
 selectedHco=options($('hco'),data.hcos,x=>x.name,selectedHco);
 selectedMission=options($('mission'),data.missions.filter(x=>x.hcoId===selectedHco),x=>x.title,selectedMission);
 render();
}
function render(){
 $('tenant-name').textContent=data.context.tenant.displayName+' · '+(data.actor.role==='sales_manager'?'团队例外关注':'一线客户工作');
 const m=mission();$('mission-title').textContent=m?.title||'先为当前机构建立一个目标';$('criteria').textContent=m?.successCriteria||'目标需要明确成功条件、截止日和范围。';$('mission-status').textContent=m?statuses[m.status]||m.status:'暂无目标';
 const plans=scoped('plans'),tasks=scoped('tasks');
 $('pending-count').textContent=plans.filter(p=>p.status==='AWAITING_CONFIRMATION').length;
 $('open-count').textContent=tasks.filter(t=>t.status==='OPEN').length;
 $('done-count').textContent=tasks.filter(t=>t.status==='COMPLETED').length;
 $('budget').textContent=m?'截止 '+fmt(m.deadlineAt)+' · 检查次数 '+m.runCount+'/'+m.maxRuns+' · Asia/Shanghai':'';
 $('pause').textContent=m?.status==='PAUSED'?'恢复目标':'暂停目标';$('pause').disabled=!m||['CANCELLED','EXPIRED','SUCCEEDED'].includes(m.status);$('cancel-mission').disabled=!m||['CANCELLED','SUCCEEDED'].includes(m.status);
 $('manager-note').textContent=data.actor.role==='sales_manager'?'管理者视角：优先关注逾期、没有责任人、证据变化和待判断事项。本次仅验证内部闭环，未实现管理者报表或医学用途权限。':'一线视角：保留来源、负责人和明确期限，避免在多个页面重复录入。当前字段与流程仍需真实业务访谈验证。';
 renderEvidence();renderPlans(plans);renderOutcomes(m,tasks);renderVisits();renderTasks(tasks);renderAudit();
 document.querySelectorAll('.write-action').forEach(b=>{b.hidden=!writer();});
 $('analyze').disabled=!writer()||!active()||!latestVisit();$('new-task').disabled=!active();
}
function renderEvidence(){const root=$('evidence-list');root.replaceChildren();const visits=scoped('visits').slice(-2);if(!visits.length)return empty(root,'暂无拜访证据。先记录一条虚构拜访，明确下一步。');for(const v of visits){const card=el('div','source-card');append(card,el('small','source-meta',fmt(v.occurredAt)+' · 来源版本 '+v.version),el('p','',v.notes),el('div','source-followup','明确后续：'+(v.followUp?.title||'未填写；不会自动猜测')),el('small','source-meta',v.id));root.append(card);}}
function renderPlans(plans){const root=$('proposal-list');root.replaceChildren();const shown=plans.filter(p=>p.status==='AWAITING_CONFIRMATION').concat(plans.filter(p=>p.status!=='AWAITING_CONFIRMATION').slice(-2));if(!shown.length)return empty(root,'还没有提案。检查明确承诺后，会显示依据、负责人和期限；任务不会自动生成。');for(const p of shown){const card=el('div','proposal');append(card,el('span','badge '+(p.contextState!=='CURRENT'&&p.status==='AWAITING_CONFIRMATION'?'warn':''),statuses[p.status]||p.status));for(const a of p.actions){card.append(el('h4','',a.title));const dl=el('dl');for(const [k,v]of [['负责人',ownerName(a.ownerId)],['内部期限',a.dueDate+' · Asia/Shanghai'],['来源',p.source.id+' · v'+p.source.version]])append(dl,el('dt','',k),el('dd','',v));card.append(dl);}
 card.append(el('p','source-meta','依据：'+p.source.excerpt));
 if(p.status==='AWAITING_CONFIRMATION'){const stale=p.contextState!=='CURRENT';if(stale)card.append(el('p','callout','上下文已变化或提案已过期。请修订 / 刷新后重新审阅。'));card.append(el('small','source-meta','有效期至 '+fmt(p.expiresAt)+'；仅内部任务，无对外通信。'));const actions=el('div','actions');const confirm=button('确认并创建 '+p.actions.length+' 项任务','button primary',()=>mutate('/ai/plans/'+p.id+'/confirm','POST',{planHash:p.planHash,actionIds:p.actions.map(a=>a.id)},'confirm:'+p.id,r=>'已核验执行回执：'+r.receipt.taskIds.length+' 项任务，未向外部发送消息。'));confirm.disabled=!writer()||stale||!active()||p.ownerId!==data.actor.id;append(actions,confirm,button('修订 / 刷新','button secondary',()=>openRevise(p)),button('拒绝','text-button',()=>mutate('/ai/plans/'+p.id+'/reject','POST',{planHash:p.planHash,reason:'用户在工作台拒绝本次建议'},'reject:'+p.id,'已拒绝，没有创建任务。')));if(writer()&&p.ownerId===data.actor.id)card.append(actions);}
 if(p.receipt)card.append(el('p','receipt','已创建任务：'+p.receipt.taskIds.join('、')+'\n实际执行时间：'+fmt(p.receipt.executedAt)));
 root.append(card);}}
function renderOutcomes(m,tasks){const root=$('outcome-list');root.replaceChildren();if(!m||!m.outcomes.length){empty(root,tasks.length?'已有 '+tasks.length+' 项内部任务。完成后填写实际结果说明，仍需独立核验外部结果。':'还没有执行结果。系统会依据已保存的任务回执显示状态。');return;}for(const o of m.outcomes){const item=el('div','outcome-item');append(item,el('span','outcome-icon','✓'),append(el('div'),el('p','',o.note),el('small','',fmt(o.createdAt)+' · 仅内部任务完成 · 外部结果未核验')));root.append(item);}}
function renderVisits(){const root=$('visit-list');root.replaceChildren();for(const v of scoped('visits').slice().reverse()){const c=el('section','panel');append(c,el('h3','',v.purpose),el('small','source-meta',fmt(v.occurredAt)+' · v'+v.version+' · '+v.id),el('p','muted',v.notes),el('p','source-followup','后续事项：'+(v.followUp?.title||'待澄清')+' / '+(v.followUp?.dueDate||'日期待澄清')));if(writer())c.append(button('更正记录（旧提案将失效）','text-button',()=>openVisit(v)));root.append(c);}if(!root.children.length)empty(root,'当前机构没有拜访记录。');}
function renderTasks(tasks){const root=$('task-list');root.replaceChildren();for(const t of tasks.slice().reverse()){const c=el('section','task-card'),left=el('div');append(left,el('h3','',t.title),el('small','',ownerName(t.ownerId)+' · '+t.dueDate+' · Asia/Shanghai · '+(t.source==='FORM'?'传统表单':'模拟提案，经用户确认')),el('p','receipt','任务 '+t.id));if(t.completionNote)left.append(el('p','',t.completionNote));append(c,left,el('span','badge',statuses[t.status]));if(t.status==='OPEN'&&writer()&&(t.ownerId===data.actor.id||data.actor.role==='sales_manager'))c.append(button('记录完成结果','button secondary',()=>openComplete(t)));root.append(c);}if(!tasks.length)empty(root,'当前目标没有任务。可确认提案，也可直接用传统表单创建。');}
function renderAudit(){const root=$('audit-list');root.replaceChildren();const ids=new Set([selectedMission,...scoped('tasks').map(t=>t.id),...scoped('plans').map(p=>p.id),...scoped('visits').map(v=>v.id)]);for(const a of data.audit.filter(a=>a.hcoId===selectedHco||ids.has(a.resourceId))){const r=el('div','audit-row');append(r,el('span','',fmt(a.createdAt)),append(el('div'),el('span','',actionNames[a.action]||a.action),el('small','',a.resourceId||''),el('small','',a.id+' · '+a.requestId)),el('span','badge '+(a.outcome==='SUCCESS'?'quiet':'warn'),a.outcome==='SUCCESS'?'已记录':'已阻断'));root.append(r);}if(!root.children.length)empty(root,'尚无该机构操作记录。');}
function setView(name){view=name;document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==name+'-view');document.querySelectorAll('.nav').forEach(e=>e.classList.toggle('active',e.dataset.view===name));$('page-title').textContent={mission:'目标工作台',visits:'客户与拜访',tasks:'内部跟进任务',chat:'对话入口',audit:'操作与审计'}[name];}
function field(name,label,type,value='',required=true){const l=el('label','',label);let input;if(type==='textarea')input=el('textarea');else{input=el('input');input.type=type;}input.name=name;input.value=value;input.required=required;input.maxLength=type==='textarea'?2000:500;l.append(input);return l;}
function showForm(title,fields,submitLabel,handler){$('dialog-title').textContent=title;$('form-fields').replaceChildren(...fields);$('submit-dialog').textContent=submitLabel;formHandler=handler;formKey=crypto.randomUUID();$('form-dialog').showModal();}
function closeForm(){if($('form-dialog').open)$('form-dialog').close();formHandler=null;}
function tomorrow(days=2){const dt=new Date(Date.now()+days*86400000);return dt.toISOString().slice(0,10);}
function openMission(){const hid=selectedHco;showForm('设定一个内部跟进目标',[field('title','目标名称','text','落实医院拜访后的内部承诺'),field('successCriteria','成功条件（仅内部目标，外部结果保持待核验）','textarea','跟进事项有负责人、期限和完成说明。'),field('deadline','截止日期 · Asia/Shanghai','date',tomorrow(14)),field('maxRuns','本目标模拟检查次数上限（1–20）','number','10')],'创建并启用',async f=>{const body={hcoId:hid,title:f.title,successCriteria:f.successCriteria,deadlineAt:f.deadline+'T15:59:59Z',maxRuns:Number(f.maxRuns)};return api('/missions',{method:'POST',body,idem:formKey});});}
function openVisit(existing){const hid=selectedHco;showForm(existing?'更正拜访事实':'记录拜访与明确后续',[field('purpose','本次拜访目的','text',existing?.purpose||'药企客户协作资料沟通'),field('notes','事实记录（仅虚构机构业务）','textarea',existing?.notes||''),field('title','明确后续事项（可空，空时请求澄清）','text',existing?.followUp?.title||'',false),field('dueDate','明确内部期限 · Asia/Shanghai（可空）','date',existing?.followUp?.dueDate||'',false)],existing?'保存新版本':'保存并检查已启用目标',async f=>{const body={occurredAt:existing?.occurredAt||new Date().toISOString(),purpose:f.purpose,notes:f.notes,followUp:{title:f.title,dueDate:f.dueDate,ownerId:data.actor.id}};if(existing)body.expectedVersion=existing.version;else body.hcoId=hid;return api('/visits'+(existing?'/'+existing.id:''),{method:existing?'PATCH':'POST',body,idem:formKey});});}
function openTask(){const mid=selectedMission;showForm('传统表单 · 新建本人内部任务',[field('title','任务标题','text',''),field('dueDate','内部期限 · Asia/Shanghai','date',tomorrow())],'创建任务',f=>api('/tasks',{method:'POST',body:{missionId:mid,title:f.title,dueDate:f.dueDate,ownerId:data.actor.id},idem:formKey}));}
function openComplete(t){showForm('记录实际完成结果',[field('completionNote','实际做了什么？还有哪些外部事项待核验？','textarea','')],'保存内部结果',f=>api('/tasks/'+t.id,{method:'PATCH',body:{expectedVersion:t.version,completionNote:f.completionNote},idem:formKey}));}
function openRevise(p){const a=p.actions[0];showForm('修订提案 · 旧确认作废，重新审阅',[field('title','内部任务标题','text',a.title),field('dueDate','内部期限 · Asia/Shanghai','date',a.dueDate)],'生成新提案',f=>api('/ai/plans/'+p.id+'/revise',{method:'POST',body:{planHash:p.planHash,action:{title:f.title,dueDate:f.dueDate,ownerId:data.actor.id}},idem:formKey}));}
async function analyze(message){if(!mission()||!latestVisit())throw Error('请先选择目标并记录拜访。');return mutate('/missions/'+selectedMission+'/runs','POST',{visitId:latestVisit().id,message:message||'检查当前拜访的明确承诺',modelAlias:'stub-v1'},'analyze:'+selectedMission+':'+latestVisit().id,r=>r.plan?'已生成或找到待审提案。未执行时，任务数量不会改变。':r.run.summary);}
$('detail-form').addEventListener('submit',event=>{event.preventDefault();safe(async()=>{if(!formHandler)return;const handler=formHandler,gen=generation;const values=Object.fromEntries(new FormData(event.target));$('submit-dialog').disabled=true;try{await handler(values);if(gen===generation){closeForm();await load();notice('已保存，页面显示的是服务端实际状态。');}}finally{$('submit-dialog').disabled=false;}});});
$('close-dialog').onclick=closeForm;$('cancel-dialog').onclick=closeForm;
$('form-dialog').addEventListener('cancel',()=>{formHandler=null;});
$('identity').addEventListener('change',()=>safe(async()=>{generation++;token=$('identity').value;selectedHco='';selectedMission='';data=null;closeForm();$('chat-log').replaceChildren();$('notice').hidden=true;await load();}));
$('hco').addEventListener('change',()=>safe(async()=>{generation++;selectedHco=$('hco').value;selectedMission='';closeForm();$('chat-log').replaceChildren();await load();}));
$('mission').addEventListener('change',()=>{generation++;selectedMission=$('mission').value;closeForm();$('chat-log').replaceChildren();render();});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('refresh').onclick=()=>safe(load);$('new-mission').onclick=openMission;$('record-visit').onclick=()=>openVisit();$('record-visit-2').onclick=()=>openVisit();$('new-task').onclick=openTask;$('analyze').onclick=()=>safe(()=>analyze());
$('pause').onclick=()=>safe(()=>{const m=mission();return mutate('/missions/'+m.id+'/'+(m.status==='PAUSED'?'resume':'pause'),'POST',{expectedVersion:m.version},'status:'+m.id+':'+m.version,m.status==='PAUSED'?'目标已恢复，旧提案仍需重新审阅。':'目标已暂停；既有任务保留，不再生成新执行。');});
$('cancel-mission').onclick=()=>safe(()=>{const m=mission();showForm('结束目标（已有任务和审计仍保留）',[field('reason','结束原因','textarea','')],'确认结束目标',f=>api('/missions/'+m.id+'/cancel',{method:'POST',body:{expectedVersion:m.version,reason:f.reason},idem:formKey}));});
$('chat-form').addEventListener('submit',event=>{event.preventDefault();safe(async()=>{const message=$('chat-input').value,gen=generation;$('chat-log').append(el('div','chat-message user',message));const result=await analyze(message);if(gen===generation){$('chat-log').append(el('div','chat-message','【规则模拟，无真实模型】\n'+result.run.summary+(result.plan?'\n提案已放在目标工作台，尚未执行。':'')));$('chat-input').value='';}});});
safe(async()=>{const response=await fetch('/api/v1/demo-identities');const {items}=await response.json();$('identity').replaceChildren();for(const item of items){const o=el('option','',item.tenantId+' / '+item.name);o.value=item.demoToken;$('identity').append(o);}token=items.find(x=>x.id==='rep-a')?.demoToken||items[0]?.demoToken||'';$('identity').value=token;await load();});
