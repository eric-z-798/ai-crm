# Local representative workflow integration

This is an un-deployed Java 21 / Spring Boot / Vue 3 / PostgreSQL synthetic workflow slice. It adds manually reviewed personal commitments to communication recording. It is not a full CRM reconstruction, a real-data service, or an accepted production release.

## Scope

- One version-2 command atomically records a communication, its item-by-item manual review, explicitly confirmed personal commitments, histories, internal outbox and an idempotent result receipt.
- Requests and unconfirmed statements remain review facts; they do not create promises. No AI or natural-language extraction runs.
- The original communication and declaration text is retained. Unknown occurrence dates and deadlines remain unknown. Organization text is stored with `organizationId: null`; an organization directory is not implemented.
- Cross-day follow-up separates progress, incoming/outgoing reply facts and completion. New content cannot inherit old verification. Replies explicitly select the relevant content revision and can be recorded after completion without reopening.
- Event drafts bind their original revision/scope. A changed server version requires explicit comparison before rebinding. Session recovery preserves main and held drafts, original legacy bytes and pending requests. A mutation is not sent until its complete recovery state has been written and read back successfully.
- Old v1 server endpoints/rows/receipts remain supported by this paired backend. An old client or binary that requires non-null dates is not guaranteed compatible with new unknown-date records.

## Install and build

Requirements: Node 24, Java 21, Maven 3.9, npm, and Linux x64 for the bundled local PostgreSQL runner. Use ordinary official package registries. No paid service or cloud account is needed.

From this directory:

```sh
npm ci
npm --prefix frontend ci
mvn -f backend/pom.xml package
npm --prefix frontend test
```

On a stripped JDK without the normal release metadata, the tested compiler fallback is:

```sh
mvn -f backend/pom.xml -Dmaven.compiler.release= -Dmaven.compiler.source=21 -Dmaven.compiler.target=21 package
```

Maven currently compiles/packages the Java application but has no separate Java unit-test suite. It must not be reported as a unit-test pass. `npm --prefix frontend test` runs the pure domain/DTO/event-draft tests, strict Vue/TypeScript build and built-bundle JSDOM tests with a mocked API.

## Ordinary business checks with real PostgreSQL

Run each command separately. They create a new `.runtime/atomic-*` database, bind only to loopback, refuse occupied ports and stop their own child services when finished:

```sh
npm run test:atomic
npm run test:ui-api
npm run test:business-regressions
npm run test:runner
```

- `test:atomic`: 22 actual HTTP/PostgreSQL business and preservation scenarios, followed by 3 full Java/PostgreSQL restart scenarios.
- `test:ui-api`: 4 built-Vue/JSDOM scenarios against the actual Spring/PostgreSQL server, including lost-response recovery.
- `test:business-regressions`: 9 targeted recovery/scope/storage/manual-review scenarios against the actual server.
- `test:runner`: 5 ordinary configuration/ownership checks, including invalid settings and occupied API ports.

Node's reported test totals also include parent wrappers. These are ordinary business suites, not a broad security assessment. The historical `check` command remains for reference and is not invoked by these commands.

The reviewed local Host boundary fixes the API port at 8787. The runner rejects a different CRM_API_PORT rather than weakening that boundary. A different PostgreSQL loopback port and a new, nonexistent runtime directory are supported:

```sh
CRM_PG_PORT=55433 npm run test:atomic
CRM_RUN_DIR=/path/to/new-test-directory npm run test:ui-api
```

If a port is occupied, the runner refuses to start and never stops the other listener. Stop only a service you started for this task (Ctrl-C in its terminal); otherwise leave it alone and wait. PostgreSQL may use a different supported port, but the API remains at 8787.

The explicit runtime directory must not already exist. Its parent must exist and be writable. Never point this runner at real data. The runner communicates its fixed API address and selected PostgreSQL port to child tests through environment variables.

## Manual local development

In one terminal run `npm run serve:atomic`; in another run `npm --prefix frontend run dev`. With default ports the frontend is at `http://127.0.0.1:5173`, backend at `http://127.0.0.1:8787`. Stop the service with Ctrl-C. The Vite proxy and reviewed backend boundary both use API port 8787.

Demo identities and local trust authentication are synthetic fixtures. Do not expose these ports, deploy this app with real information, or treat them as production authentication.

## Evidence boundary and remaining work

This source was exercised with the ordinary suites described above. Built-bundle JSDOM tests are not real-browser/mobile visual evidence. Real desktop/mobile task and visual acceptance, complete CRM requirements, a real identity provider, organization directory, production migrations/rollback and operations remain pending. No product-internal AI is present. Wider requirements are not reduced to this slice.

The legacy schema fixture has explicit source attribution under `tests/fixtures/`. Build outputs, dependency folders, runtime databases and logs are excluded from version control. Keep business-source changes and acceptance evidence tied to an exact commit; do not deploy merely because author tests pass.
