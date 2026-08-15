export function EmptyDashboardBanner() {
  return (
    <div className="vindicate-empty-banner">
      <div className="vindicate-empty-banner-icon" aria-hidden>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z" />
          <path d="M12 8v4" />
          <circle cx="12" cy="16" r="0.5" fill="currentColor" />
        </svg>
      </div>
      <div className="vindicate-empty-banner-body">
        <p className="vindicate-empty-banner-title">Your workspace is ready</p>
        <p className="vindicate-empty-banner-sub">
          Chat with your AI agent to generate specs, write tests, or explore your codebase.
        </p>
      </div>
    </div>
  );
}
