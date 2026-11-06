import {handoff as handoffProjection} from './handoff-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {captureFollowUp} from '../src/domain/commitment.ts';
const built=fs.readFileSync('dist/index.html','utf8').match(/src="([^"]+\.js)"/)[1],code=fs.readFileSync('dist'+built,'utf8');
const original={id:'v-a',revision:2,status:'RECORDED',organization:'原机构 Ω',occurredOn:'2026-10-01',notes:'原文 Original Ω',ownerId:'rep-a',organizationId:null,createdAt:'2026-10-01T01:00:00Z',updatedAt:'2026-10-01T02:00:00Z'};
const commitment=captureFollowUp({id:'c-a',eventId:'created',actorId:'rep-a',recordedAt:original.createdAt,source:{visitId:original.id,organizationId:null,organizationText:original.organization,occurredOn:original.occurredOn,originalText:original.notes},declaration:{kind:'explicit-self-commitment',ownerId:'rep-a',confirmation:'person-explicitly-confirmed',commitmentText:'原承诺 promise',deadline:{kind:'unknown'}}}).value.commitment;
const clone=x=>JSON.parse(JSON.stringify(x)),key='aicrm-synthetic-slice-v2';
async function boot(storage=new Map(),existing){
 const state=existing??{visit:clone(original),versions:[clone(original)],calls:[],mode:'ok',receipts:new Map(),receiptVisible:true,storageFail:false};
 const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost:5173',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.confirm=()=>true;w.AbortController=AbortController;
 Object.defineProperty(w,'sessionStorage',{value:{get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(state.storageFail)throw Error('storage');storage.set(k,String(v))},removeItem:k=>storage.delete(k)}});
 w.fetch=async(url,o={})=>{const path=String(url).replace(/^\/api/,''),method=o.method??'GET',body=o.body?JSON.parse(o.body):null;state.calls.push({path,method,body,key:o.headers['Idempotency-Key']});const reply=(v,status=200)=>({ok:status<400,status,json:async()=>w.JSON.parse(JSON.stringify(v))});
 if(path==='/context')return reply({id:o.headers.Authorization.includes('manager')?'manager-a':'rep-a',role:o.headers.Authorization.includes('manager')?'MANAGER':'REP',tenant:'tenant-a'});
 if(path==='/v2/visits')return reply([state.visit]);if(path==='/v2/commitments')return reply([commitment]);if(path==='/v2/handoffs')return reply([handoffProjection({id:'h-a',visitId:'v-a',revision:2,status:'RECEIVED',request:'原请求',acceptedBy:null,acceptanceEvidence:'not-accepted'})]);
 if(path.endsWith('/review'))return reply({objectType:'record-review',visitId:'v-a',followUpReview:{status:'reviewed',decisions:[{kind:'customer-request',requestText:'原请求核对'}]}});
 if(path.endsWith('/history'))return state.mode==='history-fail'?reply({code:'FAIL'},503):reply({visitId:'v-a',versions:state.versions});
 if(path.startsWith('/commands/'))return state.receiptVisible&&state.receipts.has(path.split('/').at(-1))?reply(state.receipts.get(path.split('/').at(-1))):reply({code:'NOT_FOUND'},404);
 if(method==='POST'){
  assert.equal(path,'/v2/visits/v-a/corrections');
  if(body.expectedRevision!==state.visit.revision)return reply({code:'REVISION_CONFLICT'},409);
  const next={...state.visit,...body,revision:state.visit.revision+1,updatedAt:'2026-11-06T04:00:00Z'};delete next.expectedRevision;state.visit=next;state.versions.push(clone(next));state.receipts.set(o.headers['Idempotency-Key'],clone(next));
  if(state.mode==='lost')throw Error('Response lost');if(state.mode==='wrong')return reply({...next,id:'wrong'});return reply(next);
 }
 if(path==='/v2/visits/v-a')return reply(state.visit);throw Error(path);
 };
 w.eval(code);const tick=()=>new Promise(r=>setTimeout(r,30));await tick();await tick();
 const q=s=>w.document.querySelector(s),text=()=>w.document.body.textContent;
 const click=async s=>{const e=q(s);assert(e,s);assert(!e.disabled,s);e.click();await tick();};
 const input=async(s,v)=>{const e=q(s);assert(e,s);e.value=v;e.dispatchEvent(new w.Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));await tick();};
 return {w,state,storage,q,text,tick,click,input,close:()=>w.close(),open:()=>click('.record-item'),draft:()=>JSON.parse(storage.get(key))};
}
await test('correction keeps ID, unknown date and bilingual original, shows history and original review/source',async()=>{
 const a=await boot();try{await a.open();await a.click('#begin-correction');await a.input('#organization','更正组织 English');await a.input('#date','');await a.input('#notes','更正 Chinese Ω\nunchanged language');await a.click('.language');assert.equal(a.q('#notes').value,'更正 Chinese Ω\nunchanged language');await a.click('#save-correction');
 assert.equal(a.state.visit.revision,3);assert.equal(a.state.visit.occurredOn,null);assert.equal(a.state.calls.filter(c=>c.method==='POST').length,1);assert.equal(a.state.calls.find(c=>c.method==='POST').body.expectedRevision,2);assert(a.text().includes('review from the original recording'));assert(!a.q('#reviewed'));
 await a.click('.visit-history button');assert(a.q('.visit-history').textContent.includes(original.notes));assert(a.q('.visit-history').textContent.includes('更正 Chinese Ω'));
 const nav=[...a.w.document.querySelectorAll('nav button')].find(x=>x.textContent.includes('My commitments'));nav.click();await a.tick();await a.click('#source-button-c-a');assert(a.text().includes('Current communication record'));assert(a.text().includes(original.notes));assert(a.text().includes('更正 Chinese Ω'));assert.equal(a.state.calls.filter(c=>c.method==='POST').length,1);
 }finally{a.close();}
});
await test('conflict compares all versions and requires explicit rebind before a separate save',async()=>{
 const a=await boot();try{await a.open();await a.click('#begin-correction');await a.input('#notes','My retained input');a.state.visit={...a.state.visit,revision:3,notes:'Other newer text',organization:'Other organization',occurredOn:null};await a.click('#save-correction');assert.equal(a.q('#notes').value,'My retained input');await a.click('.alert.error button');assert(a.q('.conflict-panel').textContent.includes(original.notes));assert(a.q('.conflict-panel').textContent.includes('Other newer text'));assert(a.q('.conflict-panel').textContent.includes('My retained input'));assert(a.q('.conflict-panel button').disabled);assert(a.q('#save-correction').disabled);await a.click('#correction-reviewed');await a.click('.conflict-panel button');assert.equal(a.draft().current.revision,3);assert.equal(a.state.calls.filter(c=>c.method==='POST').length,1);await a.click('#save-correction');assert.equal(a.state.visit.revision,4);assert.equal(a.state.calls.filter(c=>c.method==='POST').length,2);
 }finally{a.close();}
});
await test('lost response survives reload, original key lookup does not overwrite a later version or repeat POST',async()=>{
 const a=await boot();let b;try{await a.open();await a.click('#begin-correction');await a.input('#notes','Submitted correction');a.state.mode='lost';a.state.receiptVisible=false;await a.click('#save-correction');assert(a.draft().pending);assert(a.q('.save-state').textContent.includes('有待确认的请求'));assert(!a.q('.save-state').textContent.includes('本次改动尚未保存'));await a.click('.language');assert(a.q('.save-state').textContent.includes('A request needs confirmation'));assert(!a.q('.save-state').textContent.includes('Current changes are not saved'));const command=clone(a.draft().pending);assert(a.q('#cancel-correction').disabled);a.state.visit={...a.state.visit,revision:4,notes:'Later server version'};a.close();a.state.receiptVisible=true;b=await boot(a.storage,a.state);assert.equal(b.state.calls.filter(c=>c.method==='POST').length,1);assert.equal(b.q('#notes').value,'Later server version');assert.equal(b.draft().pending,null);assert(b.state.calls.some(c=>c.path==='/commands/'+command.key));}finally{a.close();b?.close();}
});
await test('unsubmitted correction survives reload; cancel and manager view cause no correction writes',async()=>{
 const a=await boot();let b;try{await a.open();await a.click('#begin-correction');await a.input('#notes','Unsubmitted Ω');a.close();b=await boot(a.storage,a.state);assert.equal(b.q('#notes').value,'Unsubmitted Ω');assert(b.q('#save-correction'));await b.click('#cancel-correction');assert.equal(b.q('#notes').value,original.notes);await b.input('#role','manager');const nav=[...b.w.document.querySelectorAll('nav button')].find(x=>x.textContent.includes('交流记录'));nav.click();await b.tick();await b.open();assert(!b.q('#begin-correction'));await b.click('.visit-history button');assert(b.q('.visit-history').textContent.includes(original.notes));assert.equal(b.state.calls.filter(c=>c.method==='POST').length,0);}finally{a.close();b?.close();}
});
await test('storage failure blocks sending and keeps correction text and pending identity',async()=>{
 const a=await boot();try{await a.open();await a.click('#begin-correction');await a.input('#notes','Protected input');a.state.storageFail=true;await a.click('#save-correction');assert.equal(a.state.calls.filter(c=>c.method==='POST').length,0);assert.equal(a.q('#notes').value,'Protected input');assert(a.text().includes('尚未发送'));}finally{a.close();}
});
await test('history failure stays failure and switches language without interpreting as empty history',async()=>{
 const a=await boot();try{await a.open();a.state.mode='history-fail';await a.click('.visit-history button');assert(a.text().includes('交流历史读取失败'));await a.click('.language');assert(a.text().includes('Communication history could not be loaded'));assert(!a.q('.visit-history ol'));}finally{a.close();}
});
await test('wrong correction result remains pending without applying another target',async()=>{
 const a=await boot();try{await a.open();await a.click('#begin-correction');await a.input('#notes','Bound text');a.state.mode='wrong';a.state.receiptVisible=false;await a.click('#save-correction');assert(a.draft().pending);assert.equal(a.draft().current.id,'v-a');assert.equal(a.draft().current.revision,2);assert.equal(a.q('#notes').value,'Bound text');assert(a.q('#save-correction').disabled);assert.equal(a.state.calls.filter(c=>c.method==='POST').length,1);}finally{a.close();}
});
await test('malformed restored correction target is quarantined, never replayed or checked under a new target',async()=>{
 const a=await boot();let b;try{await a.open();await a.click('#begin-correction');await a.input('#notes','Original protected');a.state.storageFail=true;await a.click('#save-correction');a.state.storageFail=false;const raw=a.draft();raw.pending={kind:'correction',key:'unsafe-target-key',path:'/v2/visits/other/corrections',method:'POST',role:'rep',body:{expectedRevision:2,organization:original.organization,occurredOn:null,notes:'Original protected'}};a.storage.set(key,JSON.stringify(raw));a.close();b=await boot(a.storage,a.state);assert(!b.state.calls.some(c=>c.path.includes('unsafe-target-key')||c.path.includes('/other/')));assert(b.text().includes('不完整或不兼容'));assert([...b.storage.values()].some(v=>v.includes('unsafe-target-key')));}finally{a.close();b?.close();}
});
