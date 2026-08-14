---
feature: smoke
status: approved
version: 1
generated: 2026-05-23
last_updated: 2026-05-23
layer: ui
source:
  - template
---

# Smoke Check — application reachability

Verify that the application responds at the configured base URL without authentication.

**Persona**
anonymous visitor — no credentials required

# Feature

- [FA-00-1] Application is reachable at the configured base URL

# Acceptance Criteria

AC-1: Application is reachable at the configured base URL

## Happy Path [AC-1]
Given the application server is running
When a visitor opens the app at the base URL
Then a valid page response is returned

# Out of Scope

- Authenticated flows
- Page content assertions
- Navigation

# Change Log

- 2026-05-23: created as scaffold smoke check (template)
