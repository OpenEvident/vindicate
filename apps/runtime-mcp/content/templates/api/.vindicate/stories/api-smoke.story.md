---
feature: api-smoke
status: approved
version: 1
generated: 2026-05-23
last_updated: 2026-05-23
layer: api
source:
  - template
---

# Smoke Check — API reachability

Verify that the API responds at the configured base URL without authentication.

**Persona**
unauthenticated client — no credentials required

# Feature

- [FA-00-2] API is reachable at the configured base URL

# Acceptance Criteria

AC-1: API is reachable at the configured base URL

## Happy Path [AC-1]
Given the API server is running
When a client requests the API at the base URL
Then a response is returned proving the host is reachable

# Out of Scope

- Authenticated endpoints
- Response body assertions
- Specific endpoint behavior

# Change Log

- 2026-05-23: created as scaffold smoke check (template)
