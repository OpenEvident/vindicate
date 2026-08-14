/**
 * @file Periodic worker health probe — marks the client ready when /health succeeds.
 */
import type { IWorkerLifecycle } from "./worker-client.interface.js";

export function startWorkerHealthProbe(
  client: Pick<IWorkerLifecycle, "health" | "markWorkerReady">,
  intervalMs: number
): () => void {
  const probe = async (): Promise<void> => {
    try {
      const h = await client.health();
      if (h.ok) {
        client.markWorkerReady();
      }
    } catch {
      /* retry on next tick */
    }
  };

  void probe();
  const timer = setInterval(() => {
    void probe();
  }, intervalMs);

  return () => {
    clearInterval(timer);
  };
}
