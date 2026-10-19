// Ordinary local test-runner configuration/ownership checks; no account or security assessment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=extra=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['scripts/atomic-local.mjs'],{cwd:root,env:{...process.env,...extra},stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);p.on('exit',code=>resolve({code,output}));});
await test('local runner rejects unsupported API port before service startup',async()=>{const r=await run({CRM_API_PORT:'8788'});assert.notEqual(r.code,0);assert.match(r.output,/must remain 8787/);assert.doesNotMatch(r.output,/database system is ready/)});
await test('local runner rejects invalid PostgreSQL port',async()=>{const r=await run({CRM_API_PORT:'8787',CRM_PG_PORT:'80'});assert.notEqual(r.code,0);assert.match(r.output,/must be an integer/);assert.doesNotMatch(r.output,/database system is ready/)});
await test('local runner rejects equal API/PG ports',async()=>{const r=await run({CRM_API_PORT:'8787',CRM_PG_PORT:'8787'});assert.notEqual(r.code,0);assert.match(r.output,/must differ/)});
await test('local runner refuses an existing runtime directory without touching it',async()=>{const existing=await mkdtemp(path.join(tmpdir(),'crm-export-existing-'));await writeFile(path.join(existing,'keep.txt'),'unchanged');const r=await run({CRM_API_PORT:'8787',CRM_PG_PORT:'55432',CRM_RUN_DIR:existing});assert.notEqual(r.code,0);assert.match(r.output,/EEXIST/);assert.equal(await readFile(path.join(existing,'keep.txt'),'utf8'),'unchanged');assert.doesNotMatch(r.output,/database system is ready/)});
await test('occupied API port causes refusal without stopping the pre-existing listener',async()=>{const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8787,'127.0.0.1',resolve)});try{const r=await run({CRM_API_PORT:'8787',CRM_PG_PORT:'55432',CRM_RUN_DIR:''});assert.notEqual(r.code,0);assert.match(r.output,/EADDRINUSE/);assert.equal(server.listening,true);assert.doesNotMatch(r.output,/database system is ready/);}finally{await new Promise(resolve=>server.close(resolve));}});
