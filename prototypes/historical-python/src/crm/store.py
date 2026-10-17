"""SQLite prototype storage. Composite tenant foreign keys; no claim of PostgreSQL RLS."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
import uuid


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def future(days=1):
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat(timespec="seconds").replace("+00:00", "Z")


def uid(prefix):
    return f"{prefix}-{uuid.uuid4().hex[:20]}"


def dump(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS actors (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
 role TEXT NOT NULL, team_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
 active INTEGER NOT NULL DEFAULT 1, permission_version INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY (tenant_id,id));
CREATE TABLE IF NOT EXISTS hcos (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
 team_id TEXT NOT NULL, owner_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,owner_id) REFERENCES actors(tenant_id,id));
CREATE TABLE IF NOT EXISTS missions (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, hco_id TEXT NOT NULL,
 owner_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL,
 PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,hco_id) REFERENCES hcos(tenant_id,id),
 FOREIGN KEY (tenant_id,owner_id) REFERENCES actors(tenant_id,id));
CREATE TABLE IF NOT EXISTS visits (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, hco_id TEXT NOT NULL,
 owner_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL,
 PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,hco_id) REFERENCES hcos(tenant_id,id),
 FOREIGN KEY (tenant_id,owner_id) REFERENCES actors(tenant_id,id));
CREATE TABLE IF NOT EXISTS plans (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, hco_id TEXT NOT NULL,
 mission_id TEXT NOT NULL, visit_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL,
 PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,hco_id) REFERENCES hcos(tenant_id,id),
 FOREIGN KEY (tenant_id,mission_id) REFERENCES missions(tenant_id,id),
 FOREIGN KEY (tenant_id,visit_id) REFERENCES visits(tenant_id,id),
 FOREIGN KEY (tenant_id,owner_id) REFERENCES actors(tenant_id,id));
CREATE TABLE IF NOT EXISTS tasks (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, hco_id TEXT NOT NULL,
 mission_id TEXT NOT NULL, visit_id TEXT, owner_id TEXT NOT NULL,
 plan_id TEXT, action_id TEXT, version INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL,
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,plan_id,action_id),
 FOREIGN KEY (tenant_id,hco_id) REFERENCES hcos(tenant_id,id),
 FOREIGN KEY (tenant_id,mission_id) REFERENCES missions(tenant_id,id),
 FOREIGN KEY (tenant_id,visit_id) REFERENCES visits(tenant_id,id),
 FOREIGN KEY (tenant_id,plan_id) REFERENCES plans(tenant_id,id),
 FOREIGN KEY (tenant_id,owner_id) REFERENCES actors(tenant_id,id));
CREATE TABLE IF NOT EXISTS events (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, hco_id TEXT NOT NULL,
 mission_id TEXT NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY (tenant_id,id), FOREIGN KEY (tenant_id,mission_id) REFERENCES missions(tenant_id,id),
 FOREIGN KEY (tenant_id,hco_id) REFERENCES hcos(tenant_id,id));
CREATE TABLE IF NOT EXISTS runs (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, hco_id TEXT NOT NULL,
 mission_id TEXT NOT NULL, event_id TEXT NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,mission_id,event_id),
 FOREIGN KEY (tenant_id,mission_id) REFERENCES missions(tenant_id,id),
 FOREIGN KEY (tenant_id,hco_id) REFERENCES hcos(tenant_id,id),
 FOREIGN KEY (tenant_id,event_id) REFERENCES events(tenant_id,id));
CREATE TABLE IF NOT EXISTS audit (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, hco_id TEXT,
 actor_id TEXT NOT NULL, action TEXT NOT NULL, resource_id TEXT,
 outcome TEXT NOT NULL, request_id TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY (tenant_id,id));
CREATE TABLE IF NOT EXISTS idempotency (
 tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL, key TEXT NOT NULL,
 fingerprint TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY (tenant_id,actor_id,key));
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit
 BEGIN SELECT RAISE(ABORT, 'audit is append-only in this application'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit
 BEGIN SELECT RAISE(ABORT, 'audit is append-only in this application'); END;
"""


class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript(SCHEMA)
            self._seed(db)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=10000")
        return db

    @contextmanager
    def transaction(self):
        db = self.connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _seed(self, db):
        if db.execute("SELECT 1 FROM actors LIMIT 1").fetchone():
            return
        actors = [
            ("tenant-a", "rep-a", "演示客户经理 · 林澄", "sales_rep", "north", "demo-rep-a"),
            ("tenant-a", "manager-a", "演示团队经理 · 周宁", "sales_manager", "north", "demo-manager-a"),
            ("tenant-a", "reader-a", "演示只读 · 许禾", "reader", "north", "demo-reader-a"),
            ("tenant-a", "rep-south", "南区演示客户经理", "sales_rep", "south", "demo-rep-south"),
            ("tenant-a", "rep-peer", "北区其他演示负责人", "sales_rep", "north", "demo-rep-peer"),
            ("tenant-b", "rep-b", "租户B演示客户经理", "sales_rep", "north", "demo-rep-b"),
        ]
        db.executemany("INSERT INTO actors (tenant_id,id,name,role,team_id,token) VALUES (?,?,?,?,?,?)", actors)
        hcos = [
            ("tenant-a", "hco-a", "示例澄明医院（虚构）", "north", "rep-a"),
            ("tenant-a", "hco-south", "示例南湾医院（虚构）", "south", "rep-south"),
            ("tenant-a", "hco-peer", "示例北辰医院（虚构）", "north", "rep-peer"),
            ("tenant-b", "hco-b", "示例澄明医院（虚构）", "north", "rep-b"),
        ]
        db.executemany("INSERT INTO hcos (tenant_id,id,name,team_id,owner_id) VALUES (?,?,?,?,?)", hcos)
        for tenant, hid, _, _, owner in hcos:
            suffix = hid.removeprefix("hco-")
            mid, vid = f"mission-{suffix}", f"visit-{suffix}"
            mission = {"goalType": "INTERNAL_FOLLOW_UP", "businessPurpose": "COMMERCIAL", "timezone": "Asia/Shanghai", "title": "落实医院拜访后的内部承诺", "successCriteria": "跟进事项有负责人、期限和完成说明；外部结果需另行核验。", "status": "ACTIVE", "deadlineAt": future(14), "triggerTypes": ["visit.recorded", "task.completed"], "maxRuns": 10, "runCount": 0, "approvalMode": "EXPLICIT_CONFIRMATION", "createdAt": now(), "updatedAt": now(), "outcomes": []}
            visit = {"occurredAt": now(), "purpose": "内部资料准备进度沟通", "notes": "已确认后续需要整理药企客户协作资料清单。全部为虚构的机构业务记录。", "followUp": {"title": "整理药企客户协作资料清单", "ownerId": owner, "dueDate": future(2)[:10]}, "createdAt": now(), "updatedAt": now(), "status": "SUBMITTED"}
            db.execute("INSERT INTO missions (tenant_id,id,hco_id,owner_id,data) VALUES (?,?,?,?,?)", (tenant, mid, hid, owner, dump(mission)))
            db.execute("INSERT INTO visits (tenant_id,id,hco_id,owner_id,data) VALUES (?,?,?,?,?)", (tenant, vid, hid, owner, dump(visit)))


def record(row):
    if row is None:
        return None
    result = dict(row)
    payload = json.loads(result.pop("data", "{}"))
    result = {"".join([part if i == 0 else part.title() for i, part in enumerate(k.split("_"))]): v for k, v in result.items()}
    result.update(payload)
    return result
