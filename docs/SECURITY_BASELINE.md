# Security Baseline

This baseline defines minimum controls for all services in this monorepo.

## 1. Secret management

- Never commit secrets to git.
- `.env.example` is for placeholders only.
- Runtime secrets must come from secure stores (cloud secret manager, CI secret vault, OS keychain).
- Production credentials must be rotated and scoped by service role.

## 2. Authentication and authorization

- All control-plane APIs require authenticated requests.
- Access tokens must be short-lived and revocable.
- Every request must carry tenant/org context for authorization checks.
- Entitlements are deny-by-default.

## 3. Proprietary skills protection

- Do not store plaintext proprietary skill packs in repo.
- Deliver skills only through authenticated, metered APIs.
- Enforce scoped access by org, workflow version, and intent.
- Log skill delivery events for audit and abuse detection.

## 4. Data protection

- Encrypt data in transit using TLS 1.2+.
- Encrypt sensitive data at rest.
- Store only metadata required for operations and audit.
- Avoid storing raw customer source code in cloud services by default.

## 5. Secure development controls

- Required quality gates: `lint`, `typecheck`, `test`, `build`.
- Use pinned dependencies via lockfile.
- Run vulnerability scans in CI before merge.
- Protect main branch with mandatory checks and reviews.

## 6. Logging and audit

- Use structured logs with trace IDs and request IDs.
- Redact tokens, credentials, and PII from logs.
- Keep immutable audit trails for auth, entitlement changes, and skill delivery.

## 7. Incident readiness

- Define severity levels and response SLA.
- Maintain runbooks for auth outage, token leak, and key rotation.
- Verify rollback and credential revocation workflows at least quarterly.
