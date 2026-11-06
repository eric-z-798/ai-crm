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
 const state={sourceMode:'ok',calls:[],delayed:[],listFail:false,commitments:clone(commitments),reviewFail:false,latestMode:'ok',visits:clone(visits)};
 const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'http://localhost:5173',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.confirm=()=>true;w.AbortController=AbortController;
 Object.defineProperty(w,'sessionStorage',{value:{get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}});
 w.fetch=async(url,options={})=>{
  const path=String(url).replace(/^\/api/,''),method=options.method??'GET';state.calls.push({path,method});
  const response=(data,status=200)=>({ok:status<400,status,json:async()=>w.JSON.parse(JSON.stringify(data))});
  if(method==='POST')return response({code:'REVISION_CONFLICT'},409);
  if(path==='/context')return response({id:options.headers.Authorization==='Bearer demo-manager'?'manager-a':'rep-a',role:options.headers.Authorization==='Bearer demo-manager'?'MANAGER':'REP',tenant:'tenant-a'});
  if(path==='/v2/visits')return response(state.visits);
  if(path==='/v2/handoffs')return response([]);
  if(path==='/v2/commitments'){if(state.latestMode==='delay')return new Promise(resolve=>state.delayed.push(()=>resolve(response(state.commitments))));if(state.latestMode==='missing')return response([]);return response(state.commitments);}
  if(path.endsWith('/review'))return state.reviewFail?response({code:'UNAVAILABLE'},503):response({schemaVersion:2,objectType:'record-review',visitId:path.split('/')[3],followUpReview:path.includes('legacy')?null:{status:'reviewed',decisions:[{kind:'explicit-self-commitment',commitmentText:state.commitments[0].events[0].commitmentText,deadline:state.commitments[0].events[0].deadline}]}});
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

async function conflict(a){
 await a.nav();await a.click('#commitment-action-a-open');
 await a.input('#event-type','amended');await a.input('form.followup-review textarea','Retained reason Ω');
 await a.click('form.followup-review label.check-label input');
 await a.input('form.followup-review select:not(#event-type)','date');
 await a.input('form.followup-review input[type=date]','2033-04-09');
 await a.click('form.followup-review button[type=submit]');
 assert(a.text().includes('服务器版本已变化'));assert(a.w.document.querySelector('.alert.error button'));
 const original=a.draft();
 a.state.commitments[0]=appendCommitmentEvent(a.state.commitments[0],{expectedRevision:1,event:{type:'amended',eventId:'other-change',actorId:'rep-a',recordedAt:'2026-10-20T00:00:00Z',reason:'Other scope',deadline:{kind:'date',date:'2033-04-07'}}}).value;
 return original;
}
await test('top recovery fetches actual conflicting commitment without changing the draft or old binding',async()=>{
 const a=await boot();try{
 const original=await conflict(a),start=a.state.calls.length;
 await a.click('.alert.error button');
 assert.deepEqual(a.state.calls.slice(start),[{path:'/v2/commitments',method:'GET'}]);
 assert(a.w.document.querySelector('.alert.warning').textContent.includes('2033-04-07'));
 assert.deepEqual(a.draft(),original);assert.equal(a.draft().target.revision,1);
 assert.equal(a.w.document.querySelector('form.followup-review input[type=date]').value,'2033-04-09');
 assert(a.w.document.querySelector('.alert.warning button').disabled);
 assert.equal(a.w.document.querySelector('.conflict-panel'),null);
 await a.click('#scope-reviewed');await a.click('.alert.warning button');
 assert.equal(a.draft().target.revision,2);assert.equal(a.draft().reason,original.reason);
 assert.equal(a.state.calls.filter(c=>c.method==='POST').length,1,'read and explicit rebind do not write');
 }finally{a.close()}
});
await test('missing latest entity preserves the draft and does not substitute visit state',async()=>{
 const a=await boot();try{const original=await conflict(a);a.state.latestMode='missing';await a.click('.alert.error button');assert.deepEqual(a.draft(),original);assert.equal(a.w.document.querySelector('.alert.warning'),null);assert.equal(a.w.document.querySelector('.conflict-panel'),null);assert(a.w.document.querySelector('.alert.error'));}finally{a.close()}
});
await test('late latest response after a role switch cannot apply the previous identity projection',async()=>{
 const a=await boot();try{await conflict(a);a.state.latestMode='delay';a.w.document.querySelector('.alert.error button').click();await a.tick();assert.equal(a.state.delayed.length,1);
 // Exercise a public role change while the read response is held.
 const visitNav=[...a.w.document.querySelectorAll('nav button')].find(b=>b.textContent.includes('交流记录'));visitNav.click();await a.tick();
 // Switching the synthetic role uses the public control and invalidates accessEpoch.
 await a.input('#role','manager');
 a.state.delayed[0]();await a.tick();assert(!a.text().includes('2033-04-07'));assert.equal(a.w.document.querySelector('.alert.warning'),null);
 }finally{a.close()}
});

await test('visit recovery still preserves local wording and requires explicit use of latest draft (mock server variant)',async()=>{
 const a=await boot();try{
 a.state.visits[0].status='DRAFT';await a.click('.record-list .icon-button');await a.openVisit('visit-a');
 await a.input('#notes','Local wording retained Ω');await a.click('#reviewed');
 const record=[...a.w.document.querySelectorAll('button')].find(b=>b.textContent==='保存交流及承诺');assert(record&&!record.disabled);record.click();await a.tick();
 assert(a.w.document.querySelector('.alert.error button'));
 a.state.visits[0]={...a.state.visits[0],revision:3,notes:'Server changed wording'};const start=a.state.calls.length;
 await a.click('.alert.error button');assert.deepEqual(a.state.calls.slice(start),[{path:'/v2/visits',method:'GET'}]);
 assert(a.w.document.querySelector('.conflict-panel').textContent.includes('Server changed wording'));assert.equal(a.w.document.querySelector('#notes').value,'Local wording retained Ω');
 await a.click('.conflict-panel button');assert.equal(a.w.document.querySelector('#notes').value,'Local wording retained Ω');assert.equal(JSON.parse(a.storage.get(key)).current.revision,3);
 assert.equal(a.state.calls.filter(c=>c.method==='POST').length,1);
 }finally{a.close()}
});
