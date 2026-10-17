/** Additive product recovery. Original N14 data and operation receipts are retained. */
import {createDayState,loadDayState,saveDayPlan,saveDayReport,dayRecordFields,planView} from './day.mjs';
import {prepareActual} from './domain.mjs';
import {dispatch,authorize,canonical} from '../n14-domain.mjs';
export const WORKSPACE_CONTEXT={tenantId:'A',principalId:'chen',assignmentId:'rep',businessPurpose:'crm',contextGeneration:1};
export const BUSINESS_KEY='pharma-configurable-v1:tenant-demo-01:rep-chen-xiao:business';
export const OBSERVER_KEY='crm-workspace:demo-as-of';
const copy=x=>JSON.parse(JSON.stringify(x));
const localTime=x=>new Date(Date.parse(x)+8*3600000).toISOString().slice(0,19)+'+08:00';
const fail=(code,message)=>{const e=new Error(message);e.code=code;throw e;};
const relation=(hcp,hco)=>({'hcp-li-ming|hco-hechuan':'li-hechuan','hcp-li-ming|hco-anlan':'li-anlan','hcp-xu-an|hco-qinghe':'xu-qinghe','hcp-zhao-ning|hco-hechuan':'zhao-hechuan','hcp-wang-qing|hco-xincheng':'wang-xincheng'})[hcp+'|'+hco];
function read(map,key=BUSINESS_KEY,tenant='tenant-demo-01') {const loaded=loadDayState({getItem:()=>map[key]||null},tenant);if(loaded.warning)fail('INVALID_WORKSPACE','工作记录校验失败，未保存');return loaded.state;}
function extendRelations(n14){if(!n14.config.productRelationExpansion){n14.config.ledgerAllowedRelationships.push(...['zhao-hechuan','wang-xincheng'].filter(x=>!n14.config.ledgerAllowedRelationships.includes(x)));n14.config.productRelationExpansion=1;}}
export function reconcileProductWorkspace(n14,map,options={}){
 authorize(n14,WORKSPACE_CONTEXT);extendRelations(n14);
 if(!map[BUSINESS_KEY])map[BUSINESS_KEY]=JSON.stringify(createDayState());
 const s=read(map);let changed=false;
 const obj=n14.objects.find(o=>o.objectId==='PLAN-NBA-02'&&o.scope==='A|chen|rep|crm');
 if(obj&&!s.visits.some(v=>v.id===obj.objectId)){
  if(obj.payload.relationshipId!=='xu-qinghe'||obj.payload.productId!=='B')fail('INVALID_WORKSPACE','建议对象与客户关系不一致');
  const p={...obj.payload,scheduledAt:localTime(obj.payload.scheduledAt),endsAt:localTime(obj.payload.endsAt)};const created=saveDayPlan(s,'REP','NEW',{doctorId:'hcp-xu-an',productId:'product-demo-b',purpose:p.purpose,date:p.scheduledAt.slice(0,10),start:p.scheduledAt.slice(11,16),end:p.endsAt.slice(11,16),reason:'依据客户资料请求安排',confirmationEvidence:''},0,'import-'+obj.objectId).state;
  const v=created.visits.find(v=>v.id===created.activeVisitId);const generated=v.id;v.id=obj.objectId;v.sourceObjectId=obj.objectId;v.sourceObjectVersion=obj.version;v.sourceKind='RECOMMENDATION';v.planned.historyText='客户请求周三下午交流；具体时段仍待确认。';v.planned.historyRef='REQ-NBA-02';created.activeVisitId=obj.objectId;
  // Preserve a pre-existing structured record as evidence, without counting it again.
  const old=n14.interactions.filter(i=>i.objectId===obj.objectId).at(-1);
  if(old&&options.legacyEvidenceOnly){v.importedInteractionId=old.interactionId;v.legacyInteraction=copy(old);v.importedEvidencePending=true;v.legacyEvidenceReadOnly=true;}
  else if(old){
   const mappings={'xu-qinghe':['hcp-xu-an','hco-qinghe'],'li-hechuan':['hcp-li-ming','hco-hechuan'],'li-anlan':['hcp-li-ming','hco-anlan'],'zhao-hechuan':['hcp-zhao-ning','hco-hechuan'],'wang-xincheng':['hcp-wang-qing','hco-xincheng']};
   const mapped=mappings[old.facts.relationshipIds[0]];
   if(!old.facts.formallyConfirmed){v.importedInteractionId=old.interactionId;v.legacyInteraction=copy(old);}
   else if(old.facts.relationshipIds.length===1&&mapped){
    const at=localTime(old.facts.occurredAt),f={...dayRecordFields(v),meetingStatus:old.facts.outcome,facts:old.facts.text,actualDoctorId:mapped[0],actualHcoId:mapped[1],actualProductId:'',actualDate:at.slice(0,10),actualStart:'',actualEnd:'',unknowns:'原互动未记录结束时间及后续承诺；请核对后补充。',hasCommitment:false,needsSupport:false};
    const imported=saveDayReport(created,'REP',prepareActual(created,'REP',f),'import-evidence-'+old.interactionId).state;
    const iv=imported.visits.find(x=>x.id===obj.objectId);iv.importedInteractionId=old.interactionId;iv.ledgerVersion=old.version;iv.legacyInteraction=copy(old);iv.report.sourceKind='IMPORTED_CONFIRMED_INTERACTION';iv.report.recordedAt=old.recordedAt||null;iv.actual.recordedAt=old.recordedAt||null;iv.report.recordedBy=old.recordedBy==='A|chen|rep|crm'?'rep-chen-xiao':null;iv.actual.reportedBy=iv.report.recordedBy;iv.report.importedUnknownFields=['actualProduct','followUp','support','endedAt'];iv.report.version=old.version;iv.recordVersion=old.version;iv.occurrence.version=old.version;iv.actual.occurredAt=at;if(old.facts.outcome==='MET')iv.occurrence.startedAt=at;else iv.occurrence.arrivedAt=at;iv.occurrence.timeBasis='IMPORTED_REPORTED';Object.assign(created,imported);
   }else{v.importedInteractionId=old.interactionId;v.legacyInteraction=copy(old);v.importedEvidencePending=true;}
  }
  if(options.legacyEvidenceOnly){v.migrationProvenance={sourceObjectId:obj.objectId,sourceObjectVersion:obj.version,sourceScope:obj.scope,importedAt:options.migrationTime,originalSavedAt:null};v.planned.planEvents=[{id:'migration-'+obj.objectId,type:'MIGRATION_PROJECTION_CREATED',recordedAt:options.migrationTime,originalSavedAt:null,statusSource:'SERVER_MIGRATION'}];created.day.receipts=copy(s.day.receipts);created.audit=copy(s.audit);}
  created.activeVisitId=s.activeVisitId;created.day.planDrafts=copy(s.day.planDrafts);Object.assign(s,created);for(const r of s.day.receipts){if(r.planId===generated)r.planId=obj.objectId;if(r.recordContainerId===generated)r.recordContainerId=obj.objectId;}changed=true;
 }
 if(changed)map[BUSINESS_KEY]=JSON.stringify(s);
 if(!map[OBSERVER_KEY]){const observed=n14.snapshots.at(-1)?.demoAsOf||'2026-10-20T09:00:00+08:00';map[OBSERVER_KEY]=observed;}
 return map;
}
export function syncProductOutcomes(n14,map,previousMap={}){
 authorize(n14,WORKSPACE_CONTEXT);extendRelations(n14);
 const old=read(previousMap),next=read(map);
 if(!map[BUSINESS_KEY])fail('INVALID_WORKSPACE','不能删除工作记录');
 for(const v of old.visits){const n=next.visits.find(x=>x.id===v.id);if(v.legacyEvidenceReadOnly&&(!n||canonical(n)!==canonical(v)))fail('LEGACY_RECONCILIATION_REQUIRED','迁移保留的原证据只读，须另行明确核对后才能更正');if(!n||n.recordVersion<v.recordVersion||n.revision<v.revision)fail('STALE','工作记录已改变或被移除，请重新读取');if(JSON.stringify(n.planned)!==JSON.stringify(v.planned)&&n.revision<=v.revision)fail('STALE','计划内容已改变，须核对原版本');}
 for(const v of next.visits){const prev=old.visits.find(x=>x.id===v.id);if(prev&&v.report?.version===prev?.report?.version&&JSON.stringify([v.report,v.occurrence,v.actual])!==JSON.stringify([prev?.report,prev?.occurrence,prev?.actual]))fail('STALE','正式结果已变更，必须沿原版本更正');if(!v.report||v.report.version===prev?.report?.version)continue;
  if(v.report.version!==(prev?.report?.version||0)+1)fail('STALE','实际记录版本不连续，请沿原记录更正');
  if(v.importedEvidencePending)fail('LEGACY_RECONCILIATION_REQUIRED','该计划已有互动记录，请先核对原记录，避免重复计入');
  const occurred=v.occurrence.startedAt||v.occurrence.arrivedAt;
  const existing=n14.interactions.find(i=>i.interactionId===(v.importedInteractionId||'WORKSPACE-'+v.id));
  if(!occurred){if(existing)fail('ACTUAL_TIME_REQUIRED','更正已计入记录时请保留或修正实际时点');continue;}
  const met=v.occurrence.outcome==='MET';
  const person=met?v.report.actualHcpId:planView(v).doctorId,hco=met?v.report.actualHcoId:planView(v).hcoId;
  if(met&&(!person||!hco)){if(existing)fail('ACTUAL_RELATION_REQUIRED','更正已计入记录时请先核对实际客户机构，不从计划推断');continue;}
  const rel=relation(person,hco);if(!rel)fail('RELATIONSHIP_SCOPE','实际客户关系不在此工作区授权范围');
  let obj=n14.objects.find(o=>o.objectId===v.id&&o.scope==='A|chen|rep|crm');
  if(obj&&prev?.sourceObjectVersion!==undefined&&obj.version!==prev.sourceObjectVersion)fail('STALE','原关联事项已有新进展，请重新核对后再更正');
  if(existing&&prev?.ledgerVersion!==undefined&&existing.version!==prev.ledgerVersion)fail('STALE','原互动已有新版本，请先核对原记录');
  if(!obj){obj={objectId:v.id,scope:'A|chen|rep|crm',semanticKey:'workspace:'+v.id,version:1,kind:'WORKSPACE_VISIT',status:'INTERNAL_RECORD',payload:{relationshipId:rel,productId:planView(v).productIds[0],purpose:planView(v).purposeText},originalBusinessResult:'UNVERIFIED',history:[]};n14.objects.push(obj);}
  dispatch(n14,{context:WORKSPACE_CONTEXT,action:'record_interaction',objectId:obj.objectId,baseDomainVersion:obj.version,operationId:'workspace-report:'+v.id+':'+v.report.version,confirmed:true,payload:{interactionId:v.importedInteractionId||'WORKSPACE-'+v.id,expectedInteractionVersion:existing?.version||0,outcome:v.occurrence.outcome,relationshipIds:[rel],occurredAt:occurred,formallyConfirmed:true,text:v.report.facts||'未见到，未发生交流',demoAsOf:map[OBSERVER_KEY]||previousMap[OBSERVER_KEY]||'2026-10-20T09:00:00+08:00'}});
  v.sourceObjectVersion=obj.version;v.ledgerVersion=n14.interactions.find(i=>i.interactionId===(v.importedInteractionId||'WORKSPACE-'+v.id)).version;
 }
 // Validate secondary enterprise state, while never folding its private records into Chen's metrics.
 const second='pharma-configurable-v1:tenant-demo-02:rep-sun-yue:business';if(map[second])read(map,second,'tenant-demo-02');
 map[BUSINESS_KEY]=JSON.stringify(next);
 return map;
}
