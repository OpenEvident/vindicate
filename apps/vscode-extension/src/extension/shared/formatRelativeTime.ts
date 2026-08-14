export function formatRelativeTime(isoString: string, nowMs: number): string {
  const diffMs = nowMs - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const d = new Date(isoString);
  const today = new Date(nowMs);
  const isYesterday =
    today.getDate() - d.getDate() === 1 &&
    today.getMonth() === d.getMonth() &&
    today.getFullYear() === d.getFullYear();
  if (isYesterday) {
    return `Yesterday · ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }
  return d.toLocaleDateString();
}
