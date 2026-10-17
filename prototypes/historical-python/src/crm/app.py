"""Local-only synthetic prototype HTTP adapter. Never use this fixture auth in production."""
from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import parse_qs, urlsplit

from .domain import CRM, DomainError, fail, schema
from .store import Store, uid

STATIC = Path(__file__).parent / "static"


def context(crm, token, deployment):
    with crm.store.connect() as db:
        actor=crm.actor(db,token)
    return {"actor":crm.public_actor(actor),"tenant":{"id":actor["tenantId"],"displayName":"演示制药企业 "+actor["tenantId"][-1].upper()},
            "timezone":"Asia/Shanghai","businessPurpose":"COMMERCIAL","runtimeLevel":"prototype","deploymentMode":deployment,"persistence":"sqlite",
            "authentication":"synthetic_fixture_not_production_auth","ai":{"mode":"stub","routeAlias":"stub-v1","externalCallsEnabled":False},
            "capabilities":{"durableEventWorker":False,"synchronousVisitTrigger":True,"databaseRlsVerified":False,"documentRag":False,"externalMessaging":False,"autoPolicyExecution":False,"proactiveNotifications":False,"realModelIntegration":False,"externalOutcomeVerification":False}}


def create_server(db_path, port=8765, deployment="demo"):
    if deployment not in ("demo","private-demo") or os.environ.get("AI_PROVIDER_MODE","stub") != "stub":
        raise ValueError("Only demo/private-demo and AI_PROVIDER_MODE=stub are supported; production and real models fail closed.")
    crm=CRM(Store(db_path),allowed_tenant="tenant-a" if deployment=="private-demo" else None)

    class Handler(BaseHTTPRequestHandler):
        server_version="SyntheticCRM/0.1"

        def log_message(self, fmt, *args):
            # No request body, token, query string or sensitive content in access logs.
            sys.stderr.write(f"{self.command} {getattr(self, 'response_status', '-')}\n")

        def send(self,status,body,content_type="application/json; charset=utf-8"):
            data=body if isinstance(body,bytes) else json.dumps(body,ensure_ascii=False).encode()
            self.response_status=status
            self.send_response(status)
            self.send_header("Content-Type",content_type)
            self.send_header("Content-Length",str(len(data)))
            self.send_header("Cache-Control","no-store")
            self.send_header("X-Content-Type-Options","nosniff")
            self.send_header("Referrer-Policy","no-referrer")
            self.send_header("X-Frame-Options","DENY")
            self.send_header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
            self.send_header("X-Request-Id",body.get("requestId",uid("request")) if isinstance(body,dict) else uid("request"))
            self.end_headers()
            self.wfile.write(data)

        def process(self):
            request_id=uid("request")
            try:
                allowed_hosts={f"127.0.0.1:{self.server.server_port}",f"localhost:{self.server.server_port}"}
                if self.headers.get("Host") not in allowed_hosts:
                    fail("HOST_NOT_ALLOWED","演示只允许本机访问。",403)
                origin=self.headers.get("Origin")
                if origin and origin not in {"http://"+host for host in allowed_hosts}:
                    fail("ORIGIN_NOT_ALLOWED","跨站请求已阻断。",403)
                parsed=urlsplit(self.path)
                path=parsed.path
                if self.command=="GET" and path in ("/","/app.js","/style.css"):
                    name={"/":"index.html","/app.js":"app.js","/style.css":"style.css"}[path]
                    mime={"/":"text/html; charset=utf-8","/app.js":"text/javascript; charset=utf-8","/style.css":"text/css; charset=utf-8"}[path]
                    return self.send(200,(STATIC/name).read_bytes(),mime)
                if self.command=="GET" and path in ("/health/live","/api/v1/health/live"):
                    return self.send(200,{"status":"UP","runtimeLevel":"prototype","mode":"stub"})
                if self.command=="GET" and path in ("/health/ready","/api/v1/health/ready"):
                    with crm.store.connect() as db:
                        db.execute("SELECT 1 FROM actors LIMIT 1").fetchone()
                    return self.send(200,{"status":"READY","persistence":"sqlite","mode":"stub"})
                if self.command=="GET" and path=="/api/v1/demo-identities":
                    return self.send(200,{"items":crm.identities(),"notice":"公开的合成演示身份，不是真实身份认证。"})
                auth=self.headers.get("Authorization","")
                if not auth.startswith("Bearer "):
                    fail("UNAUTHENTICATED","请选择演示身份。",401)
                token=auth[7:]
                with crm.store.connect() as db:
                    crm.actor(db,token)
                if self.command=="GET":
                    return self.get_api(path,parse_qs(parsed.query),token)
                if self.command not in ("POST","PATCH"):
                    fail("METHOD_NOT_ALLOWED","不支持此请求方式。",405)
                if self.headers.get("Content-Type","").split(";")[0]!="application/json":
                    fail("UNSUPPORTED_MEDIA_TYPE","只接受 application/json。",415)
                try:
                    length=int(self.headers.get("Content-Length","0"))
                except ValueError:
                    fail("INVALID_BODY","请求大小无效。")
                if length<0 or length>16384:
                    fail("PAYLOAD_TOO_LARGE","演示请求上限为 16 KiB。",413)
                try:
                    body=json.loads(self.rfile.read(length))
                except (ValueError,UnicodeError):
                    fail("INVALID_JSON","请求不是有效 JSON。")
                if not isinstance(body,dict):
                    fail("INVALID_SCHEMA","请求必须是 JSON 对象。")
                result=self.write_api(path,token,body,self.headers.get("Idempotency-Key"))
                self.send(200 if result.get("replayed") or self.command=="PATCH" else 201,result)
            except DomainError as exc:
                self.send(exc.status,{"type":"urn:crm:error:"+exc.code.lower().replace("_","-"),"title":exc.message,"status":exc.status,"code":exc.code,"detail":exc.message,"requestId":request_id,"retryable":False,"fieldErrors":[]},"application/problem+json; charset=utf-8")
            except Exception:
                self.send(500,{"type":"urn:crm:error:internal","title":"操作未完成。请刷新核对结果；没有成功回执时不能视为完成。","status":500,"code":"INTERNAL_ERROR","requestId":request_id},"application/problem+json; charset=utf-8")

        def get_api(self,path,query,token):
            if path=="/api/v1/context":
                return self.send(200,context(crm,token,deployment))
            if path=="/api/v1/bootstrap":
                return self.send(200,{**crm.bootstrap(token),"context":context(crm,token,deployment)})
            if path=="/api/v1/ai/models":
                return self.send(200,{"items":[{"alias":"stub-v1","label":"本地规则模拟（未连接真实模型）","mode":"stub","available":True,"externalCalls":False}]})
            tablemap={"hcos":"hcos","missions":"missions","visits":"visits","tasks":"tasks","ai/plans":"plans","agent-runs":"runs","audit-events":"audit"}
            for route,table in tablemap.items():
                base="/api/v1/"+route
                if path==base:
                    data=crm.bootstrap(token)[table]
                    if query.get("search"):
                        needle=query["search"][0].casefold()
                        data=[r for r in data if needle in (r.get("title",r.get("name",""))).casefold()]
                    try:
                        limit=int(query.get("limit",["20"])[0]);offset=int(query.get("cursor",["0"])[0])
                        if not 1<=limit<=100 or offset<0:
                            raise ValueError
                    except ValueError:
                        fail("INVALID_PAGINATION","limit 必须为 1 至 100，cursor 为非负整数。")
                    return self.send(200,{"items":data[offset:offset+limit],"nextCursor":str(offset+limit) if offset+limit<len(data) else None,"total":len(data)})
                if path.startswith(base+"/") and "/" not in path[len(base)+1:]:
                    if table=="audit":
                        item=next((a for a in crm.bootstrap(token)["audit"] if a["id"]==path[len(base)+1:]),None)
                        if not item: fail("NOT_FOUND","记录不存在或无访问权限。",404)
                        return self.send(200,item)
                    return self.send(200,crm.get(token,table,path[len(base)+1:]))
            match=re.fullmatch(r"/api/v1/missions/([^/]+)/(timeline|runs)",path)
            if match:
                mission=crm.get(token,"missions",match[1]);data=crm.bootstrap(token)
                items=[x for x in data["events" if match[2]=="timeline" else "runs"] if x["missionId"]==mission["id"]]
                return self.send(200,{"items":items,"outcomes":mission["outcomes"] if match[2]=="timeline" else [],"truncated":False})
            match=re.fullmatch(r"/api/v1/hcos/([^/]+)/context",path)
            if match:
                hco=crm.get(token,"hcos",match[1]);data=crm.bootstrap(token)
                subset={t:[x for x in data[t] if x["hcoId"]==hco["id"]] for t in ("visits","tasks","missions")}
                return self.send(200,{"hco":hco,**{t:v[:20] for t,v in subset.items()},"truncated":any(len(v)>20 for v in subset.values()),"departments":[],"hcps":[],"masterDataImplemented":False})
            fail("NOT_FOUND","此演示接口不存在。",404)

        def write_api(self,path,token,body,key):
            if self.command=="POST" and path=="/api/v1/missions": return crm.create_mission(token,body,key)
            if self.command=="POST" and path=="/api/v1/visits": return crm.create_visit(token,body,key)
            if self.command=="POST" and path=="/api/v1/tasks": return crm.create_task(token,body,key)
            if self.command=="POST" and path=="/api/v1/ai/plans": return crm.generate_plan(token,body,key)
            match=re.fullmatch(r"/api/v1/ai/plans/([^/]+)/(confirm|reject|revise)",path)
            if self.command=="POST" and match:
                return getattr(crm,{"confirm":"confirm_plan","reject":"reject_plan","revise":"revise_plan"}[match[2]])(token,match[1],body,key)
            match=re.fullmatch(r"/api/v1/missions/([^/]+)/(pause|resume|cancel)",path)
            if self.command=="POST" and match:
                schema(body,("expectedVersion",),("reason",))
                return crm.change_mission(token,match[1],{**body,"status":{"pause":"PAUSED","resume":"ACTIVE","cancel":"CANCELLED"}[match[2]]},key)
            match=re.fullmatch(r"/api/v1/missions/([^/]+)/runs",path)
            if self.command=="POST" and match:
                schema(body,("visitId",),("message","modelAlias"))
                return crm.generate_plan(token,{**body,"missionId":match[1]},key)
            match=re.fullmatch(r"/api/v1/visits/([^/]+)",path)
            if self.command=="PATCH" and match: return crm.update_visit(token,match[1],body,key)
            match=re.fullmatch(r"/api/v1/tasks/([^/]+)",path)
            if self.command=="PATCH" and match: return crm.complete_task(token,match[1],body,key)
            if path.startswith("/api/v1/"):
                fail("CAPABILITY_NOT_IMPLEMENTED","此能力尚未实现；没有产生执行效果。",501)
            fail("NOT_FOUND","此演示接口不存在。",404)

        do_GET=process
        do_POST=process
        do_PATCH=process
        do_DELETE=process
        do_OPTIONS=process

    server=ThreadingHTTPServer(("127.0.0.1",port),Handler)
    server.crm=crm
    return server


def main():
    parser=argparse.ArgumentParser(description="Local synthetic pharmaceutical CRM prototype")
    parser.add_argument("--db",default=".runtime/crm.sqlite")
    parser.add_argument("--port",type=int,default=8765)
    parser.add_argument("--deployment-mode",default="demo",choices=["demo","private-demo"])
    args=parser.parse_args()
    server=create_server(args.db,args.port,args.deployment_mode)
    print(f"Synthetic prototype only: http://127.0.0.1:{server.server_port} | SQLite | stub-v1 | {args.deployment_mode}",flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__=="__main__":
    main()
