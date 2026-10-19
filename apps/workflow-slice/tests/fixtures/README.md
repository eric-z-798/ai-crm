# Synthetic legacy-schema fixture

`schema-93cf1d3.sql` is the unchanged schema from this repository at commit
`93cf1d3e32231f5baba0d1f54bf40e1ef47bb27e`, path
`apps/workflow-slice/backend/src/main/resources/schema.sql`.

It contains table definitions and synthetic demonstration identities only. It contains no real customer records or credentials. The atomic runner initializes a new local test database with this old schema and explicit synthetic rows, then starts the current backend to verify data-preserving schema changes and old receipt compatibility. It never attaches to an existing database.

The legacy fixture is test input, not a supported production rollback script. Any source update must be explicit and separately reviewed.

Exact fixture SHA-256: `63e87ca7c95aa0da1f699222c27e2f18426b78b07f344ad0a5095c80e101b2c6`.
