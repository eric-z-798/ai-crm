import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import pg from 'pg';
const s=JSON.parse(await readFile(process.env.CRM_TEST_STATE,'utf8'));
async function get(route){let r=await fetch('http://127.0.0.1:8787/api'+route,{headers:{Authorization:'Bearer demo-rep'}});assert.equal(r.status,200);return r.json();}
await test('PostgreSQL + Java full restart retains confirmed record and original text',async()=>assert.deepEqual(await get('/visits/'+s.record.id),s.record));
await test('full restart retains independent accepted handoff',async()=>assert.deepEqual((await get('/handoffs')).find(x=>x.id===s.handoff.id),s.handoff));
await test('full restart retains exact command receipt',async()=>assert.deepEqual(await get('/commands/'+s.originalKey),s.receipt));
await test('full restart does not duplicate records, audit, outbox or receipts',async()=>{let db=new pg.Client({host:'127.0.0.1',port:55432,user:'crm_fixture_admin',database:'crm_demo'});await db.connect();let counts=[];for(let table of ['visits','handoffs','audit_events','outbox','command_receipts'])counts.push(Number((await db.query('SELECT count(*) FROM '+table)).rows[0].count));assert.deepEqual(counts,s.counts);await db.end();});
