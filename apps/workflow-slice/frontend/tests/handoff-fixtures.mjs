export const clone=x=>JSON.parse(JSON.stringify(x));
export function handoff(overrides={}){return {schemaVersion:1,objectType:'internal-handoff',id:'h-a',visitId:'v-a',ownerId:'rep-a',recipientId:'manager-a',request:'请核实资料 Q / original request',revision:3,status:'ACCEPTED',createdAt:'2026-11-01T01:00:00Z',updatedAt:'2026-11-01T03:00:00Z',acceptedBy:'manager-a',acceptanceEvidence:'verified',result:{latestResult:null,completion:null,correctionRequests:[],history:[]},...overrides};}
export function append(h,body,actor='manager-a'){
 const n=clone(h),e={...body,eventId:'event-'+(n.revision+1),actorId:actor,recordedAt:'2026-11-06T05:00:00Z',revision:++n.revision};n.updatedAt=e.recordedAt;n.result.history.push(e);
 if(e.type==='result-recorded'||e.type==='result-corrected')n.result.latestResult=e;if(e.type==='completed')n.result.completion=e;if(e.type==='completion-withdrawn')n.result.completion=null;if(e.type==='correction-requested')n.result.correctionRequests.push(e);return n;
}
