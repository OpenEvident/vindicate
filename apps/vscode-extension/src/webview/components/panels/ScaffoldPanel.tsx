import { useState } from "react";
import { McpEnableCallout } from "../shared/McpEnableCallout";
import { postToExtension } from "../../lib/bridge";
import { SCAFFOLD_PROMPT } from "../../lib/prompts";
import { useOnboardingStore } from "../../stores/onboardingStore";

const WATCHED_FILES = [".vindicate/stories/*.story.md", "tests/**/*.spec.ts"];

export function ScaffoldPanel() {
  const onboardingDone = useOnboardingStore((s) => s.onboardingDone);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(SCAFFOLD_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="vindicate-scp-root">
      <p className="vindicate-fp-section-label">SCAFFOLD YOUR PROJECT STRUCTURE</p>

      <p className="vindicate-screen-hint">
        <span className="vindicate-mono-label">HOW THIS WORKS</span>
        Copy the prompt below, paste it into your agent, then watch Vindicate tick each file off as
        it lands on disk.
      </p>

      <McpEnableCallout title="Before you run the prompt" variant="scaffold" attention />

      {/* Prompt card */}
      <div className="vindicate-scp-card">
        {/* Card header */}
        <div className="vindicate-scp-card-head">
          <div className="vindicate-scp-num-badge" aria-hidden>
            1
          </div>
          <div className="vindicate-scp-card-meta">
            <div className="vindicate-scp-card-title">Project setup</div>
            <div className="vindicate-scp-card-sub">Playwright project structure · TypeScript</div>
          </div>
          <span className="vindicate-vpill vindicate-vpill--blue">REQUIRED</span>
        </div>

        {/* Prompt — inset dark box */}
        <div className="vindicate-scp-prompt-box">
          <pre className="vindicate-scp-prompt-text">{SCAFFOLD_PROMPT}</pre>
        </div>

        {/* Action row */}
        <div className="vindicate-scp-actions">
          <button
            type="button"
            className={`vindicate-scp-copy-btn${copied ? " vindicate-scp-copy-btn--copied" : ""}`}
            onClick={() => void copyPrompt()}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="5" y="5" width="9" height="9" rx="1" />
              <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
            </svg>
            {copied ? "✓ Copied" : "Copy"}
          </button>

          {!onboardingDone && (
            <button
              type="button"
              className="vindicate-gs-mark-btn"
              onClick={() => postToExtension({ type: "onboarding:markOnboardingDone" })}
              title="Use if Vindicate can't detect the output files"
            >
              Mark done manually
            </button>
          )}
        </div>

        {/* Watching indicator */}
        {!onboardingDone && (
          <div className="vindicate-scp-watch-list">
            {WATCHED_FILES.map((f) => (
              <div key={f} className="vindicate-scp-watch-row">
                <span className="vindicate-pulse-dot" aria-hidden />
                <span className="vindicate-scp-watch-file">{f}</span>
                <span className="vindicate-shimmer vindicate-scp-watch-status">
                  Waiting for file…
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Done state */}
        {onboardingDone && (
          <div className="vindicate-scp-done-banner">
            <svg
              width="13"
              height="13"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="2,7 5.5,10.5 12,4" />
            </svg>
            Scaffold complete — re-run the prompt any time to regenerate files.
          </div>
        )}

        {/* Expected outputs */}
        <div className="vindicate-scp-outputs">
          <p className="vindicate-scp-outputs-label">Expected outputs:</p>
          {WATCHED_FILES.map((f) => (
            <div key={f} className="vindicate-agent-file">
              <span className="vindicate-agent-file-arrow" aria-hidden>
                └
              </span>
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
