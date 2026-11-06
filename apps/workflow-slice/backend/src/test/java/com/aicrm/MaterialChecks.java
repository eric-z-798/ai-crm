package com.aicrm;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.json.JsonWriteFeature;
public class MaterialChecks {
 static void check(boolean b){if(!b)throw new AssertionError();}
 static final String CID="11111111-1111-4111-8111-111111111111",PID="22222222-2222-4222-8222-222222222222";
 static class TX extends TransactionTemplate {public <T>T execute(TransactionCallback<T> c){return c.doInTransaction(null);}}
 static class W extends Workflow {
  List<String> steps=new ArrayList<>();boolean active=true,owner=true;String role="REP";
  W(){super(new JdbcTemplate(){public int update(String q,Object...a){throw new AssertionError("write");}},new TX(),new ObjectMapper());}
  Actor actor(String a){steps.add("actor");require(active,401,"UNAUTHENTICATED");return new Actor("rep-a","tenant-a","team-a",role);}
  Map<String,Object> preparationSource(Actor a,String cid,boolean lock){steps.add("source");require(a.role().equals("REP"),403,"FORBIDDEN");require(owner,404,"NOT_FOUND");return Map.of();}
  Map<String,Object> preparation(Actor a,String cid,boolean lock){steps.add("preparation");return Map.of("id",PID,"revision",2147483647);}
 }
 static void rejects(Runnable r,int status){try{r.run();throw new AssertionError("allowed");}catch(Workflow.Problem p){check(p.status==status);}}
 public static void main(String[]args)throws Exception{
  var w=new W();var directory=w.materials("x",CID,PID);check(w.steps.equals(List.of("actor","source","preparation")));
  var normal=new ObjectMapper();var escaped=new ObjectMapper();escaped.getFactory().configure(JsonWriteFeature.ESCAPE_NON_ASCII.mappedFeature(),true);
  List<Integer> raw=new ArrayList<>(),worst=new ArrayList<>();
  for(Object response:List.of(directory,w.materialVersion("x",CID,PID,"synthetic-reading","v1"),w.materialVersion("x",CID,PID,"synthetic-reading","v2"))){int a=normal.writeValueAsBytes(response).length,b=escaped.writeValueAsBytes(response).length;raw.add(a);worst.add(b);check(a<=b&&b<=SyntheticMaterials.RESPONSE_LIMIT);}
  check(worst.equals(List.of(684,889,985)));check(SyntheticMaterials.VERSIONS.stream().map(v->((String)v.get("plainText")).getBytes(java.nio.charset.StandardCharsets.UTF_8).length).toList().equals(List.of(261,309)));
  rejects(()->w.materialVersion("x",CID,PID,"synthetic-reading","missing"),404);rejects(()->w.materials("x",CID,CID),404);
  w.owner=false;rejects(()->w.materials("x",CID,PID),404);w.owner=true;w.role="MANAGER";rejects(()->w.materials("x",CID,PID),403);w.role="REP";w.active=false;rejects(()->w.materials("x",CID,PID),401);
  List<Map<String,Object>> dynamic=new ArrayList<>();
  for(String id:List.of("x".repeat(180),"quote\"back\\slash","control\n\t\u0001","中文😀")){
   int payload=escaped.writeValueAsBytes(id).length-2,budget=985-72+payload*2;
   var context=Map.of("cid",id,"pid",id,"preparationRevision",2147483647);
   int max=0;for(var material:SyntheticMaterials.VERSIONS){int count=escaped.writeValueAsBytes(Map.of("schemaVersion",1,"context",context,"material",material)).length;check(count<=budget);max=Math.max(max,count);}
   dynamic.add(Map.of("payloadBytes",payload,"budget",budget,"maxWire",max));
  }
  System.out.println(normal.writeValueAsString(Map.of("dynamicContext",dynamic)));
  System.out.println(normal.writeValueAsString(Map.of("kind","offline ObjectMapper + authorization proxy, not runtime","rawBytes",raw,"escapedBytes",worst,"limit",985,"checks",8)));
 }
}
