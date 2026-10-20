import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {captureFollowUp,appendCommitmentEvent} from '../src/domain/commitment.ts';
const built=fs.readFileSync('dist/index.html','utf8').match(/src="([^"]+\.js)"/)[1];
const code=fs.readFileSync('dist'+built,'utf8');
const key='aicrm-synthetic-slice-v2';
const clone=x=>JSON.parse(JSON.stringify(x));
const visits=['a','b','empty','legacy'].map(id=>({id:'visit-'+id,revision:2,status:'RECORDED',organization:'机构 '+id,occurredOn:null,notes:'原交流 '+id+'\nExact Ω 中文',ownerId:'rep-a',createdAt:'2026-10-19T08:00:00Z',updatedAt:'2026-10-19T09:00:00Z'}));
function promise(id,visit,completed=false){
 const c=captureFollowUp({id,eventId:'created-'+id,actorId:'rep-a',recordedAt:'2026-10-19T08:00:00Z',source:{visitId:visit.id,organizationId:null,organizationText:visit.organization,occurredOn:visit.occurredOn,originalText:visit.notes},declaration:{kind:'explicit-self-commitment',ownerId:'rep-a',confirmation:'person-explicitly-confirmed',commitmentText:'本人承诺 '+id,deadline:{kind:'unknown'}}});assert(c.ok);let result=c.value.commitment;
 if(completed){const a=appendCommitmentEvent(result,{expectedRevision:1,event:{eventId:'complete-'+id,type:'completed',actorId:'rep-a',recordedAt:'2026-10-19T10:00:00Z',contentRevision:1,text:'本人确认办完',confirmation:'person-confirmed-complete'}});assert(a.ok,JSON.stringify(a));result=a.value;}
 return result;
}
const commitments=[promise('a-open',visits[0]),promise('a-complete',visits[0],true),promise('b-open',visits[1])];
async function boot(storage=new Map()){
 const state={sourceMode:'ok',calls:[],delayed:[],listFail:false,commitments:clone(commitments),reviewFail:false};
 const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'http://localhost:5173',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.confirm=()=>true;w.AbortController=AbortController;
 Object.defineProperty(w,'sessionStorage',{value:{get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}});
 w.fetch=async(url,options={})=>{
  const path=String(url).replace(/^\/api/,''),method=options.method??'GET';state.calls.push({path,method});assert.equal(method,'GET','read navigation must not mutate');
  const response=(data,status=200)=>({ok:status<400,status,json:async()=>w.JSON.parse(JSON.stringify(data))});
  if(path==='/context')return response({id:options.headers.Authorization==='Bearer demo-manager'?'manager-a':'rep-a',role:options.headers.Authorization==='Bearer demo-manager'?'MANAGER':'REP',tenant:'tenant-a'});
  if(path==='/v2/visits')return response(visits);
  if(path==='/handoffs')return response([]);
  if(path==='/v2/commitments')return state.listFail?response({code:'UNAVAILABLE'},503):response(state.commitments);
  if(path.endsWith('/review'))return state.reviewFail?response({code:'UNAVAILABLE'},503):response({schemaVersion:2,objectType:'record-review',visitId:path.split('/')[3],followUpReview:path.includes('legacy')?null:{status:'reviewed',decisions:[]}});
  const value=visits.find(v=>v.id===path.split('/')[3]);
  if(state.sourceMode==='delay')return await new Promise(resolve=>state.delayed.push(()=>resolve(response(value))));
  if(state.sourceMode==='wrong')return response({...value,id:'wrong-visit'});
  if(state.sourceMode==='missing')return response({code:'NOT_FOUND'},404);
  if(state.sourceMode==='denied')return response({code:'FORBIDDEN'},403);
  if(state.sourceMode==='fail')return response({code:'UNAVAILABLE'},503);
  return response(value);
 };
 w.eval(code);const tick=()=>new Promise(r=>setTimeout(r,25));await tick();await tick();
 const text=()=>w.document.body.textContent;
 async function click(selector){const b=w.document.querySelector(selector);assert(b,selector);assert(!b.disabled,selector);b.click();await tick();}
 async function input(selector,value){const el=w.document.querySelector(selector);assert(el,selector);el.value=value;el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await tick();}
 async function openVisit(id){await click('.record-item:nth-of-type('+(visits.findIndex(v=>v.id===id)+1)+')');}
 async function nav(){const b=[...w.document.querySelectorAll('nav button')].find(b=>b.textContent.includes('本人承诺'));b.click();await tick();}
 return {w,state,storage,tick,text,click,input,openVisit,nav,close:()=>w.close(),draft:()=>JSON.parse(storage.get(key)).eventDraft};
}
await test('same-record links include completed commitments, exclude other visits, and open exact history',async()=>{const a=await boot();try{await a.openVisit('visit-a');const related=a.w.document.querySelector('.related-commitments');assert.equal(related.querySelectorAll('.related-commitment').length,2);assert(!related.textContent.includes('b-open'));assert(related.textContent.includes('负责人: 本人'));await a.click('[data-related-id="a-complete"]');assert.equal(a.draft().commitmentId,'a-complete');assert.equal(a.w.document.getElementById('event-type').value,'reply-recorded');assert.equal(a.w.document.getElementById('commitment-history-a-complete').open,true);assert.equal(a.w.document.activeElement.id,'commitment-action-a-complete');assert(a.text().includes('本人确认办完'));}finally{a.close()}});
await test('read source and close preserve every draft field, scope and confirmation without a mutation',async()=>{const a=await boot();try{await a.nav();await a.click('#commitment-action-a-open');await a.input('#event-type','amended');await a.input('form.followup-review textarea','具体原因 Ω');await a.input('form.followup-review textarea:nth-of-type(1)','具体原因 Ω');const before=clone(a.draft());await a.click('#source-button-a-open');assert.equal(a.w.document.querySelector('.source-record-notes').textContent,visits[0].notes);assert.deepEqual(a.draft(),before);await a.click('.source-panel .panel-heading button');assert.deepEqual(a.draft(),before);assert.equal(a.w.document.activeElement.id,'source-button-a-open');assert(!a.w.document.querySelector('.source-panel'));assert(a.state.calls.every(c=>c.method==='GET'));}finally{a.close()}});
for(const mode of ['wrong','missing','fail'])await test('source '+mode+' does not display unrelated data or erase draft; retry works',async()=>{const a=await boot();try{await a.nav();await a.click('#commitment-action-a-open');await a.input('form.followup-review textarea','尚未提交');const before=clone(a.draft());a.state.sourceMode=mode;await a.click('#source-button-a-open');assert(!a.w.document.querySelector('.source-record-notes'));assert(a.w.document.querySelector('.source-panel [role=alert]'));assert.deepEqual(a.draft(),before);a.state.sourceMode='ok';await a.click('.source-panel > button');assert.equal(a.w.document.querySelector('.source-record-notes').textContent,visits[0].notes);}finally{a.close()}});
await test('closing a pending source read rejects its late result',async()=>{const a=await boot();try{await a.nav();a.state.sourceMode='delay';await a.click('#source-button-a-open');assert(a.text().includes('正在读取原交流'));await a.click('.source-panel .panel-heading button');a.state.delayed[0]();await a.tick();assert(!a.w.document.querySelector('.source-panel'));}finally{a.close()}});
await test('a later source request wins if earlier response arrives last',async()=>{const a=await boot();try{await a.nav();a.state.sourceMode='delay';await a.click('#source-button-a-open');await a.click('#source-button-b-open');a.state.delayed[1]();await a.tick();a.state.delayed[0]();await a.tick();assert.equal(a.w.document.querySelector('.source-record-notes').textContent,visits[1].notes);}finally{a.close()}});
await test('role switch hides source and rejects late response',async()=>{const a=await boot();try{await a.nav();a.state.sourceMode='delay';await a.click('#source-button-a-open');await a.input('#role','manager');a.state.delayed[0]();await a.tick();assert(!a.w.document.querySelector('.source-panel'));assert(!a.w.document.querySelector('.related-commitments'));}finally{a.close()}});
await test('access denial removes source and keeps held event recovery',async()=>{const a=await boot();try{await a.nav();await a.click('#commitment-action-a-open');await a.input('form.followup-review textarea','原草稿仍需保全');const before=clone(a.draft());a.state.sourceMode='denied';await a.click('#source-button-a-open');assert(!a.w.document.querySelector('.source-panel'));assert(a.text().includes('权限'));assert.deepEqual(JSON.parse(a.storage.get(key+'-held-rep')).eventDraft,before);}finally{a.close()}});
await test('list failure and legacy unknown review do not claim zero commitments',async()=>{const a=await boot();try{await a.openVisit('visit-empty');assert(a.w.document.querySelector('.related-commitments').textContent.includes('目前没有关联'));a.state.listFail=true;await a.click('.record-list .icon-button');assert(a.w.document.querySelector('.related-commitments').textContent.includes('不能据此判断没有承诺'));a.state.listFail=false;await a.click('.record-list .icon-button');await a.openVisit('visit-legacy');assert(a.w.document.querySelector('.related-commitments').textContent.includes('不能据此认为没有承诺'));}finally{a.close()}});
await test('malformed source association is a list failure, never a zero result',async()=>{const a=await boot();try{await a.openVisit('visit-empty');a.state.commitments[0].source.visitId='';await a.click('.record-list .icon-button');assert(a.w.document.querySelector('.related-commitments').textContent.includes('关联承诺尚未查回'));}finally{a.close()}});
await test('English read-only source and return wording retain the same draft',async()=>{const a=await boot();try{await a.nav();await a.click('#commitment-action-a-open');await a.input('form.followup-review textarea','Draft unchanged');const before=clone(a.draft());await a.click('.language');await a.click('#source-button-a-open');assert(a.text().includes('Read-only view of the saved communication'));assert(a.text().includes('Return to this follow-up'));await a.click('.source-panel .panel-heading button');assert.deepEqual(a.draft(),before);}finally{a.close()}});
await test('refresh/reconstructed DOM keeps event draft and no source panel is persisted',async()=>{const a=await boot();let storage,before;try{await a.nav();await a.click('#commitment-action-a-open');await a.input('form.followup-review textarea','刷新后继续');before=clone(a.draft());await a.click('#source-button-a-open');storage=a.storage;}finally{a.close()}const b=await boot(storage);try{assert.deepEqual(b.draft(),before);assert.equal(b.w.document.querySelector('form.followup-review textarea').value,'刷新后继续');assert(!b.w.document.querySelector('.source-panel'));}finally{b.close()}});
console.log('CONTINUITY: built Vue/JSDOM, mocked API. No native browser/layout or real persistence claim.');
