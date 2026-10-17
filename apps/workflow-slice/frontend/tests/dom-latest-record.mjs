import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';

// Ordinary UI regression: every API call is mocked in memory. No server is used.
const html=fs.readFileSync('dist/index.html','utf8');
const script=html.match(/src="([^"]+\.js)"/)[1];
const bundle=fs.readFileSync('dist'+script,'utf8');
const storageKey='aicrm-synthetic-slice-v1';
const visit={id:'sample-visit',revision:1,status:'DRAFT',organization:'Sample clinic',occurredOn:'2026-10-17',notes:'Saved sample notes',ownerId:'rep-a',createdAt:'2026-10-17T17:15:00Z',updatedAt:'2026-10-17T17:15:00Z'};

async function checkLatestRecord(recordStillPresent){
 const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:'http://localhost:5173',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;
 const state={visits:[structuredClone(visit)],calls:[]};
 w.confirm=()=>true;
 w.AbortController=AbortController;
 w.fetch=async (url,options={})=>{
  const path=String(url).replace('/api','');
  assert.equal(options.method??'GET','GET','this component check performs no writes');
  state.calls.push(path);
  const values={'/context':{id:'rep-a',role:'rep',tenant:'demo-team'},'/visits':state.visits,'/handoffs':[]};
  assert.ok(Object.hasOwn(values,path),`only expected mock endpoints are used: ${path}`);
  return {ok:true,status:200,json:async()=>structuredClone(values[path])};
 };
 const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
 const text=()=>w.document.body.textContent;
 async function waitFor(check,label){for(let i=0;i<100;i++){if(check())return;await tick()}assert.fail(label)}
 async function click(label){const button=[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert.ok(button,`button ${label}`);assert.ok(!button.disabled,`enabled ${label}`);button.click();await tick()}
 async function input(id,value){const field=w.document.getElementById(id);assert.ok(field,`field ${id}`);field.value=value;field.dispatchEvent(new w.Event('input',{bubbles:true}));await tick()}
 try{
  w.eval(bundle);
  await waitFor(()=>w.document.querySelector('.record-item'),'initial record list');
  await click('English');
  w.document.querySelector('.record-item').click();
  await waitFor(()=>w.document.getElementById('notes'),'selected record editor');
  await input('notes','Unsubmitted sample notes');
  await input('organization','');
  await click('Save draft');
  assert.ok(text().includes('Enter an organization, interaction date and discussion notes.'));
  state.visits=recordStillPresent?[{...visit,revision:2,notes:'Latest saved sample notes'}]:[];
  await click('Review latest server version');
  assert.equal(state.calls.filter(path=>path==='/visits').length,2);
  if(recordStillPresent){
   assert.ok(w.document.querySelector('.conflict-panel')?.textContent.includes('Latest saved sample notes'));
   assert.equal(w.document.getElementById('notes').value,'Unsubmitted sample notes');
   assert.equal(w.document.getElementById('organization').value,'');
   assert.equal(w.document.querySelectorAll('.record-item.selected').length,1);
   assert.equal(w.sessionStorage.getItem(storageKey+'-held-rep'),null);
  }else{
   assert.ok(text().includes('The current identity or record access has changed, so the previous record is hidden.'));
   assert.ok(w.document.querySelector('.editor-empty'));
   assert.equal(w.document.getElementById('notes'),null);
   assert.equal(w.document.getElementById('organization'),null);
   assert.equal(w.document.querySelector('.conflict-panel'),null);
   assert.equal(w.document.querySelectorAll('.record-item').length,0);
   const held=JSON.parse(w.sessionStorage.getItem(storageKey+'-held-rep'));
   assert.equal(held.current.id,visit.id);
   assert.equal(held.form.notes,'Unsubmitted sample notes');
   const active=JSON.parse(w.sessionStorage.getItem(storageKey));
   if(active){assert.equal(active.current,null);assert.equal(active.editing,false);assert.equal(active.pending,null);assert.equal(active.request,'');assert.deepEqual(active.form,{organization:'',occurredOn:'',notes:''})}
   await click('＋ Record an interaction');
   assert.equal(w.document.getElementById('organization').value,'');
   assert.equal(w.document.getElementById('date').value,'');
   assert.equal(w.document.getElementById('notes').value,'');
  }
  console.log(`PASS: latest-record component check (${recordStillPresent?'record remains: comparison shown and local edits retained':'record missing: editor cleared, edits held separately, fresh draft empty'}).`);
 }finally{w.close()}
}

await checkLatestRecord(false);
await checkLatestRecord(true);
console.log('PASS: 2 ordinary built-bundle JSDOM checks with in-memory mock data only. No browser/layout or backend verification.');
