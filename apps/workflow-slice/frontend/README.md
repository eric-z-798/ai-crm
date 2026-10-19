# Representative workflow frontend

Vue 3 and TypeScript frontend for the paired local Java/PostgreSQL workflow slice. It records manual decisions, not AI inference.

From this directory:

```sh
npm ci
npm test
npm run dev
```

`npm test` runs 118 pure-domain/DTO/event-draft cases, strict Vue/TypeScript plus Vite build, and 14 built-Vue mocked-API JSDOM scenarios. The paired actual-API suites are run from the parent directory with `npm run test:ui-api` and `npm run test:business-regressions`; the runner starts a fresh synthetic server/database and provides its API address.

The editor retains the full communication text, optional actual occurrence day and manually reviewed declarations. Local draft retention explicitly says it has not been sent to the server. Server recording saves the communication and commitments together. The personal-commitment view is independent of communication day; progress, reply facts and completion remain distinct.

Event drafts retain their editing-time scope. Refresh cannot silently apply old text to a newer promise. A late reply requires an explicit content-revision choice. Main/held recovery bytes and old pending requests are retained; storage failure blocks new POSTs rather than sending an unrecoverable request. Session storage is not a cross-device durable draft service and cannot survive the user clearing all browser data.

Both languages preserve user text. History uses readable event/time/state labels. Relative dates require manual reference-day review; no date is inferred from words such as “tomorrow.”

The default Vite proxy targets loopback port 8787. Do not use synthetic demo identities with real data. JSDOM passing does not establish browser/mobile layout or visual acceptance. Old frontend test files remain as historical references; only the named current package scripts are advertised as current passing suites.
