/**
 * @file Graceful shutdown coordination for runtime-mcp.
 */
let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export interface ShutdownDeps {
  readonly closeMcpSessions: () => Promise<void>;
  readonly httpServer: { close: () => Promise<void> };
  readonly stopCloudQueue?: (timeoutMs?: number) => Promise<void>;
  readonly stopWorkerProbe?: () => void;
  readonly drainMs?: number;
}

export async function requestGracefulShutdown(deps: ShutdownDeps): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  const drain = deps.drainMs ?? 2_000;
  await new Promise((resolve) => setTimeout(resolve, drain));
  deps.stopWorkerProbe?.();
  await deps.stopCloudQueue?.(drain);
  await deps.closeMcpSessions();
  await deps.httpServer.close();
}
