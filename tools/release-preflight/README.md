# New local release-evidence preflight candidate

Release ID: CRM-PREFLIGHT-NEW-20261020-C
Author: /root/recover_crm_candidate
Baseline: eric-z-798/ai-crm commit 07d0243c3bdd4491b735af66a4f40ed8d42f2688, work/java-vue-postgres-slice-20261017.

This is a NEW tooling candidate, not the recovered October 19 preflight, not the complete CRM rebuild, and not a production or business UI delivery. The prior 20-test author claim is not reused. Existing business source is unchanged. Scope: deterministic, offline, read-only validation of a manually assembled release-evidence packet.

## Run
Requires Node 24; no npm packages, credentials, network, service startup, or database.

node --test src/release-preflight.test.mjs
node src/release-preflight.mjs example-blocked.json .

Exit 2 indicates blocked/invalid input. Exit 0 means only declared evidence fields and local file hashes are structurally consistent. It NEVER means authorized to deploy. Both outputs contain deploymentAuthorized=false and publicDeploymentSupported=false.

## Evidence format
schemaVersion=1; nonempty releaseId/scope/author; exact 40-hex commit; completeReconstruction=false; dataClass=synthetic; authMode=demo-local; target=loopback-only. artifacts contains relative paths and 64-hex SHA256 values. gates contains requirements, product, qa, experience, operations, each with status/releaseId/commit/scope/executor/checkedAt/evidence/evidenceSha256. Each gate must identify locally hash-verified evidence. Product/QA/experience reviewer differs from author, and PM differs from QA.

The tool does not establish that names are genuine people, evidence is truthful, approval exists, or a gate actually passed. Human/agent architecture review of the actual evidence remains required. Source commit verification is a separate connector operation and is not inferred from text typed into this manifest. No external inputs are fetched. It does not read credential files.

## Coverage and current gates
- D07 / P01-P62 / N01-N12 coverage: release ID, exact commit and explicit scope binding support the existing requirement mapping; full requirement implementation and coverage remain OPEN.
- D08 / D09: same-target named PM/QA/experience evidence and declared author independence are required, but substantive acceptance and identity verification remain human review responsibilities.
- CRM-ARCH 1.2.0 release gates: five evidence categories, on-disk bytes, target restrictions, explicit non-production state. Real runtime/visual/identity/persistence/rollback acceptance is NOT performed by this tool.
- Existing demo-local source retains loopback restrictions; this tool refuses a public target. No changes to LocalBoundary.java, database, application.properties, or app UI.

## Publication status
Candidate only. Independent same-version PM/QA pending when authored. No application deployment, main merge, server purchase, or persistent access change. A repository commit may save this tool only after same-version reviews; it would not publish the app.

## Remaining product blockers
Actual authenticated deployment, persistent operations/backup/restore, full reconstruction, desktop/mobile browser acceptance, real identity directory and product model integration remain separate work. Tencent login awaits the owner's existing handoff. This tool removes reliance on an unlocatable old test claim; it does not remove those product gaps.

## Revision B
A is preserved unchanged. B fixes declared reviewer identifier aliases (NFKC, trim and lowercase comparison), rejects impossible calendar dates and malformed/out-of-range times or timezone offsets, and returns both false deployment flags for invalid/null manifests. Identifier normalization remains declaration checking, not real identity verification. All B reviews must bind the B manifest.

## Revision C
B is preserved unchanged. CLI usage and manifest read/parse errors now emit BLOCKED JSON with both deployment flags false and exit 2. No manifest content or input path is included in error output. CLI output contract is covered by child-process regression tests. C requires fresh same-version independent review.
