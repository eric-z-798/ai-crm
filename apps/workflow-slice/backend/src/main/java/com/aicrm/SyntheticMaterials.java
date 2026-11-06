package com.aicrm;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import java.util.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Fixed public synthetic reading fixture, not approved or official material. No writes. */
final class SyntheticMaterials {
    static final int RESPONSE_LIMIT=985;
    static final List<Map<String,Object>> VERSIONS=load();
    private static List<Map<String,Object>> load(){
        try(var stream=SyntheticMaterials.class.getResourceAsStream("/synthetic-materials.json")){
            var values=new ObjectMapper().readValue(stream,new TypeReference<List<Map<String,Object>>>(){});
            if(values.size()!=2)throw new IllegalStateException("Catalog shape");
            for(var v:values){
                if(!v.keySet().equals(Set.of("materialId","versionId","title","sourceType","buildSource","plainText","sha256"))||!"synthetic".equals(v.get("sourceType")))throw new IllegalStateException("Catalog fields");
                var hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(((String)v.get("plainText")).getBytes(StandardCharsets.UTF_8)));
                if(!hash.equals(v.get("sha256")))throw new IllegalStateException("Catalog hash");
            }
            return values.stream().map(Map::copyOf).toList();
        }catch(Exception e){throw new ExceptionInInitializerError(e);}
    }
    static List<Map<String,Object>> entries(){return VERSIONS.stream().map(v->{var x=new LinkedHashMap<String,Object>(v);x.remove("plainText");return (Map<String,Object>)x;}).toList();}
    static Map<String,Object> version(String material,String version){return VERSIONS.stream().filter(v->v.get("materialId").equals(material)&&v.get("versionId").equals(version)).findFirst().orElseThrow(()->new Workflow.Problem(404,"MATERIAL_NOT_FOUND"));}
}
