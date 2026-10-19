package com.aicrm;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.dao.DataAccessException;
import java.time.LocalDate;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.Function;

/** Local synthetic slice: identity is resolved on the server, never from request body. */
@RestController
@RequestMapping("/api")
public class Workflow {
    final JdbcTemplate db;
    final TransactionTemplate tx;
    final ObjectMapper json;
    Workflow(JdbcTemplate db, TransactionTemplate tx, ObjectMapper json) {
        this.db=db; this.tx=tx; this.json=json;
    }
    record Actor(String id,String tenant,String team,String role) {}
    static class Problem extends RuntimeException {
        final int status; final String code;
        Problem(int status,String code) { super(code); this.status=status; this.code=code; }
    }
    static void require(boolean condition,int status,String code) {
        if(!condition) throw new Problem(status,code);
    }
    Actor actor(String auth) {
        require(auth!=null && auth.startsWith("Bearer "),401,"UNAUTHENTICATED");
        var rows=db.query("SELECT id,tenant,team,role FROM actors WHERE token=? AND active=true FOR SHARE",
            (r,n)->new Actor(r.getString(1),r.getString(2),r.getString(3),r.getString(4)),auth.substring(7));
        require(rows.size()==1,401,"UNAUTHENTICATED"); Actor a=rows.getFirst(); require(Set.of("REP","MANAGER").contains(a.role),403,"ROLE_REVOKED"); return a;
    }
    String encode(Object x) { try{return json.writeValueAsString(x);}catch(Exception e){throw new IllegalStateException(e);} }
    Object decode(String s) {try{return json.readValue(s,Object.class);}catch(Exception e){throw new IllegalStateException(e);}}
    String digest(Object x) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(encode(x).getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    static void schema(Map<String,Object> b,String... fields) {
        require(b!=null && b.keySet().equals(Set.of(fields)),400,"INVALID_FIELDS");
    }
    static String text(Map<String,Object> b,String k,int max) {
        Object value=b.get(k); require(value instanceof String,400,"INVALID_"+k.toUpperCase());
        String s=(String)value; require(!s.isBlank() && s.length()<=max && s.indexOf('\0')<0,400,"INVALID_"+k.toUpperCase());
        return s; // Business original text is preserved exactly, not normalized/translated.
    }
    static int revision(Map<String,Object> b) {
        Object n=b.get("expectedRevision");require(n instanceof Integer && (int)n>0,400,"INVALID_REVISION");return (int)n;
    }
    static LocalDate date(Map<String,Object> b) {
        String s=text(b,"occurredOn",10);
        try {require(s.matches("\\d{4}-\\d{2}-\\d{2}"),400,"INVALID_DATE");return LocalDate.parse(s);}
        catch(java.time.DateTimeException e){throw new Problem(400,"INVALID_DATE");}
    }
    static String key(String key) {require(key!=null && key.matches("[A-Za-z0-9_-]{8,100}"),400,"INVALID_COMMAND_KEY");return key;}
    Map<String,Object> visit(Actor a,String id,boolean lock) {
        var rows=db.queryForList("SELECT id,tenant,team,owner_id,revision,status,organization,occurred_on,notes,created_at,updated_at FROM visits WHERE id=? AND tenant=? AND team=? AND ((owner_id=? AND ?='REP') OR (?='MANAGER' AND status='RECORDED'))"+(lock?" FOR UPDATE":""),id,a.tenant,a.team,a.id,a.role,a.role);
        require(rows.size()==1,404,"NOT_FOUND");return rows.getFirst();
    }
    Map<String,Object> handoff(Actor a,String id,boolean lock) {
        var rows=db.queryForList("SELECT * FROM handoffs WHERE id=? AND tenant=? AND team=? AND ((owner_id=? AND ?='REP') OR (recipient_id=? AND ?='MANAGER'))"+(lock?" FOR UPDATE":""),id,a.tenant,a.team,a.id,a.role,a.id,a.role);
        require(rows.size()==1,404,"NOT_FOUND");return rows.getFirst();
    }
    Map<String,Object> publicVisit(Map<String,Object> r) {
        var m=new LinkedHashMap<String,Object>();
        for(String k:List.of("id","revision","status","organization","notes"))m.put(k,r.get(k));
        m.put("ownerId",r.get("owner_id"));m.put("occurredOn",(r.get("occurred_on")==null?null:r.get("occurred_on").toString()));
        m.put("createdAt",((java.sql.Timestamp)r.get("created_at")).toInstant().toString());
        m.put("updatedAt",((java.sql.Timestamp)r.get("updated_at")).toInstant().toString());return m;
    }
    Map<String,Object> publicHandoff(Map<String,Object> r) {
        var m=new LinkedHashMap<String,Object>();
        for(String k:List.of("id","revision","status","request"))m.put(k,r.get(k));
        m.put("visitId",r.get("visit_id"));m.put("ownerId",r.get("owner_id"));m.put("recipientId",r.get("recipient_id"));
        m.put("updatedAt",((java.sql.Timestamp)r.get("updated_at")).toInstant().toString());return m;
    }
    void event(Actor a,String key,String id,String action,int rev) {
        db.update("INSERT INTO audit_events(tenant,actor_id,command_key,object_id,action,revision) VALUES(?,?,?,?,?,?)",a.tenant,a.id,key,id,action,rev);
        db.update("INSERT INTO outbox(tenant,object_id,event_type,payload) VALUES(?,?,?,?::jsonb)",a.tenant,id,action,encode(Map.of("objectId",id,"revision",rev)));
    }
    void commandRole(Actor a,String route) {
        String action=route==null?"":route.split("/",2)[0];
        if(Set.of("create","update","confirm","handoff","record-v2","commitment-event").contains(action))require(a.role.equals("REP"),403,"FORBIDDEN");
        else if(Set.of("receive","accept").contains(action))require(a.role.equals("MANAGER"),403,"FORBIDDEN");
        else throw new Problem(403,"COMMAND_SCOPE_UNKNOWN");
    }
    void reauthorizeResult(Actor a,Object result,String route) {
        if(!(result instanceof Map<?,?> r))throw new Problem(403,"COMMAND_SCOPE_UNKNOWN");
        String action=route==null?"":route.split("/",2)[0];
        // Legacy receipt bodies remain byte-content compatible. Their saved operation identifies the object.
        if(Set.of("create","update","confirm").contains(action)) {
            require(r.get("id") instanceof String,403,"COMMAND_SCOPE_UNKNOWN");visit(a,(String)r.get("id"),false);
        } else if(Set.of("handoff","receive","accept").contains(action)) {
            require(r.get("id") instanceof String,403,"COMMAND_SCOPE_UNKNOWN");handoff(a,(String)r.get("id"),false);
        } else if(action.equals("record-v2")) {
            require("record-with-commitments".equals(r.get("objectType")) && r.get("visit") instanceof Map<?,?> && r.get("commitments") instanceof List<?>,403,"COMMAND_SCOPE_UNKNOWN");
            var v=(Map<?,?>)r.get("visit");require(v.get("id") instanceof String,403,"COMMAND_SCOPE_UNKNOWN");visit(a,(String)v.get("id"),false);
            for(Object c:(List<?>)r.get("commitments")){var m=CommitmentDomain.object(c);commitment(a,CommitmentDomain.id(m.get("id")),false);}
        } else if(action.equals("commitment-event")) {
            require("self-commitment".equals(r.get("kind")) && r.get("id") instanceof String,403,"COMMAND_SCOPE_UNKNOWN");commitment(a,(String)r.get("id"),false);
        } else throw new Problem(403,"COMMAND_SCOPE_UNKNOWN");
    }
    Object command(String auth,String key,String route,Map<String,Object> body,Function<Actor,Object> work) {
        key(key);
        boolean versioned=route.startsWith("record-v2") || route.startsWith("commitment-event/");
        Object hashBody=versioned?CommitmentDomain.canonical(body):new TreeMap<>(body);
        var envelope=new LinkedHashMap<String,Object>();envelope.put("route",route);envelope.put("body",hashBody);String hash=digest(envelope);
        // Original v1 used Map.of, whose top-level key iteration order can change after a JVM restart.
        var legacyEnvelope=new LinkedHashMap<String,Object>();legacyEnvelope.put("body",hashBody);legacyEnvelope.put("route",route);String legacyHash=digest(legacyEnvelope);
        return tx.execute(status->{
            Actor a=actor(auth); commandRole(a,route);
            // Serialize same key even before a receipt exists. Different keys still use row locks/revisions.
            db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",a.tenant+":"+a.id+":"+key);
            var saved=db.queryForList("SELECT request_hash,response::text FROM command_receipts WHERE tenant=? AND actor_id=? AND command_key=?",a.tenant,a.id,key);
            if(!saved.isEmpty()) {
                require(saved.getFirst().get("request_hash").equals(hash) || (!versioned && saved.getFirst().get("request_hash").equals(legacyHash)),409,"IDEMPOTENCY_CONFLICT");
                Object result=decode((String)saved.getFirst().get("response")); reauthorizeResult(a,result,route); return result;
            }
            Object result=work.apply(a);
            db.update("INSERT INTO command_receipts(tenant,actor_id,command_key,request_hash,response,command_type) VALUES(?,?,?,?,?::jsonb,?)",a.tenant,a.id,key,hash,encode(result),route);
            return result;
        });
    }
    @GetMapping("/context") Object context(@RequestHeader(value="Authorization",required=false) String auth) {
        return tx.execute(s->{Actor a=actor(auth);return Map.of("id",a.id,"role",a.role,"tenant",a.tenant,"mode","synthetic","aiMode","unavailable","persistence","postgresql");});
    }
    @GetMapping("/visits") Object visits(@RequestHeader(value="Authorization",required=false) String auth) {
        return tx.execute(s->{Actor a=actor(auth);return db.queryForList("SELECT * FROM visits WHERE tenant=? AND team=? AND ((owner_id=? AND ?='REP') OR (?='MANAGER' AND status='RECORDED')) ORDER BY updated_at DESC,id",a.tenant,a.team,a.id,a.role,a.role).stream().map(this::publicVisit).toList();});
    }
    @GetMapping("/visits/{id}") Object getVisit(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable String id) {
        return tx.execute(s->publicVisit(visit(actor(auth),id,false)));
    }
    @PostMapping("/visits") Object create(@RequestHeader(value="Authorization",required=false) String auth,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody Map<String,Object> b) {
        schema(b,"organization","occurredOn","notes");String org=text(b,"organization",200),notes=text(b,"notes",4000);LocalDate day=date(b);
        return command(auth,key,"create",b,a->{
            require(a.role.equals("REP"),403,"FORBIDDEN");String id=UUID.randomUUID().toString();
            db.update("INSERT INTO visits(id,tenant,team,owner_id,revision,status,organization,occurred_on,notes) VALUES(?,?,?,?,1,'DRAFT',?,?,?)",id,a.tenant,a.team,a.id,org,day,notes);
            event(a,key,id,"DRAFT_SAVED",1);return publicVisit(visit(a,id,false));
        });
    }
    @PutMapping("/visits/{id}") Object update(@RequestHeader(value="Authorization",required=false) String auth,@RequestHeader(value="Idempotency-Key",required=false) String key,@PathVariable String id,@RequestBody Map<String,Object> b) {
        schema(b,"organization","occurredOn","notes","expectedRevision");String org=text(b,"organization",200),notes=text(b,"notes",4000);LocalDate day=date(b);int rev=revision(b);
        return command(auth,key,"update/"+id,b,a->{
            var v=visit(a,id,true);require(a.id.equals(v.get("owner_id")) && a.role.equals("REP"),403,"FORBIDDEN");
            require(v.get("revision").equals(rev),409,"REVISION_CONFLICT");require(v.get("status").equals("DRAFT"),409,"RECORD_IMMUTABLE");
            db.update("UPDATE visits SET organization=?,occurred_on=?,notes=?,revision=revision+1,updated_at=now() WHERE id=?",org,day,notes,id);
            event(a,key,id,"DRAFT_UPDATED",rev+1);return publicVisit(visit(a,id,false));
        });
    }
    @PostMapping("/visits/{id}/confirm") Object confirm(@RequestHeader(value="Authorization",required=false) String auth,@RequestHeader(value="Idempotency-Key",required=false) String key,@PathVariable String id,@RequestBody Map<String,Object> b) {
        schema(b,"expectedRevision");int rev=revision(b);
        return command(auth,key,"confirm/"+id,b,a->{
            var v=visit(a,id,true);require(a.id.equals(v.get("owner_id")) && a.role.equals("REP"),403,"FORBIDDEN");
            require(v.get("revision").equals(rev),409,"REVISION_CONFLICT");require(v.get("status").equals("DRAFT"),409,"ALREADY_RECORDED");
            db.update("UPDATE visits SET status='RECORDED',revision=revision+1,updated_at=now() WHERE id=?",id);
            event(a,key,id,"RECORD_CONFIRMED",rev+1);return publicVisit(visit(a,id,false));
        });
    }
    @PostMapping("/visits/{id}/handoffs") Object send(@RequestHeader(value="Authorization",required=false) String auth,@RequestHeader(value="Idempotency-Key",required=false) String key,@PathVariable String id,@RequestBody Map<String,Object> b) {
        schema(b,"expectedRevision","request");int rev=revision(b);String request=text(b,"request",2000);
        return command(auth,key,"handoff/"+id,b,a->{
            var v=visit(a,id,true);require(a.id.equals(v.get("owner_id")) && a.role.equals("REP"),403,"FORBIDDEN");
            require(v.get("revision").equals(rev),409,"REVISION_CONFLICT");require(v.get("status").equals("RECORDED"),409,"RECORD_REQUIRED");
            var recipients=db.queryForList("SELECT id FROM actors WHERE tenant=? AND team=? AND role='MANAGER' AND active=true ORDER BY id FOR SHARE",a.tenant,a.team);
            require(recipients.size()==1,409,"RECIPIENT_UNRESOLVED");String recipient=(String)recipients.getFirst().get("id");
            String handoffId=UUID.randomUUID().toString();
            db.update("INSERT INTO handoffs(id,tenant,team,visit_id,owner_id,recipient_id,revision,status,request) VALUES(?,?,?,?,?,?,1,'SENT',?)",handoffId,a.tenant,a.team,id,a.id,recipient,request);
            event(a,key,handoffId,"HANDOFF_SENT",1);return publicHandoff(handoff(a,handoffId,false));
        });
    }
    @GetMapping("/handoffs") Object handoffs(@RequestHeader(value="Authorization",required=false) String auth) {
        return tx.execute(s->{Actor a=actor(auth);return db.queryForList("SELECT * FROM handoffs WHERE tenant=? AND team=? AND ((owner_id=? AND ?='REP') OR (recipient_id=? AND ?='MANAGER')) ORDER BY updated_at DESC,id",a.tenant,a.team,a.id,a.role,a.id,a.role).stream().map(this::publicHandoff).toList();});
    }
    @PostMapping("/handoffs/{id}/{action}") Object handoffAction(@RequestHeader(value="Authorization",required=false) String auth,@RequestHeader(value="Idempotency-Key",required=false) String key,@PathVariable String id,@PathVariable String action,@RequestBody Map<String,Object> b) {
        require(Set.of("receive","accept").contains(action),404,"NOT_FOUND");schema(b,"expectedRevision");int rev=revision(b);
        return command(auth,key,action+"/"+id,b,a->{
            var h=handoff(a,id,true);require(a.role.equals("MANAGER") && a.id.equals(h.get("recipient_id")),403,"FORBIDDEN");
            require(h.get("revision").equals(rev),409,"REVISION_CONFLICT");
            require(h.get("status").equals(action.equals("receive")?"SENT":"RECEIVED"),409,"INVALID_TRANSITION");
            String next=action.equals("receive")?"RECEIVED":"ACCEPTED";
            db.update("UPDATE handoffs SET status=?,revision=revision+1,updated_at=now() WHERE id=?",next,id);
            event(a,key,id,"HANDOFF_"+next,rev+1);return publicHandoff(handoff(a,id,false));
        });
    }
    @GetMapping("/commands/{commandKey}") Object receipt(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable String commandKey) {
        key(commandKey);return tx.execute(s->{Actor a=actor(auth);var rows=db.queryForList("SELECT response::text,command_type FROM command_receipts WHERE tenant=? AND actor_id=? AND command_key=?",a.tenant,a.id,commandKey);require(rows.size()==1,404,"NOT_FOUND");commandRole(a,(String)rows.getFirst().get("command_type")); Object result=decode((String)rows.getFirst().get("response")); reauthorizeResult(a,result,(String)rows.getFirst().get("command_type")); return result;});
    }
    Map<String,Object> publicVisitV2(Map<String,Object> row) {
        var result=publicVisit(row);result.put("organizationId",null);return result;
    }
    void snapshotVisit(Map<String,Object> row) {
        db.update("INSERT INTO visit_history(visit_id,revision,snapshot) VALUES(?,?,?::jsonb) ON CONFLICT DO NOTHING",row.get("id"),row.get("revision"),encode(publicVisitV2(row)));
    }
    Map<String,Object> commitment(Actor a,String id,boolean lock) {
        var rows=db.queryForList("SELECT document::text,revision FROM commitments WHERE id=? AND tenant=? AND team=? AND owner_id=?"+(lock?" FOR UPDATE":""),id,a.tenant,a.team,a.id);
        require(rows.size()==1,404,"NOT_FOUND");var document=CommitmentDomain.object(decode((String)rows.getFirst().get("document")));CommitmentDomain.validate(document);
        require(rows.getFirst().get("revision").equals(CommitmentDomain.events(document).size()),503,"STORED_REVISION_MISMATCH");return document;
    }
    @GetMapping("/v2/visits") Object visitsV2(@RequestHeader(value="Authorization",required=false) String auth) {
        return tx.execute(s->{Actor a=actor(auth);return db.queryForList("SELECT * FROM visits WHERE tenant=? AND team=? AND ((owner_id=? AND ?='REP') OR (?='MANAGER' AND status='RECORDED')) ORDER BY updated_at DESC,id",a.tenant,a.team,a.id,a.role,a.role).stream().map(this::publicVisitV2).toList();});
    }
    @GetMapping("/v2/visits/{id}") Object visitV2(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable String id) {
        return tx.execute(s->publicVisitV2(visit(actor(auth),id,false)));
    }
    @GetMapping("/v2/visits/{id}/review") Object reviewV2(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable String id) {
        return tx.execute(s->{
            Actor a=actor(auth);visit(a,id,false);
            var rows=db.queryForList("SELECT review::text FROM follow_up_reviews WHERE visit_id=? AND tenant=?",id,a.tenant);
            var response=new LinkedHashMap<String,Object>();response.put("schemaVersion",2);response.put("objectType","record-review");response.put("visitId",id);
            response.put("followUpReview",rows.isEmpty()?null:decode((String)rows.getFirst().get("review")));return response;
        });
    }
    @PostMapping("/v2/visits/record") Object recordV2(@RequestHeader(value="Authorization",required=false) String auth,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody Map<String,Object> b) {
        schema(b,"schemaVersion","visitId","expectedRevision","record","followUpReview");require(Integer.valueOf(2).equals(b.get("schemaVersion")),400,"INVALID_SCHEMA");
        var record=CommitmentDomain.object(b.get("record"));schema(record,"organization","organizationId","occurredOn","notes");require(record.get("organizationId")==null,400,"ORGANIZATION_ID_UNAVAILABLE");
        String org=text(record,"organization",200),notes=text(record,"notes",4000);CommitmentDomain.text(org);CommitmentDomain.text(notes);LocalDate occurred=null;
        if(record.get("occurredOn")!=null){CommitmentDomain.day(record.get("occurredOn"));occurred=LocalDate.parse((String)record.get("occurredOn"));}
        LocalDate day=occurred;var review=CommitmentDomain.review(b.get("followUpReview"));
        String requestedId=b.get("visitId")==null?null:CommitmentDomain.id(b.get("visitId"));
        Integer expected=requestedId==null?null:revision(b);require(requestedId!=null||b.get("expectedRevision")==null,400,"INVALID_REVISION");
        return command(auth,key,"record-v2",b,a->{
            String id=requestedId==null?UUID.randomUUID().toString():requestedId;int draftRevision;
            if(requestedId==null) {
                db.update("INSERT INTO visits(id,tenant,team,owner_id,revision,status,organization,occurred_on,notes) VALUES(?,?,?,?,1,'DRAFT',?,?,?)",id,a.tenant,a.team,a.id,org,day,notes);draftRevision=1;
            } else {
                var old=visit(a,id,true);require(a.id.equals(old.get("owner_id")),403,"FORBIDDEN");require(old.get("revision").equals(expected),409,"REVISION_CONFLICT");require("DRAFT".equals(old.get("status")),409,"RECORD_IMMUTABLE");snapshotVisit(old);
                db.update("UPDATE visits SET organization=?,occurred_on=?,notes=?,revision=revision+1,updated_at=now() WHERE id=?",org,day,notes,id);draftRevision=expected+1;
            }
            snapshotVisit(visit(a,id,false));
            db.update("UPDATE visits SET status='RECORDED',revision=revision+1,updated_at=now() WHERE id=?",id);
            var recorded=visit(a,id,false);snapshotVisit(recorded);
            db.update("INSERT INTO follow_up_reviews(visit_id,tenant,owner_id,review) VALUES(?,?,?,?::jsonb)",id,a.tenant,a.id,encode(review));
            var source=new LinkedHashMap<String,Object>();source.put("visitId",id);source.put("organizationId",null);source.put("organizationText",org);source.put("occurredOn",record.get("occurredOn"));source.put("originalText",notes);
            var commitments=new ArrayList<Map<String,Object>>();String now=java.time.Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS).toString();
            for(Object value:(List<?>)review.get("decisions")) {
                var declaration=CommitmentDomain.object(value);if(!"explicit-self-commitment".equals(declaration.get("kind")))continue;
                String commitmentId=UUID.randomUUID().toString();var c=CommitmentDomain.create(commitmentId,UUID.randomUUID().toString(),a.id,now,source,declaration);
                db.update("INSERT INTO commitments(id,tenant,team,owner_id,visit_id,revision,document) VALUES(?,?,?,?,?,1,?::jsonb)",commitmentId,a.tenant,a.team,a.id,id,encode(c));
                event(a,key,commitmentId,"SELF_COMMITMENT_CREATED",1);commitments.add(c);
            }
            event(a,key,id,"RECORD_WITH_REVIEW_RECORDED",draftRevision+1);
            return Map.of("schemaVersion",2,"objectType","record-with-commitments","visit",publicVisitV2(recorded),"commitments",commitments,"followUpReview",review);
        });
    }
    @GetMapping("/v2/commitments") Object commitmentsV2(@RequestHeader(value="Authorization",required=false) String auth) {
        return tx.execute(s->{Actor a=actor(auth);return db.queryForList("SELECT id FROM commitments WHERE tenant=? AND team=? AND owner_id=? ORDER BY created_at,id",a.tenant,a.team,a.id).stream().map(row->commitment(a,(String)row.get("id"),false)).toList();});
    }
    @GetMapping("/v2/commitments/{id}") Object commitmentV2(@RequestHeader(value="Authorization",required=false) String auth,@PathVariable String id) {
        return tx.execute(s->commitment(actor(auth),id,false));
    }
    @PostMapping("/v2/commitments/{id}/events") Object eventV2(@RequestHeader(value="Authorization",required=false) String auth,@RequestHeader(value="Idempotency-Key",required=false) String key,@PathVariable String id,@RequestBody Map<String,Object> b) {
        schema(b,"schemaVersion","expectedRevision","event");require(Integer.valueOf(2).equals(b.get("schemaVersion")),400,"INVALID_SCHEMA");int expected=revision(b);
        var input=CommitmentDomain.object(b.get("event"));require(!input.containsKey("actorId")&&!input.containsKey("recordedAt"),400,"SERVER_METADATA_REQUIRED");String eventId=CommitmentDomain.id(input.get("eventId"));
        return command(auth,key,"commitment-event/"+id,b,a->{
            var current=commitment(a,id,true);var history=CommitmentDomain.events(current);var e=new LinkedHashMap<>(input);e.put("actorId",a.id);
            // Client replay sends the same business event. Preserve its original server recording time.
            String recordedAt=history.stream().filter(old->eventId.equals(old.get("eventId"))).map(old->(String)old.get("recordedAt")).findFirst().orElseGet(()->java.time.Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS).toString());e.put("recordedAt",recordedAt);
            var updated=CommitmentDomain.append(current,expected,e);if(updated==current)return current;
            int next=CommitmentDomain.events(updated).size();
            db.update("UPDATE commitments SET revision=?,document=?::jsonb,updated_at=now() WHERE id=?",next,encode(updated),id);
            event(a,key,id,"SELF_COMMITMENT_"+((String)e.get("type")).toUpperCase(Locale.ROOT).replace('-','_'),next);
            return updated;
        });
    }
    @GetMapping("/health") Object health() { db.queryForObject("SELECT 1",Integer.class);return Map.of("status","UP","mode","synthetic","persistence","postgresql","modelIntegration",false); }
    @ExceptionHandler(Problem.class) ResponseEntity<?> domainError(Problem e) {return ResponseEntity.status(e.status).body(Map.of("code",e.code,"message",e.code));}
    @ExceptionHandler(DataAccessException.class) ResponseEntity<?> databaseError(DataAccessException e) {return ResponseEntity.status(503).body(Map.of("code","PERSISTENCE_UNAVAILABLE","message","Save result is not confirmed. Retain input and look up the original command before retrying."));}
}
