package com.aicrm;

import java.time.*;
import java.util.*;
import java.util.regex.*;
import static com.aicrm.Workflow.require;

/** Pure Java counterpart of the locked v0.2.1 domain, with explicit v3 text-only organization source.
 * No NLP, inferred completion, deadline, actual reply time, clock, IDs, I/O or authority in this class.
 */
final class CommitmentDomain {
    private CommitmentDomain() {}
    static Workflow.Problem invalid(String message) { return new Workflow.Problem(400,message); }
    @SuppressWarnings("unchecked") static Map<String,Object> object(Object v) {
        require(v instanceof Map<?,?>,400,"INVALID_INPUT");
        Map<?,?> m=(Map<?,?>)v; require(m.keySet().stream().allMatch(k->k instanceof String),400,"INVALID_INPUT");
        return (Map<String,Object>)m;
    }
    static void fields(Map<String,Object> m,List<String> required,List<String> optional) {
        require(m.keySet().containsAll(required),400,"INVALID_INPUT");
        require(m.keySet().stream().allMatch(k->required.contains(k)||optional.contains(k)),400,"INVALID_INPUT");
    }
    static void fields(Map<String,Object> m,String... required) { fields(m,List.of(required),List.of()); }
    // Match ECMAScript trim (the locked TypeScript domain), rather than Java's different Unicode isBlank set.
    static String trim(String value) { return value.replaceAll("^[\\s\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+|[\\s\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+$", ""); }
    static String text(Object o) { require(o instanceof String && !trim((String)o).isEmpty() && ((String)o).indexOf('\0')<0,400,"INVALID_INPUT");return (String)o; }
    static String id(Object o) { String v=text(o);require(v.equals(trim(v)),400,"INVALID_INPUT");return v; }
    static int positive(Object o) { require(o instanceof Integer && (int)o>0,400,"INVALID_INPUT");return (int)o; }
    static void day(Object o) {
        require(o instanceof String && ((String)o).matches("[0-9]{4}-[0-9]{2}-[0-9]{2}"),400,"INVALID_INPUT");
        try {require(LocalDate.parse((String)o).getYear()>0,400,"INVALID_INPUT");}catch(DateTimeException e){throw invalid("INVALID_INPUT");}
    }
    static Instant instant(Object o) {
        require(o instanceof String,400,"INVALID_INPUT");
        var match=Pattern.compile("^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\\.[0-9]{1,3})?(Z|[+-][0-9]{2}:[0-9]{2})$").matcher((String)o);
        require(match.matches(),400,"INVALID_INPUT");day(match.group(1));
        require(Integer.parseInt(match.group(2))<=23 && Integer.parseInt(match.group(3))<=59 && Integer.parseInt(match.group(4))<=59,400,"INVALID_INPUT");
        String offset=match.group(5);
        if(!offset.equals("Z")) {int h=Integer.parseInt(offset.substring(1,3)),m=Integer.parseInt(offset.substring(4));require(h<=14 && m<=59 && (h!=14||m==0) && !offset.equals("-00:00"),400,"INVALID_INPUT");}
        try {return OffsetDateTime.parse((String)o).toInstant();}catch(DateTimeException e){throw invalid("INVALID_INPUT");}
    }
    static void deadline(Object o) {
        var d=object(o);String kind=text(d.get("kind"));
        switch(kind) {case "unknown"->fields(d,"kind");case "date"->{fields(d,"kind","date");day(d.get("date"));}case "instant"->{fields(d,"kind","at");instant(d.get("at"));}default->throw invalid("INVALID_INPUT");}
    }
    static void declaration(Object o) {
        var d=object(o);String kind=text(d.get("kind"));
        switch(kind) {
            case "no-self-commitment"->fields(d,"kind");
            case "customer-request"->{fields(d,"kind","requestText");text(d.get("requestText"));}
            case "unconfirmed"->{fields(d,"kind","candidateText");text(d.get("candidateText"));}
            case "explicit-self-commitment"->{fields(d,"kind","confirmation","commitmentText","deadline");require("person-explicitly-confirmed".equals(d.get("confirmation")),400,"INVALID_INPUT");text(d.get("commitmentText"));deadline(d.get("deadline"));}
            default->throw invalid("INVALID_INPUT");
        }
    }
    static Map<String,Object> review(Object o) {
        var r=object(o);fields(r,"status","decisions");require("reviewed".equals(r.get("status")) && r.get("decisions") instanceof List<?>,400,"INVALID_INPUT");
        for(var d:(List<?>)r.get("decisions"))declaration(d);return r;
    }
    static void event(Map<String,Object> e,boolean created,boolean stored) {
        var required=new ArrayList<>(List.of("type","eventId","actorId","recordedAt"));
        if(stored)required.add("contentRevision");
        var optional=new ArrayList<String>();if(!stored)optional.add("contentRevision");
        id(e.get("eventId"));id(e.get("actorId"));Instant time=instant(e.get("recordedAt"));
        if(e.containsKey("contentRevision"))positive(e.get("contentRevision"));
        String type=text(e.get("type"));
        switch(type) {
            case "created"->{require(created,400,"INVALID_INPUT");required.addAll(List.of("confirmation","commitmentText","deadline"));require(Integer.valueOf(1).equals(e.get("contentRevision")) && "person-explicitly-confirmed".equals(e.get("confirmation")),400,"INVALID_INPUT");text(e.get("commitmentText"));deadline(e.get("deadline"));}
            case "amended"->{required.add("reason");optional.addAll(List.of("commitmentText","deadline"));text(e.get("reason"));require(e.containsKey("commitmentText")||e.containsKey("deadline"),400,"INVALID_INPUT");if(e.containsKey("commitmentText"))text(e.get("commitmentText"));if(e.containsKey("deadline"))deadline(e.get("deadline"));}
            case "progress-recorded"->{required.addAll(List.of("status","text"));text(e.get("text"));require(Set.of("not-started","in-progress","verified").contains(text(e.get("status"))),400,"INVALID_INPUT");}
            case "reply-recorded"->{required.addAll(List.of("direction","occurredAt","text"));text(e.get("text"));require(Set.of("to-customer","from-customer").contains(text(e.get("direction"))),400,"INVALID_INPUT");require(!instant(e.get("occurredAt")).isAfter(time),400,"INVALID_INPUT");}
            case "completed"->{required.addAll(List.of("confirmation","text"));text(e.get("text"));require("person-confirmed-complete".equals(e.get("confirmation")),400,"INVALID_INPUT");}
            case "reopened"->{required.add("reason");text(e.get("reason"));}
            default->throw invalid("INVALID_INPUT");
        }
        fields(e,required,optional);
    }
    static boolean transition(boolean complete,String type) {
        if(type.equals("reply-recorded"))return complete;
        if(type.equals("reopened")){require(complete,409,"INVALID_TRANSITION");return false;}
        require(!complete,409,"INVALID_TRANSITION");return type.equals("completed");
    }
    @SuppressWarnings("unchecked") static List<Map<String,Object>> events(Map<String,Object> c) {
        require(c.get("events") instanceof List<?>,400,"INVALID_INPUT");return ((List<?>)c.get("events")).stream().map(CommitmentDomain::object).toList();
    }
    static void validate(Map<String,Object> c) {
        fields(c,"schemaVersion","kind","id","ownerId","source","events");require(Integer.valueOf(3).equals(c.get("schemaVersion")) && "self-commitment".equals(c.get("kind")),400,"INVALID_INPUT");
        id(c.get("id"));String owner=id(c.get("ownerId"));var source=object(c.get("source"));fields(source,"visitId","organizationId","organizationText","occurredOn","originalText");
        id(source.get("visitId"));require(source.get("organizationId")==null,400,"INVALID_INPUT");text(source.get("organizationText"));text(source.get("originalText"));if(source.get("occurredOn")!=null)day(source.get("occurredOn"));
        var events=events(c);require(!events.isEmpty(),400,"INVALID_INPUT");Set<Object> ids=new HashSet<>();Instant last=Instant.MIN;boolean complete=false;int scope=1;String content="";
        for(int i=0;i<events.size();i++) {
            var e=events.get(i);event(e,i==0,true);String type=(String)e.get("type");require(i!=0||type.equals("created"),400,"INVALID_INPUT");
            if(type.equals("created"))content=(String)e.get("commitmentText");
            if(type.equals("amended")&&e.containsKey("commitmentText")&&!e.get("commitmentText").equals(content)){scope++;content=(String)e.get("commitmentText");}
            int eventScope=positive(e.get("contentRevision"));require(type.equals("reply-recorded")?eventScope<=scope:eventScope==scope,400,"INVALID_INPUT");
            require(owner.equals(e.get("actorId")),403,"ACTOR_MISMATCH");require(ids.add(e.get("eventId")),409,"EVENT_ID_CONFLICT");Instant now=instant(e.get("recordedAt"));require(!now.isBefore(last),400,"INVALID_INPUT");last=now;
            if(!type.equals("created"))complete=transition(complete,type);
        }
    }
    static Map<String,Object> create(String id,String eventId,String owner,String now,Map<String,Object> source,Map<String,Object> declaration) {
        declaration(declaration);require("explicit-self-commitment".equals(declaration.get("kind")),400,"INVALID_INPUT");
        var e=new LinkedHashMap<String,Object>();e.put("type","created");e.put("contentRevision",1);e.put("eventId",eventId);e.put("actorId",owner);e.put("recordedAt",now);e.put("confirmation",declaration.get("confirmation"));e.put("commitmentText",declaration.get("commitmentText"));e.put("deadline",declaration.get("deadline"));
        var c=new LinkedHashMap<String,Object>();c.put("schemaVersion",3);c.put("kind","self-commitment");c.put("id",id);c.put("ownerId",owner);c.put("source",source);c.put("events",List.of(e));validate(c);return c;
    }
    static Map<String,Object> append(Map<String,Object> c,int expectedRevision,Map<String,Object> e) {
        validate(c);positive(expectedRevision);event(e,false,false);require(c.get("ownerId").equals(e.get("actorId")),403,"ACTOR_MISMATCH");var events=events(c);
        for(var previous:events)if(previous.get("eventId").equals(e.get("eventId"))) {
            var retry=new LinkedHashMap<>(e);retry.putIfAbsent("contentRevision",previous.get("contentRevision"));require(previous.equals(retry),409,"EVENT_ID_CONFLICT");return c;
        }
        require(expectedRevision==events.size(),409,"REVISION_CONFLICT");require(!instant(e.get("recordedAt")).isBefore(instant(events.getLast().get("recordedAt"))),400,"INVALID_INPUT");
        int scope=1;boolean complete=false;String content=(String)events.getFirst().get("commitmentText");
        for(var old:events) {String type=(String)old.get("type");if(type.equals("amended") && old.containsKey("commitmentText")&&!old.get("commitmentText").equals(content)){scope++;content=(String)old.get("commitmentText");}if(type.equals("completed"))complete=true;else if(type.equals("reopened"))complete=false;}
        String type=(String)e.get("type");transition(complete,type);int resultScope=e.containsKey("contentRevision")?positive(e.get("contentRevision")):scope;
        if(type.equals("amended")||type.equals("reopened")) {int target=scope+(type.equals("amended")&&e.containsKey("commitmentText")&&!e.get("commitmentText").equals(content)?1:0);require(!e.containsKey("contentRevision")||resultScope==target,400,"INVALID_INPUT");resultScope=target;}
        var stored=new LinkedHashMap<>(e);stored.put("contentRevision",resultScope);var updated=new ArrayList<>(events);updated.add(stored);var next=new LinkedHashMap<>(c);next.put("events",updated);validate(next);return next;
    }
    static Object canonical(Object value) {
        if(value instanceof Map<?,?> m){var sorted=new TreeMap<String,Object>();m.forEach((k,v)->sorted.put((String)k,canonical(v)));return sorted;}
        if(value instanceof List<?> l)return l.stream().map(CommitmentDomain::canonical).toList();return value;
    }
}
