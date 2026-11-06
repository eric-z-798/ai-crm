package com.aicrm;

import java.util.*;

/** Internal handling facts; deliberately independent of personal commitment/customer reply state. */
final class HandoffResults {
    static final Set<String> TYPES=Set.of("result-recorded","completed","correction-requested","result-corrected","completion-withdrawn");
    static class Problem extends RuntimeException {
        final int status; final String code;
        Problem(int status,String code){super(code);this.status=status;this.code=code;}
    }
    static void require(boolean value,int status,String code){if(!value)throw new Problem(status,code);}
    static String text(Object value,int max){require(value instanceof String,400,"INVALID_RESULT_INPUT");String s=(String)value;require(!s.isBlank()&&s.length()<=max&&s.indexOf('\0')<0,400,"INVALID_RESULT_INPUT");return s;}
    static String id(Object value){String s=text(value,100);try{require(UUID.fromString(s).toString().equals(s),400,"INVALID_RESULT_REFERENCE");}catch(IllegalArgumentException e){throw new Problem(400,"INVALID_RESULT_REFERENCE");}return s;}
    static void schema(Map<String,Object> m,String... fields){require(m.keySet().equals(Set.of(fields)),400,"INVALID_RESULT_FIELDS");}
    static String type(Map<String,Object> input){Object t=input.get("type");require(t instanceof String&&TYPES.contains(t),400,"INVALID_RESULT_TYPE");return (String)t;}
    static void validateInput(Map<String,Object> e){
        String type=type(e);
        switch(type){
            case "result-recorded" -> {schema(e,"type","text");text(e.get("text"),4000);}
            case "completed" -> {schema(e,"type","resultEventId","confirmation");id(e.get("resultEventId"));require("person-confirmed-internal-complete".equals(e.get("confirmation")),400,"COMPLETION_CONFIRMATION_REQUIRED");}
            case "correction-requested" -> {schema(e,"type","targetEventId","text");id(e.get("targetEventId"));text(e.get("text"),4000);}
            case "result-corrected" -> {schema(e,"type","targetEventId","text","reason");id(e.get("targetEventId"));text(e.get("text"),4000);text(e.get("reason"),1000);}
            case "completion-withdrawn" -> {schema(e,"type","targetEventId","reason");id(e.get("targetEventId"));text(e.get("reason"),1000);}
        }
    }
    static final class State {
        Map<String,Object> latest,completion; int lastWithdrawal;
        final List<Map<String,Object>> requests=new ArrayList<>();
    }
    static void transition(State s,Map<String,Object> e){
        String t=type(e);
        if(t.equals("result-recorded"))require(s.completion==null,409,"COMPLETION_ALREADY_DECLARED");
        else if(t.equals("completed")){
            require(s.completion==null,409,"COMPLETION_ALREADY_DECLARED");
            require(s.latest!=null&&Objects.equals(e.get("resultEventId"),s.latest.get("eventId")),409,"RESULT_REFERENCE_CHANGED");
            require(((Number)s.latest.get("revision")).intValue()>s.lastWithdrawal,409,"NEW_RESULT_REQUIRED");
        } else if(t.equals("completion-withdrawn"))require(s.completion!=null&&Objects.equals(e.get("targetEventId"),s.completion.get("eventId")),409,"COMPLETION_REFERENCE_CHANGED");
        else require(s.latest!=null&&Objects.equals(e.get("targetEventId"),s.latest.get("eventId")),409,"RESULT_REFERENCE_CHANGED");
        switch(t){
            case "result-recorded","result-corrected" -> s.latest=e;
            case "completed" -> s.completion=e;
            case "completion-withdrawn" -> {s.completion=null;s.lastWithdrawal=((Number)e.get("revision")).intValue();}
            case "correction-requested" -> s.requests.add(e);
        }
    }
    static State fold(List<Map<String,Object>> history){
        State s=new State();int previous=0;Set<String> ids=new HashSet<>();
        for(var e:history){
            try{
                id(e.get("eventId"));text(e.get("actorId"),200);java.time.Instant.parse((String)e.get("recordedAt"));
                require(e.get("revision") instanceof Integer&&((Integer)e.get("revision"))>previous,503,"STORED_HANDOFF_HISTORY_INVALID");
                previous=(Integer)e.get("revision");require(ids.add((String)e.get("eventId")),503,"STORED_HANDOFF_HISTORY_INVALID");
                var body=new LinkedHashMap<>(e);for(String k:List.of("eventId","actorId","recordedAt","revision"))body.remove(k);validateInput(body);transition(s,e);
            }catch(RuntimeException ex){throw new Problem(503,"STORED_HANDOFF_HISTORY_INVALID");}
        }
        return s;
    }
    static Map<String,Object> project(List<Map<String,Object>> history){
        State s=fold(history);var p=new LinkedHashMap<String,Object>();p.put("latestResult",s.latest);p.put("completion",s.completion);p.put("correctionRequests",s.requests);p.put("history",history);return p;
    }
    static Map<String,Object> append(List<Map<String,Object>> history,Map<String,Object> input,String actorId,int revision,String eventId,String at){
        validateInput(input);State s=fold(history);require(history.isEmpty()||revision>((Number)history.getLast().get("revision")).intValue(),409,"REVISION_CONFLICT");
        var e=new LinkedHashMap<>(input);e.put("eventId",id(eventId));e.put("actorId",actorId);e.put("recordedAt",at);e.put("revision",revision);transition(s,e);return e;
    }
    /** Returns only cross-checked historical acceptance; never infer it from current recipient alone. */
    static String acceptedBy(Map<String,Object> h,List<Map<String,Object>> audits,List<Map<String,Object>> receipts){
        if(!"ACCEPTED".equals(h.get("status"))||audits.size()!=1||receipts.size()!=1)return null;
        var a=audits.getFirst();var r=receipts.getFirst();
        if(!(r.get("response") instanceof Map<?,?> v))return null;
        if(!Objects.equals(a.get("tenant"),h.get("tenant"))||!Objects.equals(a.get("object_id"),h.get("id"))||!"HANDOFF_ACCEPTED".equals(a.get("action"))||!Objects.equals(a.get("actor_id"),h.get("recipient_id")))return null;
        if(!Objects.equals(r.get("tenant"),a.get("tenant"))||!Objects.equals(r.get("actor_id"),a.get("actor_id"))||!Objects.equals(r.get("command_key"),a.get("command_key"))||!Objects.equals(r.get("command_type"),"accept/"+h.get("id")))return null;
        if(!Objects.equals(v.get("id"),h.get("id"))||!Objects.equals(v.get("visitId"),h.get("visit_id"))||!Objects.equals(v.get("ownerId"),h.get("owner_id"))||!Objects.equals(v.get("recipientId"),a.get("actor_id"))||!"ACCEPTED".equals(v.get("status"))||!Objects.equals(v.get("revision"),a.get("revision")))return null;
        if(!(a.get("revision") instanceof Number ar)||!(h.get("revision") instanceof Number hr)||ar.intValue()<1||ar.intValue()>hr.intValue())return null;
        return (String)a.get("actor_id");
    }
}
