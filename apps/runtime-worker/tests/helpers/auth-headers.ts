import { config } from "../../src/core/config.js";

export function internalAuthHeaders(): Record<string, string> {
  return { "x-vindicate-internal-key": config.VINDICATE_INTERNAL_KEY };
}
