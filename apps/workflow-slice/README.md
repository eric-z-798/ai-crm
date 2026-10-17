# AICRM local workflow slice

A running **Java 21 / Spring Boot 3.5.6 + Vue 3 / TypeScript + PostgreSQL 18.4** implementation of a narrow synthetic workflow. This directory is separate from the preserved historical Python/Sites prototypes.

## What works

1. A representative records fictional institution, actual date, and original-language notes in one draft.
2. Saving creates a PostgreSQL draft. Resume and edit the same draft; this is not a formal record yet.
3. Explicitly confirm the reviewed, saved revision to create a `RECORDED` record. Confirmation cannot silently replace its text. No task or handoff is created automatically.
4. Optionally send a separate internal request to the configured synthetic manager. It starts `SENT`.
5. Viewing the manager inbox changes nothing. Explicit **receive** changes it to `RECEIVED`; a separate **accept responsibility** changes it to `ACCEPTED`. None of these means an external business result happened.

The UI has Chinese/English labels and keeps business original text unchanged. The same form remains available without AI. **No model is integrated and no agent is called by this application.** Current agent-and-skill evaluations are a separate project activity; this slice does not pretend their output was generated inside the product.

## Run locally

Prerequisites: Linux x64, Java 21 JDK, Maven 3.9+, Node 22.12+ and npm. The embedded PostgreSQL package contains a real local PostgreSQL server, not a database mock. Other operating systems are not supported by this launcher yet.

```sh
npm ci
npm --prefix frontend ci
mvn -f backend/pom.xml clean package
npm --prefix frontend run build
npm run check
npm run demo
```

Open http://127.0.0.1:5173 while `npm run demo` is running. The backend is http://127.0.0.1:8787 and PostgreSQL listens on 127.0.0.1:55432. Ctrl+C stops the processes. Demo data persists under `.runtime/demo/pgdata`; restarting the demo restores it. Tests use a new `.runtime/check-<time>/pgdata` every run and never erase existing demo data.

This is **local synthetic verification**, not a production deployment. Only fictional data is permitted. It uses intentionally public `demo-rep` and `demo-manager` fixture tokens, not production authentication, and loopback-only PostgreSQL trust authentication. A local user can access this synthetic database. Do not expose these ports or reuse these identities for real information.

On the project's stripped cloud Java runtime, `ct.sym` is absent. The verified equivalent build workaround is:

```sh
mvn -f backend/pom.xml package -Dmaven.compiler.release= -Dmaven.compiler.source=21 -Dmaven.compiler.target=21
```

A normal complete JDK should use the default build above. Maven/registry network settings belong to the local environment and are not committed.

## Verification

`npm run check` starts PostgreSQL and Java together, runs real HTTP/database checks, stops both, restarts them, and verifies durable records, handoffs, original receipts and row counts. Tests exercise:

- No authentication, forged fields, invalid dates and input types
- Tenant, team, owner and draft isolation; manager read-only scope
- Current account revocation, including receipt lookup/replay
- Revision conflicts with genuinely concurrent requests
- Concurrent duplicate idempotency keys and changed-payload conflicts
- Immutable confirmed records and independently optional handoff
- Received versus accepted state transitions and unauthorized attempts
- Injected audit failure causing rollback of business, receipt and outbox writes
- Non-superuser application database identity; cross-origin rejection
- Full PostgreSQL and Java process restart and exact receipt recovery

Frontend build: `npm --prefix frontend run build`. The frontend's tests distinguish DOM/mocked-contract checks from the real-browser smoke script. See `frontend/README.md` and test files for their actual scope. Browser visual acceptance must be reported separately; inability to start a browser is not a pass.

For an extra independent test script against the same isolated runtime:

```sh
CRM_EXTRA_CHECK=/absolute/path/to/independent-check.mjs npm run check
```

This executes the additional check before the restart stage. The test administrator is `crm_fixture_admin`; the app itself uses `crm_demo`, which is not superuser, createdb, createrole or bypassrls.

## Review status — 2026-10-17 UTC

This code is preserved on a work/review branch; it is not merged into the main product or deployed publicly. Ordinary Java/Vue builds and the narrow actual Vue-to-Java-to-PostgreSQL workflow have run successfully. The initial backend run covered 27 specific checks plus four full-process-restart checks. Later checks added to the source are not automatically covered by that result.

Independent review identified current-role/team rechecks on handoffs and old command receipts, and the UI input limits. Those code defects were corrected. The interface was also updated for P62: unavailable authorization clears previously loaded server content from view, while unsaved personal work has a guarded, hidden recovery path. This fix still needs final independent acceptance. Final independent acceptance of all fixes remains incomplete. Do not treat an author test, source review or this branch as independent acceptance or production authorization.

Browser startup was unavailable in the verification environment. DOM interaction checks are explicitly not visual, mobile-device, screen-reader or full browser acceptance. Production identity, model integration, external dispatch, full requirement coverage and deployment remain unimplemented or unverified as stated below.

## API and persistence boundary

Each modifying request uses `Idempotency-Key`; the same actor and key with the same operation/payload returns the original receipt. Reusing it with another payload returns 409. Object updates include `expectedRevision`. After an uncertain response, query `/api/commands/{key}` before replaying the same intent. No external provider is invoked.

All mutations, audit events, internal-only outbox entries and command receipts commit in one PostgreSQL transaction. Same-key requests use a transaction advisory lock; object updates use row locks and revision checks. This does not claim end-to-end exactly-once delivery to external systems. No external outbox worker exists.

Identity and scope come from the server-side fixture actor table, not user-supplied roles or tenant fields. Application queries enforce isolation; PostgreSQL RLS is **not implemented or claimed**. Schema initialization is idempotent for this first schema, but production migration, backup, retention and restore operations are not implemented.

## Requirement mapping and limits

- P15–P23 / CP06 / D04: narrow manual record, distinct draft and confirmed record; no invented follow-up. Full clinical/visit-specific fields, not-met plans and historical correction flows remain unimplemented.
- P24–P32 / D04: optional internal handoff with distinct sent, received and accepted endpoints; no external dispatch/outcome.
- P57–P61 / ARCH-S02–S03: transaction, revision, idempotent receipt and process-restart checks for this slice only. ARCH-S04 external-result reconciliation is unimplemented and untested because no external provider/worker exists. Process restart does not establish ARCH-S06 backup restore or upgrade rollback. Browser disconnect and visual acceptance remain distinct tests.
- P62: authorization-dependent display and hidden recovery of unsaved input, with current-record visibility checked before restoring saved-record drafts; final independent acceptance remains outstanding.
- P56: Chinese/English labels and original-text retention in this slice. Full locale, export, date-zone and whole-product internationalization acceptance is outstanding.
- CRM REQ03: a working manual path when model integration is unavailable. No autonomous policies, natural-language inference, agent execution or product model integration in this build.
- CP02/CP08: synthetic application scope enforcement, not enterprise identity assurance or pharmaceutical activity eligibility. Unknown activity qualification is never presented as approved.

This is a functioning engineering slice, not selection of the first production business scenario, proof of customer demand, enterprise validation, measured time savings or whole-product completion. No external communications, real sensitive data, paid service or persistent third-party permission was used. A software license has not been selected; public repository visibility is not an open-source license.
