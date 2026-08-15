# Security Baseline

This baseline defines minimum controls for Vindicate's local extension, MCP server, browser worker,
and generated project artifacts.

## 1. Secret management

- Never commit secrets to git.
- `.env.example` is for placeholders only.
- Application credentials used by generated tests must come from ignored environment files or CI
  secret stores.
- The extension-managed worker key is machine-local and must not be logged or copied into project
  files.
- Credentials exposed in chat, recordings, traces, or logs must be rotated.

## 2. Local process access

- Runtime services must bind to `127.0.0.1`, never to a public network interface.
- Worker routes require the shared `x-vindicate-internal-key` except documented health/readiness
  probes.
- File access must remain scoped to the MCP session or browser session's validated `project_root`.
- Do not treat loopback binding as permission to weaken path validation or secret redaction.

## 3. Workflow content integrity

- Workflow graphs, nodes, references, and templates are version-controlled repository content.
- Validate bundled workflow content during CI and before packaging.
- Agent configuration writers must update only their documented, workspace-scoped files.
- Generated instructions must not embed credentials or machine-specific secrets.

## 4. Data protection

- Browser sessions, recordings, screenshots, traces, and generated tests remain local unless the
  user explicitly uploads or commits them.
- Session persistence may be encrypted with the supported OS-keyring integration.
- Recording and file routes must reject traversal outside the validated project root.
- Store only the artifacts required for automation, diagnosis, and traceability.

## 5. Secure development controls

- Required quality gates: `lint`, `typecheck`, `test`, `build`.
- Use pinned dependencies via lockfile.
- Run vulnerability scans in CI before merge.
- Protect main branch with mandatory checks and reviews.

## 6. Logging and audit

- Use structured logs with operation and request identifiers where available.
- Redact tokens, credentials, and PII from logs.
- Write diagnostic logs locally and keep stdout available for protocol/subprocess traffic.
- Do not log the worker internal key, browser cookies, authorization headers, or form secrets.

## 7. Incident readiness

- Document how to stop orphaned local runtimes and remove persisted sessions safely.
- Treat leaked test credentials or the worker key as a rotation event.
- Keep release rollback and vulnerable-dependency response procedures documented.
