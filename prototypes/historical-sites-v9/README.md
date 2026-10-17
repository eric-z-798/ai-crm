# Historical v9 frontend source

This is the reproducible frontend source of an earlier hosted prototype, preserved for traceability. It is not the new product design, a production release, or a complete deployable service.

Rebuild with Python 3: `python build.py`. This creates `dist/` and `static-assets.mjs`. The rebuilt app.js SHA-256 is `e2ec5a01df52a3d05a3a1bf72b98c314fd39aebb66e71b6ffc47b4847091fc8f`, matching the historical v9 frontend artifact. Reproduction and JavaScript syntax checks were rerun on 2026-10-17.

The frontend expects a compatible authenticated durable-storage API. Its server, cloud deployment settings, credentials, stored workspace data, private reports and migration snapshots are deliberately excluded. Opening the generated files without the API does not provide the hosted application's persistence or authentication. Do not reuse this as a production deployment package.

Included fixtures are fictional demonstration content. Simulator outputs do not represent real-model results or verified business outcomes. No current visual acceptance is asserted.
