export const MAX_RECORDING_NAME_LENGTH = 100;

export interface RecordingNameConflict {
  safeName: string;
  existingName: string;
  status: string;
}

export type RecordingNameValidationIssue = "empty" | "too_long" | "no_content" | "conflict";

export interface RecordingNameValidation {
  ok: boolean;
  issue: RecordingNameValidationIssue | null;
  message: string | null;
  conflict: RecordingNameConflict | null;
  sanitizedSlug: string | null;
}

/** Normalized key for comparing recording slugs without case sensitivity. */
export function recordingSlugKey(safeName: string): string {
  return safeName.toLowerCase();
}

/** Matches runtime-worker recording-name sanitization (filesystem-safe slug). */
export function sanitizeRecordingName(name: string): string {
  return (
    name
      // eslint-disable-next-line no-control-regex -- strip control chars invalid in filenames
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "recording"
  );
}

export function findRecordingNameConflict(
  name: string,
  sessions: readonly { safeName: string; name: string; status: string }[]
): RecordingNameConflict | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const safeName = sanitizeRecordingName(trimmed);
  const slugKey = recordingSlugKey(safeName);
  const match = sessions.find(
    (s) => recordingSlugKey(s.safeName) === slugKey && s.status !== "abandoned"
  );
  if (match === undefined) {
    return null;
  }
  return { safeName, existingName: match.name, status: match.status };
}

function hasUsableNameContent(name: string): boolean {
  const stripped = name
    // eslint-disable-next-line no-control-regex -- match sanitizeRecordingName invalid char set
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
  return /[\p{L}\p{N}]/u.test(stripped);
}

export function validateRecordingName(
  name: string,
  sessions: readonly { safeName: string; name: string; status: string }[],
  options?: { requireNonEmpty?: boolean }
): RecordingNameValidation {
  const trimmed = name.trim();
  const requireNonEmpty = options?.requireNonEmpty ?? false;

  if (trimmed.length === 0) {
    if (requireNonEmpty) {
      return {
        ok: false,
        issue: "empty",
        message: "Enter a recording name.",
        conflict: null,
        sanitizedSlug: null
      };
    }
    return { ok: false, issue: null, message: null, conflict: null, sanitizedSlug: null };
  }

  if (trimmed.length > MAX_RECORDING_NAME_LENGTH) {
    return {
      ok: false,
      issue: "too_long",
      message: `Recording name must be ${MAX_RECORDING_NAME_LENGTH} characters or fewer.`,
      conflict: null,
      sanitizedSlug: null
    };
  }

  if (!hasUsableNameContent(trimmed)) {
    return {
      ok: false,
      issue: "no_content",
      message: "Recording name must include at least one letter or number.",
      conflict: null,
      sanitizedSlug: null
    };
  }

  const conflict = findRecordingNameConflict(trimmed, sessions);
  if (conflict !== null) {
    return {
      ok: false,
      issue: "conflict",
      message: formatRecordingNameConflictMessage(conflict),
      conflict,
      sanitizedSlug: sanitizeRecordingName(trimmed)
    };
  }

  return {
    ok: true,
    issue: null,
    message: null,
    conflict: null,
    sanitizedSlug: sanitizeRecordingName(trimmed)
  };
}

export function formatRecordingNameConflictMessage(conflict: RecordingNameConflict): string {
  const statusHint =
    conflict.status === "finalized"
      ? "already exists"
      : conflict.status === "review"
        ? "is in review"
        : conflict.status === "recording"
          ? "is currently recording"
          : "already exists";
  if (conflict.existingName.trim().toLowerCase() === conflict.safeName.replace(/-/g, " ").toLowerCase()) {
    return `A recording named "${conflict.existingName}" ${statusHint}. Choose a different name.`;
  }
  return `A recording with this name already exists as "${conflict.existingName}" (${statusHint}). Choose a different name.`;
}
