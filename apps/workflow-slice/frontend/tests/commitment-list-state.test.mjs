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
 const state={sourceMode:'ok',calls:[],delayed:[],listFail:false,listDelay:false,listDelayed:[],commitments:clone(commitments),reviewFail:false};
 const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'http://localhost:5173',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;w.confirm=()=>true;w.AbortController=AbortController;
 Object.defineProperty(w,'sessionStorage',{value:{get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}});
 w.fetch=async(url,options={})=>{
  const path=String(url).replace(/^\/api/,''),method=options.method??'GET';state.calls.push({path,method});assert.equal(method,'GET','read navigation must not mutate');
  const response=(data,status=200)=>({ok:status<400,status,json:async()=>w.JSON.parse(JSON.stringify(data))});
  if(path==='/context')return response({id:options.headers.Authorization==='Bearer demo-manager'?'manager-a':'rep-a',role:options.headers.Authorization==='Bearer demo-manager'?'MANAGER':'REP',tenant:'tenant-a'});
  if(path==='/v2/visits')return response(visits);
  if(path==='/handoffs')return response([]);
  if(path==='/v2/commitments'&&state.listDelay)return await new Promise(resolve=>state.listDelayed.push(()=>resolve(response(state.commitments))));
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

for(const english of [false,true])await test('total list states, retry and filters '+(english?'English':'Chinese'),async()=>{const a=await boot();try{await a.nav();if(english)await a.click('.language');a.state.commitments=[];await a.click('.commitment-list .panel-heading button');assert(a.w.document.querySelector('[data-list-state=empty]'));a.state.listDelay=true;await a.click('.commitment-list .panel-heading button');assert(a.w.document.querySelector('[data-list-state=loading]'));assert(!a.w.document.querySelector('[data-list-state=empty]'));assert(a.w.document.querySelector('.commitment-list .panel-heading button').disabled);a.state.listDelayed[0]();a.state.listDelay=false;await a.tick();assert(a.w.document.querySelector('[data-list-state=empty]'));a.state.listFail=true;await a.click('.commitment-list .panel-heading button');assert(a.w.document.querySelector('[data-list-state=failed]'));assert(!a.w.document.querySelector('[data-list-state=empty]'));assert(!a.w.document.querySelector('.commitment-list .panel-heading button').disabled);a.state.listFail=false;await a.click('.commitment-list .panel-heading button');assert(a.w.document.querySelector('[data-list-state=empty]'));a.w.document.querySelector('.commitment-list input[type=checkbox]').click();await a.tick();assert(a.w.document.querySelector('[data-list-state=empty]').textContent.includes(english?'including completed':'包含已完成'));a.state.commitments=[clone(commitments[1])];await a.click('.commitment-list .panel-heading button');assert.equal(a.w.document.querySelectorAll('.commitment-card').length,1);assert(!a.w.document.querySelector('[data-list-state=empty]'));a.w.document.querySelector('.commitment-list input[type=checkbox]').click();await a.tick();assert(a.w.document.querySelector('[data-list-state=empty]'));}finally{a.close()}});
await test('nonempty refresh failure labels retained data and preserves unsent draft',async()=>{const a=await boot();try{await a.nav();await a.click('#commitment-action-a-open');await a.input('form.followup-review textarea','未提交的内容');const before=clone(a.draft());a.state.listFail=true;await a.click('.commitment-list .panel-heading button');assert(a.w.document.querySelector('[data-list-state=failed]').textContent.includes('上次读取'));assert.equal(a.w.document.querySelectorAll('.commitment-card').length,2);assert.deepEqual(a.draft(),before);assert(a.state.calls.every(c=>c.method==='GET'));}finally{a.close()}});
console.log('Limited total-list state regression: built Vue/JSDOM and mocked GET responses; not native browser or backend validation.');
