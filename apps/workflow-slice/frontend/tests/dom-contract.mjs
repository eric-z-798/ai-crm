import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('dist/index.html','utf8'),script=html.match(/src="([^"]+\.js)"/)[1];
const state={visits:[],handoffs:[],commands:new Map(),delay:0,drop:false,conflict:false,counter:0};
const fixedTime='2026-10-17T17:15:00Z';
const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:'http://localhost:5173',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;w.confirm=()=>true;w.AbortController=AbortController;
w.fetch=async (url,options={})=>{
 const path=String(url).replace('/api',''),method=options.method??'GET',body=options.body?JSON.parse(options.body):null,role=options.headers?.Authorization?.endsWith('manager')?'manager':'rep',key=options.headers?.['Idempotency-Key'];
 const response=(value,status=200)=>({ok:status<400,status,json:async()=>structuredClone(value)});
 if(method==='GET'){
  if(path==='/context')return response({id:role==='rep'?'rep-a':'manager-a',role,tenant:'demo-team',mode:'synthetic',aiMode:'stub'});
  if(path==='/visits')return response(state.visits.filter(v=>role==='rep'||v.status==='RECORDED'));
  if(path==='/handoffs')return response(state.handoffs);
  if(path.startsWith('/commands/'))return state.commands.has(path.split('/').at(-1))?response(state.commands.get(path.split('/').at(-1))):response({code:'NOT_FOUND'},404);
 }
 assert.ok(key,'all mutations have idempotency keys');
 if(state.commands.has(key))return response(state.commands.get(key));
 if(state.conflict){state.conflict=false;state.visits[0].revision++;state.visits[0].notes='server changed text';return response({code:'REVISION_CONFLICT'},409)}
 let result;
 if(path==='/visits'){result={...body,id:'visit-'+(++state.counter),revision:1,status:'DRAFT',ownerId:'rep-a',createdAt:fixedTime,updatedAt:fixedTime};state.visits.push(result)}
 else if(method==='PUT'){let v=state.visits.find(v=>path.endsWith(v.id));assert.equal(body.expectedRevision,v.revision);Object.assign(v,body,{revision:v.revision+1});result={...v}}
 else if(path.endsWith('/confirm')){let v=state.visits.find(v=>path.includes(v.id));assert.equal(body.expectedRevision,v.revision);v.status='RECORDED';v.revision++;result={...v}}
 else if(path.endsWith('/handoffs')){let v=state.visits.find(v=>path.includes(v.id));assert.equal(v.status,'RECORDED');result={id:'handoff-1',visitId:v.id,request:body.request,status:'SENT',revision:1};state.handoffs.push(result)}
 else{let h=state.handoffs.find(h=>path.includes(h.id));assert.equal(body.expectedRevision,h.revision);h.status=path.endsWith('/receive')?'RECEIVED':'ACCEPTED';h.revision++;result={...h}}
 state.commands.set(key,structuredClone(result));
 if(state.delay){const delay=state.delay;state.delay=0;await new Promise(resolve=>setTimeout(resolve,delay))}
 if(state.drop){state.drop=false;throw new TypeError('Lost response')}
 return response(result);
};
w.eval(fs.readFileSync('dist'+script,'utf8'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
const text=()=>w.document.body.textContent;
async function click(label){const b=[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert.ok(b,`button ${label}`);assert.ok(!b.disabled,`enabled ${label}`);b.click();await tick()}
async function input(id,value){const el=w.document.getElementById(id);assert.ok(el,`input ${id}`);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));await tick()}
async function waitFor(check,label){for(let i=0;i<100;i++){if(check())return;await tick()}assert.fail(label)}
const has=t=>text().includes(t);
try{
 await tick();await click('＋ 记录一次交流');await input('organization','合成城南医院');await input('date','2026-10-17');await input('notes','原话：尚未核实 Mixed English 🧪');await input('organization','院'.repeat(201));await click('保存草稿');assert.ok(has('文字超出长度限制'));assert.equal(state.visits.length,0);await input('organization','合成城南医院');await click('English');await input('notes','x'.repeat(4001));await click('Save draft');assert.ok(has('Text exceeds the limit'));assert.equal(state.visits.length,0);await input('notes','原话：尚未核实 Mixed English 🧪');assert.equal(w.document.getElementById('notes').value,'原话：尚未核实 Mixed English 🧪');await click('Save draft');await waitFor(()=>has('Draft saved; not officially recorded'),'initial save');assert.equal(state.visits.length,1);
 await input('notes','submitted text');state.delay=180;await click('Save draft');await input('notes','newer edits during save');await new Promise(r=>setTimeout(r,250));assert.equal(w.document.getElementById('notes').value,'newer edits during save');assert.ok(has('Current changes are not saved'));assert.equal([...w.document.querySelectorAll('button')].find(b=>b.textContent==='Reviewed: confirm official record').disabled,true);
 state.conflict=true;await click('Save draft');assert.ok(has('The server version changed.'));assert.equal(w.document.getElementById('notes').value,'newer edits during save');await click('Review latest server version');await click('Keep my text and use latest revision');await click('Save draft');assert.ok(has('Draft saved; not officially recorded'));
 await input('notes','original remains on lost acknowledgment');state.drop=true;await click('Save draft');assert.ok(has('A request needs confirmation'));const mutationCount=state.commands.size;await click('Retry original request');assert.ok(has('Draft saved; not officially recorded'));assert.equal(state.commands.size,mutationCount);assert.equal(state.visits.length,1);
 await click('Reviewed: confirm official record');assert.ok(has('This version is recorded and cannot be rewritten directly.'));assert.ok(w.document.getElementById('notes').closest('fieldset').disabled);assert.equal(state.handoffs.length,0);await input('request','x'.repeat(2001));await click('Send internal request');assert.ok(has('Internal requests allow up to 2000'));assert.equal(state.handoffs.length,0);await input('request','协助范围核对，尚未接责');await click('Send internal request');assert.equal(state.handoffs.length,1);assert.equal(state.handoffs[0].status,'SENT');
 let role=w.document.getElementById('role');role.value='manager';role.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();await click('Confirm receipt');assert.equal(state.handoffs[0].status,'RECEIVED');assert.ok(has('Received · not accepted'));await click('Accept responsibility');assert.equal(state.handoffs[0].status,'ACCEPTED');
 console.log('PASS: built Vue bundle DOM API-contract tests: language/raw text retention; create/save; delayed receipt preserves newer edits and dirty state; stale revision explicit review/rebase; lost acknowledgement recovery without duplicate write; immutable confirmation without forced handoff; sent/received/accepted separate. Mock API only; not a browser/layout/Java persistence test.');
 fs.mkdirSync('../../evidence',{recursive:true});fs.writeFileSync('../../evidence/frontend-dom-contract-result.txt',new Date().toISOString()+'\nPASS: Built Vue bundle in JSDOM with mocked API. 8 workflow checks passed. No real browser/layout or backend claim.\n');
}finally{w.close()}
