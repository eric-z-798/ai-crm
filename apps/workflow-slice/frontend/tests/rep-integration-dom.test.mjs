import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {captureFollowUp,appendCommitmentEvent,projectCommitment} from '../src/domain/commitment.ts';
const built=fs.readFileSync('dist/index.html','utf8').match(/src="([^"]+\.js)"/)[1];
const code=fs.readFileSync('dist'+built,'utf8');
const v1='aicrm-synthetic-slice-v1',v2='aicrm-synthetic-slice-v2';
const clone=v=>JSON.parse(JSON.stringify(v));
const legacyVisit={id:'old-draft',organization:'旧机构',occurredOn:'2026-10-17',notes:'原草稿',status:'DRAFT',revision:1,ownerId:'rep-a',createdAt:'2026-10-17T10:00:00Z',updatedAt:'2026-10-17T10:00:00Z'};
const legacy=(pending=null)=>({schemaVersion:1,role:'rep',identity:'rep-a',lang:'zh',current:clone(legacyVisit),editing:true,form:{organization:'  未保存机构  ',occurredOn:'2026-10-16',notes:'未保存 原文\r\nEnglish 😀'},request:'',pending,tab:'visits'});
async function boot({storage=new Map(),visits=[],commitments=[],drop=false,wrong=false,failBackup=false,lookupHook=null,handoffHold=null,contextHook=null}={}){
 const state={visits:clone(visits),commitments:clone(commitments),reviews:[],calls:[],receipts:new Map(),drop,wrong,counter:0,failBackup,handoffs:[],lookupHook,handoffHold,contextHook};
 const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:'http://localhost:5173',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.confirm=()=>true;w.AbortController=AbortController;
 Object.defineProperty(w,'sessionStorage',{value:{get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem(k,v){if(state.failBackup&&(/invalid|legacy-aicrm/.test(k)))throw Error('quota');storage.set(k,String(v))},removeItem:k=>storage.delete(k)}});
 w.fetch=async(url,options={})=>{
  const path=String(url).replace(/^\/api/,''),method=options.method??'GET',body=options.body?JSON.parse(options.body):null,key=options.headers?.['Idempotency-Key'];
  state.calls.push({path,method,body,key});
  const response=(value,status=200)=>({ok:status<400,status,json:async()=>w.JSON.parse(JSON.stringify(value))});
  if(method==='GET'){
   if(path==='/context'){if(state.contextHook){const status=await state.contextHook();if(status)return response({code:'UNAUTHENTICATED'},status);}return response({id:'rep-a',role:'rep',tenant:'synthetic-only'});}
   if(path==='/v2/visits')return response(state.visits);
   if(path==='/v2/commitments')return response(state.commitments);
   if(path==='/handoffs')return response(state.handoffs);
   if(path.startsWith('/v2/visits/')&&path.endsWith('/review'))return response({schemaVersion:2,objectType:'record-review',visitId:path.split('/')[3],followUpReview:state.reviews.at(-1)??null});
   if(path.startsWith('/commands/')){if(state.lookupHook)await state.lookupHook(options.signal);return state.receipts.has(path.slice(10))?response(state.receipts.get(path.slice(10))):response({code:'NOT_FOUND'},404);}
  }
  assert.ok(key,'mutation has idempotency key');
  if(state.receipts.has(key))return response(state.receipts.get(key));
  let result;
  const now='2026-10-19T10:00:'+String(state.counter++).padStart(2,'0')+'Z';
  if(path==='/v2/visits/record'){
   const visit={id:body.visitId??'v-'+state.counter,revision:(body.expectedRevision??0)+1,status:'RECORDED',ownerId:'rep-a',createdAt:now,updatedAt:now,...body.record};
   const additions=[];
   for(const [i,d] of body.followUpReview.decisions.entries()){
    const check=captureFollowUp({id:'c-'+state.counter+'-'+i,eventId:'e-'+state.counter+'-'+i,actorId:'rep-a',recordedAt:now,source:{visitId:visit.id,organizationId:null,organizationText:visit.organization,occurredOn:visit.occurredOn,originalText:visit.notes},declaration:d.kind==='explicit-self-commitment'?{...d,ownerId:'rep-a'}:d});assert.equal(check.ok,true,JSON.stringify(check));if(check.value.kind==='follow-up-created')additions.push(check.value.commitment);
   }
   state.visits=state.visits.filter(v=>v.id!==visit.id).concat(visit);state.commitments.push(...additions);state.reviews.push(clone(body.followUpReview));result={schemaVersion:2,objectType:'record-with-commitments',visit,commitments:additions,followUpReview:body.followUpReview};
  }else if(path.endsWith('/handoffs')&&method==='POST'){result={id:'handoff-'+state.counter,visitId:path.split('/')[2],revision:1,status:'SENT',request:body.request};state.handoffs.push(result);if(state.handoffHold)await state.handoffHold;}else if(path.startsWith('/v2/commitments/')&&path.endsWith('/events')){
   const id=path.split('/')[3],index=state.commitments.findIndex(c=>c.id===id);const check=appendCommitmentEvent(state.commitments[index],{expectedRevision:body.expectedRevision,event:{...body.event,actorId:'rep-a',recordedAt:now}});if(!check.ok)return response({code:check.error.code},409);result=check.value;state.commitments[index]=result;
  }else if(path==='/visits/old-draft'&&method==='PUT'){result={...legacyVisit,...body,revision:2};delete result.expectedRevision;state.visits=[result];}
  else throw Error('Unexpected mutation '+path);
  state.receipts.set(key,clone(result));
  if(state.drop){state.drop=false;throw TypeError('Simulated lost acknowledgment')}
  if(state.wrong){state.wrong=false;return response({objectType:'handoff'})}
  return response(result);
 };
 w.eval(code);const tick=()=>new Promise(r=>setTimeout(r,20));await tick();await tick();
 const text=()=>w.document.body.textContent;
 const click=async label=>{const b=[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert.ok(b,'button '+label);assert.equal(b.disabled,false,'enabled '+label);b.click();await tick()};
 const input=async(id,value)=>{const el=w.document.getElementById(id);assert.ok(el,'input '+id);el.value=value;el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await tick()};
 const check=async el=>{assert.ok(el);el.checked=true;el.dispatchEvent(new w.Event('change',{bubbles:true}));await tick()};
 const field=async(selector,value)=>{const el=w.document.querySelector(selector);assert.ok(el,selector);el.value=value;el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await tick()};
 return {w,state,storage,tick,text,click,input,check,field,close:()=>w.close()};
}
async function fresh(a){await a.click('＋ 记录一次交流');await a.input('organization','  合成 机构  ');await a.input('notes','客户请求 A；本人承诺 B。\nExact  text 😀');}
async function promise(a){await a.click('＋ 添加一项核对');await a.input('review-kind-0','explicit-self-commitment');await a.input('review-text-0','我承诺核实 B 后回复');await a.check(a.w.document.querySelector('.review-row input[type=checkbox]'));await a.check(a.w.document.getElementById('reviewed'));}
async function record(a){await a.click('保存交流及承诺');}
const cases=[];
async function scenario(name,fn){await test(name,async()=>{await fn();cases.push(name)})}
await scenario('blank date retained as unknown; empty reviewed record sends atomic DTO with zero promises',async()=>{const a=await boot();try{await fresh(a);assert.equal(a.w.document.getElementById('date').value,'');assert.equal([...a.w.document.querySelectorAll('button')].find(b=>b.textContent==='保存交流及承诺').disabled,true);await a.check(a.w.document.getElementById('reviewed'));await record(a);assert.equal(a.state.visits.length,1);assert.equal(a.state.visits[0].occurredOn,null);assert.equal(a.state.visits[0].organizationId,null);assert.equal(a.state.visits[0].notes,'客户请求 A；本人承诺 B。\nExact  text 😀');assert.equal(a.state.commitments.length,0);assert.equal(a.state.calls.filter(c=>c.method!=='GET').length,1)}finally{a.close()}});
await scenario('customer request stays request; raw notes are not parsed',async()=>{const a=await boot();try{await fresh(a);await a.click('＋ 添加一项核对');await a.input('review-kind-0','customer-request');await a.input('review-text-0','客户请我回复');await a.check(a.w.document.getElementById('reviewed'));await record(a);assert.equal(a.state.commitments.length,0);assert.deepEqual(a.state.reviews[0].decisions,[{kind:'customer-request',requestText:'客户请我回复'}])}finally{a.close()}});
await scenario('explicit checkbox required; change of content invalidates confirmation',async()=>{const a=await boot();try{await fresh(a);await promise(a);await a.input('review-text-0','变更后的本人承诺');assert.equal(a.w.document.querySelector('.review-row input[type=checkbox]').checked,false);assert.equal(a.w.document.getElementById('reviewed').checked,false);await a.check(a.w.document.getElementById('reviewed'));await record(a);assert.equal(a.state.visits.length,0);assert(a.text().includes('所有输入仍保留'));assert.equal(a.w.document.getElementById('review-text-0').value,'变更后的本人承诺')}finally{a.close()}});
await scenario('local save does not pretend server success and recovery retains review across new DOM',async()=>{const a=await boot();let storage;try{await fresh(a);await promise(a);await a.click('保留本地草稿');assert(a.text().includes('尚未提交服务器'));assert.equal(a.state.visits.length,0);storage=a.storage;}finally{a.close()}const b=await boot({storage});try{assert.equal(b.w.document.getElementById('review-text-0').value,'我承诺核实 B 后回复');assert.equal(b.w.document.getElementById('date').value,'');assert.equal(b.w.document.getElementById('reviewed').checked,true)}finally{b.close()}});
await scenario('lost acknowledgment keeps original body/key and reconciles without duplicate record',async()=>{const a=await boot({drop:true});try{await fresh(a);await promise(a);await record(a);assert.equal(JSON.parse(a.storage.get(v2)).pending,null);assert.equal(a.state.calls.filter(c=>c.path.startsWith('/commands/')).length,1);assert.equal(a.state.calls.find(c=>c.path.startsWith('/commands/')).path,'/commands/'+a.state.calls.find(c=>c.method==='POST').key);assert.equal(a.state.visits.length,1);assert.equal(a.state.visits.length,1);assert.equal(a.state.commitments.length,1);assert.equal(a.state.calls.filter(c=>c.path==='/v2/visits/record').length,1);assert.equal(JSON.parse(a.storage.get(v2)).pending,null)}finally{a.close()}});
await scenario('wrong objectType preserves pending request until receipt reconciliation',async()=>{const a=await boot({wrong:true});try{await fresh(a);await promise(a);await record(a);assert.equal(JSON.parse(a.storage.get(v2)).pending,null);assert.equal(a.state.calls.filter(c=>c.path.startsWith('/commands/')).length,1);assert.equal(a.state.commitments.length,1)}finally{a.close()}});
await scenario('cross-day entry shows old unknown-deadline promise with independent statuses and completes then records acknowledgment',async()=>{const a=await boot();try{await fresh(a);await a.input('date','2001-01-01');await promise(a);await record(a);await a.click('✓本人承诺1');assert(a.text().includes('2001-01-01'));assert(a.text().includes('承诺期限: 未知'));await a.click('记录进展或回复');await a.input('event-type','progress-recorded');await a.field('form.followup-review select:not(#event-type)','verified');await a.field('form.followup-review textarea','A 已核实');await a.click('保存状态记录');assert.equal(projectCommitment(a.state.commitments[0]).value.verificationStatus,'verified');await a.click('记录进展或回复');await a.input('event-type','completed');await a.field('form.followup-review textarea','本人确认完成');await a.check(a.w.document.querySelector('form.followup-review input[type=checkbox]'));await a.click('保存状态记录');assert.equal(projectCommitment(a.state.commitments[0]).value.completionStatus,'completed');assert(a.text().includes('没有待跟进的本人承诺'));await a.check(a.w.document.querySelector('.commitment-list > .check-label input'));await a.click('记录进展或回复');assert.equal(a.w.document.getElementById('event-type').value,'reply-recorded');await a.input('reply-scope','1');await a.field('form.followup-review input:not([type=checkbox])','2026-10-19T09:00:00Z');await a.field('form.followup-review textarea','客户确认已收到');await a.click('保存状态记录');const view=projectCommitment(a.state.commitments[0]).value;assert.equal(view.completionStatus,'completed');assert.equal(view.replyFromCustomer,'recorded');assert.equal(view.history.some(e=>e.type==='reopened'),false)}finally{a.close()}});
await scenario('legacy draft bytes stay exact while new recovery uses version2 and manual review unset',async()=>{const old=JSON.stringify(legacy(),null,3)+'\n';const storage=new Map([[v1,old]]);const a=await boot({storage,visits:[legacyVisit]});try{assert.equal(a.storage.get(v1),old);assert.equal(a.storage.get(v2+'-legacy-'+v1),old);assert.equal(JSON.parse(a.storage.get(v2)).form.notes,legacy().form.notes);assert.equal(a.w.document.getElementById('notes').value,legacy().form.notes.replace(/\r\n/g,'\n'));assert.equal(a.w.document.getElementById('reviewed').checked,false);await a.input('notes','新版新增文字');assert.equal(a.storage.get(v1),old);assert.equal(JSON.parse(a.storage.get(v2)).schemaVersion,3)}finally{a.close()}});
await scenario('legacy unresolved command retries exact original v1 endpoint/key/body without v2 conversion',async()=>{const pending={kind:'save',key:'original-key',method:'PUT',path:'/visits/old-draft',role:'rep',body:{organization:'旧提交',occurredOn:'2026-10-16',notes:'原始提交 原文',expectedRevision:1}};const raw=JSON.stringify(legacy(pending));const a=await boot({storage:new Map([[v1,raw]]),visits:[legacyVisit]});try{assert.equal(JSON.parse(a.storage.get(v2)).pending.key,pending.key);await a.click('重试原请求');const call=a.state.calls.find(c=>c.method==='PUT');assert.deepEqual(call,{path:pending.path,method:'PUT',key:pending.key,body:pending.body});assert.equal(a.storage.get(v1),raw);assert.equal(a.w.document.getElementById('notes').value,legacy().form.notes.replace(/\r\n/g,'\n'));assert.equal(a.state.calls.some(c=>c.path==='/v2/visits/record'),false)}finally{a.close()}});
await scenario('malformed v2 preserved exactly before new draft autosave',async()=>{const raw='{"broken":"原文';const a=await boot({storage:new Map([[v2,raw]])});try{assert([...a.storage].some(([k,v])=>k.includes('-invalid-')&&v===raw));await fresh(a);assert([...a.storage].some(([k,v])=>k.includes('-invalid-')&&v===raw))}finally{a.close()}});
await scenario('quota failure protecting invalid raw blocks overwrite; later input retries backup first',async()=>{const raw='{"broken":"原文';const a=await boot({storage:new Map([[v2,raw]]),failBackup:true});try{await fresh(a);assert.equal(a.storage.get(v2),raw);a.state.failBackup=false;await a.input('notes','新草稿仍在');assert([...a.storage].some(([k,v])=>k.includes('-invalid-')&&v===raw));assert.equal(JSON.parse(a.storage.get(v2)).form.notes,'新草稿仍在')}finally{a.close()}});
await scenario('legacy held recovery preserves raw bytes and restores original pending metadata',async()=>{const original=JSON.stringify(legacy(),null,2);const a=await boot({storage:new Map([[v1+'-held-rep',original]]),visits:[legacyVisit]});try{assert.equal(a.storage.get(v1+'-held-rep'),original);assert.equal(JSON.parse(a.storage.get(v2)).form.notes,legacy().form.notes);assert.equal(a.w.document.getElementById('reviewed').checked,false)}finally{a.close()}});
await scenario('legacy backup quota failure keeps original and locks autosave until protected',async()=>{const raw=JSON.stringify(legacy());const a=await boot({storage:new Map([[v1,raw]]),visits:[legacyVisit],failBackup:true});try{assert.equal(a.storage.get(v1),raw);assert.equal(a.storage.has(v2),false);assert.equal(a.w.document.getElementById('notes').value,legacy().form.notes.replace(/\r\n/g,'\n'));a.state.failBackup=false;await a.input('notes','新的编辑');assert.equal(a.storage.get(v1),raw);assert([...a.storage].some(([k,v])=>k.includes('-invalid-')&&v===raw));assert.equal(JSON.parse(a.storage.get(v2)).form.notes,'新的编辑')}finally{a.close()}});
await scenario('saved request and unconfirmed review remain readable after record, not hidden as commitments',async()=>{const a=await boot();try{await fresh(a);await a.click('＋ 添加一项核对');await a.input('review-kind-0','unconfirmed');await a.input('review-text-0','尚待本人确认的额外文字');await a.check(a.w.document.getElementById('reviewed'));await record(a);assert(a.text().includes('已保存的逐项核对'));assert(a.text().includes('尚待本人确认的额外文字'));assert.equal(a.state.commitments.length,0)}finally{a.close()}});
console.log('Built Vue/JSDOM author tests only; API is mocked. No browser layout or real transaction claim. '+cases.length+' scenarios passed.');

await scenario('automatic missing receipt is read-only; navigation cancels late lookup and resumes original key',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const pending={kind:'save',key:'lookup-original-key',method:'PUT',path:'/visits/old-draft',role:'rep',body:{organization:'旧提交',occurredOn:'2026-10-16',notes:'原始提交',expectedRevision:1}};
 const a=await boot({storage:new Map([[v1,JSON.stringify(legacy(pending))]]),visits:[legacyVisit],lookupHook:()=>gate});
 try{
  assert.equal(a.state.calls.filter(c=>c.path.startsWith('/commands/')).length,1);
  a.w.dispatchEvent(new a.w.Event('pageshow'));await a.tick();assert.equal(a.state.calls.filter(c=>c.path.startsWith('/commands/')).length,1);
  a.w.dispatchEvent(new a.w.Event('pagehide'));a.state.receipts.set(pending.key,{...legacyVisit,revision:2});release();await a.tick();
  assert.equal(JSON.parse(a.storage.get(v2)).pending.key,pending.key,'late result after leaving is ignored');
  assert.equal(a.state.calls.filter(c=>c.method!=='GET').length,0);
  a.state.lookupHook=null;a.state.receipts.delete(pending.key);a.w.dispatchEvent(new a.w.Event('pageshow'));await a.tick();await a.tick();
  assert.equal(JSON.parse(a.storage.get(v2)).pending.key,pending.key,'404 keeps pending');assert.equal(a.state.calls.filter(c=>c.method!=='GET').length,0);
  await a.click('重试原请求');assert.equal(JSON.parse(a.storage.get(v2)).pending,null);
  assert.deepEqual(a.state.calls.find(c=>c.method==='PUT'),{path:pending.path,method:'PUT',body:pending.body,key:pending.key});
 }finally{release();a.close()}
});
await scenario('late handoff receipt distinguishes saved A from unsent B and translates system notice only',async()=>{
 let release;const hold=new Promise(r=>release=r);const a=await boot({handoffHold:hold});
 try{
  await fresh(a);await a.check(a.w.document.getElementById('reviewed'));await record(a);
  await a.input('request','业务原文 A');await a.click('发送内部请求');await a.input('request','新稿 B English 原文');release();await a.tick();await a.tick();
  assert.equal(a.w.document.getElementById('request').value,'新稿 B English 原文');assert.equal(a.state.handoffs.length,1);assert.equal(a.state.handoffs[0].request,'业务原文 A');
  assert(a.text().includes('上一条内部请求已保存；当前新文字尚未发送。'));assert(a.text().includes('内部请求尚未发送'));
  await a.click('English');assert(a.text().includes('The previous internal request was saved; the current text has not been sent.'));assert(!a.text().includes('上一条内部请求已保存'));
  assert.equal(a.w.document.getElementById('request').value,'新稿 B English 原文');assert(a.text().includes('业务原文 A'));
 }finally{release();a.close()}
});

await scenario('unmounted instance cannot erase replacement recovery after delayed post-receipt reload fails',async()=>{
 let release;const held=new Promise(r=>release=r);const a=await boot({drop:true});
 try{
  await fresh(a);await promise(a);a.state.contextHook=()=>held;await record(a);
  assert.equal(a.state.calls.filter(c=>c.path.startsWith('/commands/')).length,1);
  assert(a.state.calls.filter(c=>c.path==='/context').length>=2,'post-receipt reload in flight');
  a.w.document.getElementById('app').__vue_app__.unmount();
  const replacement=JSON.stringify({...legacy(),form:{organization:'replacement',occurredOn:'2026-10-16',notes:'new instance original'}});
  a.storage.set(v2,replacement);release(401);await a.tick();await a.tick();
  assert.equal(a.storage.get(v2),replacement,'old async denial must not remove newer recovery');
  const calls=a.state.calls.length;a.w.dispatchEvent(new a.w.Event('pageshow'));await a.tick();assert.equal(a.state.calls.length,calls,'unmounted listeners removed');
 }finally{release(401);a.close()}
});

await scenario('failed persistence shows idle lookup in both languages and preserves explicit recovery',async()=>{
 const a=await boot();try{
  await fresh(a);await promise(a);const storage=a.w.sessionStorage,setItem=storage.setItem;
  storage.setItem=(key,value)=>{if(key===v2)throw Error('synthetic quota');setItem(key,value)};
  const before=a.state.calls.length;await record(a);await a.tick();
  assert.equal(a.state.calls.length,before);assert(a.text().includes('当前未自动查回。'));
  assert(!a.text().includes('正在自动查回原请求。'));
  await a.click('English');assert(a.text().includes('Automatic checking is not active.'));
  assert.equal(a.state.calls.length,before);
  storage.setItem=setItem;await a.click('Retry original request');
  assert.equal(a.state.visits.length,1);assert.equal(a.state.commitments.length,1);
  assert.equal(a.state.calls.filter(c=>c.method==='POST').length,1);
  const lookup=a.state.calls.find(c=>c.path.startsWith('/commands/'));
  assert.equal(lookup.path,'/commands/'+a.state.calls.find(c=>c.method==='POST').key);
  assert(!a.text().includes('Automatic checking is not active.'));
 }finally{a.close()}
});
