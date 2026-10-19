import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {projectCommitment} from '../src/domain/commitment.ts';
const host=(process.env.CRM_TEST_API_BASE??'http://127.0.0.1:8787/api').replace(/\/api$/,'');
const built=fs.readFileSync('dist/index.html','utf8').match(/src="([^"]+\.js)"/)[1];
const code=fs.readFileSync('dist'+built,'utf8');
const sleep=()=>new Promise(r=>setTimeout(r,30));
async function actual(path){const r=await fetch(host+'/api'+path,{headers:{Authorization:'Bearer demo-rep'}});assert.equal(r.status,200);return await r.json()}
await test('built Vue with actual Spring/PostgreSQL API in same runner (JSDOM, no browser visual claim)',async t=>{
 const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:'http://localhost:5173',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;t.after(()=>w.close());w.AbortController=AbortController;w.confirm=()=>true;
 const calls=[],achieved=[];let dropNext=false;
 w.fetch=async(url,options={})=>{const path=String(url);calls.push({path,method:options.method??'GET',key:options.headers?.['Idempotency-Key'],body:options.body?JSON.parse(options.body):null});const r=await fetch(host+path,options);const value=await r.json();if(dropNext&&options.method==='POST'&&r.ok){dropNext=false;throw TypeError('Author test intentionally drops successful HTTP response')}return {ok:r.ok,status:r.status,json:async()=>w.JSON.parse(JSON.stringify(value))}};
 w.eval(code);
 const text=()=>w.document.body.textContent;
 async function until(check,label){for(let i=0;i<200;i++){if(check())return;await sleep()}assert.fail(label+'; visible='+text().slice(-1000))}
 const click=async label=>{await until(()=>{const found=[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);return found&&!found.disabled},'clickable '+label);const b=[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert.ok(b,'button '+label);assert.equal(b.disabled,false,'enabled '+label);b.click();await sleep()};
 const input=async(id,value)=>{const el=w.document.getElementById(id);assert.ok(el,id);el.value=value;el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await sleep()};
 const field=async(selector,value)=>{const el=w.document.querySelector(selector);assert.ok(el,selector);el.value=value;el.dispatchEvent(new w.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await sleep()};
 const check=async el=>{assert.ok(el);el.checked=true;el.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep()};
 await until(()=>text().includes('历史机构 Original Ω'),'initial actual records load');let commitmentId,originalBody;
 await t.test('same-draft one-click atomic record with manually confirmed promise plus nonpromise; null occurrence preserved',async()=>{
  await click('＋ 记录一次交流');await input('organization','真实运行合成机构  Ω');await input('notes','仅合成业务资料。\n客户请求 A；本人承诺核实 B。  ');
  await click('＋ 添加一项核对');await input('review-kind-0','customer-request');await input('review-text-0','客户请求 A，未答应');await click('＋ 添加一项核对');await input('review-kind-1','explicit-self-commitment');await input('review-text-1','核实 B 后回复');await check(w.document.querySelectorAll('.review-row input[type=checkbox]')[0]);await check(w.document.getElementById('reviewed'));
  dropNext=true;await click('保存交流及承诺');await until(()=>!!JSON.parse(w.sessionStorage.getItem('aicrm-synthetic-slice-v2')).pending,'pending record retained');await until(()=>calls.some(c=>c.path==='/api/v2/visits/record'),'record call');await sleep();await sleep();
  const sent=calls.find(c=>c.path==='/api/v2/visits/record');originalBody=sent.body;assert.equal(sent.body.record.occurredOn,null);assert.equal(sent.body.record.organizationId,null);
  await click('查回保存结果');await until(()=>JSON.parse(w.sessionStorage.getItem('aicrm-synthetic-slice-v2')).pending===null,'receipt resolved');
  const receipt=await actual('/commands/'+sent.key);assert.equal(receipt.objectType,'record-with-commitments');assert.equal(receipt.commitments.length,1);assert.equal(receipt.followUpReview.decisions.length,2);assert.equal(receipt.visit.notes,originalBody.record.notes);assert.equal(receipt.visit.occurredOn,null);assert.equal(receipt.commitments[0].source.organizationId,null);assert.equal(receipt.commitments[0].source.organizationText,originalBody.record.organization);assert.equal(receipt.commitments[0].source.originalText,originalBody.record.notes);assert.equal(projectCommitment(receipt.commitments[0]).ok,true);assert.equal(calls.filter(c=>c.path==='/api/v2/visits/record').length,1);commitmentId=receipt.commitments[0].id;achieved.push('atomic-record-and-original-key-receipt');
 });
 async function select(){await until(()=>[...w.document.querySelectorAll('.commitment-card')].some(c=>c.textContent.includes('核实 B')&&c.querySelector('button')&&!c.querySelector('button').disabled),'matching enabled commitment action');const card=[...w.document.querySelectorAll('.commitment-card')].find(c=>c.textContent.includes('核实 B'));assert.ok(card);const b=card.querySelector('button');assert.equal(b.disabled,false);b.click();await sleep()}
 async function waitSaved(){await until(()=>!w.document.getElementById('event-type'),'event accepted')}
 await t.test('cross-day entry and actual event lost-response receipt use original Idempotency-Key',async()=>{
  const nav=[...w.document.querySelectorAll('nav button')].find(b=>b.textContent.includes('本人承诺'));assert.ok(nav);nav.click();await sleep();assert(text().includes('跨日跟进'));await select();await field('form.followup-review select:not(#event-type)','verified');await field('form.followup-review textarea','B 已核实');dropNext=true;await click('保存状态记录');await until(()=>JSON.parse(w.sessionStorage.getItem('aicrm-synthetic-slice-v2')).pending?.kind==='commitment-event','event pending');await sleep();await sleep();
  const call=calls.find(c=>c.path===`/api/v2/commitments/${commitmentId}/events`);await click('查回保存结果');await waitSaved();assert.equal((await actual('/commands/'+call.key)).id,commitmentId);assert.equal(projectCommitment(await actual('/v2/commitments/'+commitmentId)).value.verificationStatus,'verified');assert.equal(calls.filter(c=>c.path===call.path).length,1);achieved.push('event-original-key-receipt');
 });
 await t.test('actual content amendment resets verification and reply scope; old event retained',async()=>{
  await select();await input('event-type','amended');await field('form.followup-review textarea','本人新增 C 的核实范围');const areas=w.document.querySelectorAll('form.followup-review textarea');areas[1].value='核实 B 和 C 后回复';areas[1].dispatchEvent(new w.Event('input',{bubbles:true}));await sleep();await click('保存状态记录');await waitSaved();const c=await actual('/v2/commitments/'+commitmentId);const p=projectCommitment(c).value;assert.equal(p.contentRevision,2);assert.equal(p.verificationStatus,'not-started');assert.equal(p.history.some(e=>e.type==='progress-recorded'&&e.status==='verified'&&e.contentRevision===1),true);achieved.push('content-scope-reset');
 });
 await t.test('actual completion then customer acknowledgment remains completed and never invents reopen',async()=>{
  await select();await input('event-type','completed');await field('form.followup-review textarea','本人确认完成');await check(w.document.querySelector('form.followup-review input[type=checkbox]'));await click('保存状态记录');await waitSaved();await check(w.document.querySelector('.commitment-list > .check-label input'));await select();assert.equal(w.document.getElementById('event-type').value,'reply-recorded');await input('reply-scope','2');await field('form.followup-review input:not([type=checkbox])','2026-10-18T09:00:00Z');await field('form.followup-review textarea','客户后来确认收到');await click('保存状态记录');await waitSaved();const p=projectCommitment(await actual('/v2/commitments/'+commitmentId)).value;assert.equal(p.completionStatus,'completed');assert.equal(p.replyFromCustomer,'recorded');assert.equal(p.history.some(e=>e.type==='reopened'),false);achieved.push('post-completion-reply-without-reopen');
 });
 console.log('ACTUAL_UI_API_RESULT '+JSON.stringify({achieved,method:'built Vue in JSDOM + actual loopback Spring/PostgreSQL; NOT a browser/layout test'}));
});
