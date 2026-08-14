/**
 * @file Worker root logger — only `main.ts` should import this module after {@link config} is loaded.
 */
import { createVindicateLogger, type Logger } from "@vindicate/observability";

import { config } from "./config.js";

export const logger: Logger = createVindicateLogger({
  service: "runtime-worker",
  level: config.LOG_LEVEL,
  ...(config.VINDICATE_LOG_FILE !== undefined ? { logFile: config.VINDICATE_LOG_FILE } : {})
});
