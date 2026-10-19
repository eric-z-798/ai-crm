// Fresh isolated synthetic database only. Does not invoke the historic aggregate/security suite.
import {spawn} from 'node:child_process';
import {mkdir,access,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
function port(name,fallback){const value=Number(process.env[name]??fallback);if(!Number.isSafeInteger(value)||value<1024||value>65535)throw new Error(`${name} must be an integer from 1024 to 65535`);return value;}
const apiPort=8787,pgPort=port('CRM_PG_PORT',55432);
if(process.env.CRM_API_PORT!==undefined&&process.env.CRM_API_PORT!=='8787')throw new Error('CRM_API_PORT must remain 8787 to match the reviewed local Host boundary');
if(apiPort===pgPort)throw new Error('API and PostgreSQL ports must differ');
const runtime=path.join(root,'.runtime');
const runDir=process.env.CRM_RUN_DIR?path.resolve(process.env.CRM_RUN_DIR):path.join(runtime,'atomic-'+Date.now());
const data=path.join(runDir,'pgdata');
if(process.platform!=='linux'||process.arch!=='x64')throw new Error('This local synthetic runner currently supports Linux x64 only');
const native=path.resolve(path.dirname(require.resolve('@embedded-postgres/linux-x64')),'../native');
const jar=path.join(root,'backend/target/workflow-slice-0.1.0.jar');
const serve=process.argv.includes('--serve');
const uiCheck=process.argv.find(arg=>arg.startsWith('--ui-check='))?.slice('--ui-check='.length);
if(serve && uiCheck)throw new Error('Choose serve or ui-check');
const env={...process.env,LD_LIBRARY_PATH:path.join(native,'lib'),SERVER_PORT:String(apiPort),SPRING_DATASOURCE_URL:`jdbc:postgresql://127.0.0.1:${pgPort}/crm_demo`,CRM_TEST_API_BASE:`http://127.0.0.1:${apiPort}/api`,CRM_TEST_PG_PORT:String(pgPort),CRM_TEST_STATE:path.join(runDir,'restart.json'),CRM_TEST_RUN:runDir};
await access(jar);await mkdir(runtime,{recursive:true});await mkdir(runDir,{recursive:false});
let children=[],pgProcess,javaProcess;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function start(cmd,args,options={}) {const p=spawn(cmd,args,{cwd:root,stdio:'inherit',env,...options});children.push(p);return p;}
function finished(p) {return new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',(c,s)=>c===0?resolve():reject(new Error(`Process failed: ${c??s}`)));});}
async function stop(p) {if(!p||p.exitCode!==null)return;p.kill('SIGTERM');await Promise.race([new Promise(r=>p.once('exit',r)),delay(8000)]);if(p.exitCode===null){p.kill('SIGKILL');await new Promise(r=>p.once('exit',r));}}
async function cleanup() {for(const p of [...children].reverse())await stop(p);}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await cleanup();process.exit(0);});
async function client(database='postgres') {const c=new pg.Client({host:'127.0.0.1',port:pgPort,user:'crm_fixture_admin',database});await c.connect();return c;}
async function startPg(){pgProcess=start(path.join(native,'bin/postgres'),['-D',data,'-h','127.0.0.1','-p',String(pgPort),'-c','unix_socket_directories=']);for(let i=0;i<150;i++){if(pgProcess.exitCode!==null)throw new Error('Postgres exited');try{const c=await client();const actual=(await c.query('SHOW data_directory')).rows[0].data_directory;await c.end();if(actual!==data)throw new Error('Refuse existing foreign database');return;}catch(e){if(String(e).includes('foreign'))throw e;}await delay(100);}throw new Error('Postgres timeout');}
async function startJava(){javaProcess=start('java',['-jar',jar]);for(let i=0;i<300;i++){if(javaProcess.exitCode!==null)throw new Error('Java exited');try{const r=await fetch(`http://127.0.0.1:${apiPort}/api/health`);if(r.ok)return;}catch{}await delay(100);}throw new Error('Backend timeout');}
try {
  // Refuse an occupied database or backend port rather than attach to anything pre-existing.
  const net=await import('node:net');for(const port of [pgPort,apiPort])await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(port,'127.0.0.1',()=>s.close(resolve));});
  await finished(start(path.join(native,'bin/initdb'),['-D',data,'-U','crm_fixture_admin','-A','trust','--encoding=UTF8','--locale=C']));
  await startPg();const admin=await client();await admin.query('CREATE ROLE crm_demo LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION');await admin.query('CREATE DATABASE crm_demo OWNER crm_demo');await admin.end();
  const seed=new pg.Client({host:'127.0.0.1',port:pgPort,user:'crm_demo',database:'crm_demo'});await seed.connect();
  const baseline=await readFile(path.join(root,'tests/fixtures/schema-93cf1d3.sql'),'utf8');await seed.query(baseline);
  const oldBody={organization:'历史机构 Original Ω',occurredOn:'2026-09-03',notes:'旧记录原话\r\nEnglish 与中文 🧪'};
  await seed.query("INSERT INTO visits(id,tenant,team,owner_id,revision,status,organization,occurred_on,notes) VALUES('legacy-record','tenant-a','team-a','rep-a',2,'RECORDED',$1,$2,$3)",[oldBody.organization,oldBody.occurredOn,oldBody.notes]);
  await seed.query("INSERT INTO visits(id,tenant,team,owner_id,revision,status,organization,occurred_on,notes) VALUES('legacy-draft','tenant-a','team-a','rep-a',1,'DRAFT','旧草稿','2026-09-04','旧草稿文本\r\nretain me')");
  const oldResult={id:'legacy-record',revision:1,status:'DRAFT',organization:oldBody.organization,notes:oldBody.notes,ownerId:'rep-a',occurredOn:oldBody.occurredOn,createdAt:'2026-09-03T09:00:00Z',updatedAt:'2026-09-03T09:00:00Z'};
  const sorted=Object.fromEntries(Object.entries(oldBody).sort(([a],[b])=>a.localeCompare(b)));
  const oldHash=createHash('sha256').update(JSON.stringify({body:sorted,route:'create'})).digest('hex');
  await seed.query("INSERT INTO command_receipts(tenant,actor_id,command_key,request_hash,response,command_type) VALUES('tenant-a','rep-a','legacy-create-key',$1,$2::jsonb,'create')",[oldHash,JSON.stringify(oldResult)]);
  const forwardHash=createHash('sha256').update(JSON.stringify({route:'create',body:sorted})).digest('hex');
  await seed.query("INSERT INTO command_receipts(tenant,actor_id,command_key,request_hash,response,command_type) VALUES('tenant-a','rep-a','legacy-forward-key',$1,$2::jsonb,'create')",[forwardHash,JSON.stringify(oldResult)]);
  await writeFile(path.join(runDir,'legacy-fixture.json'),JSON.stringify({body:oldBody,result:oldResult}));await seed.end();
  await startJava();console.log(`ATOMIC LOCAL READY: http://127.0.0.1:${apiPort}; database ${data}; synthetic fixtures only`);
  if(uiCheck) {
    const frontend=path.join(root,'frontend');
    await finished(start('node',[path.resolve(frontend,uiCheck)],{cwd:frontend}));
    console.log('LOCAL UI CHECK SCRIPT FINISHED: evidence and assertion scope belong to its author.');
  } else if(serve)await new Promise((resolve,reject)=>{javaProcess.on('exit',c=>c===0?resolve():reject(new Error('Backend stopped')));});
  else {
    await finished(start('node',['--test','tests/atomic-record.mjs']));
    await stop(javaProcess);await stop(pgProcess);await startPg();await startJava();
    await finished(start('node',['--test','tests/atomic-restart.mjs']));
    console.log('ATOMIC CHECK COMPLETE: actual HTTP + PostgreSQL, full Java and PostgreSQL restart; author test only.');
  }
} finally {await cleanup();}
