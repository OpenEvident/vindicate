// spec: .vindicate/stories/api-smoke.story.md
import { test, expect } from '@config/api.config';

// scenario: Happy Path
test('[AC-1] should be reachable at the configured base URL', async ({ apiRequest }) => {
  const response = await apiRequest.get('/');
  // Proves the host responds at all (a 4xx is still a coherent response from the real
  // service — many APIs don't map their root path, so this must not require 2xx). A 5xx or a
  // completely unroutable host is what this is actually meant to catch — a wrong BASE_URL/path
  // segment is caught once real client methods exist (see ref-api-codegen-schema's
  // leading_slash_path rule), not here.
  expect(response.status()).toBeLessThan(500);
});
