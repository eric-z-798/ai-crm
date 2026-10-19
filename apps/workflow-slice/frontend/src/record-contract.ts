import {captureFollowUp, type Deadline, type Declaration} from './domain/commitment.ts';

export type ReviewRow={id:string;kind:'explicit-self-commitment'|'customer-request'|'unconfirmed';text:string;confirmed:boolean;deadlineKind:'unknown'|'date'|'instant';deadlineValue:string};
export type RecordForm={organization:string;occurredOn:string;notes:string};
export type Review={checked:boolean;rows:ReviewRow[]};
export type ApiDeclaration=Exclude<Declaration,{kind:'explicit-self-commitment'}>|Omit<Extract<Declaration,{kind:'explicit-self-commitment'}>,'ownerId'>;
export const emptyReview=():Review=>({checked:false,rows:[]});
export function validReview(value:any):value is Review {
 return !!value&&typeof value==='object'&&Object.keys(value).sort().join(',')==='checked,rows'&&typeof value.checked==='boolean'&&Array.isArray(value.rows)&&value.rows.every((r:any)=>r&&typeof r==='object'&&Object.keys(r).sort().join(',')==='confirmed,deadlineKind,deadlineValue,id,kind,text'&&typeof r.id==='string'&&['explicit-self-commitment','customer-request','unconfirmed'].includes(r.kind)&&typeof r.text==='string'&&typeof r.confirmed==='boolean'&&['unknown','date','instant'].includes(r.deadlineKind)&&typeof r.deadlineValue==='string');
}
export function recordCommand(form:RecordForm,review:Review,current:{id:string;revision:number}|null,actorId:string){
 if(!validReview(review)||!review.checked)throw Error('REVIEW_REQUIRED');
 if(!form.organization.trim()||!form.notes.trim())throw Error('RECORD_REQUIRED');
 if(form.organization.length>200||form.notes.length>4000)throw Error('RECORD_LENGTH');
 const source={visitId:current?.id??'unsaved-validation-only',organizationId:null,organizationText:form.organization,occurredOn:form.occurredOn||null,originalText:form.notes};
 const decisions:ApiDeclaration[]=review.rows.map(row=>{
  if(row.kind==='customer-request')return {kind:row.kind,requestText:row.text};
  if(row.kind==='unconfirmed')return {kind:row.kind,candidateText:row.text};
  if(!row.confirmed)throw Error('EXPLICIT_CONFIRMATION_REQUIRED');
  const deadline:Deadline=row.deadlineKind==='unknown'?{kind:'unknown'}:row.deadlineKind==='date'?{kind:'date',date:row.deadlineValue}:{kind:'instant',at:row.deadlineValue};
  return {kind:row.kind,confirmation:'person-explicitly-confirmed',commitmentText:row.text,deadline};
 });
 // Validate even an empty review: no synthetic follow-up is created by this probe.
 for(const declaration of decisions.length?decisions:[{kind:'no-self-commitment'} as const]){
  const typed=declaration.kind==='explicit-self-commitment'?{...declaration,ownerId:actorId}:declaration;
  const checked=captureFollowUp({id:'validation-only',eventId:'validation-event',actorId,recordedAt:'2000-01-01T00:00:00Z',source,declaration:typed});
  if(!checked.ok)throw Error(checked.error.message);
 }
 return {schemaVersion:2 as const,visitId:current?.id??null,expectedRevision:current?.revision??null,record:{organization:form.organization,organizationId:null,occurredOn:form.occurredOn||null,notes:form.notes},followUpReview:{status:'reviewed' as const,decisions}};
}
