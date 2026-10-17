import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1080}});
const suffix=Date.now().toString();
const output=process.env.EVIDENCE_DIR||'../../evidence';fs.mkdirSync(output,{recursive:true});
const click=text=>page.getByRole('button',{name:text,exact:true}).click();
try{
 await page.goto('http://127.0.0.1:5173');await click('＋ 记录一次交流');
 await page.getByLabel('机构名称',{exact:true}).fill('合成医院 UI '+suffix);await page.getByLabel('交流发生日',{exact:true}).fill('2026-10-17');await page.getByLabel('实际交流内容',{exact:true}).fill('合成记录：已说明资料出处，范围仍待核实。');await click('保存草稿');await page.getByText('草稿已保存，尚未正式留存',{exact:true}).waitFor();
 await click('English');assert.equal(await page.getByLabel('What actually happened',{exact:true}).inputValue(),'合成记录：已说明资料出处，范围仍待核实。');await click('Reviewed: confirm official record');await page.getByText('This version is recorded and cannot be rewritten directly.',{exact:true}).waitFor();
 await page.getByLabel('What do you need your manager to help with?',{exact:true}).fill('合成内部请求 '+suffix);await click('Send internal request');await page.getByText('Awaiting receipt',{exact:true}).first().waitFor();await page.screenshot({path:output+'/frontend-real-desktop.png',fullPage:true});
 await page.getByLabel('Access scope',{exact:true}).selectOption('manager');const card=page.locator('.handoff-card').filter({hasText:'合成内部请求 '+suffix});await card.getByRole('button',{name:'Confirm receipt',exact:true}).click();await card.getByText('Received · not accepted',{exact:true}).waitFor();await card.getByRole('button',{name:'Accept responsibility',exact:true}).click();await card.getByText('Responsibility accepted',{exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/frontend-real-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 console.log('PASS: actual browser -> Vite proxy -> Java/PostgreSQL: create draft, language retention, confirm, send, receive, accept, mobile no overflow. Synthetic organization suffix '+suffix);
}finally{await browser.close()}
