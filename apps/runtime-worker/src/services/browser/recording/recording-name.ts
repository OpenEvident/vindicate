/** Normalized key for comparing recording slugs without case sensitivity. */
export function recordingSlugKey(safeName: string): string {
  return safeName.toLowerCase();
}

/** Strips characters that are invalid in filenames on Windows and POSIX. */
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
