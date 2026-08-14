function statusDotClass(state: "up" | "down" | "unknown"): string {
  if (state === "up") return "vindicate-status-dot vindicate-status-dot--green";
  if (state === "down") return "vindicate-status-dot vindicate-status-dot--red";
  return "vindicate-status-dot vindicate-status-dot--gray";
}

export function ServiceStatusItem({
  label,
  state
}: {
  label: string;
  state: "up" | "down" | "unknown";
}) {
  return (
    <span className="vindicate-service-status">
      <span className={statusDotClass(state)} aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export function ServiceStatusRow({
  runtime,
  mcp
}: {
  runtime: "up" | "down" | "unknown";
  mcp: "up" | "down" | "unknown";
}) {
  return (
    <div className="vindicate-service-status-row">
      <ServiceStatusItem label="Runtime" state={runtime} />
      <ServiceStatusItem label="MCP" state={mcp} />
    </div>
  );
}
