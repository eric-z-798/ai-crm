# AICRM

AICRM is the internal project name. The public product name is not yet selected.

## Repository status

This repository preserves two isolated historical prototypes for traceability:

- `prototypes/historical-sites-v9/`: reproducible frontend source matching an earlier hosted artifact; the server and deployment configuration are excluded.
- `prototypes/historical-python/`: local-only workflow regression prototype.

These sources are not the current product architecture or a production release. The target architecture remains a modular application with Java/Vue/PostgreSQL under evaluation; that stack is not implemented by this prototype.

The Python prototype uses fictional fixtures, SQLite and a deterministic rule simulator, with no real model integration, external messaging or production authentication. The historical hosted frontend expects a separately implemented storage API that is not included. Never use real customer, patient or other sensitive data. Run these reference sources locally; do not expose a runnable demo publicly.

Current agent-and-skill task validation is separate from this historical simulator and from future product model integration.

## License

A software license has not yet been selected. Public repository visibility does not itself grant an open-source license. No license is asserted here.
