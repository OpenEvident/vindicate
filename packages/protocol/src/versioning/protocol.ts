/**
 * Semantic version of the `@vindicate/protocol` contract package.
 */
export const PROTOCOL_VERSION = "1.0.0" as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;

/** Semver bump class when evolving schemas (patch, minor, major). */
export type ProtocolChangeLevel = "patch" | "minor" | "major";

/**
 * Parses `major.minor.patch` strings used in protocol version headers and health checks.
 *
 * @throws {Error} When the string is not a valid three-part semver.
 */
export function parseProtocolVersion(version: string): { major: number; minor: number; patch: number } {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) {
    throw new Error(`Invalid protocol version: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

/**
 * Client is compatible when major matches and client minor is not newer than the server.
 */
export function isCompatibleProtocolVersion(clientVersion: string, serverVersion = PROTOCOL_VERSION): boolean {
  const client = parseProtocolVersion(clientVersion);
  const server = parseProtocolVersion(serverVersion);
  return client.major === server.major && client.minor <= server.minor;
}
