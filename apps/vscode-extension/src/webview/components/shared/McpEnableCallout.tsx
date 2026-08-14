export type McpEnableCalloutProps = {
  title: string;
  /** Use "scaffold" for onboarding scaffold copy; default is dashboard-oriented. */
  variant?: "default" | "scaffold";
  /** Stronger visual treatment (accent bar, pulse, badge). */
  attention?: boolean;
  dismissible?: boolean;
  onDismiss?: () => void;
};

function CalloutBody({ variant }: { variant: "default" | "scaffold" }) {
  if (variant === "scaffold") {
    return (
      <>
        Make sure <strong>Vindicate MCP</strong> is enabled in your agent&apos;s MCP settings —
        otherwise the prompt won&apos;t have access to Vindicate tools.
      </>
    );
  }
  return (
    <>
      Make sure <strong>Vindicate MCP</strong> is enabled in your agent&apos;s MCP settings —
      otherwise Vindicate tools and live project metrics won&apos;t connect.
    </>
  );
}

function InfoIcon() {
  return (
    <svg
      className="vindicate-mcp-callout-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="8" cy="8" r="7" />
      <line x1="8" y1="5" x2="8" y2="8.5" />
      <circle cx="8" cy="11" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function McpEnableCallout({
  title,
  variant = "default",
  attention = false,
  dismissible = false,
  onDismiss
}: McpEnableCalloutProps) {
  return (
    <div
      className={[
        "vindicate-mcp-callout",
        attention ? "vindicate-mcp-callout--attention" : "",
        dismissible ? "vindicate-mcp-callout--dismissible" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      role="note"
    >
      {attention ? (
        <div className="vindicate-mcp-callout-icon-wrap" aria-hidden>
          <InfoIcon />
          <span className="vindicate-mcp-callout-pulse" />
        </div>
      ) : (
        <InfoIcon />
      )}
      <div className="vindicate-mcp-callout-content">
        <div className="vindicate-mcp-callout-head">
          <div className="vindicate-mcp-callout-title-row">
            {attention && <span className="vindicate-mcp-callout-badge">Action required</span>}
            <p className="vindicate-mcp-callout-title">{title}</p>
          </div>
          {dismissible && onDismiss !== undefined && (
            <button
              type="button"
              className="vindicate-mcp-callout-dismiss"
              onClick={onDismiss}
              aria-label="Hide MCP reminder"
            >
              Hide
            </button>
          )}
        </div>
        <p className="vindicate-mcp-callout-body">
          <CalloutBody variant={variant} />
        </p>
        <p className="vindicate-mcp-callout-hint">
          Cursor · Windsurf → Settings → MCP → Vindicate{" "}
          <span className="vindicate-mcp-callout-on">ON</span>
        </p>
      </div>
    </div>
  );
}
