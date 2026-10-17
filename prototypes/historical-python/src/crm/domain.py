"""Application services shared by forms, mission events and the conversation simulator."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
from sqlite3 import IntegrityError

from .model import StubGateway
from .store import dump, future, now, record, uid


class DomainError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def fail(code, message, status=400):
    raise DomainError(code, message, status)


def schema(data, required=(), optional=()):
    if not isinstance(data, dict):
        fail("INVALID_SCHEMA", "请求必须是 JSON 对象。")
    extra = set(data) - set(required) - set(optional)
    missing = set(required) - set(data)
    if extra or missing:
        fail("INVALID_SCHEMA", "请求字段不符合接口约束。")


# Defense in depth only: deliberately limited, cannot certify absence of sensitive data.
SENSITIVE = re.compile(r"病历|病例|身份证|诊断|处方|患者|糖尿病|血糖|癌症|不良事件|用药建议|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY|sk-[A-Za-z0-9]{12,}|\b(?:patient|diagnos\w*|prescription|api[_ -]?key|password)\b|(?<!\d)\d{17}[0-9Xx](?!\d)", re.I)


def text_field(value, field, limit=500, required=True):
    if not isinstance(value, str) or (required and not value.strip()) or len(value) > limit:
        fail("INVALID_FIELD", f"{field} 必须是长度 1 至 {limit} 的文本。")
    if SENSITIVE.search(value):
        fail("SENSITIVE_INPUT_BLOCKED", "检测到可能的患者、医疗敏感或凭据内容。请删除；本演示仅允许虚构的机构业务数据。")
    return value.strip()


def date_field(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        fail("INVALID_DATE", "截止日期必须是绝对日期 YYYY-MM-DD，不自动猜测相对日期。")
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        fail("INVALID_DATE", "日期无效。")
    return value


def timestamp(value):
    try:
        if not isinstance(value, str) or not value.endswith("Z"):
            raise ValueError
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        fail("INVALID_DATE", "时间必须是带 Z 的 UTC ISO 时间。")


def resource_id(value):
    if not isinstance(value,str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}",value):
        fail("INVALID_RESOURCE_ID", "记录 ID 必须是有限长度的有效字符串。")
    return value


def version_field(value):
    if type(value) is not int or value < 1:
        fail("INVALID_VERSION", "版本必须为正整数。")
    return value


def digest(value):
    return hashlib.sha256(dump(value).encode()).hexdigest()


class CRM:
    def __init__(self, store, gateway=None, allowed_tenant=None):
        self.store = store
        self.gateway = gateway or StubGateway()
        self.allowed_tenant = allowed_tenant

    def actor(self, db, token):
        row = db.execute("SELECT * FROM actors WHERE token=? AND active=1", (token,)).fetchone()
        if not row or (self.allowed_tenant and row["tenant_id"] != self.allowed_tenant):
            fail("UNAUTHENTICATED", "请选择有效的演示身份。", 401)
        return record(row)

    @staticmethod
    def public_actor(actor):
        return {k: actor[k] for k in ("id", "tenantId", "name", "role", "teamId", "permissionVersion")}

    def identities(self):
        with self.store.connect() as db:
            return [{**self.public_actor(record(r)), "demoToken": r["token"]}
                    for r in db.execute("SELECT * FROM actors WHERE active=1 ORDER BY tenant_id,id")
                    if not self.allowed_tenant or r["tenant_id"] == self.allowed_tenant]

    @staticmethod
    def visible(actor, hco):
        return (hco["tenantId"] == actor["tenantId"] and hco["teamId"] == actor["teamId"]
                and (actor["role"] in ("sales_manager", "reader") or hco["ownerId"] == actor["id"]))

    def hco(self, db, actor, hid, write=False):
        resource_id(hid)
        row = db.execute("SELECT * FROM hcos WHERE tenant_id=? AND id=?", (actor["tenantId"], hid)).fetchone()
        hco = record(row)
        if not hco or not self.visible(actor, hco):
            fail("NOT_FOUND", "记录不存在或无访问权限。", 404)
        if write and actor["role"] not in ("sales_rep", "sales_manager"):
            fail("FORBIDDEN", "当前角色只读，不能执行此动作。", 403)
        return hco

    def entity(self, db, actor, table, rid, write=False):
        resource_id(rid)
        assert table in ("missions", "visits", "plans", "tasks", "events", "runs")
        result = record(db.execute(f"SELECT * FROM {table} WHERE tenant_id=? AND id=?", (actor["tenantId"], rid)).fetchone())
        if not result:
            fail("NOT_FOUND", "记录不存在或无访问权限。", 404)
        self.hco(db, actor, result["hcoId"], write)
        if write and table in ("missions", "visits", "tasks") and actor["role"] != "sales_manager" and result["ownerId"] != actor["id"]:
            fail("FORBIDDEN", "当前角色只能修改本人负责的记录。", 403)
        if table == "plans":
            source = self.entity(db, actor, "visits", result["visitId"])
            mission = self.entity(db, actor, "missions", result["missionId"])
            if source["hcoId"] != result["hcoId"] or mission["hcoId"] != result["hcoId"]:
                fail("NOT_FOUND", "记录不存在或无访问权限。", 404)
        if table == "plans" and result["ownerId"] != actor["id"] and (write or actor["role"] != "sales_manager"):
            fail("NOT_FOUND", "记录不存在或无访问权限。", 404)
        return result

    def public_plan(self, db, actor, plan):
        self.entity(db, actor, "plans", plan["id"])
        visit = self.entity(db, actor, "visits", plan["visitId"])
        mission = self.entity(db, actor, "missions", plan["missionId"])
        hco = self.hco(db, actor, plan["hcoId"])
        current = {"mission": mission["version"], "visit": visit["version"], "hco": hco["version"], "permission": actor["permissionVersion"]}
        plan["contextState"] = "CURRENT" if current == plan["contextVersions"] else "STALE"
        if visit["version"] != plan["source"]["version"]:
            plan["source"] = {**plan["source"], "excerpt": "原证据版本已变更，请刷新提案以查看当前证据。"}
        if timestamp(plan["expiresAt"]) <= datetime.now(timezone.utc):
            plan["contextState"] = "EXPIRED"
        return plan

    @staticmethod
    def touch_hco(db, actor, hid):
        db.execute("UPDATE hcos SET version=version+1 WHERE tenant_id=? AND id=?", (actor["tenantId"], hid))

    @staticmethod
    def save(db, table, entity):
        assert table in ("missions", "visits", "plans", "tasks", "runs")
        base = {"tenantId", "id", "hcoId", "ownerId", "version", "missionId", "visitId", "planId", "actionId", "eventId"}
        data = {k: v for k, v in entity.items() if k not in base}
        entity["version"] += 1
        data["updatedAt"] = now()
        db.execute(f"UPDATE {table} SET version=?,data=? WHERE tenant_id=? AND id=?",
                   (entity["version"], dump(data), entity["tenantId"], entity["id"]))
        entity.update(data)
        return entity

    def audit(self, db, actor, action, resource, request_id, outcome="SUCCESS", hco_id=None, data=None):
        aid = uid("audit")
        db.execute("INSERT INTO audit VALUES (?,?,?,?,?,?,?,?,?,?)", (actor["tenantId"], aid, hco_id, actor["id"], action, resource, outcome, request_id, now(), dump(data or {})))
        return aid

    def mutate(self, token, operation, payload, key, guard, work):
        if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{8,100}", key):
            fail("IDEMPOTENCY_KEY_REQUIRED", "写操作需要 8 至 100 位 Idempotency-Key。")
        fingerprint = digest({"operation": operation, "payload": payload})
        request_id = uid("request")
        actor = None
        try:
            with self.store.transaction() as db:
                actor = self.actor(db, token)
                context = guard(db, actor)  # Even a replay rechecks current resource ACL.
                cached = db.execute("SELECT * FROM idempotency WHERE tenant_id=? AND actor_id=? AND key=?", (actor["tenantId"], actor["id"], key)).fetchone()
                if cached:
                    if cached["fingerprint"] != fingerprint:
                        fail("IDEMPOTENCY_CONFLICT", "此幂等键已用于不同请求，请先核对原结果。", 409)
                    replay=json.loads(cached["response"])
                    if replay.get("plan"):
                        replay["plan"]=self.public_plan(db,actor,self.entity(db,actor,"plans",replay["plan"]["id"]))
                    return {**replay, "replayed": True}
                response = work(db, actor, context, request_id)
                response = {**response, "requestId": request_id, "replayed": response.get("replayed",False)}
                db.execute("INSERT INTO idempotency VALUES (?,?,?,?,?,?)", (actor["tenantId"], actor["id"], key, fingerprint, dump(response), now()))
                return response
        except DomainError as exc:
            if actor:
                with self.store.transaction() as db:
                    self.audit(db, actor, operation, None, request_id, "DENIED", data={"code": exc.code})
            raise

    def bootstrap(self, token):
        with self.store.connect() as db:
            actor = self.actor(db, token)
            hcos = [record(r) for r in db.execute("SELECT * FROM hcos WHERE tenant_id=?", (actor["tenantId"],)) if self.visible(actor, record(r))]
            visible_ids = {h["id"] for h in hcos}
            result = {"actor": self.public_actor(actor), "hcos": hcos,
                      "simulation": {"mode": "stub", "simulated": True, "modelAlias": "stub-v1", "externalCalls": 0, "realModelBudget": 0,
                                     "notice": "规则模拟，无真实模型调用；仅用于验证假设，不代表AI能力或生产就绪。"}}
            for table in ("missions", "visits", "plans", "tasks", "events", "runs"):
                records = [record(r) for r in db.execute(f"SELECT * FROM {table} WHERE tenant_id=? ORDER BY rowid", (actor["tenantId"],)) if r["hco_id"] in visible_ids]
                if table == "plans":
                    records = [p for p in records if p["ownerId"] == actor["id"] or actor["role"] == "sales_manager"]
                    checked = []
                    for plan in records:
                        try:
                            checked.append(self.public_plan(db, actor, plan))
                        except DomainError:
                            pass
                    records = checked
                result[table] = records
            result["audit"] = [record(r) for r in db.execute("SELECT * FROM audit WHERE tenant_id=? ORDER BY rowid DESC LIMIT 500", (actor["tenantId"],))
                               if r["hco_id"] in visible_ids or (r["hco_id"] is None and r["actor_id"] == actor["id"])]
            result["audit"] = result["audit"][:100]
            return result

    def get(self, token, table, rid):
        with self.store.connect() as db:
            actor = self.actor(db, token)
            if table == "hcos":
                return self.hco(db, actor, rid)
            entity = self.entity(db, actor, table, rid)
            return self.public_plan(db, actor, entity) if table == "plans" else entity

    def validate_mission(self, mission):
        if mission["status"] in ("PAUSED", "CANCELLED", "EXPIRED", "SUCCEEDED"):
            fail("MISSION_INACTIVE", "目标已暂停、结束或到期；不会产生新执行。", 409)
        if timestamp(mission["deadlineAt"]) <= datetime.now(timezone.utc):
            fail("MISSION_EXPIRED", "目标已到期，请重新评审目标范围。", 409)

    def create_mission(self, token, body, key):
        schema(body, ("hcoId", "title", "successCriteria", "deadlineAt", "maxRuns"))
        def work(db, actor, hco, request_id):
            title = text_field(body["title"], "目标", 160)
            criteria = text_field(body["successCriteria"], "成功条件", 500)
            end = timestamp(body["deadlineAt"])
            if end <= datetime.now(timezone.utc):
                fail("INVALID_DATE", "目标截止时间必须在未来。")
            if type(body["maxRuns"]) is not int or not 1 <= body["maxRuns"] <= 20:
                fail("INVALID_BUDGET", "模拟检查预算必须在 1 至 20 之间。")
            mid = uid("mission")
            data = {"goalType": "INTERNAL_FOLLOW_UP", "businessPurpose": "COMMERCIAL", "timezone": "Asia/Shanghai", "title": title, "successCriteria": criteria, "deadlineAt": body["deadlineAt"], "maxRuns": body["maxRuns"], "runCount": 0, "status": "ACTIVE", "approvalMode": "EXPLICIT_CONFIRMATION", "triggerTypes": ["visit.recorded", "task.completed"], "createdAt": now(), "updatedAt": now(), "outcomes": []}
            db.execute("INSERT INTO missions (tenant_id,id,hco_id,owner_id,data) VALUES (?,?,?,?,?)", (actor["tenantId"], mid, hco["id"], actor["id"], dump(data)))
            aid = self.audit(db, actor, "mission.activated", mid, request_id, hco_id=hco["id"])
            return {"mission": self.entity(db, actor, "missions", mid), "auditId": aid}
        return self.mutate(token, "mission.create", body, key, lambda db,a: self.hco(db,a,body["hcoId"],True), work)

    def change_mission(self, token, mid, body, key):
        schema(body, ("expectedVersion", "status"), ("reason",))
        def work(db, actor, mission, request_id):
            if version_field(body["expectedVersion"]) != mission["version"]:
                fail("VERSION_CONFLICT", "目标已更新，请刷新后操作。", 409)
            if body["status"] not in ("ACTIVE", "PAUSED", "CANCELLED"):
                fail("INVALID_STATE", "此接口只支持恢复、暂停或取消目标。")
            if mission["status"] in ("CANCELLED", "SUCCEEDED", "EXPIRED"):
                fail("MISSION_INACTIVE", "已结束的目标不能恢复。", 409)
            text_field(body.get("reason", "用户主动调整"), "原因", 300)
            if body["status"] == "ACTIVE" and timestamp(mission["deadlineAt"]) <= datetime.now(timezone.utc):
                fail("MISSION_EXPIRED", "目标已到期，不能恢复。", 409)
            mission["status"] = body["status"]
            self.save(db, "missions", mission)
            aid = self.audit(db, actor, "mission.status_changed", mid, request_id, hco_id=mission["hcoId"], data={"status": body["status"]})
            return {"mission": mission, "auditId": aid}
        return self.mutate(token, f"mission.status:{mid}", body, key, lambda db,a: self.entity(db,a,"missions",mid,True),work)

    def _validate_visit(self, db, actor, hco, body):
        timestamp(body["occurredAt"])
        if timestamp(body["occurredAt"]) > datetime.now(timezone.utc):
            fail("INVALID_DATE", "实际拜访不能记录在未来。")
        data = {"occurredAt": body["occurredAt"], "purpose": text_field(body["purpose"], "拜访目的", 160), "notes": text_field(body["notes"], "事实记录", 2000), "status": "SUBMITTED"}
        fu = body.get("followUp", {})
        schema(fu, (), ("title", "ownerId", "dueDate"))
        if fu:
            for field in ("title", "ownerId", "dueDate"):
                if field in fu and not isinstance(fu[field], str):
                    fail("INVALID_FIELD", "后续事项字段必须是文本。")
            if fu.get("title"):
                text_field(fu["title"], "后续事项", 200)
            if fu.get("dueDate"):
                date_field(fu["dueDate"])
            if fu.get("ownerId"):
                self._assignee(db, actor, hco, fu["ownerId"])
        data["followUp"] = fu
        return data

    def _assignee(self, db, actor, hco, owner):
        resource_id(owner)
        target = record(db.execute("SELECT * FROM actors WHERE tenant_id=? AND id=? AND active=1", (actor["tenantId"], owner)).fetchone())
        if not target or target["role"] not in ("sales_rep", "sales_manager") or not self.visible(target, hco):
            fail("INVALID_ASSIGNEE", "负责人不存在或无目标机构权限。")
        if actor["role"] != "sales_manager" and owner != actor["id"]:
            fail("FORBIDDEN", "当前角色只能创建本人负责的事项。", 403)
        return target

    def create_visit(self, token, body, key):
        schema(body, ("hcoId", "occurredAt", "purpose", "notes"), ("followUp",))
        def work(db, actor, hco, request_id):
            data = {**self._validate_visit(db,actor,hco,body), "createdAt": now(), "updatedAt": now()}
            vid = uid("visit")
            db.execute("INSERT INTO visits (tenant_id,id,hco_id,owner_id,data) VALUES (?,?,?,?,?)", (actor["tenantId"],vid,hco["id"],actor["id"],dump(data)))
            self.touch_hco(db,actor,hco["id"])
            visit = self.entity(db,actor,"visits",vid)
            aid = self.audit(db,actor,"visit.recorded",vid,request_id,hco_id=hco["id"])
            runs = []
            for row in db.execute("SELECT * FROM missions WHERE tenant_id=? AND hco_id=? AND owner_id=?", (actor["tenantId"], hco["id"], actor["id"])).fetchall():
                mission=record(row)
                if mission["status"] not in ("PAUSED","CANCELLED","EXPIRED","SUCCEEDED") and timestamp(mission["deadlineAt"]) > datetime.now(timezone.utc):
                    runs.append(self._run(db, actor, mission, visit, request_id, "visit.recorded"))
            return {"visit": visit, "runs": runs, "auditId": aid}
        return self.mutate(token,"visit.create",body,key,lambda db,a:self.hco(db,a,body["hcoId"],True),work)

    def update_visit(self, token, vid, body, key):
        schema(body,("expectedVersion","occurredAt","purpose","notes"),("followUp",))
        def work(db,actor,visit,request_id):
            if version_field(body["expectedVersion"]) != visit["version"]:
                fail("VERSION_CONFLICT","拜访已更新，请刷新后重试。",409)
            hco=self.hco(db,actor,visit["hcoId"],True)
            data=self._validate_visit(db,actor,hco,body)
            old_version=visit["version"]
            visit.update(data)
            self.save(db,"visits",visit)
            self.touch_hco(db,actor,hco["id"])
            aid=self.audit(db,actor,"visit.corrected",vid,request_id,hco_id=hco["id"],data={"previousVersion":old_version,"newVersion":visit["version"]})
            return {"visit":visit,"auditId":aid}
        return self.mutate(token,f"visit.correct:{vid}",body,key,lambda db,a:self.entity(db,a,"visits",vid,True),work)

    def _event(self, db, actor, mission, event_type, source_id, source_version):
        eid = "event-" + digest({"mission":mission["id"],"type":event_type,"source":source_id,"version":source_version})[:24]
        data={"type":event_type,"sourceId":source_id,"sourceVersion":source_version,"createdAt":now()}
        db.execute("INSERT OR IGNORE INTO events VALUES (?,?,?,?,?)",(actor["tenantId"],eid,mission["hcoId"],mission["id"],dump(data)))
        return eid

    def _run(self, db, actor, mission, visit, request_id, trigger_type, override=None):
        event_type = "visit.recorded" if override is None else "proposal.revised:" + uid("revision")
        eid=self._event(db,actor,mission,event_type,visit["id"],visit["version"])
        prior=record(db.execute("SELECT * FROM runs WHERE tenant_id=? AND mission_id=? AND event_id=?",(actor["tenantId"],mission["id"],eid)).fetchone())
        if prior:
            return prior
        rid=uid("run")
        result={"status":"COMPLETED","mode":"stub","simulated":True,"usage":{"inputTokens":None,"outputTokens":None,"externalCostMinor":0,"basis":"STUB_NO_EXTERNAL_CALL"},"modelAlias":"stub-v1","externalCalls":0,"createdAt":now(),"triggerType":trigger_type,"planId":None,"summary":"","needsClarification":[]}
        if mission["runCount"] >= mission["maxRuns"]:
            result.update(status="BUDGET_EXHAUSTED",summary="模拟检查预算已耗尽，不再生成提案；传统表单仍可用。")
        else:
            mission["runCount"] += 1
            try:
                proposed=self.gateway.propose(visit,actor["id"]) if override is None else {"actions":[{"type":"task.create", **override}], "needsClarification":[], "summary":"用户修订的内部任务提案，重新使用当前证据与权限；仍未执行。"}
                schema(proposed,("actions","needsClarification","summary"))
                if not isinstance(proposed["actions"],list) or len(proposed["actions"]) > 1:
                    fail("MODEL_OUTPUT_INVALID","模拟器输出超出允许动作范围。",422)
                for action in proposed["actions"]:
                    schema(action,("type","title","ownerId","dueDate"))
                    if action["type"]!="task.create":
                        fail("MODEL_OUTPUT_INVALID","模拟器提出未允许的工具。",422)
            except Exception:
                proposed=None
                result.update(status="FAILED",summary="规则模拟器不可用；未创建提案或任务。")
            if proposed:
                result.update(summary=proposed["summary"],needsClarification=proposed["needsClarification"])
                if proposed["actions"]:
                    action=proposed["actions"][0]
                    equivalent=False
                    for row in db.execute("SELECT * FROM tasks WHERE tenant_id=? AND mission_id=? AND visit_id=?",(actor["tenantId"],mission["id"],visit["id"])):
                        task=record(row)
                        if all(task[k]==action[k] for k in ("title","ownerId","dueDate")):
                            equivalent=True
                    if equivalent:
                        result["summary"]="已有同来源、负责人、标题和截止日的任务；没有重复创建提案。"
                    else:
                        hco=self.hco(db,actor,mission["hcoId"],True)
                        self._assignee(db,actor,hco,action["ownerId"])
                        text_field(action["title"],"任务标题",200)
                        date_field(action["dueDate"])
                        mission["status"]="WAITING_APPROVAL"
                        result["status"]="AWAITING_CONFIRMATION"
                        result["planId"]=uid("plan")
            self.save(db,"missions",mission)
            if result["planId"]:
                pid=result["planId"]
                action={**proposed["actions"][0],"id":uid("action"),"hcoId":mission["hcoId"],"missionId":mission["id"],"visitId":visit["id"]}
                frozen={"actions":[action],"contextVersions":{"mission":mission["version"],"visit":visit["version"],"hco":hco["version"],"permission":actor["permissionVersion"]},"expiresAt":(datetime.now(timezone.utc)+timedelta(minutes=15)).isoformat(timespec="seconds").replace("+00:00","Z"),"actorId":actor["id"],"tenantId":actor["tenantId"],"schemaVersion":1}
                plan={"status":"AWAITING_CONFIRMATION","actions":[action],"contextVersions":frozen["contextVersions"],"expiresAt":frozen["expiresAt"],"planHash":digest(frozen),"createdAt":now(),"updatedAt":now(),"mode":"stub","simulated":True,"usage":{"inputTokens":None,"outputTokens":None,"externalCostMinor":0,"basis":"STUB_NO_EXTERNAL_CALL"},"modelAlias":"stub-v1","runId":rid,"source":{"type":"visit","id":visit["id"],"version":visit["version"],"excerpt":visit["notes"]},"receipt":None}
                db.execute("INSERT INTO plans (tenant_id,id,hco_id,mission_id,visit_id,owner_id,data) VALUES (?,?,?,?,?,?,?)",(actor["tenantId"],pid,mission["hcoId"],mission["id"],visit["id"],actor["id"],dump(plan)))
                self.audit(db,actor,"proposal.created",pid,request_id,hco_id=mission["hcoId"],data={"missionId":mission["id"],"runId":rid,"simulated":True})
        db.execute("INSERT INTO runs VALUES (?,?,?,?,?,?)",(actor["tenantId"],rid,mission["hcoId"],mission["id"],eid,dump(result)))
        return self.entity(db,actor,"runs",rid)

    def generate_plan(self, token, body, key):
        schema(body,("missionId","visitId"),("message","modelAlias"))
        def work(db,actor,context,request_id):
            mission,visit=context
            self.validate_mission(mission)
            if body.get("modelAlias","stub-v1") != "stub-v1":
                fail("MODEL_UNAVAILABLE","本原型只支持明确标注的 stub-v1，未接入真实模型。",503)
            if "message" in body:
                text_field(body["message"],"对话输入",1000)
            run=self._run(db,actor,mission,visit,request_id,"user.requested")
            return {"run":run,"plan":self.entity(db,actor,"plans",run["planId"]) if run.get("planId") else None,"simulated":True,"modelAlias":"stub-v1"}
        def guard(db,actor):
            mission=self.entity(db,actor,"missions",body["missionId"],True)
            visit=self.entity(db,actor,"visits",body["visitId"])
            if mission["hcoId"]!=visit["hcoId"]:
                fail("INVALID_RELATION","目标和拜访必须属于同一机构。")
            return mission,visit
        return self.mutate(token,"ai.plan",body,key,guard,work)

    def _create_task(self,db,actor,mission,visit,params,request_id,source,plan_id=None,action_id=None):
        # Both form and proposal paths converge here; no AI-specific write backdoor.
        self.validate_mission(mission)
        hco=self.hco(db,actor,mission["hcoId"],True)
        self._assignee(db,actor,hco,params["ownerId"])
        title=text_field(params["title"],"任务标题",200)
        due=date_field(params["dueDate"])
        if visit and visit["hcoId"]!=mission["hcoId"]:
            fail("INVALID_RELATION","来源拜访与目标机构不一致。")
        tid=uid("task")
        data={"title":title,"dueDate":due,"timezone":"Asia/Shanghai","businessPurpose":"COMMERCIAL","status":"OPEN","source":source,"createdAt":now(),"updatedAt":now(),"completedAt":None,"completionNote":None}
        db.execute("INSERT INTO tasks (tenant_id,id,hco_id,mission_id,visit_id,owner_id,plan_id,action_id,data) VALUES (?,?,?,?,?,?,?,?,?)",(actor["tenantId"],tid,mission["hcoId"],mission["id"],visit["id"] if visit else None,params["ownerId"],plan_id,action_id,dump(data)))
        self.touch_hco(db,actor,hco["id"])
        aid=self.audit(db,actor,"task.created",tid,request_id,hco_id=mission["hcoId"],data={"source":source,"planId":plan_id,"missionId":mission["id"]})
        self._event(db,actor,mission,"task.created",tid,1)
        return {"task":self.entity(db,actor,"tasks",tid),"auditId":aid}

    def create_task(self,token,body,key):
        schema(body,("missionId","title","ownerId","dueDate"),("visitId",))
        def guard(db,actor):
            mission=self.entity(db,actor,"missions",body["missionId"],True)
            visit=self.entity(db,actor,"visits",body["visitId"]) if body.get("visitId") else None
            return mission,visit
        def work(db,actor,context,request_id):
            mission,visit=context
            result=self._create_task(db,actor,mission,visit,body,request_id,"FORM")
            mission["status"]="WAITING_OUTCOME"
            self.save(db,"missions",mission)
            return result
        return self.mutate(token,"task.create",body,key,guard,work)

    def confirm_plan(self,token,pid,body,key):
        schema(body,("planHash","actionIds"))
        def work(db,actor,plan,request_id):
            if plan["status"]=="EXECUTED":
                if body["planHash"]==plan["planHash"] and isinstance(body["actionIds"],list) and body["actionIds"]==plan["receipt"]["executedActionIds"]:
                    tasks=[self.entity(db,actor,"tasks",tid) for tid in plan["receipt"]["taskIds"]]
                    return {"plan":self.public_plan(db,actor,plan),"receipt":plan["receipt"],"tasks":tasks,"replayed":True}
                fail("PLAN_ALREADY_FINAL","已执行提案与本次确认内容不一致。",409)
            if plan["status"]!="AWAITING_CONFIRMATION":
                fail("PLAN_ALREADY_FINAL","提案已处理，请查看原执行回执。",409)
            if not isinstance(body["planHash"],str) or body["planHash"]!=plan["planHash"]:
                fail("PLAN_HASH_MISMATCH","确认内容与原提案不一致。",409)
            if timestamp(plan["expiresAt"])<=datetime.now(timezone.utc):
                fail("PLAN_EXPIRED","提案已过期，必须重新审阅。",409)
            ids=body["actionIds"]
            if not isinstance(ids,list) or not ids or not all(isinstance(x,str) for x in ids) or len(set(ids))!=len(ids) or not set(ids).issubset({a["id"] for a in plan["actions"]}):
                fail("INVALID_ACTION_SELECTION","请选择提案中的有效动作，不可添加或替换参数。")
            mission=self.entity(db,actor,"missions",plan["missionId"],True)
            visit=self.entity(db,actor,"visits",plan["visitId"])
            hco=self.hco(db,actor,plan["hcoId"],True)
            self.validate_mission(mission)
            current={"mission":mission["version"],"visit":visit["version"],"hco":hco["version"],"permission":actor["permissionVersion"]}
            if current!=plan["contextVersions"]:
                fail("STALE_CONTEXT","证据、目标或权限已变化，原提案不可执行，请重新审阅。",409)
            receipts=[]
            for action in plan["actions"]:
                if action["id"] in ids:
                    if action["type"]!="task.create":
                        fail("TOOL_NOT_ALLOWED","此工具不在允许清单内。",403)
                    receipts.append(self._create_task(db,actor,mission,visit,action,request_id,"AI_CONFIRMED",pid,action["id"]))
            receipt={"taskIds":[r["task"]["id"] for r in receipts],"auditIds":[r["auditId"] for r in receipts],"executedActionIds":ids,"executedAt":now(),"confirmedBy":actor["id"]}
            plan.update(status="EXECUTED",receipt=receipt)
            self.save(db,"plans",plan)
            self.finalize_run(db, actor, plan, "COMPLETED")
            mission["status"]="WAITING_OUTCOME"
            self.save(db,"missions",mission)
            self.audit(db,actor,"proposal.confirmed",pid,request_id,hco_id=plan["hcoId"],data={"taskIds":receipt["taskIds"],"planHash":plan["planHash"]})
            return {"plan":plan,"receipt":receipt,"tasks":[r["task"] for r in receipts]}
        return self.mutate(token,f"plan.confirm:{pid}",body,key,lambda db,a:self.entity(db,a,"plans",pid,True),work)

    def reject_plan(self,token,pid,body,key):
        schema(body,("planHash","reason"))
        def work(db,actor,plan,request_id):
            if plan["status"]!="AWAITING_CONFIRMATION":
                fail("PLAN_ALREADY_FINAL","提案已处理。",409)
            if body["planHash"]!=plan["planHash"]:
                fail("PLAN_HASH_MISMATCH","提案已变化。",409)
            reason=text_field(body["reason"],"拒绝原因",300)
            plan.update(status="REJECTED",rejectionReason=reason)
            self.save(db,"plans",plan)
            self.finalize_run(db, actor, plan, "CANCELLED")
            mission=self.entity(db,actor,"missions",plan["missionId"])
            if mission["status"]=="WAITING_APPROVAL":
                mission["status"]="ACTIVE"
                self.save(db,"missions",mission)
            aid=self.audit(db,actor,"proposal.rejected",pid,request_id,hco_id=plan["hcoId"])
            return {"plan":plan,"auditId":aid}
        return self.mutate(token,f"plan.reject:{pid}",body,key,lambda db,a:self.entity(db,a,"plans",pid,True),work)

    def complete_task(self,token,tid,body,key):
        schema(body,("expectedVersion","completionNote"))
        def work(db,actor,task,request_id):
            if version_field(body["expectedVersion"])!=task["version"]:
                fail("VERSION_CONFLICT","任务已更新，请刷新后操作。",409)
            if task["status"]!="OPEN":
                fail("TASK_ALREADY_FINAL","任务已完成，请查看现有结果。",409)
            note=text_field(body["completionNote"],"完成说明",500)
            task.update(status="COMPLETED",completionNote=note,completedAt=now())
            self.save(db,"tasks",task)
            self.touch_hco(db,actor,task["hcoId"])
            mission=self.entity(db,actor,"missions",task["missionId"])
            outcome={"id":uid("outcome"),"type":"INTERNAL_TASK_COMPLETED","taskId":tid,"taskVersion":task["version"],"note":note,"verifiedBy":None,"createdAt":now(),"externalOutcomeVerified":False}
            mission["outcomes"].append(outcome)
            if mission["status"] not in ("PAUSED","CANCELLED","EXPIRED","SUCCEEDED"):
                mission["status"]="WAITING_OUTCOME"
            self.save(db,"missions",mission)
            self._event(db,actor,mission,"task.completed",tid,task["version"])
            aid=self.audit(db,actor,"task.completed",tid,request_id,hco_id=task["hcoId"],data={"outcomeId":outcome["id"],"externalOutcomeVerified":False})
            return {"task":task,"outcome":outcome,"mission":mission,"auditId":aid}
        return self.mutate(token,f"task.complete:{tid}",body,key,lambda db,a:self.entity(db,a,"tasks",tid,True),work)

    def finalize_run(self, db, actor, plan, state):
        row=db.execute("SELECT * FROM runs WHERE tenant_id=? AND id=?",(actor["tenantId"],plan["runId"])).fetchone()
        if row:
            data=json.loads(row["data"])
            data.update(status=state,finishedAt=now())
            db.execute("UPDATE runs SET data=? WHERE tenant_id=? AND id=?",(dump(data),actor["tenantId"],plan["runId"]))

    def revise_plan(self, token, pid, body, key):
        schema(body,("planHash","action"))
        schema(body["action"],("title","ownerId","dueDate"))
        def work(db,actor,plan,request_id):
            if plan["status"]!="AWAITING_CONFIRMATION":
                fail("PLAN_ALREADY_FINAL","提案已处理，不能修改。",409)
            if body["planHash"]!=plan["planHash"]:
                fail("PLAN_HASH_MISMATCH","提案内容已改变。",409)
            mission=self.entity(db,actor,"missions",plan["missionId"],True)
            visit=self.entity(db,actor,"visits",plan["visitId"])
            self.validate_mission(mission)
            if mission["runCount"] >= mission["maxRuns"]:
                fail("BUDGET_EXHAUSTED","模拟检查预算耗尽，仍可使用传统表单。",429)
            plan["status"]="STALE"
            self.save(db,"plans",plan)
            self.finalize_run(db,actor,plan,"CANCELLED")
            run=self._run(db,actor,mission,visit,request_id,"user.revised",body["action"])
            self.audit(db,actor,"proposal.revised",pid,request_id,hco_id=plan["hcoId"])
            return {"run":run,"plan":self.entity(db,actor,"plans",run["planId"]) if run.get("planId") else None,"mode":"stub"}
        return self.mutate(token,f"plan.revise:{pid}",body,key,lambda db,a:self.entity(db,a,"plans",pid,True),work)
