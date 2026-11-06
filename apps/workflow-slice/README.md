# Local representative workflow integration

This is an un-deployed Java 21 / Spring Boot / Vue 3 / PostgreSQL synthetic workflow slice. It adds manually reviewed personal commitments to communication recording. It is not a full CRM reconstruction, a real-data service, or an accepted production release.

## Scope

- One version-2 command atomically records a communication, its item-by-item manual review, explicitly confirmed personal commitments, histories, internal outbox and an idempotent result receipt.
- Requests and unconfirmed statements remain review facts; they do not create promises. No AI or natural-language extraction runs.
- The original communication and declaration text is retained. Unknown occurrence dates and deadlines remain unknown. Organization text is stored with `organizationId: null`; an organization directory is not implemented.
- Cross-day follow-up separates progress, incoming/outgoing reply facts and completion. New content cannot inherit old verification. Replies explicitly select the relevant content revision and can be recorded after completion without reopening.
- Event drafts bind their original revision/scope. A changed server version requires explicit comparison before rebinding. Session recovery preserves main and held drafts, original legacy bytes and pending requests. A mutation is not sent until its complete recovery state has been written and read back successfully.
- Saved communications link to their current personal commitments, including completed ones, and open the exact follow-up/history. A read-only source-communication panel keeps the current event draft unchanged, rejects late or mismatched source results, and returns keyboard focus to its opener. Failed loading is not shown as an empty result.
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

## Record-to-follow-up continuity checks

`npm --prefix frontend test` now also includes 13 targeted built-Vue/JSDOM continuity cases. They exercise same-record links, completed-item history, unchanged event drafts, read failures, late replies, role changes, legacy/invalid associations, language changes and simulated reload. These use a mocked API; do not describe them as browser or database tests.

For the separate native browser check, first install the official Playwright Chromium browser for the pinned frontend dependency, then run:

```sh
cd frontend && npx playwright install chromium && cd ..
npm run test:continuity-browser
```

This uses the existing isolated synthetic PostgreSQL/Java runner and serves the built frontend only at loopback `127.0.0.1:5173`. It refuses an occupied frontend port and closes its own server/browser. The 7 scenario groups cover real one-click record saving, correct source linkage, source read/keyboard return without extra mutations, native same-tab reload, saving the retained progress, completed-item access, and an English 412-pixel viewport. JSON results and internal screenshots are written under the run's `.runtime` directory. Viewport emulation is not a physical-phone test; this does not restart the separately paused 369/390 specialist check.

That continuity increment did not add backend endpoints, schema migrations, real identities, organization-directory integration or AI extraction. P20/P24/P25 are only partially addressed; the complete P01–P62/N01–N12 and 21-group reconstruction, wider visual/accessibility acceptance and production release remain open. Native-browser evidence for this narrow chain does not replace those gates.

## Internal handling results (P45 candidate)

The original P45 increment was independently reviewed on f2313ba. This combined candidate also includes P23 correction; neither standalone review substitutes the combined integration and impact check. This is not a deployed release.

Reception remains SENT / RECEIVED / ACCEPTED. The new version-2 handoff projection separately exposes recorded results, an explicit internal completion declaration, correction requests, and append-only history. Saving a result does not complete anything. Completion references that saved result and requires an explicit confirmation. The requesting representative can read the same object and request a correction without a mandatory second approval. A request does not withdraw completion. The currently authorized recipient manager, whose historical acceptance is cross-checked with the unique acceptance audit and matching receipt, can append a corrected result or withdraw an erroneous completion declaration with a reason. Withdrawal preserves history and restores not-completed semantics; another completion requires a newly saved result after withdrawal. These facts never update customer replies or personal commitments, send external messages, or prove the external statements are true.

GET `/api/v2/handoffs` and `/api/v2/handoffs/{id}` return `internal-handoff` projections. POST `/api/v2/handoffs/{id}/events` accepts `{expectedRevision,event}` with `result-recorded`, `completed`, `correction-requested`, `result-corrected`, or `completion-withdrawn`. Commands preserve the original actor-scoped idempotency key and canonical body, lock the object revision, and atomically append one result event plus receipt/audit/internal-outbox records. Successful historical receipts are not the current projection. Shared reads use the handoff resource, not another actor's command key.

The additive migration creates `handoff_result_events`; it does not rewrite old handoffs, reception states or receipts, or invent results for older rows. Missing, contradictory or changed historical acceptance evidence blocks new manager result writes. No reassignment, proxy manager, identity-provider integration or historical repair route is added. Production migration, rollback with an old binary and dynamic revocation remain separate verification work.

**Client contract change:** every business request to this candidate must send `X-AICRM-Contract: record-corrections-handoff-results-1` (`/api/health` is exempt). Missing/older contracts receive 426 `CLIENT_UPGRADE_REQUIRED` before business processing. The header is compatibility negotiation, not authentication. The paired Vue client sends it; old three-state clients are unsupported and cannot silently load a new business projection. An entirely offline old tab remains only its cached snapshot; this is not a promise of remote cache deletion. Legacy receive/accept and saved receipt bodies retain their original shapes; the new client refreshes the version-2 projection afterward. A 426 in the new client retains pending input/key/body and stops automatic polling rather than silently clearing or converting the command. Existing recovery snapshots are retained and can be checked under the supported client with their original key.

Field length checks and the existing 16-KiB encoded JSON request limit are distinct. JSON escaping can expand a body. Oversized input is rejected with retained text, never truncated. All existing HTTP-test helpers carry the supported header; this edit alone is not evidence that their entire historical suites were rerun.

The dependency-free backend state and acceptance-evidence checks are explicit, not JUnit and not HTTP/authorization tests:

```sh
mvn -f backend/pom.xml package
java -ea -cp backend/target/classes:backend/target/test-classes com.aicrm.HandoffResultsChecks
```

Use the documented source/target compiler fallback on stripped JDKs. These checks include missing/conflicting audit/receipt fixtures, not runtime account revocation. Candidate-specific UI, permission, migration and preservation results must be bound to exact source/build hashes; the earlier suite counts in this README do not establish this increment's acceptance.

## Correcting a recorded communication (P23)

The owner representative can explicitly correct organization display text, occurrence date (including unknown/null), and original communication text on the same recorded visit. `POST /api/v2/visits/{id}/corrections` accepts exactly `expectedRevision`, `organization`, `occurredOn`, and `notes`, with the existing `Idempotency-Key`. The response is the version-2 public visit. The command checks current role/resource access and the locked revision; one success increments the visit revision and adds a receipt, audit event, and internal outbox event. Exact replay reauthorizes and returns the saved receipt without another correction. The old draft-update/record commands are unchanged.

`GET /api/v2/visits/{id}/history` first authorizes the current visit and returns `{visitId, versions}` in revision order. These are known visit snapshots, including the current row; legacy rows without earlier snapshots do not acquire invented history. Draft snapshots remain labeled as drafts. Corrections retain identity, ownership, status, original creation time and previous recorded text. No new database schema is required.

Existing commitments, their source snapshots, original manual reviews and handoffs remain historical facts: a correction does not regenerate commitments, rewrite replies/progress/completion, re-send handoffs or re-review the new text. The interface separates the current communication and its history from the original saved review and commitment source. Organization text is not a customer-directory reassignment. Manager communication correction, deletion and reversal are outside P23. Internal-handoff completion is a separate P45 object and never follows from a visit correction.

This is a local candidate capability, not a production migration or complete P23 acceptance. Candidate-specific runtime and independent review evidence must be bound separately; earlier test counts above do not establish this new route's acceptance.

## Combined P23 / P45 integration candidate

The standalone P45 header is rejected with 426 by this combined candidate; upgraded clients can safely interpret both old recovery shapes. This source integrates both increments on f2313ba; earlier standalone evidence is provenance, not acceptance of this combined source. The new client retains distinct visit-correction and internal-result drafts in recovery schema 5. Both standalone schema-4 layouts are recognized by their exact field contracts; ambiguous or invalid recovery remains protected rather than guessed. The combined client-contract header is required for all business routes including visit correction/history. A visit correction does not rewrite commitment source snapshots, reviews, handoff requests or handling result history. The current associated visit background can change; immutable referenced result/visit history remains separately readable.

Real authentication/reassignment/revocation, production migration and rollback remain outside local synthetic verification. No production deployment is implied.
