# Historical local workflow prototype

Preserved for regression reference; not the production product or the latest user-interface design.

Requires Python 3.12 or newer. Uses only the Python standard library.

From this directory:

```sh
PYTHONPATH=src python -m unittest discover -s tests -v
PYTHONPATH=src python -m crm.app --db .runtime/crm.sqlite --port 8765
```

Open http://127.0.0.1:8765. The visible demo identities and demo-prefixed tokens are intentionally public fictional test fixtures, not authentication credentials. The server binds to loopback and rejects production and real-model modes. Keep those restrictions.

The historical flow covers explicit internal commitments, proposals requiring confirmation, idempotent task creation, permission boundaries and audit records. Completion of an internal task is not proof of an external business outcome. This old flow does not implement the current independent preparation/recording/handoff validation design.

Verification on 2026-10-17: 47 Python regression tests passed on a clean copy, and `node --check src/crm/static/app.js` passed. These checks do not constitute visual acceptance, real-model verification or production readiness.
