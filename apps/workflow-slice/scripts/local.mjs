import {spawn} from 'node:child_process';
import {mkdir,access,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const check=process.argv.includes('--check');
const runDir=path.join(root,'.runtime',check?'check-'+Date.now():'demo');
const data=path.join(runDir,'pgdata');
const bin=path.join(root,'node_modules/@embedded-postgres/linux-x64/native/bin');
const jar=path.join(root,'backend/target/workflow-slice-0.1.0.jar');
await access(jar);await mkdir(runDir,{recursive:true});
let children=[];let pgProcess,javaProcess,viteProcess;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function start(cmd,args,options={}) {const p=spawn(cmd,args,{cwd:root,stdio:'inherit',...options});children.push(p);return p;}
function finished(p) {return new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',(c,s)=>c===0?resolve():reject(new Error(`Process failed: ${c??s}`)));});}
async function stop(p) {if(!p||p.exitCode!==null)return;p.kill('SIGTERM');await Promise.race([new Promise(r=>p.once('exit',r)),delay(8000)]);if(p.exitCode===null)p.kill('SIGKILL');}
async function cleanup() {for(const p of [...children].reverse())await stop(p);}
for(const s of ['SIGINT','SIGTERM'])process.on(s,async()=>{await cleanup();process.exit(0);});
async function sqlClient(database='postgres') {const c=new pg.Client({host:'127.0.0.1',port:55432,user:'crm_fixture_admin',database});await c.connect();return c;}
async function waitPg(){for(let n=0;n<100;n++){try{const c=await sqlClient();await c.end();return;}catch{}await delay(100);}throw new Error('PostgreSQL did not become ready');}
async function startPg(){pgProcess=start(path.join(bin,'postgres'),['-D',data,'-h','127.0.0.1','-p','55432','-c',"unix_socket_directories="]);await waitPg();}
async function startJava(){javaProcess=start('java',['-jar',jar]);for(let n=0;n<200;n++){try{const r=await fetch('http://127.0.0.1:8787/api/health');if(r.ok)return;}catch{}await delay(100);}throw new Error('Backend did not become ready');}
try {
  try {await access(path.join(data,'PG_VERSION'));} catch {
    await finished(start(path.join(bin,'initdb'),['-D',data,'-U','crm_fixture_admin','-A','trust','--encoding=UTF8','--locale=C']));
  }
  await startPg();
  const c=await sqlClient();
  if(!(await c.query("SELECT 1 FROM pg_roles WHERE rolname='crm_demo'")).rowCount)await c.query('CREATE ROLE crm_demo LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION');
  if(!(await c.query("SELECT 1 FROM pg_database WHERE datname='crm_demo'")).rowCount)await c.query('CREATE DATABASE crm_demo OWNER crm_demo');
  await c.end();await startJava();
  if(check) {
    await finished(start('node',['--test','tests/integration.mjs'],{env:{...process.env,CRM_TEST_STATE:path.join(runDir,'restart.json')}}));
    if(process.env.CRM_EXTRA_CHECK)await finished(start('node',[process.env.CRM_EXTRA_CHECK],{env:{...process.env,CRM_TEST_STATE:path.join(runDir,'restart.json')}}));
    await stop(javaProcess);await stop(pgProcess);await startPg();await startJava();
    await finished(start('node',['--test','tests/restart.mjs'],{env:{...process.env,CRM_TEST_STATE:path.join(runDir,'restart.json')}}));
    console.log('CHECK COMPLETE: actual HTTP and PostgreSQL, including full process restart.');
  } else {
    viteProcess=start('npm',['run','dev','--','--host','127.0.0.1'],{cwd:path.join(root,'frontend')});
    console.log('SYNTHETIC LOCAL DEMO: http://127.0.0.1:5173 — fictional data only; no product model or external messages.');
    if(process.env.CRM_UI_CHECK) {
      let ready=false; for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:5173')).ok){ready=true;break;}}catch{}await delay(100);}
      if(!ready)throw new Error('Frontend did not become ready');
      await finished(start('node',[process.env.CRM_UI_CHECK],{cwd:path.join(root,'frontend')}));
    }
    else await new Promise((resolve,reject)=>{viteProcess.on('exit',c=>c===0?resolve():reject(new Error('Vite stopped')));});
  }
} finally {await cleanup();}
