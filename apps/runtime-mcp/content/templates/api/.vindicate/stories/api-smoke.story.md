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

# Intent

Verifies the API is reachable at the configured base URL.

# Acceptance Criteria

- [ ] AC-1: API is reachable at the configured base URL

# Scenarios

## Happy Path [AC-1]

- A request to the API's base URL receives a response, proving the host is reachable

# Out of Scope

- Authenticated endpoints
- Response body assertions
- Specific endpoint behavior

# Change Log

- 2026-05-23: created as scaffold smoke check (template)
