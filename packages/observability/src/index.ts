/**
 * @packageDocumentation
 * Shared observability primitives for Vindicate (structured logging; tracing hooks later).
 */
export type { Logger } from "pino";
export { createVindicateLogger, type VindicateLoggerOptions } from "./create-logger.js";
