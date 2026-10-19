import type {CommitmentView,Deadline} from './domain/commitment';
export type EventTarget={revision:number;contentRevision:number;commitmentText:string;deadline:Deadline;completionStatus:'open'|'completed'};
export const emptyEventDraft=()=>({commitmentId:'',type:'progress-recorded',text:'',status:'in-progress',direction:'from-customer',occurredAt:'',confirmed:false,reason:'',newText:'',changeDeadline:false,deadlineKind:'unknown',deadlineValue:'',target:null as EventTarget|null,replyScope:'',scopeReviewed:false});
export type EventDraft=ReturnType<typeof emptyEventDraft>;
const object=(v:any)=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const bindTarget=(v:CommitmentView):EventTarget=>({revision:v.revision,contentRevision:v.contentRevision,commitmentText:v.commitmentText,deadline:JSON.parse(JSON.stringify(v.deadline)),completionStatus:v.completionStatus});
export function validEventDraft(value:any,legacy=false):boolean {
 if(!object(value))return false;
 const sample=emptyEventDraft(),optional=legacy?['target','replyScope','scopeReviewed']:[];
 if(Object.keys(value).some(k=>!Object.hasOwn(sample,k)))return false;
 for(const [k,v] of Object.entries(sample)){if(k==='target')continue;if(optional.includes(k)&&!Object.hasOwn(value,k))continue;if(typeof value[k]!==typeof v)return false;}
 if(!Object.hasOwn(value,'target'))return legacy;
 const t=value.target;if(t===null)return true;
 return object(t)&&Object.keys(t).sort().join(',')==='commitmentText,completionStatus,contentRevision,deadline,revision'&&Number.isSafeInteger(t.revision)&&t.revision>0&&Number.isSafeInteger(t.contentRevision)&&t.contentRevision>0&&typeof t.commitmentText==='string'&&['open','completed'].includes(t.completionStatus)&&object(t.deadline)&&['unknown','date','instant'].includes(t.deadline.kind);
}
export function restoreEventDraft(value:any):EventDraft {
 if(!validEventDraft(value,true))throw Error('INVALID_EVENT_DRAFT');
 // A legacy draft lacks an editing-time scope. Never synthesize one from the latest server object.
 return {...emptyEventDraft(),...value,target:value.target??null,replyScope:value.replyScope??'',scopeReviewed:false};
}
export function targetChanged(draft:EventDraft,current:CommitmentView|undefined){
 return !draft.target||!current||draft.target.revision!==current.revision||draft.target.contentRevision!==current.contentRevision||draft.target.commitmentText!==current.commitmentText||JSON.stringify(draft.target.deadline)!==JSON.stringify(current.deadline)||draft.target.completionStatus!==current.completionStatus;
}
export function contentScopes(view:CommitmentView|undefined){
 if(!view)return [];
 const result:{contentRevision:number;commitmentText:string}[]=[];
 for(const event of view.history){if(event.type==='created')result.push({contentRevision:event.contentRevision,commitmentText:event.commitmentText});else if(event.type==='amended'&&event.commitmentText!==undefined&&!result.some(r=>r.contentRevision===event.contentRevision))result.push({contentRevision:event.contentRevision,commitmentText:event.commitmentText});}
 return result;
}
