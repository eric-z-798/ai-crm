// Local, read-only evidence checks. This tool cannot authorize or perform deployment.
import {readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
const sha=/^[a-f0-9]{64}$/; const commit=/^[a-f0-9]{40}$/;
const gates=['requirements','product','qa','experience','operations'];
// Declared identifiers only: normalization prevents whitespace/case aliases, not impersonation.
const identity=value=>typeof value==='string'?value.normalize('NFKC').trim().toLowerCase():'';
function validTimestamp(value){
 if(typeof value!=='string')return false;
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if(!match)return false;
 const [,y,mo,d,h,mi,se,,zone]=match;
 const year=Number(y),month=Number(mo),day=Number(d);
 const leap=year%4===0&&(year%100!==0||year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(month<1||month>12||day<1||day>days[month-1]||Number(h)>23||Number(mi)>59||Number(se)>59)return false;
 if(zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(4))>59))return false;
 return Number.isFinite(Date.parse(value));
}
export async function preflight(manifest,root){
 const blockers=[];const checks=[];const add=(code)=>{if(!blockers.includes(code))blockers.push(code)};
 const m=manifest;
 if(!m||typeof m!=='object'||Array.isArray(m))return {status:'BLOCKED',deploymentAuthorized:false,publicDeploymentSupported:false,blockers:['MANIFEST_INVALID'],checks:[]};
 if(m.schemaVersion!==1)add('SCHEMA_VERSION');
 if(typeof m.releaseId!=='string'||!m.releaseId.trim())add('RELEASE_ID');
 if(!commit.test(m.commit??''))add('COMMIT');
 if(typeof m.scope!=='string'||!m.scope.trim())add('SCOPE');
 if(m.completeReconstruction!==false)add('RECONSTRUCTION_CLAIM_UNSUPPORTED');
 if(m.dataClass!=='synthetic')add('DATA_CLASS');
 if(m.authMode!=='demo-local')add('AUTH_MODE_UNREVIEWED');
 if(m.target!=='loopback-only')add('TARGET_NOT_ALLOWED');
 // Evidence completeness never makes this synthetic baseline publicly deployable.
 let base;try{base=await realpath(root)}catch{add('EVIDENCE_ROOT');}
 const artifacts=Array.isArray(m.artifacts)?m.artifacts:[];
 if(artifacts.length===0)add('ARTIFACTS_MISSING');
 const names=new Set();const verified=new Map();
 for(const a of artifacts){
  if(!a||typeof a.path!=='string'||!a.path||path.isAbsolute(a.path)||a.path.split(/[\\/]/).includes('..')||!sha.test(a.sha256??'')){add('ARTIFACT_INVALID');continue;}
  if(names.has(a.path)){add('ARTIFACT_DUPLICATE');continue;} names.add(a.path);
  if(!base)continue;
  try{const actual=await realpath(path.resolve(base,a.path));if(actual!==base&&!actual.startsWith(base+path.sep)){add('ARTIFACT_OUTSIDE_ROOT');continue;}
   const bytes=await readFile(actual);const ok=hash(bytes)===a.sha256;checks.push({path:a.path,sha256:hash(bytes),matches:ok});if(!ok)add('ARTIFACT_HASH_MISMATCH');else verified.set(a.path,a.sha256);
  }catch{add('ARTIFACT_UNREADABLE');}
 }
 const roles={};
 for(const name of gates){const g=m.gates?.[name];
  if(!g||g.status!=='passed'){add('GATE_'+name.toUpperCase());continue;}
  if(g.releaseId!==m.releaseId||g.commit!==m.commit||g.scope!==m.scope)add('GATE_TARGET_'+name.toUpperCase());
  if(!identity(g.executor))add('GATE_EXECUTOR_'+name.toUpperCase());else roles[name]=identity(g.executor);
  if(!validTimestamp(g.checkedAt))add('GATE_TIME_'+name.toUpperCase());
  if(!g.evidence||verified.get(g.evidence)!==g.evidenceSha256||!sha.test(g.evidenceSha256??''))add('GATE_EVIDENCE_'+name.toUpperCase());
 }
 if(!identity(m.author))add('AUTHOR');
 for(const n of ['product','qa','experience'])if(roles[n]&&roles[n]===identity(m.author))add('INDEPENDENCE_'+n.toUpperCase());
 if(roles.qa&&roles.qa===roles.product)add('INDEPENDENCE_PM_QA');
 const result={schemaVersion:1,releaseId:m.releaseId??null,commit:m.commit??null,scope:m.scope??null,status:blockers.length?'BLOCKED':'EVIDENCE_STRUCTURALLY_COMPLETE',deploymentAuthorized:false,publicDeploymentSupported:false,blockers,checks,limitations:['Checks local bytes and declared metadata only; does not authenticate reviewer identity or validate the substance of evidence.','Synthetic local baseline only. No network access, service startup, database access, credential handling, or deployment is performed.','A structurally complete packet is not product acceptance, architecture release approval, or permission to deploy.']};
 return result;
}
function cliBlocked(code){
 console.log(JSON.stringify({schemaVersion:1,status:'BLOCKED',deploymentAuthorized:false,publicDeploymentSupported:false,blockers:[code],checks:[]},null,2));
 process.exitCode=2;
}
async function main(){if(process.argv.length!==4){cliBlocked('CLI_USAGE');return;}
 let m;try{m=JSON.parse(await readFile(process.argv[2],'utf8'));}catch{cliBlocked('MANIFEST_READ_OR_PARSE');return;}
 try{const r=await preflight(m,process.argv[3]);console.log(JSON.stringify(r,null,2));process.exitCode=r.status==='BLOCKED'?2:0;}catch{cliBlocked('PREFLIGHT_ERROR');}}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
