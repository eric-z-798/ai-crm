import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1080}});
const state={visits:[],handoffs:[],commands:new Map(),saveDelay:0,drop:false,conflict:false,count:0};
const now='2026-10-17T17:15:00Z';
await page.route('**/api/**',async route=>{
 const r=route.request(),path=new URL(r.url()).pathname.replace('/api',''),method=r.method(),body=r.postDataJSON(),role=r.headers().authorization?.endsWith('manager')?'manager':'rep',key=r.headers()['idempotency-key'];
 const fulfill=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
 if(method==='GET'){
  if(path==='/context')return fulfill({id:role==='rep'?'rep-a':'manager-a',role,tenant:'demo-team',mode:'synthetic',aiMode:'stub'});
  if(path==='/visits')return fulfill(state.visits.filter(v=>role==='rep'||v.status==='RECORDED'));
  if(path==='/handoffs')return fulfill(state.handoffs);
  if(path.startsWith('/commands/'))return state.commands.has(path.split('/').at(-1))?fulfill(state.commands.get(path.split('/').at(-1))):fulfill({code:'NOT_FOUND'},404);
 }
 assert.ok(key,'all writes require idempotency key');
 if(state.commands.has(key))return fulfill(state.commands.get(key));
 if(state.conflict){state.conflict=false;state.visits[0].revision++;state.visits[0].notes='Server changed text';return fulfill({code:'REVISION_CONFLICT'},409)}
 let result;
 if(path==='/visits') {result={...body,id:'visit-'+(++state.count),revision:1,status:'DRAFT',ownerId:'rep-a',createdAt:now,updatedAt:now};state.visits.push(result)}
 else if(method==='PUT'){let v=state.visits.find(v=>path.endsWith(v.id));assert.equal(body.expectedRevision,v.revision);Object.assign(v,body,{revision:v.revision+1});result={...v}}
 else if(path.endsWith('/confirm')){let v=state.visits.find(v=>path.includes(v.id));assert.equal(body.expectedRevision,v.revision);v.status='RECORDED';v.revision++;result={...v}}
 else if(path.endsWith('/handoffs')){let v=state.visits.find(v=>path.includes(v.id));assert.equal(v.status,'RECORDED');result={id:'handoff-1',visitId:v.id,request:body.request,status:'SENT',revision:1};state.handoffs.push(result)}
 else{let h=state.handoffs.find(h=>path.includes(h.id));assert.equal(body.expectedRevision,h.revision);h.status=path.endsWith('/receive')?'RECEIVED':'ACCEPTED';h.revision++;result={...h}}
 state.commands.set(key,structuredClone(result));
 if(state.saveDelay){await new Promise(resolve=>setTimeout(resolve,state.saveDelay));state.saveDelay=0}
 if(state.drop){state.drop=false;return route.abort('failed')}
 return fulfill(result);
});
const click=(text)=>page.getByRole('button',{name:text,exact:true}).click();
const waitText=async text=>page.getByText(text,{exact:true}).first().waitFor();
const output=process.env.EVIDENCE_DIR||'../../evidence';fs.mkdirSync(output,{recursive:true});
try{
 await page.goto('http://127.0.0.1:5173');await click('＋ 记录一次交流');
 await page.getByLabel('机构名称',{exact:true}).fill('示例城南医院');await page.getByLabel('交流发生日',{exact:true}).fill('2026-10-17');await page.getByLabel('实际交流内容',{exact:true}).fill('原话：范围尚未核实。Mixed English 🧪');
 await click('English');assert.equal(await page.getByLabel('What actually happened',{exact:true}).inputValue(),'原话：范围尚未核实。Mixed English 🧪');
 await click('Save draft');await waitText('Draft saved; not officially recorded');assert.equal(state.visits.length,1);
 // An old receipt must not mark newer text saved.
 await page.getByLabel('What actually happened',{exact:true}).fill('Submitted version');state.saveDelay=650;await click('Save draft');await page.getByLabel('What actually happened',{exact:true}).fill('Newer input while saving');await waitText('Current changes are not saved');await page.waitForTimeout(850);assert.equal(await page.getByLabel('What actually happened',{exact:true}).inputValue(),'Newer input while saving');assert.equal(await page.getByRole('button',{name:'Reviewed: confirm official record',exact:true}).isDisabled(),true);
 // Stale revisions retain input and support explicit rebase.
 state.conflict=true;await click('Save draft');await waitText('The server version changed. Your text is preserved. Review the latest version before merging.');assert.equal(await page.getByLabel('What actually happened',{exact:true}).inputValue(),'Newer input while saving');await click('Review latest server version');await click('Keep my text and use latest revision');await click('Save draft');await waitText('Draft saved; not officially recorded');
 // Lost acknowledgment: check original key, no duplicate creates or writes.
 await page.getByLabel('What actually happened',{exact:true}).fill('最后核对：尚未回应问题。');state.drop=true;await click('Save draft');await waitText('A request needs confirmation');await click('Check saved result');await waitText('Draft saved; not officially recorded');assert.equal(state.visits.length,1);
 await click('Reviewed: confirm official record');await waitText('This version is recorded and cannot be rewritten directly.');assert.equal(await page.getByLabel('What actually happened',{exact:true}).isDisabled(),true);assert.equal(state.handoffs.length,0);
 await page.getByLabel('What do you need your manager to help with?',{exact:true}).fill('请协助核对范围，暂未接责。');await click('Send internal request');await waitText('Awaiting receipt');assert.equal(state.handoffs.length,1);
 await page.screenshot({path:output+'/frontend-contract-desktop.png',fullPage:true});
 await page.getByLabel('Access scope',{exact:true}).selectOption('manager');await click('Confirm receipt');await waitText('Received · not accepted');assert.equal(state.handoffs[0].status,'RECEIVED');await click('Accept responsibility');await waitText('Responsibility accepted');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/frontend-contract-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no mobile horizontal overflow');
 // Recovery is scoped to browser tab and survives page reload.
 await page.getByLabel('Access scope',{exact:true}).selectOption('rep');await click('＋ Record an interaction');await page.getByLabel('Organization',{exact:true}).fill('恢复草稿');await page.getByLabel('What actually happened',{exact:true}).fill('未保存的中英文 mixed');page.once('dialog',dialog=>dialog.accept());await page.reload();assert.equal(await page.getByLabel('What actually happened',{exact:true}).inputValue(),'未保存的中英文 mixed');
 console.log('PASS: UI API-contract tests (mocked): bilingual retention, delayed save dirty truth, stale conflict/rebase, lost acknowledgment lookup, explicit immutable confirm, no forced handoff, separate receive/accept, mobile overflow, refresh recovery.');
}finally{await browser.close()}
