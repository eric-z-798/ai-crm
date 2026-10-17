# AICRM synthetic workflow frontend

Vue 3 + TypeScript, built for the local Java/PostgreSQL slice. Only fictional data and public demo fixture identities (`demo-rep`, `demo-manager`). This is not production authentication, a real enterprise deployment or an integrated AI product.

## Run

- `npm ci --cache /tmp/crm-npm-cache`
- `npm run build`
- `npm run dev` binds **127.0.0.1:5173**, strictly; `/api` proxies to **127.0.0.1:8787**.
- `npm run test:dom` runs the production bundle inside JSDOM with mock API contracts.
- `npm test` runs headless Chromium contract tests; requires Chromium that can open its local IPC sockets.
- `node tests/dom-real-smoke.mjs` runs the built Vue UI against the actual running Vite+backend, using JSDOM and real fetch. All services must share the same network environment.
- `node tests/ui-real-smoke.mjs` is the actual browser equivalent and captures desktop/mobile screenshots when Chromium is supported.

## Implemented subset

Task-first representative workspace: create, save, resume and explicitly confirm an immutable recorded interaction. Handoff is separately optional; synthetic fixed recipient `manager-a` is displayed. Manager must explicitly receive, then separately accept responsibility. Viewing a request does not change its state.

Chinese/English UI changes only labels. Original content and saved state survive switching. Draft text and pending requests recover from same-tab sessionStorage; failures to store locally are disclosed. Local recovery is not server persistence. Cached content is not displayed before an initial successful access check. P62: a 401/403 clears all displayed/server-loaded state and pauses operations. Unsubmitted draft text, handoff text and unresolved intents are moved to a separate, invisible same-tab recovery entry. Recovery requires a newly successful context/list check with the same identity; record-linked drafts additionally require that record to remain visible in the current authorized list. A successful list refresh also reconciles the selected record and current identity; a missing selected record or changed identity hides the editor and isolates any unsubmitted edits. Otherwise the entry stays isolated and is not rendered. A new manual draft can resume only for the same verified identity. Session storage remains a synthetic-demo recovery mechanism, not production encrypted storage. In-flight save receipts do not overwrite newer edits or falsely clear dirty state. Conflicts preserve text and require explicit review/rebase. Uncertain writes retain an idempotency key and are looked up before the retry action; only an explicit not-found result permits replay with the original key. A pending confirm keeps the reviewed fields locked until its outcome is resolved. No forced tasks or automatic handoffs.

AI panel states honestly that product AI is unavailable and continues manual editing of the same draft; it has no fake generation endpoint.

## Verification boundary

Strict TypeScript and Vite production build passed. Built-bundle mocked DOM contract tests passed for original-text language retention, delayed response/newer text preservation, stale conflict/rebase, lost-response command recovery without duplicate writes, immutable explicit confirmation, optional handoff and received/accepted separation.

Chromium startup was attempted but the command sandbox denied required local IPC sockets. Escalated execution was also blocked by environment startup. Therefore this frontend author has **not** verified real browser visual layout, screenshots, 200% zoom, screen readers, mobile device behavior or IME composition. Playwright tests are provided but not claimed passed. Parent integration may separately run actual backend tests; their evidence must be retained separately.

Broader CRM capabilities, historical-record correction flow, identity/tenant production security, real AI, medical approval, export, server-side draft autosave, multiple tabs conflict UX and all-role/full-scope product validation are not delivered by this slice.
