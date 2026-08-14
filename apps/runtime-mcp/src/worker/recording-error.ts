export class WorkerRecordingError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly bodyText: string
  ) {
    super(bodyText);
    this.name = "WorkerRecordingError";
  }
}

export function mapRecordingError(err: unknown): { error: string; message: string } {
  if (err instanceof WorkerRecordingError) {
    const messages: Record<string, string> = {
      session_not_found:
        "The session ID wasn't found. Create a session with browser_create_session first.",
      session_not_active: "The session isn't active. Resume or recreate it before recording.",
      recording_not_found: "No active recording for this session.",
      recording_invalid: "The saved recording failed validation."
    };
    return {
      error: err.code,
      message: messages[err.code] ?? `Recording failed: ${err.bodyText}`
    };
  }
  return {
    error: "recording_failed",
    message: err instanceof Error ? err.message : "Recording failed"
  };
}

export async function readWorkerRecordingError(res: Response): Promise<WorkerRecordingError> {
  const text = await res.text().catch(() => "");
  let code = "recording_failed";
  try {
    const body = JSON.parse(text) as { error?: string };
    if (typeof body.error === "string" && body.error.length > 0) {
      code = body.error;
    }
  } catch {
    /* ignore */
  }
  return new WorkerRecordingError(code, res.status, text);
}
