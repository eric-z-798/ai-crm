import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('src/App.vue',root),'utf8');
const translations=fs.readFileSync(new URL('src/i18n.ts',root),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const script=compile(source.match(/<script setup lang="ts">\n([\s\S]*?)\n<\/script>/)[1].split('\n').filter(line=>!line.startsWith('import ')).join('\n'));
const i18n=compile(translations.replace('export const copy=','const copy='));
const vue=fs.readFileSync(require.resolve('vue/dist/vue.global.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const key='aicrm-synthetic-slice-v1';
const id='synthetic-recovery-rep';
const visit={id:'synthetic-recovery-visit',revision:3,status:'DRAFT',organization:'虚构机构',occurredOn:'2026-10-17',notes:'已有草稿',ownerId:id,createdAt:'2026-10-17T12:00:00Z',updatedAt:'2026-10-17T12:00:00Z'};
const full=()=>({role:'rep',identity:id,lang:'zh',current:clone(visit),editing:true,form:{organization:'合成机构',occurredOn:'2026-10-18',notes:'未保存原文\nUnsubmitted  text'},request:'',pending:null,tab:'visits'});
function create(raw,options={}){
 let mounted;
 const stored=options.stored??new Map(raw===undefined?[]:[[key,raw]]),operations=[],calls=[],confirmations=[],logs=[],listeners={};
 const fail={value:options.failBackup??false};
 const s={console:{log(){},info(){},warn:(...args)=>logs.push(args.join(' ')),error:(...args)=>logs.push(args.join(' '))},sessionStorage:{getItem:k=>stored.get(k)??null,setItem(k,v){if(fail.value&&k.includes('-invalid-')){operations.push({op:'failedBackup',key:k});throw Error('synthetic storage capacity failure')}stored.set(k,String(v));operations.push({op:'set',key:k,value:String(v)})},removeItem(k){stored.delete(k);operations.push({op:'remove',key:k})}},crypto:{randomUUID(){throw Error('No mutation expected')}},window:{confirm(text){confirmations.push(text);return false},addEventListener(name,fn){listeners[name]=fn}},ApiError:class extends Error{},api:async(role,path,method)=>{calls.push({role,path,method:method??'GET'});assert.equal(method,undefined);if(path==='/context')return {id,role:'rep',tenant:'synthetic-only'};if(path==='/visits')return [clone(visit)];if(path==='/handoffs')return [];throw Error(path)},captureMount:fn=>mounted=fn};
 vm.createContext(s);vm.runInContext(vue,s);s.document={documentElement:{lang:'zh-CN'},title:'',activeElement:null,getElementById:()=>null};
 vm.runInContext(`const {ref,reactive,computed,watch,nextTick}=Vue;const onMounted=captureMount;const scope=Vue.effectScope();scope.run(()=>{${i18n}\n${script}\nglobalThis.subject={form,current,editing,lang,request,pending,tab,localOk,dirty,notice,error,t,recoveryIssue,fresh,open,save,formatTime};});globalThis.stop=()=>scope.stop();`,s);
 return {s,subject:s.subject,stored,operations,calls,confirmations,logs,fail,listeners,mount:async()=>{await mounted();await s.Vue.nextTick()},tick:()=>s.Vue.nextTick(),stop:()=>s.stop()};
}
const results=[];
const malformed=[
 ['bad-json','{"form":{"notes":"truncated'],
 ['null-root','null'],
 ['missing-notes',(()=>{const v=full();delete v.form.notes;return JSON.stringify(v)})()],
 ['missing-editing',(()=>{const v=full();delete v.editing;return JSON.stringify(v)})()],
 ['synthetic-obsolete-field',(()=>{const v=full();v.schemaVersion=0;v.form.noteText=v.form.notes;delete v.form.notes;return JSON.stringify(v)})()],
 ['missing-created-time',(()=>{const v=full();delete v.current.createdAt;return JSON.stringify(v)})()],
 ['null-notes',(()=>{const v=full();v.form.notes=null;return JSON.stringify(v)})()]
];
for(const [name,raw] of malformed){
 const app=create(raw);await app.mount();
 assert.equal(app.subject.editing.value,false);assert.equal(app.subject.current.value,null);assert.equal(app.subject.notice.value,'');assert.equal(app.subject.recoveryIssue.value,'preserved');assert.equal(app.stored.get(key),raw);
 const backup=[...app.stored.entries()].filter(([k])=>k.includes('-invalid-'));assert.equal(backup.length,1);assert.equal(backup[0][1],raw);
 app.subject.fresh();app.subject.form.notes='新草稿 / New draft';await app.tick();
 assert.equal(app.stored.get(backup[0][0]),raw);assert.equal(JSON.parse(app.stored.get(key)).form.notes,'新草稿 / New draft');
 assert.equal(app.logs.length,0);results.push({case:name,result:'PASS',assertion:'Reject before applying; no restored-success notice; exact original raw retained independently after new-draft autosave.'});app.stop();
}
{
 const raw=malformed[3][1],app=create(raw,{failBackup:true});await app.mount();assert.equal(app.subject.recoveryIssue.value,'blocked');assert.equal(app.subject.localOk.value,false);
 app.subject.fresh();app.subject.form.notes='新输入仍在内存';await app.tick();assert.equal(app.stored.get(key),raw);assert.equal(app.subject.form.notes,'新输入仍在内存');
 app.fail.value=false;app.subject.form.notes+='，后续编辑';await app.tick();
 assert.equal(app.subject.recoveryIssue.value,'preserved');assert.equal(app.subject.localOk.value,true);
 assert([...app.stored.entries()].some(([k,v])=>k.includes('-invalid-')&&v===raw));assert.equal(JSON.parse(app.stored.get(key)).form.notes,'新输入仍在内存，后续编辑');
 const sets=app.operations.filter(o=>o.op==='set');assert(sets.findIndex(o=>o.key.includes('-invalid-'))<sets.findIndex(o=>o.key===key));
 results.push({case:'backup-write-fails-then-next-edit-retries',result:'PASS',assertion:'Sole invalid raw not overwritten while backup fails; original backup is successfully stored before active snapshot on next edit.'});app.stop();
}
for(const version of [undefined,1]){
 const snapshot=full();if(version!==undefined)snapshot.schemaVersion=version;
 const app=create(JSON.stringify(snapshot));await app.mount();assert.equal(app.subject.recoveryIssue.value,null);assert.equal(app.subject.editing.value,true);assert.equal(app.subject.dirty.value,true);assert.equal(app.subject.notice.value,app.subject.t.value.retained);assert.deepEqual(clone(app.subject.form),snapshot.form);
 app.subject.fresh();await app.tick();assert.equal(app.confirmations.length,1);assert.deepEqual(clone(app.subject.form),snapshot.form);
 const stored=app.stored;app.stop();const second=create(undefined,{stored});await second.mount();assert.deepEqual(clone(second.subject.form),snapshot.form);assert.equal(JSON.parse(stored.get(key)).schemaVersion,1);second.stop();
 results.push({case:version===undefined?'complete-existing-unversioned':'complete-schema-v1',result:'PASS',assertion:'Original draft restores, is dirty, asks before fresh, and survives a new VM with schemaVersion=1.'});
}
{
 const app=create();await app.mount();app.subject.fresh();app.subject.form.notes=null;await app.tick();await app.subject.save();assert.equal(app.subject.error.value,app.subject.t.value.invalidDraft);assert.equal(app.calls.length,3);assert.equal(app.subject.formatTime(undefined),app.subject.t.value.timeUnavailable);assert.equal(app.subject.formatTime('bad date'),app.subject.t.value.timeUnavailable);assert(app.subject.formatTime(visit.createdAt).length>0);app.subject.lang.value='en';await app.tick();assert.equal(app.subject.formatTime(null),'Time unavailable');results.push({case:'null-draft-and-date-guards',result:'PASS',assertion:'Invalid memory field is rejected without throwing or mutation; invalid date uses bilingual fallback.'});app.stop();
}
{
 // Ordinary new-draft + handoff + language/tab autosave remains automatic.
 const app=create();await app.mount();app.subject.fresh();const form={organization:'Synthetic organization',occurredOn:'2026-10-18',notes:'中英文原文\nPreserve  spacing'};Object.assign(app.subject.form,form);app.subject.lang.value='en';await app.tick();
 const second=create(undefined,{stored:app.stored});await second.mount();assert.deepEqual(clone(second.subject.form),form);assert.equal(second.subject.lang.value,'en');second.stop();app.stop();
 const recorded={...full(),current:{...visit,status:'RECORDED'},form:{organization:visit.organization,occurredOn:visit.occurredOn,notes:visit.notes},lang:'en',tab:'handoffs',request:'Unsent  request\n未发交接'};
 const handoff=create(JSON.stringify(recorded));await handoff.mount();assert.equal(handoff.subject.request.value,recorded.request);assert.equal(handoff.subject.tab.value,'handoffs');assert.equal(handoff.subject.lang.value,'en');handoff.stop();
 results.push({case:'ordinary-new-draft-language-handoff-watch',result:'PASS',assertion:'Actual watch persists new draft; new VM retains original text/language; complete unsent handoff/tab restores.'});
}
assert(source.indexOf('v-if="recoveryIssue"')<source.indexOf('<div v-if="!editing"'),'recovery alert outside editor');
const report={sourceSha256:hash(source),i18nSha256:hash(translations),vueVersion:JSON.parse(fs.readFileSync(require.resolve('vue/package.json'),'utf8')).version,method:'Actual project-locked Vue in Node VM, captured mounted callback, synthetic Map storage and GET API. Full DOM/browser rendering not covered.',results,total:results.length,passed:results.length};
console.log(JSON.stringify(report,null,2));
