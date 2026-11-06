package com.aicrm;
import java.util.*;
import java.util.function.Function;
import java.lang.reflect.Proxy;
import java.io.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.env.StandardEnvironment;
import jakarta.servlet.http.*;
public class PreparationBoundaryChecks {
 static void check(boolean b){if(!b)throw new AssertionError();}
 static class DB extends JdbcTemplate {
  String hash=null,response=null,route=null;int writes;
  public List<Map<String,Object>> queryForList(String sql,Object...args){if(sql.contains("pg_advisory"))return List.of();if(sql.contains("command_receipts"))return hash==null?List.of():List.of(Map.of("request_hash",hash,"response",response,"command_type",route));throw new AssertionError(sql);}
  public int update(String sql,Object...args){check(sql.contains("INSERT INTO command_receipts"));writes++;hash=(String)args[3];response=(String)args[4];route=(String)args[5];return 1;}
 }
 static class TX extends TransactionTemplate { public <T>T execute(TransactionCallback<T> c){return c.doInTransaction(null);} }
 static class W extends Workflow {
  boolean allowed=true;int authorized;
  W(DB db){super(db,new TX(),new ObjectMapper());}
  Actor actor(String a){return new Actor("rep-a","tenant-a","team-a","REP");}
  Map<String,Object> preparation(Actor a,String id,boolean lock){require(allowed,404,"NOT_FOUND");authorized++;return Map.of("id","prep-a");}
  Map<String,Object> preparationSource(Actor a,String id,boolean lock){require(allowed,404,"NOT_FOUND");return Map.of();}
 }
 static int boundary(String path,long length,boolean capability) throws Exception {
  System.setProperty("server.address","127.0.0.1");System.setProperty("spring.datasource.url","jdbc:postgresql://127.0.0.1:55432/crm_demo");System.setProperty("spring.datasource.username","crm_demo");
  var f=new LocalBoundary(new StandardEnvironment());int[] status={0};boolean[] chained={false};
  var req=(HttpServletRequest)Proxy.newProxyInstance(PreparationBoundaryChecks.class.getClassLoader(),new Class[]{HttpServletRequest.class},(p,m,args)->switch(m.getName()){
   case "getHeader"->switch((String)args[0]){case "Host"->"localhost:8787";case "X-AICRM-Contract"->"record-corrections-handoff-results-1";case "X-AICRM-Preparation-Contract"->capability?"preparation-1":null;default->null;};
   case "getRequestURI"->path;case "getContentLengthLong"->length;case "getMethod"->"POST";default->null;});
  var res=(HttpServletResponse)Proxy.newProxyInstance(PreparationBoundaryChecks.class.getClassLoader(),new Class[]{HttpServletResponse.class},(p,m,args)->{if(m.getName().equals("setStatus")||m.getName().equals("sendError"))status[0]=(int)args[0];if(m.getName().equals("getWriter"))return new PrintWriter(new StringWriter());return null;});
  f.doFilter(req,res,(a,b)->chained[0]=true);return chained[0]?200:status[0];
 }
 public static void main(String[] args)throws Exception{
  var db=new DB();var w=new W(db);var a=new LinkedHashMap<String,Object>();a.put("x",Map.of("z",1,"a",2));a.put("y",3);Object result=Map.of("objectType","commitment-preparation","id","prep-a","commitmentId","c-a");
  w.command("synthetic","same-key-123","preparation-create/c-a",a,actor->result);check(db.writes==1);
  var b=new LinkedHashMap<String,Object>();b.put("y",3);b.put("x",new LinkedHashMap<>(Map.of("a",2,"z",1)));
  w.command("synthetic","same-key-123","preparation-create/c-a",b,actor->{throw new AssertionError("replayed business");});check(db.writes==1&&w.authorized==1);
  try{w.receipt("synthetic","same-key-123",null);throw new AssertionError();}catch(Workflow.Problem p){check(p.status==426);}
  w.receipt("synthetic","same-key-123","preparation-1");check(w.authorized==2);w.allowed=false;
  try{w.receipt("synthetic","same-key-123","preparation-1");throw new AssertionError();}catch(Workflow.Problem p){check(p.status==404);}
  check(boundary("/api/v2/commitments/c-a/preparation",65536,true)==200);
  check(boundary("/api/v2/commitments/c-a/preparation",65537,true)==413);
  check(boundary("/api/v2/visits/record",16385,true)==413);
  check(boundary("/api/v2/commitments/c-a/preparation",100,false)==426);
  check(boundary("/api/v2/commitments/c-a/preparation",-1,true)==411);
  System.out.println("PreparationBoundaryChecks: canonical replay, old-client426, current-scope reauthorization and 5 size/capability branches passed; JDBC/HTTP proxies, no service or database");
 }
}
