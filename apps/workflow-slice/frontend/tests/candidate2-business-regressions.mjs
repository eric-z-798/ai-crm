// Candidate2 author acceptance tests adapted from independent CRM-10 counterexamples. Original evidence stays unchanged. Synthetic only.
// No browser automation: JSDOM is used to exercise built Vue state with real loopback API.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {projectCommitment} from '../src/domain/commitment.ts';
const root=new URL('../',import.meta.url);
const built=fs.readFileSync(new URL('dist/index.html',root),'utf8').match(/src="([^"]+\.js)"/)[1];
const code=fs.readFileSync(new URL('dist'+built,root),'utf8');
const host=process.env.CRM_TEST_API_BASE??'http://127.0.0.1:8787/api',v2='aicrm-synthetic-slice-v2',v1='aicrm-synthetic-slice-v1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let seq=0;
async function api(path,{method='GET',body,key}={}){const r=await fetch(host+path,{method,headers:{Authorization:'Bearer demo-rep',...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();assert.equal(r.status,200,JSON.stringify(value));return value}
const key=()=>`independent-qa-${++seq}`;
async function create(label){return await api('/v2/visits/record',{method:'POST',key:key(),body:{schemaVersion:2,visitId:null,expectedRevision:null,record:{organization:'QA synthetic institution',organizationId:null,occurredOn:'2026-10-17',notes:'Original communication '+label},followUpReview:{status:'reviewed',decisions:[{kind:'explicit-self-commitment',confirmation:'person-explicitly-confirmed',commitmentText:label,deadline:{kind:'unknown'}}]}}})}
async function boot({storage=new Map(),failWrites=false,dropPost=false}={}){
 const dom=new JSDOM('<html><body><div id="app"></div></body></html>',{url:'http://localhost:5173',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.AbortController=AbortController;w.confirm=()=>true;
 const state={storage,failWrites,dropPost,calls:[],dropped:false};
 Object.defineProperty(w,'sessionStorage',{value:{get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem(k,v){if(state.failWrites)throw Error('Synthetic sessionStorage quota failure');storage.set(k,String(v))},removeItem:k=>storage.delete(k)}});
 w.fetch=async(url,options={})=>{const path=String(url).replace(/^\/api/,'');const call={path,method:options.method??'GET',key:options.headers?.['Idempotency-Key'],body:options.body?JSON.parse(options.body):null};state.calls.push(call);const r=await fetch(host+path,options);const value=await r.json();call.responseStatus=r.status;call.response=value;if(state.dropPost&&call.method==='POST'&&r.ok){state.dropPost=false;state.dropped=true;throw Error('Synthetic successful response loss')}return {ok:r.ok,status:r.status,json:async()=>w.JSON.parse(JSON.stringify(value))}};
 const text=()=>w.document.body.textContent;
 async function until(f,label){for(let i=0;i<200;i++){if(f())return;await sleep(20)}assert.fail(label+' '+text().slice(-1000))}
 async function click(label){await until(()=>[...w.document.querySelectorAll('button')].some(b=>b.textContent.trim()===label&&!b.disabled),'enabled '+label);[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label).click();await sleep(40)}
 async function input(selector,value){const e=w.document.querySelector(selector);assert.ok(e,selector);e.value=value;e.dispatchEvent(new w.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));await sleep(30)}
 async function check(selector){const e=w.document.querySelector(selector);assert.ok(e,selector);e.checked=true;e.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(30)}
 async function nav(){const b=[...w.document.querySelectorAll('nav button')].find(x=>x.textContent.includes('本人承诺'));assert.ok(b);b.click();await sleep(40)}
 async function select(label){const c=[...w.document.querySelectorAll('.commitment-card')].find(x=>x.querySelector('h3').textContent===label);assert.ok(c,'card '+label);c.querySelector('button').click();await sleep(40)}
 w.eval(code);await until(()=>text().includes('历史机构 Original Ω')||text().includes('QA synthetic institution'),'initial records');await sleep(100);
 return {w,state,storage,until,click,input,check,nav,select,text,close:()=>w.close()};
}
const emptyEvent=()=>({commitmentId:'',type:'progress-recorded',text:'',status:'in-progress',direction:'from-customer',occurredAt:'',confirmed:false,reason:'',newText:'',changeDeadline:false,deadlineKind:'unknown',deadlineValue:''});
const recovery=(notes,version=2)=>({schemaVersion:version,role:'rep',identity:'rep-a',lang:'zh',current:null,editing:true,form:{organization:'QA local institution',occurredOn:'',notes},request:'',pending:null,tab:'visits',...(version===2?{review:{checked:false,rows:[]},eventDraft:emptyEvent()}: {})});
await test('candidate2 author acceptance of CRM-10 business regressions',async t=>{
 await t.test('P26/P59 live event draft must not silently rebind verification to a later content scope',async()=>{
  const r=await create('QA-SCOPE-OLD-A'),c=r.commitments[0],a=await boot();try{
   await a.nav();await a.select('QA-SCOPE-OLD-A');await a.input('form.followup-review select:not(#event-type)','verified');await a.input('form.followup-review textarea','Only old A has been verified');
   await api(`/v2/commitments/${c.id}/events`,{method:'POST',key:key(),body:{schemaVersion:2,expectedRevision:1,event:{type:'amended',eventId:'independent-scope-change',reason:'The same representative changed scope in another tab',commitmentText:'QA-SCOPE-NEW-A-AND-B',contentRevision:2}}});
   await a.click('刷新列表');await a.until(()=>a.text().includes('QA-SCOPE-NEW-A-AND-B'),'new scope loaded');await a.click('保存状态记录');await a.until(()=>a.text().includes('承诺版本已变化'),'scope conflict retained');assert.equal(a.state.calls.filter(c=>c.method==='POST').length,0);assert.equal(a.w.document.querySelector('form.followup-review textarea').value,'Only old A has been verified');
   const actual=await api('/v2/commitments/'+c.id),p=projectCommitment(actual).value,call=a.state.calls.filter(x=>x.method==='POST').at(-1);
   console.log('QA_SCOPE_OBSERVED '+JSON.stringify({call,contentRevision:p.contentRevision,verificationStatus:p.verificationStatus,lastEvent:actual.events.at(-1)}));
   assert.notEqual(p.verificationStatus,'verified','Old-scope draft cannot verify new A+B');assert.equal(JSON.parse(a.storage.get(v2)).eventDraft.target.contentRevision,1);await a.check('#scope-reviewed');await a.click('核对后使用当前记录版本');assert.equal(a.w.document.querySelector('form.followup-review textarea').value,'Only old A has been verified');assert.equal(JSON.parse(a.storage.get(v2)).eventDraft.target.contentRevision,2);
  }finally{a.close()}
 });
 await t.test('P60 current recovery and older held v2 draft must both survive startup without silent replacement',async()=>{
  const main=JSON.stringify(recovery('CURRENT UNSAVED DRAFT Ω\r\nKeep me'),null,2)+'\n';const held=JSON.stringify(recovery('OLDER HELD DRAFT'),null,3);
  const a=await boot({storage:new Map([[v2,main],[v2+'-held-rep',held]])});try{await sleep(150);console.log('QA_HELD_OBSERVED '+JSON.stringify({editor:a.w.document.getElementById('notes')?.value,storage:[...a.storage]}));assert.ok([...a.storage.values()].some(raw=>raw.includes('CURRENT UNSAVED DRAFT')),'Current recovery must remain available after an older held draft is restored');assert.ok([...a.storage.values()].some(raw=>raw.includes('OLDER HELD DRAFT')),'Held recovery must remain available');}finally{a.close()}
 });
 await t.test('P60 current v2 recovery must not be overwritten by a legacy held draft',async()=>{
  const main=JSON.stringify(recovery('LATEST V2 DRAFT SHOULD SURVIVE'),null,2);const held=JSON.stringify(recovery('OLD V1 HELD DRAFT',1),null,3);
  const a=await boot({storage:new Map([[v2,main],[v1+'-held-rep',held]])});try{await sleep(100);console.log('QA_LEGACY_HELD_OBSERVED '+JSON.stringify({editor:a.w.document.getElementById('notes')?.value,storage:[...a.storage]}));assert.ok([...a.storage.values()].some(raw=>raw.includes('LATEST V2 DRAFT SHOULD SURVIVE')),'Current v2 draft must survive alongside legacy held original');assert.equal(a.storage.get(v1+'-held-rep'),held);}finally{a.close()}
 });
 await t.test('P60 ordinary edit after legacy held restore must survive a second startup',async()=>{
  const held=JSON.stringify(recovery('LEGACY HELD ORIGINAL',1),null,2);const a=await boot({storage:new Map([[v1+'-held-rep',held]])});let storage;
  try{await a.input('#notes','NEW WORK AFTER LEGACY RESTORE');storage=a.storage;assert.equal(JSON.parse(storage.get(v2)).form.notes,'NEW WORK AFTER LEGACY RESTORE');}finally{a.close()}
  const b=await boot({storage});try{console.log('QA_REPEAT_LEGACY_OBSERVED '+JSON.stringify({editor:b.w.document.getElementById('notes')?.value,storage:[...storage]}));assert.equal(b.w.document.getElementById('notes').value,'NEW WORK AFTER LEGACY RESTORE','New typed work must survive subsequent restart after a successful legacy held restoration');}finally{b.close()}
 });
 await t.test('P58/P60 pending key persistence failure plus lost response must not enable duplicate record after restart',async()=>{
  const a=await boot();let storage;try{
   await a.click('＋ 记录一次交流');await a.input('#organization','QA-QUOTA-DUPLICATE');await a.input('#notes','A reviewed communication with no promised follow-up');await a.check('#reviewed');storage=a.storage;
   a.state.failWrites=true;a.state.dropPost=true;await a.click('保存交流及承诺');await sleep(150);assert.equal(a.state.calls.some(c=>c.method==='POST'),false);assert.equal(a.state.dropped,false);assert.ok(a.text().includes('尚未发送'));assert.equal(a.w.document.getElementById('notes').value,'A reviewed communication with no promised follow-up');
  }finally{a.close()}
  const b=await boot({storage,dropPost:true});try{await b.click('保存交流及承诺');await b.until(()=>b.state.dropped,'one successful response intentionally dropped');await b.click('查回保存结果');await b.until(()=>JSON.parse(b.storage.get(v2)).pending===null,'original key restored');const matches=(await api('/v2/visits')).filter(v=>v.organization==='QA-QUOTA-DUPLICATE');console.log('QA_QUOTA_AFTER_RESTART '+JSON.stringify({ids:matches.map(v=>v.id),postCalls:b.state.calls.filter(c=>c.method==='POST')}));assert.equal(matches.length,1,'Blocked unstored command then normal lost-response recovery yields exactly one recorded visit');}finally{b.close()}
 });
 await t.test('P56 Chinese/English toggle preserves submitted exact original business payload',async()=>{
  const a=await boot();try{await a.click('＋ 记录一次交流');await a.input('#organization','  QA 中英文 Ω  ');await a.input('#notes','原话 English\n非翻译内容 😀  ');await a.check('#reviewed');const before=JSON.parse(a.storage.get(v2));await a.click('English');const after=JSON.parse(a.storage.get(v2));assert.deepEqual(after.form,before.form);assert.deepEqual(after.review,before.review);assert.equal(a.w.document.documentElement.lang,'en');await a.click('简体中文');assert.deepEqual(JSON.parse(a.storage.get(v2)).form,before.form);}finally{a.close()}
 });
 await t.test('P25 late reply requires explicit historical scope and does not mark expanded current content replied',async()=>{
  const r=await create('QA-REPLY-OLD-B'),c=r.commitments[0];await api(`/v2/commitments/${c.id}/events`,{method:'POST',key:key(),body:{schemaVersion:2,expectedRevision:1,event:{type:'amended',eventId:'historical-reply-expanded',reason:'Added C',commitmentText:'QA-REPLY-NEW-B+C',contentRevision:2}}});
  const a=await boot();try{await a.nav();await a.select('QA-REPLY-NEW-B+C');await a.input('#event-type','reply-recorded');assert.equal(a.w.document.getElementById('reply-scope').value,'');const options=a.w.document.getElementById('reply-scope').textContent;assert.ok(options.includes('QA-REPLY-OLD-B'));assert.ok(options.includes('QA-REPLY-NEW-B+C'));await a.input('#reply-scope','1');await a.input('form.followup-review input:not([type=checkbox])','2026-10-18T09:00:00Z');await a.input('form.followup-review textarea','Late receipt explicitly concerns old B');await a.click('保存状态记录');await a.until(()=>!a.w.document.getElementById('event-type'),'reply accepted');const actual=await api('/v2/commitments/'+c.id),p=projectCommitment(actual).value;assert.equal(p.replyFromCustomer,'not-recorded');assert.equal(actual.events.at(-1).contentRevision,1);assert.equal(actual.events.at(-1).text,'Late receipt explicitly concerns old B');assert.equal(a.w.document.querySelectorAll('.commitment-card pre').length,0);assert.ok(a.text().includes('记录时间'));await a.click('English');assert.ok(a.text().includes('Recorded at'));assert.ok(a.text().includes('Late receipt explicitly concerns old B'));}finally{a.close()}
 });
 await t.test('P60 failed pending write can be retried in same page only after reliable readback, using original memory key',async()=>{
  const a=await boot();try{await a.click('＋ 记录一次交流');await a.input('#organization','QA-STORAGE-RETRY');await a.input('#notes','Exact retry original');await a.check('#reviewed');a.state.failWrites=true;await a.click('保存交流及承诺');await sleep(100);assert.equal(a.state.calls.filter(c=>c.method==='POST').length,0);a.state.failWrites=false;await a.click('重试原请求');await a.until(()=>a.state.calls.some(c=>c.method==='POST'&&c.responseStatus===200),'retry executed after persistence');const post=a.state.calls.find(c=>c.method==='POST');const receipt=await api('/commands/'+post.key);assert.equal(receipt.visit.notes,'Exact retry original');assert.equal((await api('/v2/visits')).filter(v=>v.organization==='QA-STORAGE-RETRY').length,1);}finally{a.close()}
 });
 await t.test('P24 retrospective dates get bilingual manual reference-day guidance without inventing a date',async()=>{
  const a=await boot();try{await a.click('＋ 记录一次交流');assert.equal(a.w.document.getElementById('date').value,'');assert.ok(a.text().includes('补记时请核对实际交流发生日'));assert.ok(a.text().includes('本次录入日期'));await a.click('English');assert.ok(a.text().includes('Relative dates such as tomorrow require a manually confirmed reference day'));assert.equal(a.w.document.getElementById('date').value,'');}finally{a.close()}
 });

});
