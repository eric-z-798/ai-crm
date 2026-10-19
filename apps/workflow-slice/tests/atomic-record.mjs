import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import {readCommitment,projectCommitment,listPendingCommitments} from '../frontend/src/domain/commitment.ts';
await test('atomic record API and data preservation',async t=>{
const db=new pg.Client({host:'127.0.0.1',port:Number(process.env.CRM_TEST_PG_PORT??55432),user:'crm_demo',database:'crm_demo'});await db.connect();t.after(()=>db.end());
const base=process.env.CRM_TEST_API_BASE??'http://127.0.0.1:8787/api';
const fixture=JSON.parse(await readFile(path.join(process.env.CRM_TEST_RUN,'legacy-fixture.json'),'utf8'));
const tables=['actors','visits','handoffs','command_receipts','audit_events','outbox','visit_history','follow_up_reviews','commitments'];
async function snapshot(){const s={};for(const t of tables)s[t]=(await db.query(`SELECT row_to_json(x) row FROM ${t} x ORDER BY row_to_json(x)::text`)).rows.map(r=>r.row);return s;}
async function api(route,{method='GET',body,key,status=200}={}){const r=await fetch(base+route,{method,headers:{Authorization:'Bearer demo-rep',...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});const out=await r.json();assert.equal(r.status,status,`${method} ${route}: ${JSON.stringify(out)}`);return out;}
const declaration=(text,deadline={kind:'unknown'})=>({kind:'explicit-self-commitment',confirmation:'person-explicitly-confirmed',commitmentText:text,deadline});
const record=(decisions=[],changes={})=>({schemaVersion:2,visitId:null,expectedRevision:null,record:{organization:'  合成机构 Ω  ',organizationId:null,occurredOn:null,notes:'原话保留\r\n中文 English 🧪  '},followUpReview:{status:'reviewed',decisions},...changes});
const save=(body,key,status=200)=>api('/v2/visits/record',{method:'POST',body,key,status});
let zero,single,multiple,current,singleBody=record([declaration('  我来核实再回复  ')]),multiBody=record([declaration('查清库存',{kind:'date',date:'2026-11-01'}),{kind:'customer-request',requestText:'客户希望明天发货'},declaration('告知查证结果',{kind:'instant',at:'2026-11-02T09:00:00+08:00'}),{kind:'unconfirmed',candidateText:'可能有人去联系'},{kind:'no-self-commitment'}]);
await t.test('migration retains all legacy rows and old receipt content; v1 legacy reordered envelope replay remains readable',async()=>{
 const v1=await api('/visits'),v2=await api('/v2/visits');assert.equal(v1.length,2);assert.equal(v2.length,2);
 const old=v2.find(v=>v.id==='legacy-record');assert.equal(old.notes,fixture.body.notes);assert.equal(old.organization,fixture.body.organization);assert.equal(old.status,'RECORDED');assert.equal(old.revision,2);assert.equal(old.occurredOn,'2026-09-03');assert.equal(old.organizationId,null);
 assert.deepEqual(await api('/commands/legacy-create-key'),fixture.result);
 assert.deepEqual(await api('/visits',{method:'POST',body:fixture.body,key:'legacy-create-key'}),fixture.result);
 assert.deepEqual(await api('/commands/legacy-forward-key'),fixture.result);assert.deepEqual(await api('/visits',{method:'POST',body:fixture.body,key:'legacy-forward-key'}),fixture.result);
 assert.equal((await db.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='visits' AND column_name='occurred_on'")).rows[0].is_nullable,'YES');
});
await t.test('reviewed zero commitments records atomically without inventing a task or date',async()=>{
 zero=await save(record(),'record-zero-0001');assert.equal(zero.objectType,'record-with-commitments');assert.equal(zero.schemaVersion,2);assert.equal(zero.visit.status,'RECORDED');assert.equal(zero.visit.revision,2);assert.equal(zero.visit.occurredOn,null);assert.deepEqual(zero.commitments,[]);assert.deepEqual(zero.followUpReview,{status:'reviewed',decisions:[]});
 assert.equal((await db.query('SELECT count(*)::int n FROM visit_history WHERE visit_id=$1',[zero.visit.id])).rows[0].n,2);assert.deepEqual((await db.query('SELECT review FROM follow_up_reviews WHERE visit_id=$1',[zero.visit.id])).rows[0].review,zero.followUpReview);
 assert.equal((await api('/visits')).find(v=>v.id===zero.visit.id).occurredOn,null);
});
await t.test('single explicit owner commitment keeps original text, unknown source day and unknown deadline',async()=>{
 single=await save(singleBody,'record-single-0001');assert.equal(single.commitments.length,1);const c=single.commitments[0];assert.equal(c.schemaVersion,3);assert.equal(c.ownerId,'rep-a');assert.equal(c.kind,'self-commitment');assert.deepEqual(c.source,{visitId:single.visit.id,organizationId:null,organizationText:singleBody.record.organization,occurredOn:null,originalText:singleBody.record.notes});assert.equal(c.events[0].commitmentText,'  我来核实再回复  ');assert.deepEqual(c.events[0].deadline,{kind:'unknown'});assert.equal(c.events[0].actorId,'rep-a');assert.equal(c.events[0].contentRevision,1);assert.ok(Date.parse(c.events[0].recordedAt));assert.deepEqual(await api(`/v2/commitments/${c.id}`),c);current=c;
});
await t.test('multiple self promises persist; customer request and uncertainty remain review decisions only',async()=>{
 multiple=await save(multiBody,'record-multi-0001');assert.equal(multiple.commitments.length,2);assert.deepEqual(multiple.followUpReview,multiBody.followUpReview);assert.deepEqual((await db.query('SELECT review FROM follow_up_reviews WHERE visit_id=$1',[multiple.visit.id])).rows[0].review,multiBody.followUpReview);assert.equal((await db.query('SELECT count(*)::int n FROM commitments WHERE visit_id=$1',[multiple.visit.id])).rows[0].n,2);assert.deepEqual(multiple.commitments.map(c=>c.events[0].commitmentText),['查清库存','告知查证结果']);
});
await t.test('saved review readback preserves every original declaration; legacy unreviewed is explicit null',async()=>{
 const actual=await api(`/v2/visits/${multiple.visit.id}/review`);assert.deepEqual(actual,{schemaVersion:2,objectType:'record-review',visitId:multiple.visit.id,followUpReview:multiBody.followUpReview});
 assert.deepEqual(await api(`/v2/visits/${zero.visit.id}/review`),{schemaVersion:2,objectType:'record-review',visitId:zero.visit.id,followUpReview:{status:'reviewed',decisions:[]}});
 assert.deepEqual(await api('/v2/visits/legacy-record/review'),{schemaVersion:2,objectType:'record-review',visitId:'legacy-record',followUpReview:null});
});
await t.test('same idempotency key plus deeply reordered JSON is stable and concurrent replay creates no duplicates',async()=>{
 const before=await snapshot();const reorder=o=>Array.isArray(o)?o.map(reorder):o&&typeof o==='object'?Object.fromEntries(Object.entries(o).reverse().map(([k,v])=>[k,reorder(v)])):o;
 const results=await Promise.all([save(multiBody,'record-multi-0001'),save(reorder(multiBody),'record-multi-0001'),api('/commands/record-multi-0001')]);for(const x of results)assert.deepEqual(x,multiple);assert.deepEqual(await snapshot(),before);
});
await t.test('different payload under original key is conflict and all rows stay unchanged',async()=>{
 const before=await snapshot(),body=structuredClone(multiBody);body.record.notes+='new';assert.equal((await save(body,'record-multi-0001',409)).code,'IDEMPOTENCY_CONFLICT');assert.deepEqual(await snapshot(),before);
});
await t.test('ordinary input contract rejects unreviewed, invented organization ID, owner, invalid date and nullable schema omissions',async()=>{
 const bodies=[];let b=record();b.followUpReview.status='pending';bodies.push(b);b=record();b.record.organizationId='invented';bodies.push(b);b=record([declaration('本人承诺')]);b.followUpReview.decisions[0].ownerId='rep-a';bodies.push(b);b=record();b.record.occurredOn='2026-02-30';bodies.push(b);b=record();delete b.expectedRevision;bodies.push(b);b=record();b.record.occurredOn='0000-01-01';bodies.push(b);b=record();b.record.notes='\u00a0\ufeff';bodies.push(b);b=record([declaration('\u00a0')]);bodies.push(b);
 const before=await snapshot();for(let i=0;i<bodies.length;i++)await save(bodies[i],`invalid-input-${i}`,400);assert.deepEqual(await snapshot(),before);
});
await t.test('existing legacy draft is revised and recorded in the same transaction with original revision snapshot',async()=>{
 const body=record([declaration('下次核实')],{visitId:'legacy-draft',expectedRevision:1});const result=await save(body,'record-existing-0001');assert.equal(result.visit.id,'legacy-draft');assert.equal(result.visit.status,'RECORDED');assert.equal(result.visit.revision,3);const history=(await db.query('SELECT revision,snapshot FROM visit_history WHERE visit_id=$1 ORDER BY revision',['legacy-draft'])).rows;assert.deepEqual(history.map(v=>v.revision),[1,2,3]);assert.equal(history[0].snapshot.notes,'旧草稿文本\r\nretain me');assert.equal(history[0].snapshot.status,'DRAFT');assert.equal(history[0].snapshot.occurredOn,'2026-09-04');assert.equal(history[1].snapshot.notes,body.record.notes);assert.equal(history[1].snapshot.status,'DRAFT');assert.equal(history[2].snapshot.status,'RECORDED');
});
let pendingDraft;
await t.test('stale revision and recorded-record mutation preserve data',async()=>{
 pendingDraft=await api('/visits',{method:'POST',key:'legacy-new-draft-0001',body:{organization:'DRAFT',occurredOn:'2026-10-01',notes:'Original before record'}});
 const before=await snapshot();assert.equal((await save(record([],{visitId:pendingDraft.id,expectedRevision:2}),'record-stale-0001',409)).code,'REVISION_CONFLICT');assert.equal((await save(record([],{visitId:single.visit.id,expectedRevision:2}),'record-immutable-0001',409)).code,'RECORD_IMMUTABLE');assert.deepEqual(await snapshot(),before);
});
await t.test('database failure after first promise insert rolls back visits, history, review, audit, outbox and receipt',async()=>{
 await db.query(`CREATE FUNCTION atomic_failure_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.document->'events'->0->>'commitmentText'='FAIL_SECOND_FOR_ATOMIC_TEST' THEN RAISE EXCEPTION 'synthetic mid-transaction failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER atomic_failure_test BEFORE INSERT ON commitments FOR EACH ROW EXECUTE FUNCTION atomic_failure_test()`);
 try {for(const visit of [null,pendingDraft.id]) {const before=await snapshot();const body=record([declaration('first insert succeeds inside transaction'),declaration('FAIL_SECOND_FOR_ATOMIC_TEST')],{visitId:visit,expectedRevision:visit?1:null});assert.equal((await save(body,`failure-case-${visit??'new'}`,503)).code,'PERSISTENCE_UNAVAILABLE');assert.deepEqual(await snapshot(),before);}}
 finally {await db.query('DROP TRIGGER atomic_failure_test ON commitments; DROP FUNCTION atomic_failure_test()');}
});
let replayEvent;
async function append(event,status=200,expected=current.events.length,key=`event-command-${event.eventId}`){const out=await api(`/v2/commitments/${current.id}/events`,{method:'POST',body:{schemaVersion:2,expectedRevision:expected,event},status,key});if(status===200)current=out;return out;}
await t.test('progress, explicit actual replies and explicit completion are independent stored facts',async()=>{
 replayEvent={type:'progress-recorded',eventId:'progress-first',status:'verified',text:'核实完成，尚未回复'};await append(replayEvent);assert.equal(current.events.length,2);assert.equal(current.events.at(-1).contentRevision,1);
 await append({type:'reply-recorded',eventId:'reply-outgoing',direction:'to-customer',occurredAt:'2026-10-01T09:00:00+08:00',text:'  已回复原话\r\nEnglish  '});assert.equal(current.events.at(-1).occurredAt,'2026-10-01T09:00:00+08:00');assert.equal(current.events.at(-1).text,'  已回复原话\r\nEnglish  ');
 await append({type:'completed',eventId:'complete-first',confirmation:'person-confirmed-complete',text:'本人确认完成'});const n=current.events.length;
 await append({type:'reply-recorded',eventId:'reply-incoming-later',direction:'from-customer',occurredAt:'2026-10-02T09:00:00Z',text:'客户后续回复'});assert.equal(current.events.length,n+1);assert.equal(current.events.filter(e=>e.type==='reopened').length,0);
});
await t.test('client discards event response then recovers exact original result through supplied command key',async()=>{
 const event={type:'reply-recorded',eventId:'discarded-response-event',direction:'from-customer',occurredAt:'2026-10-02T10:00:00Z',text:'回复存盘但界面未得到结果'};
 const body={schemaVersion:2,expectedRevision:current.events.length,event};
 const response=await fetch(base+`/v2/commitments/${current.id}/events`,{method:'POST',headers:{Authorization:'Bearer demo-rep','Content-Type':'application/json','Idempotency-Key':'event-lost-response-key'},body:JSON.stringify(body)});
 assert.equal(response.status,200);await response.body.cancel();
 const recovered=await api('/commands/event-lost-response-key');assert.equal(recovered.events.at(-1).eventId,event.eventId);assert.equal(recovered.events.length,current.events.length+1);current=recovered;
 const before=await snapshot();assert.deepEqual(await api(`/v2/commitments/${current.id}/events`,{method:'POST',key:'event-lost-response-key',body}),recovered);assert.deepEqual(await snapshot(),before);
 assert.equal((await api(`/v2/commitments/${current.id}/events`,{method:'POST',key:'event-lost-response-key',body:{...body,event:{...event,text:'different body'}},status:409})).code,'IDEMPOTENCY_CONFLICT');assert.deepEqual(await snapshot(),before);
});
await t.test('same command key restores original snapshot; fresh command key with exact prior event ID does not duplicate journal',async()=>{
 const before=await snapshot(),original=current;const firstReceipt=await api('/commands/event-command-progress-first');
 assert.deepEqual(await api(`/v2/commitments/${current.id}/events`,{method:'POST',key:'event-command-progress-first',body:{schemaVersion:2,expectedRevision:1,event:replayEvent}}),firstReceipt);assert.deepEqual(await snapshot(),before);assert.deepEqual(await api(`/v2/commitments/${current.id}`),original);
 assert.deepEqual(await append(replayEvent,200,1,'event-replay-new-key'),original);
 const after=await snapshot();for(const table of tables.filter(t=>t!=='command_receipts'))assert.deepEqual(after[table],before[table],table);assert.equal(after.command_receipts.length,before.command_receipts.length+1);
 const conflictBefore=await snapshot();const conflict=await append({...replayEvent,text:'different content'},409,1,'event-conflict-new-key');assert.equal(conflict.code,'EVENT_ID_CONFLICT');assert.deepEqual(await snapshot(),conflictBefore);
});
await t.test('completed requires reopen before progress or amendment; invalid transition retains original',async()=>{
 const before=await snapshot();assert.equal((await append({type:'progress-recorded',eventId:'bad-closed-progress',status:'in-progress',text:'trying'},409)).code,'INVALID_TRANSITION');assert.equal((await append({type:'amended',eventId:'bad-closed-amend',reason:'trying',commitmentText:'new'},409)).code,'INVALID_TRANSITION');assert.deepEqual(await snapshot(),before);
 await append({type:'reopened',eventId:'reopen-first',reason:'本人重新打开'});assert.equal(current.events.at(-1).contentRevision,1);
});
await t.test('deadline-only amendment retains content scope; changed wording increments and retains full original history',async()=>{
 await append({type:'amended',eventId:'deadline-only',reason:'明确期限',deadline:{kind:'date',date:'2026-10-25'}});assert.equal(current.events.at(-1).contentRevision,1);
 await append({type:'amended',eventId:'new-content',reason:'范围已改变',commitmentText:'  另查产品批次  ',contentRevision:2});assert.equal(current.events.at(-1).contentRevision,2);assert.equal(current.events[0].commitmentText,'  我来核实再回复  ');assert.equal(current.source.originalText,singleBody.record.notes);
 await append({type:'reply-recorded',eventId:'historical-reply',contentRevision:1,direction:'from-customer',occurredAt:'2026-10-03T09:00:00Z',text:'属于旧内容的补记'});assert.equal(current.events.at(-1).contentRevision,1);
 const before=await snapshot();await append({type:'progress-recorded',eventId:'stale-scope',contentRevision:1,status:'verified',text:'old scope'},400);await append({type:'reply-recorded',eventId:'future-scope',contentRevision:3,direction:'from-customer',occurredAt:'2026-10-03T09:00:00Z',text:'future scope'},400);assert.deepEqual(await snapshot(),before);
});
await t.test('revision conflict, actual-reply time omission/future date, metadata injection and malformed event retain data',async()=>{
 const before=await snapshot();await append({type:'progress-recorded',eventId:'conflict-rev',status:'in-progress',text:'try'},409,1);await append({type:'reply-recorded',eventId:'missing-actual-time',direction:'to-customer',text:'缺实际时间'},400);await append({type:'reply-recorded',eventId:'future-time',direction:'to-customer',occurredAt:'2099-01-01T00:00:00Z',text:'未来不是已发生'},400);await append({type:'progress-recorded',eventId:'metadata-client',status:'verified',text:'x',actorId:'rep-a'},400);await append({type:'reopened',eventId:'already-open',reason:'no'},409);assert.deepEqual(await snapshot(),before);
});
await t.test('outbox failure on a commitment event rolls back document, audit and command receipt together',async()=>{
 await db.query(`CREATE FUNCTION atomic_outbox_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='SELF_COMMITMENT_PROGRESS_RECORDED' THEN RAISE EXCEPTION 'synthetic outbox failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER atomic_outbox_test BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION atomic_outbox_test()`);
 try {const before=await snapshot();await append({type:'progress-recorded',eventId:'outbox-failed',status:'in-progress',text:'all or nothing'},503);assert.deepEqual(await snapshot(),before);assert.deepEqual(await api(`/v2/commitments/${current.id}`),current);}
 finally {await db.query('DROP TRIGGER atomic_outbox_test ON outbox; DROP FUNCTION atomic_outbox_test()');}
});
await t.test('v1 create/update/confirm/handoff response and command lookup remain usable after v2 migration',async()=>{
 let v=await api('/visits',{method:'POST',key:'v1-create-compat',body:{organization:'v1机构',occurredOn:'2026-10-10',notes:'v1原文'}});assert.equal(v.status,'DRAFT');assert.ok(!('objectType'in v));v=await api(`/visits/${v.id}`,{method:'PUT',key:'v1-update-compat',body:{organization:'v1机构',occurredOn:'2026-10-10',notes:'v1更新原文',expectedRevision:v.revision}});v=await api(`/visits/${v.id}/confirm`,{method:'POST',key:'v1-confirm-compat',body:{expectedRevision:v.revision}});const h=await api(`/visits/${v.id}/handoffs`,{method:'POST',key:'v1-handoff-compat',body:{expectedRevision:v.revision,request:'内部合成请求'}});assert.equal(h.visitId,v.id);assert.deepEqual(await api('/commands/v1-handoff-compat'),h);assert.deepEqual(await api('/commands/v1-confirm-compat'),v);
});
await t.test('every stored event type replays unchanged after a later content scope without duplicate journal entries',async()=>{
 const original=current;
 for(const type of ['amended','progress-recorded','reply-recorded','completed','reopened']) {
   const stored=current.events.find(e=>e.type===type);const event=structuredClone(stored);delete event.actorId;delete event.recordedAt;
   assert.deepEqual(await append(event,200,1,`replay-stored-${type}`),original);
   if(type==='amended'||type==='reopened'){delete event.contentRevision;assert.deepEqual(await append(event,200,1,`replay-unscoped-${type}`),original);}
 }
 assert.deepEqual(await api(`/v2/commitments/${current.id}`),original);
});
await t.test('actual API documents are accepted by v3 TypeScript adapter and changed-scope projections do not reuse old verification or replies',async()=>{
 const all=await api('/v2/commitments');for(const c of all)assert.equal(readCommitment(c).ok,true);
 const view=projectCommitment(current);assert.equal(view.ok,true);assert.equal(view.value.contentRevision,2);assert.equal(view.value.verificationStatus,'not-started');assert.equal(view.value.replyToCustomer,'not-recorded');assert.equal(view.value.replyFromCustomer,'not-recorded');assert.equal(view.value.completionStatus,'open');assert.deepEqual(view.value.history,current.events);
 const pending=listPendingCommitments(all,{ownerId:'rep-a',asOfDate:'2026-10-19',asOfInstant:'2026-10-19T10:00:00Z'});assert.equal(pending.ok,true);assert.equal(pending.value.length,all.length);assert.ok(pending.value.some(c=>c.dueState==='unknown'));assert.ok(pending.value.some(c=>c.dueState==='upcoming'));
});
await t.test('prepare exact database and API snapshots for full process restart verification',async()=>{
 const all=await api('/v2/commitments');assert.ok(all.some(c=>c.id===current.id));assert.deepEqual(all.find(c=>c.id===current.id),current);const unknown=all.find(c=>c.id===single.commitments[0].id);assert.equal(unknown.source.occurredOn,null);
 const state={snapshot:await snapshot(),visits:await api('/v2/visits'),commitments:all,singleBody,multiBody,single,multiple,current,replayEvent,eventReceipt:await api('/commands/event-command-progress-first'),lostReceipt:await api('/commands/event-lost-response-key'),review:await api(`/v2/visits/${multiple.visit.id}/review`),fixture};await writeFile(process.env.CRM_TEST_STATE,JSON.stringify(state,null,2));
});

});
