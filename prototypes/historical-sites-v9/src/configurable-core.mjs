/** Local synthetic workspace only. The packed fixture is inspectable; these are demonstration guards. */
const cfgRuntime={tenantId:'tenant-demo-01',demoDate:'2026-10-20',ready:false,store:null,storeToken:null,storeWarning:'',sessions:{},lastSavedId:null,filterOpen:false,followupOpen:false,followupBucket:'ALL',adminDraft:null,adminPreview:null,previewOp:null};
const cfgClone=x=>JSON.parse(JSON.stringify(x));
function cfgStorageKey(){return 'pharma-configurable-v1:'+cfgRuntime.tenantId+':'+DEMO_SCOPES[cfgRuntime.tenantId].rep+':business';}
function cfgStorage(raw){return raw?{getItem:key=>raw.getItem(key.startsWith(STORAGE_KEY)?cfgStorageKey()+key.slice(STORAGE_KEY.length):key),setItem:(key,value)=>raw.setItem(key.startsWith(STORAGE_KEY)?cfgStorageKey()+key.slice(STORAGE_KEY.length):key,value)}:null;}
function cfgLoadBusiness(s){return loadDayState(s,cfgRuntime.tenantId);}
function cfgTenant(){return PRESENTATION_SEED.tenants.find(t=>t.tenantId===cfgRuntime.tenantId);}
function cfgIdentity(role=currentRole){return {tenantId:cfgRuntime.tenantId,principalId:cfgTenant().principals[role],roleView:role};}
function cfgRoleKey(role=currentRole){return cfgRuntime.tenantId+':'+cfgTenant().principals[role]+':'+role;}
function cfgRows(){return state.visits.map(v=>{
 const p=planView(v),person=dayPerson(p.doctorId,p.hcoId),source=PRESENTATION_SEED.sampleResolvedRows.find(r=>r.tenantId===cfgRuntime.tenantId&&r.targetHcpId===p.doctorId&&r.targetHcoId===p.hcoId),w=p.currentSchedule.proposedWindow||p.currentSchedule.confirmedWindow;
 const known=value=>({status:'KNOWN',value,sourceRef:v.id,sourceVersion:v.revision});const unknown={status:'UNKNOWN',sourceRef:v.id,sourceVersion:v.revision};
 const profile=source||PRESENTATION_SEED.sampleResolvedRows.find(r=>r.tenantId===cfgRuntime.tenantId&&r.targetHcpId===p.doctorId);const values=profile?cfgClone(profile.values):{};const relation=cfgRuntime.tenantId===PRESENTATION_SEED.relationCounterexample.tenantId&&p.doctorId===PRESENTATION_SEED.relationCounterexample.targetHcpId?PRESENTATION_SEED.relationCounterexample.affiliations.find(a=>a.hcoId===p.hcoId):null;if(!source){values['affiliation.position.current']=relation?known(relation.position):unknown;}
 values['hcp.name.current']=known(person?.name||p.doctorId);values['hco.name.current']=known(p.hcoId);values['affiliation.department.current']=person?.hcoId===p.hcoId?known(person.department):unknown;
 values['plan.lifecycle']=v.originKind==='UNPLANNED'?{status:'NOT_APPLICABLE',sourceRef:v.id}:known(p.planState);
 const actualDate=v.report?.actualDate||v.occurrence?.startedAt?.slice(0,10)||v.occurrence?.arrivedAt?.slice(0,10);
 values['plan.scheduleDate']=(v.originKind==='UNPLANNED'?actualDate:w?.date)?known(v.originKind==='UNPLANNED'?actualDate:w.date):unknown;
 values['plan.scheduleInstant']=w?.startAt?known(w.startAt):unknown;
 values['plan.scheduleState']=v.originKind==='UNPLANNED'?{status:'NOT_APPLICABLE',sourceRef:v.id}:known(p.currentSchedule.status==='CANCELLED'?'UNSCHEDULED':p.currentSchedule.status==='UNSCHEDULED'&&w?.date?'PROPOSED':p.currentSchedule.status);
 values['visit.actualOutcome']=known(v.occurrence?.outcome||'NOT_RECORDED');values['visit.reportingState']=known(v.report?(state.drafts[v.id]?'SAVED_WITH_DRAFT':'SAVED'):(state.drafts[v.id]?'DRAFT':'NONE'));
 const requests=[...v.coordinationRequests,...v.supportRequests.filter(r=>r.escalation)].filter(r=>r.status!=='WITHDRAWN'&&r.status!=='CLOSED');
 return{tenantId:cfgRuntime.tenantId,planId:v.id,recordContainerId:v.id,targetHcpId:p.doctorId,targetHcoId:p.hcoId,hcoLabel:person?.hospital||p.hcoId,affiliationId:source?.affiliationId||relation?.id||null,ownerId:DEMO_SCOPES[cfgRuntime.tenantId].rep,teamId:cfgTenant().teamId,productIds:p.productIds,values,supportRequests:requests.map(req=>({...req,authorizedManagerIds:[cfgTenant().principals.MANAGER]})),hasAuthorizedExplicitRequest:requests.length>0,authorizedManagerIds:requests.length?[cfgTenant().principals.MANAGER]:[],originKind:v.originKind||'PLANNED',sourceDataNotAuthorizedResponse:true};
});}
