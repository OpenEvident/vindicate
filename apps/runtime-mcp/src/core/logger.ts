/**
 * @file MCP root logger — import only after {@link config} is loaded.
 */
import { createVindicateLogger, type Logger } from "@vindicate/observability";

import { config } from "./config.js";

export const logger: Logger = createVindicateLogger({
  service: "runtime-mcp",
  level: config.LOG_LEVEL,
  ...(config.VINDICATE_LOG_FILE !== undefined ? { logFile: config.VINDICATE_LOG_FILE } : {})
});
