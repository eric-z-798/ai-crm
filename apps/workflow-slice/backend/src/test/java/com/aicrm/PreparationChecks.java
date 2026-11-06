package com.aicrm;
import java.util.*;
public class PreparationChecks {
 static void check(boolean x){if(!x)throw new AssertionError();}
 static void reject(Runnable r){try{r.run();throw new AssertionError("accepted invalid");}catch(Workflow.Problem expected){}}
 public static void main(String[] args){
  var binding=Map.<String,Object>of("commitmentRevision",3,"contentRevision",1,"visitId","v-a","visitRevision",10);
  var body=new LinkedHashMap<String,Object>();body.put("schemaVersion",1);body.put("sourceBinding",binding);body.put("purposeText","😀".repeat(1000));body.put("materialLeads",List.of());body.put("changeReason","");body.put("expectedPreparationRevision",null);
  PreparationDomain.body(body,true);check(body.get("purposeText").equals("😀".repeat(1000)));
  body.put("purposeText","😀".repeat(1001));reject(()->PreparationDomain.body(body,true));body.put("purposeText","");PreparationDomain.body(body,true);
  body.put("expectedPreparationRevision",1);reject(()->PreparationDomain.body(body,false));body.put("changeReason","because");PreparationDomain.body(body,false);
  body.put("ownerId","other");reject(()->PreparationDomain.body(body,false));body.remove("ownerId");
  var lead=Map.of("lineId","line-a","name","Q","sourceDescription","","versionDescription","","question","");body.put("materialLeads",List.of(lead,lead));reject(()->PreparationDomain.body(body,false));
  body.put("materialLeads",List.of(lead));PreparationDomain.body(body,false);
  var c=Map.<String,Object>of("events",List.of(Map.of("type","created","contentRevision",1),Map.of("type","amended","contentRevision",2),Map.of("type","reply-recorded","contentRevision",1),Map.of("type","completed","contentRevision",2)));
  check(!PreparationDomain.open(c));check(PreparationDomain.contentRevision(c)==2);
  System.out.println("PreparationChecks: 9 checks passed (pure Java; no database)");
 }
}
