import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
await test('full process restart preservation',async t=>{
const state=JSON.parse(await readFile(process.env.CRM_TEST_STATE,'utf8'));
const db=new pg.Client({host:'127.0.0.1',port:Number(process.env.CRM_TEST_PG_PORT??55432),user:'crm_demo',database:'crm_demo'});await db.connect();t.after(()=>db.end());
async function api(route,{method='GET',body,key}={}){const r=await fetch((process.env.CRM_TEST_API_BASE??'http://127.0.0.1:8787/api')+route,{method,headers:{Authorization:'Bearer demo-rep',...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});const out=await r.json();assert.equal(r.status,200,JSON.stringify(out));return out;}
await t.test('every business, review, audit, outbox and receipt row survives actual PostgreSQL and Java restart unchanged',async()=>{for(const t of Object.keys(state.snapshot)){const rows=(await db.query(`SELECT row_to_json(x) row FROM ${t} x ORDER BY row_to_json(x)::text`)).rows.map(r=>r.row);assert.deepEqual(rows,state.snapshot[t],t);}});
await t.test('versioned reads preserve full commitment journals and all legacy/new visits after restart',async()=>{assert.deepEqual(await api('/v2/visits'),state.visits);assert.deepEqual(await api('/v2/commitments'),state.commitments);assert.deepEqual(await api(`/v2/commitments/${state.current.id}`),state.current);assert.deepEqual(await api(`/v2/visits/${state.multiple.visit.id}/review`),state.review);assert.equal((await api('/v2/visits/legacy-record/review')).followUpReview,null);});
await t.test('old v1 receipt plus v2 idempotency receipt replay survive a new JVM without duplicate writes',async()=>{
 assert.deepEqual(await api('/commands/legacy-forward-key'),state.fixture.result);assert.deepEqual(await api('/visits',{method:'POST',body:state.fixture.body,key:'legacy-forward-key'}),state.fixture.result);
 assert.deepEqual(await api('/commands/legacy-create-key'),state.fixture.result);assert.deepEqual(await api('/visits',{method:'POST',body:state.fixture.body,key:'legacy-create-key'}),state.fixture.result);
 assert.deepEqual(await api('/v2/visits/record',{method:'POST',body:state.singleBody,key:'record-single-0001'}),state.single);assert.deepEqual(await api('/v2/visits/record',{method:'POST',body:state.multiBody,key:'record-multi-0001'}),state.multiple);assert.deepEqual(await api('/commands/record-multi-0001'),state.multiple);
 assert.deepEqual(await api('/commands/event-lost-response-key'),state.lostReceipt);assert.deepEqual(await api('/commands/event-command-progress-first'),state.eventReceipt);
 assert.deepEqual(await api(`/v2/commitments/${state.current.id}/events`,{method:'POST',key:'event-command-progress-first',body:{schemaVersion:2,expectedRevision:1,event:state.replayEvent}}),state.eventReceipt);
 assert.deepEqual(await api(`/v2/commitments/${state.current.id}`),state.current);
 for(const t of Object.keys(state.snapshot)){const rows=(await db.query(`SELECT row_to_json(x) row FROM ${t} x ORDER BY row_to_json(x)::text`)).rows.map(r=>r.row);assert.deepEqual(rows,state.snapshot[t],t);}
});

});
