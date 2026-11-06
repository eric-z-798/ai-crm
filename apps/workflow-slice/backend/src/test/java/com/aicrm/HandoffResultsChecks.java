package com.aicrm;
import java.util.*;
/** Explicitly invoked offline assertions; not a Spring/HTTP/permission integration test. */
public class HandoffResultsChecks {
    static int checks=0;
    static void check(boolean b){checks++;if(!b)throw new AssertionError("check "+checks);}
    static void reject(String code,Runnable f){try{f.run();throw new AssertionError("expected "+code);}catch(HandoffResults.Problem p){check(code.equals(p.code));}}
    static List<Map<String,Object>> history=new ArrayList<>();static int revision=3;
    static Map<String,Object> add(Map<String,Object> input){var e=HandoffResults.append(history,input,"manager-a",++revision,UUID.randomUUID().toString(),"2026-11-06T05:00:00Z");history.add(e);return e;}
    public static void main(String[] args){
        String absent=UUID.randomUUID().toString();
        reject("RESULT_REFERENCE_CHANGED",()->HandoffResults.append(history,Map.of("type","completed","resultEventId",absent,"confirmation","person-confirmed-internal-complete"),"manager-a",4,UUID.randomUUID().toString(),"2026-11-06T05:00:00Z"));
        var first=add(Map.of("type","result-recorded","text"," 原文 Ω\n未对外发送。 "));
        check(HandoffResults.project(history).get("completion")==null);check(first.get("text").equals(" 原文 Ω\n未对外发送。 "));
        var completion=add(Map.of("type","completed","resultEventId",first.get("eventId"),"confirmation","person-confirmed-internal-complete"));
        var question=add(Map.of("type","correction-requested","targetEventId",first.get("eventId"),"text","请更正资料版本。"));
        check(HandoffResults.project(history).get("completion").equals(completion));
        var correction=add(Map.of("type","result-corrected","targetEventId",first.get("eventId"),"text","更正后的文字","reason","原资料版本写错"));
        check(((Map<?,?>)HandoffResults.project(history).get("completion")).get("resultEventId").equals(first.get("eventId")));
        check(((List<?>)HandoffResults.project(history).get("correctionRequests")).contains(question));
        add(Map.of("type","completion-withdrawn","targetEventId",completion.get("eventId"),"reason","误声明完成，仍待办理"));
        check(HandoffResults.project(history).get("completion")==null);
        reject("NEW_RESULT_REQUIRED",()->HandoffResults.append(history,Map.of("type","completed","resultEventId",correction.get("eventId"),"confirmation","person-confirmed-internal-complete"),"manager-a",revision+1,UUID.randomUUID().toString(),"2026-11-06T05:00:00Z"));
        var replacement=add(Map.of("type","result-corrected","targetEventId",correction.get("eventId"),"text","补充完成后的新结果","reason","撤错后重新核实"));
        add(Map.of("type","completed","resultEventId",replacement.get("eventId"),"confirmation","person-confirmed-internal-complete"));
        check(HandoffResults.project(history).get("completion")!=null);check(history.size()==7);
        reject("INVALID_RESULT_INPUT",()->HandoffResults.validateInput(Map.of("type","result-recorded","text","  ")));
        reject("INVALID_RESULT_FIELDS",()->HandoffResults.validateInput(Map.of("type","result-recorded","text","x","actorId","other")));
        reject("COMPLETION_CONFIRMATION_REQUIRED",()->HandoffResults.validateInput(Map.of("type","completed","resultEventId",absent,"confirmation","automatic")));
        var corrupt=new ArrayList<>(history);var e=new LinkedHashMap<>(corrupt.getFirst());e.put("revision",999);corrupt.set(0,e);reject("STORED_HANDOFF_HISTORY_INVALID",()->HandoffResults.project(corrupt));
        var h=new LinkedHashMap<String,Object>(Map.of("id","handoff-1","tenant","tenant-a","visit_id","visit-1","owner_id","rep-a","recipient_id","manager-a","status","ACCEPTED","revision",3));
        var a=new LinkedHashMap<String,Object>(Map.of("tenant","tenant-a","object_id","handoff-1","actor_id","manager-a","command_key","original-key","action","HANDOFF_ACCEPTED","revision",3));
        var v=Map.<String,Object>of("id","handoff-1","visitId","visit-1","ownerId","rep-a","recipientId","manager-a","status","ACCEPTED","revision",3);
        var r=new LinkedHashMap<String,Object>(Map.of("tenant","tenant-a","actor_id","manager-a","command_key","original-key","command_type","accept/handoff-1","response",v));
        check("manager-a".equals(HandoffResults.acceptedBy(h,List.of(a),List.of(r))));
        check(HandoffResults.acceptedBy(h,List.of(),List.of(r))==null);check(HandoffResults.acceptedBy(h,List.of(a,a),List.of(r))==null);check(HandoffResults.acceptedBy(h,List.of(a),List.of())==null);
        h.put("recipient_id","manager-new");check(HandoffResults.acceptedBy(h,List.of(a),List.of(r))==null);h.put("recipient_id","manager-a");
        r.put("command_type","receive/handoff-1");check(HandoffResults.acceptedBy(h,List.of(a),List.of(r))==null);r.put("command_type","accept/handoff-1");
        var wrong=new LinkedHashMap<>(v);wrong.put("revision",2);r.put("response",wrong);check(HandoffResults.acceptedBy(h,List.of(a),List.of(r))==null);
        System.out.println("PASS "+checks+" offline assertions; historical evidence fixture checks are not runtime revocation tests.");
    }
}
