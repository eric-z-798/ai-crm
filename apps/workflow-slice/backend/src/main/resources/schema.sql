CREATE TABLE IF NOT EXISTS actors (
 id text PRIMARY KEY, tenant text NOT NULL, team text NOT NULL, role text NOT NULL,
 token text UNIQUE NOT NULL, active boolean NOT NULL DEFAULT true
);
INSERT INTO actors(id,tenant,team,role,token) VALUES
 ('rep-a','tenant-a','team-a','REP','demo-rep'),
 ('manager-a','tenant-a','team-a','MANAGER','demo-manager'),
 ('rep-b','tenant-b','team-b','REP','demo-other-tenant'),
 ('rep-peer','tenant-a','team-a','REP','demo-peer'),
 ('manager-other-team','tenant-a','team-z','MANAGER','demo-other-team')
ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS visits (
 id text PRIMARY KEY, tenant text NOT NULL, team text NOT NULL, owner_id text NOT NULL REFERENCES actors(id),
 revision integer NOT NULL CHECK(revision>0), status text NOT NULL CHECK(status IN ('DRAFT','RECORDED')),
 organization text NOT NULL, occurred_on date NOT NULL, notes text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS handoffs (
 id text PRIMARY KEY, tenant text NOT NULL, team text NOT NULL, visit_id text NOT NULL REFERENCES visits(id),
 owner_id text NOT NULL REFERENCES actors(id), recipient_id text NOT NULL REFERENCES actors(id),
 revision integer NOT NULL CHECK(revision>0), status text NOT NULL CHECK(status IN ('SENT','RECEIVED','ACCEPTED')),
 request text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS command_receipts (
 tenant text NOT NULL, actor_id text NOT NULL REFERENCES actors(id), command_key text NOT NULL,
 request_hash text NOT NULL, response jsonb NOT NULL, command_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,actor_id,command_key)
);
CREATE TABLE IF NOT EXISTS audit_events (
 id bigserial PRIMARY KEY, tenant text NOT NULL, actor_id text NOT NULL, command_key text NOT NULL,
 object_id text NOT NULL, action text NOT NULL, revision integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox (
 id bigserial PRIMARY KEY, tenant text NOT NULL, object_id text NOT NULL, event_type text NOT NULL,
 payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), delivery_status text NOT NULL DEFAULT 'INTERNAL_ONLY'
);
CREATE INDEX IF NOT EXISTS visits_scope ON visits(tenant,team,owner_id);
CREATE INDEX IF NOT EXISTS handoffs_scope ON handoffs(tenant,recipient_id,owner_id);

-- Existing synthetic databases fail closed for receipts made before operation-scope tracking.
ALTER TABLE command_receipts ADD COLUMN IF NOT EXISTS command_type text NOT NULL DEFAULT 'unknown';

-- Additive v2 recording migration. Existing visit rows/receipts keep their original values.
ALTER TABLE visits ALTER COLUMN occurred_on DROP NOT NULL;
CREATE TABLE IF NOT EXISTS visit_history (
 visit_id text NOT NULL REFERENCES visits(id), revision integer NOT NULL,
 snapshot jsonb NOT NULL, captured_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(visit_id,revision)
);
CREATE TABLE IF NOT EXISTS follow_up_reviews (
 visit_id text PRIMARY KEY REFERENCES visits(id), tenant text NOT NULL,
 owner_id text NOT NULL REFERENCES actors(id), review jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS commitments (
 id text PRIMARY KEY, tenant text NOT NULL, team text NOT NULL,
 owner_id text NOT NULL REFERENCES actors(id), visit_id text NOT NULL REFERENCES visits(id),
 revision integer NOT NULL CHECK(revision>0), document jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commitments_scope ON commitments(tenant,team,owner_id);
