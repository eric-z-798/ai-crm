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
  if(path==='/v2/handoffs')return response([]);
  if(path==='/v2/commitments')return state.listFail?response({code:'UNAVAILABLE'},503):response(state.commitments);
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

for(const deadline of [{kind:'unknown'},{kind:'date',date:'2032-02-19'},{kind:'instant',at:'2032-02-19T10:15:00+02:00'}])await test('deadline scope is paired with exact wording across saved, related, current and history: '+deadline.kind,async()=>{
 const a=await boot();try{
  const wording='先确认能否公开；只有获许可才于2032年2月19日前寄出。原说18日，更正为19日。未许可，未寄。';
  a.state.commitments[0].events[0].commitmentText=wording;a.state.commitments[0].events[0].deadline=deadline;
  await a.click('.record-list .icon-button');await a.openVisit('visit-a');
  for(const selector of ['.followup-review article .deadline-evidence','.related-commitment .deadline-evidence']){
   const el=a.w.document.querySelector(selector);assert(el,selector);assert.equal(el.querySelector('.deadline-wording').textContent,wording);assert(el.textContent.includes('单独填写的结构化期限'));assert(el.textContent.includes('不表示条件已满足'));
   assert(el.querySelector('.deadline-field').textContent.includes(deadline.kind==='unknown'?'未单独记录（未知）':deadline.date??deadline.at));
  }
  await a.click('[data-related-id="a-open"]');
  for(const selector of ['.commitment-card .deadline-evidence','#commitment-history-a-open .deadline-evidence','form.followup-review .deadline-evidence'])assert.equal(a.w.document.querySelector(selector).querySelector('.deadline-wording').textContent,wording);
  await a.click('.language');assert(a.text().includes('Separately entered structured deadline'));assert(a.text().includes('have not been individually structured'));assert.equal(a.w.document.querySelector('.deadline-wording').textContent,wording);
  assert(a.state.calls.every(c=>c.method==='GET'));
 }finally{a.close()}
});
await test('deadline-only history inherits wording at that event, never latest text; conflict shows both scopes',async()=>{
 const a=await boot();try{
  await a.nav();await a.click('#commitment-action-a-open');
  let c=a.state.commitments[0];const oldText=c.events[0].commitmentText;
  c=appendCommitmentEvent(c,{expectedRevision:1,event:{type:'amended',eventId:'deadline-change',actorId:'rep-a',recordedAt:'2026-10-20T00:00:00Z',reason:'核对独立期限',deadline:{kind:'date',date:'2031-04-03'}}}).value;
  c=appendCommitmentEvent(c,{expectedRevision:2,event:{type:'amended',eventId:'text-change',actorId:'rep-a',recordedAt:'2026-10-21T00:00:00Z',reason:'新范围',commitmentText:'如果再次获准才提供新稿；尚未批准。'}}).value;
  a.state.commitments[0]=c;await a.click('.commitment-list > .panel-heading > button');
  const history=a.w.document.querySelector('#commitment-history-a-open');const evidence=history.querySelectorAll('.deadline-evidence');assert.equal(evidence.length,2);for(const el of evidence)assert.equal(el.querySelector('.deadline-wording').textContent,oldText);
  const draft=a.w.document.querySelector('form.followup-review');assert.equal(draft.querySelector('.deadline-wording').textContent,oldText);assert.equal(draft.querySelector('.alert .deadline-wording').textContent,'如果再次获准才提供新稿；尚未批准。');
  assert(a.state.calls.every(c=>c.method==='GET'));
 }finally{a.close()}
});
console.log('Deadline scope DOM tests: compiled Vue with mocked read-only API; not browser or backend acceptance.');
