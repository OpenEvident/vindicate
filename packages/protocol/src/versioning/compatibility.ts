/**
 * Per-consumer supported protocol version ranges for deploy-time compatibility checks.
 */
import { PROTOCOL_VERSION } from "./protocol.js";

/** Vindicate component that consumes `@vindicate/protocol` schemas at a boundary. */
export type ProtocolConsumer = "runtime-mcp" | "runtime-worker";

/** Declared min/max protocol versions each consumer is built and tested against. */
export const PROTOCOL_COMPATIBILITY_MATRIX: Readonly<
  Record<ProtocolConsumer, { minProtocolVersion: string; maxProtocolVersion: string }>
> = {
  "runtime-mcp": { minProtocolVersion: "1.0.0", maxProtocolVersion: PROTOCOL_VERSION },
  "runtime-worker": { minProtocolVersion: "1.0.0", maxProtocolVersion: PROTOCOL_VERSION }
};

/**
 * Ensures `protocolVersion` lies within the consumer's supported range.
 *
 * @throws {Error} When the version is outside the matrix entry for `consumer`.
 */
export function assertConsumerCompatibility(
  consumer: ProtocolConsumer,
  protocolVersion: string
): void {
  const range = PROTOCOL_COMPATIBILITY_MATRIX[consumer];
  if (protocolVersion < range.minProtocolVersion || protocolVersion > range.maxProtocolVersion) {
    throw new Error(
      `Protocol version ${protocolVersion} is outside supported range for ${consumer} (${range.minProtocolVersion}..${range.maxProtocolVersion})`
    );
  }
}
