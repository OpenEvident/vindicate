/**
 * @file SSE line parser for worker command streams.
 */

export async function* parseSseStream(
  body: ReadableStream<Uint8Array> | null
): AsyncGenerator<Record<string, unknown>> {
  if (body === null) {
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part
          .split("\n")
          .find((l) => l.startsWith("data: "));
        if (line === undefined) {
          continue;
        }
        const json = line.slice(6);
        try {
          yield JSON.parse(json) as Record<string, unknown>;
        } catch {
          /* skip malformed */
        }
      }
    }
    if (buffer.trim().length > 0) {
      const line = buffer
        .split("\n")
        .find((l) => l.startsWith("data: "));
      if (line !== undefined) {
        try {
          yield JSON.parse(line.slice(6)) as Record<string, unknown>;
        } catch {
          /* skip */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
