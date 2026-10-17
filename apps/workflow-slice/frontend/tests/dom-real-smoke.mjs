import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('dist/index.html','utf8'),script=html.match(/src="([^"]+\.js)"/)[1];
const dom=new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>',{url:'http://127.0.0.1:5173',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;w.confirm=()=>true;w.AbortController=AbortController;
w.fetch=(url,options)=>fetch(new URL(String(url),'http://127.0.0.1:5173'),options);
w.eval(fs.readFileSync('dist'+script,'utf8'));
const tick=()=>new Promise(resolve=>setTimeout(resolve,40));
async function waitFor(check,label){for(let i=0;i<250;i++){if(check())return;await tick()}assert.fail(label+'\n'+w.document.body.textContent)}
async function click(label){await waitFor(()=>[...w.document.querySelectorAll('button')].some(b=>b.textContent.trim()===label&&!b.disabled),'ready '+label);const b=[...w.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);assert.ok(b,`button ${label}`);assert.ok(!b.disabled,`enabled ${label}`);b.click();await tick()}
async function input(id,value){const el=w.document.getElementById(id);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));await tick()}
const has=t=>w.document.body.textContent.includes(t),suffix=Date.now().toString();
try{
 await waitFor(()=>!has('正在读取已保存的工作…'),'initial load');assert.ok(!has('列表读取失败'));
 await click('＋ 记录一次交流');await input('organization','DOM合成医院 '+suffix);await input('date','2026-10-17');await input('notes','真实API合成记录：原话与未核事实。');await click('保存草稿');await waitFor(()=>has('草稿已保存，尚未正式留存'),'save draft');
 await click('English');assert.equal(w.document.getElementById('notes').value,'真实API合成记录：原话与未核事实。');await click('Reviewed: confirm official record');await waitFor(()=>has('This version is recorded and cannot be rewritten directly.'),'confirm');assert.ok(w.document.getElementById('notes').closest('fieldset').disabled);
 await input('request','DOM合成请求 '+suffix);await click('Send internal request');await waitFor(()=>has('Awaiting receipt'),'handoff sent');
 const role=w.document.getElementById('role');role.value='manager';role.dispatchEvent(new w.Event('change',{bubbles:true}));await waitFor(()=>!has('Loading saved work…'),'manager load');
 const getCard=()=>[...w.document.querySelectorAll('.handoff-card')].find(el=>el.textContent.includes('DOM合成请求 '+suffix));await waitFor(()=>getCard(),'manager request');
 getCard().querySelector('button').click();await waitFor(()=>getCard()?.textContent.includes('Received · not accepted'),'receive');getCard().querySelector('button').click();await waitFor(()=>getCard()?.textContent.includes('Responsibility accepted'),'accept');
 console.log('PASS: built Vue bundle DOM → actual Vite proxy → actual Java/PostgreSQL API. Synthetic record '+suffix+'. Create draft, language retention, confirm, handoff, explicit receipt and acceptance. No browser layout claim.');
}finally{w.close()}
