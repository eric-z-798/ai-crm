package com.aicrm;
import java.util.*;
import static com.aicrm.Workflow.require;
/** Preparation is evidence of intent only; it never changes source business facts. */
final class PreparationDomain {
 static String text(Object o,int min,int max){require(o instanceof String,400,"INVALID_PREPARATION_TEXT");String s=(String)o;int n=s.codePointCount(0,s.length());require(n>=min&&n<=max&&s.indexOf('\0')<0&&(min==0||!s.isBlank()),400,"INVALID_PREPARATION_TEXT");return s;}
 static Map<String,Object> body(Map<String,Object>b,boolean creating){
  Workflow.schema(b,"schemaVersion","sourceBinding","purposeText","materialLeads","changeReason","expectedPreparationRevision");require(Integer.valueOf(1).equals(b.get("schemaVersion")),400,"INVALID_SCHEMA");
  if(creating)require(b.get("expectedPreparationRevision")==null,400,"INVALID_REVISION");else CommitmentDomain.positive(b.get("expectedPreparationRevision"));
  var binding=CommitmentDomain.object(b.get("sourceBinding"));Workflow.schema(binding,"commitmentRevision","contentRevision","visitId","visitRevision");for(String k:List.of("commitmentRevision","contentRevision","visitRevision"))CommitmentDomain.positive(binding.get(k));CommitmentDomain.id(binding.get("visitId"));
  text(b.get("purposeText"),0,1000);text(b.get("changeReason"),creating?0:1,500);require(b.get("materialLeads") instanceof List<?>,400,"INVALID_MATERIAL_LEADS");var leads=(List<?>)b.get("materialLeads");require(leads.size()<=5,400,"INVALID_MATERIAL_LEADS");Set<String> ids=new HashSet<>();
  for(Object x:leads){var l=CommitmentDomain.object(x);Workflow.schema(l,"lineId","name","sourceDescription","versionDescription","question");require(ids.add(CommitmentDomain.id(l.get("lineId"))),400,"DUPLICATE_LINE");text(l.get("name"),1,200);text(l.get("sourceDescription"),0,500);text(l.get("versionDescription"),0,200);text(l.get("question"),0,500);}return b;
 }
 static boolean open(Map<String,Object> c){boolean open=true;for(var e:CommitmentDomain.events(c)){if("completed".equals(e.get("type")))open=false;if("reopened".equals(e.get("type")))open=true;}return open;}
 static int contentRevision(Map<String,Object> c){return CommitmentDomain.events(c).stream().mapToInt(e->CommitmentDomain.positive(e.get("contentRevision"))).max().orElseThrow();}
 static Map<String,Object> binding(Map<String,Object> c,Map<String,Object> v){return Map.of("commitmentRevision",CommitmentDomain.events(c).size(),"contentRevision",contentRevision(c),"visitId",v.get("id"),"visitRevision",v.get("revision"));}
}
