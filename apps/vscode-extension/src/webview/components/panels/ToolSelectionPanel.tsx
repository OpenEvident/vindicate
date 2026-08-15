import { useState, type ReactElement } from "react";
import { postToExtension } from "../../lib/bridge";
import { EMPTY_SELECTED_TOOLS } from "../../lib/types";
import { TOOL_OPTIONS } from "../../lib/toolContent";
import { useOnboardingStore } from "../../stores/onboardingStore";
import { ToolBrandIcon } from "../shared/ToolBrandIcon";

type ToolKey = keyof typeof EMPTY_SELECTED_TOOLS;

const FILES_BY_TOOL: Record<ToolKey, string[]> = {
  cursor: [".cursor/mcp.json", ".cursor/rules/vindicate.mdc"],
  claudeCode: ["CLAUDE.md", ".claude/settings.json"],
  vscode: [".vscode/mcp.json"],
  antigravity: [".agents/mcp_config.json", ".agents/AGENTS.md", ".agents/skills/vindicate/SKILL.md"]
};

const AGENT_ICONS: Record<ToolKey, { bg: string; el: ReactElement }> = {
  cursor: {
    bg: "#000",
    el: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M3 3 L21 13 L11.5 21 L3 3 Z" fill="#ffffff" />
        <path d="M3 3 L11.5 12 L11.5 21 L3 3 Z" fill="#ffffff" opacity="0.55" />
      </svg>
    )
  },
  claudeCode: {
    bg: "#d97757",
    el: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        aria-hidden
      >
        <line x1="12" y1="3.2" x2="12" y2="20.8" />
        <line x1="3.2" y1="12" x2="20.8" y2="12" />
        <line x1="5.8" y1="5.8" x2="18.2" y2="18.2" />
        <line x1="5.8" y1="18.2" x2="18.2" y2="5.8" />
      </svg>
    )
  },
  vscode: {
    bg: "#0a0a0a",
    el: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="3.5" r="0.9" fill="#fff" />
        <path d="M12 4 L12 5.6" stroke="#fff" strokeWidth="1.3" />
        <path
          d="M4 13c0-3.4 3.6-6 8-6s8 2.6 8 6v3c0 1.2-1 2-2.2 2-1 0-1.8-.6-2-1.6-.4 1-1.4 1.6-2.6 1.6h-2.4c-1.2 0-2.2-.6-2.6-1.6-.2 1-1 1.6-2 1.6C5 18 4 17.2 4 16v-3z"
          fill="#fff"
        />
        <circle cx="9.2" cy="13.5" r="1.1" fill="#0a0a0a" />
        <circle cx="14.8" cy="13.5" r="1.1" fill="#0a0a0a" />
      </svg>
    )
  },
  antigravity: {
    bg: "#1a1a2e",
    el: <ToolBrandIcon brand="antigravity" />
  }
};

function AgentCard({
  toolKey,
  label,
  hint,
  detected,
  checked,
  locked,
  files,
  onToggle
}: {
  toolKey: ToolKey;
  label: string;
  hint: string;
  detected: boolean;
  checked: boolean;
  locked: boolean;
  files: string[];
  onToggle: () => void;
}) {
  const icon = AGENT_ICONS[toolKey];
  const dimmed = !detected && !checked;

  return (
    <div
      className={[
        "vindicate-agent-card",
        checked ? "vindicate-agent-card--checked" : "",
        dimmed ? "vindicate-agent-card--undetected" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="vindicate-agent-card-head">
        <div
          className="vindicate-agent-icon-wrap"
          style={{ background: icon.bg, opacity: detected || checked ? 1 : 0.55 }}
          aria-hidden
        >
          {icon.el}
        </div>
        <div className="vindicate-agent-info">
          <div className={`vindicate-agent-name${dimmed ? " vindicate-agent-name--dim" : ""}`}>
            {label}
          </div>
          <div className="vindicate-agent-desc">{hint}</div>
        </div>
        {detected ? (
          <span className="vindicate-vpill vindicate-vpill--green">
            <span className="vindicate-vpill-dot" aria-hidden />
            DETECTED
          </span>
        ) : (
          <span className="vindicate-vpill vindicate-vpill--dashed">Not detected</span>
        )}
      </div>

      <div className="vindicate-agent-card-body">
        <div className="vindicate-agent-files-label">
          {checked ? "Will write to this project" : "Would write (skipped)"}
        </div>
        {files.length > 0 && (
          <div
            className={`vindicate-agent-files-tree${!checked ? " vindicate-agent-files-tree--dim" : ""}`}
          >
            {files.map((f) => (
              <div
                key={f}
                className={`vindicate-agent-file${!checked ? " vindicate-agent-file--struck" : ""}`}
              >
                <span className="vindicate-agent-file-arrow" aria-hidden>
                  └
                </span>
                {f}
              </div>
            ))}
          </div>
        )}
        <label className="vindicate-agent-checkbox-row">
          <input
            type="checkbox"
            checked={checked}
            disabled={locked}
            onChange={onToggle}
            className="vindicate-agent-checkbox"
            aria-label={`Use ${label} on this project`}
          />
          <span
            className={
              checked ? "vindicate-agent-checkbox-label--active" : "vindicate-agent-checkbox-label"
            }
          >
            Use {label} on this project
          </span>
          <span
            className={`vindicate-agent-checkbox-status${checked ? " vindicate-agent-checkbox-status--on" : ""}`}
          >
            {locked ? "Configured ✓" : checked ? "✓ Will configure" : "Skipped"}
          </span>
        </label>
      </div>
    </div>
  );
}

export function ToolSelectionPanel() {
  const detected = useOnboardingStore((s) => s.detectedTools);
  const confirmedTools = useOnboardingStore((s) => s.confirmedTools);
  const setConfirmedTools = useOnboardingStore((s) => s.setConfirmedTools);
  const screen = useOnboardingStore((s) => s.screen);

  const isRevisit = screen !== "toolSelection";

  // In revisit mode, initialise from confirmed tools (additive-only).
  // First-time: detected tools pre-checked.
  const initial = confirmedTools ?? {
    cursor: detected.cursor,
    claudeCode: detected.claudeCode,
    vscode: detected.vscode,
    antigravity: detected.antigravity
  };
  const [tools, setTools] = useState(initial);

  const toggle = (key: ToolKey) => {
    // Additive only when revisiting — cannot uncheck already-confirmed tools.
    if (isRevisit && confirmedTools?.[key]) return;
    setTools((t) => ({ ...t, [key]: !t[key] }));
  };

  const selectedCount = Object.values(tools).filter(Boolean).length;
  const fileCount = TOOL_OPTIONS.reduce(
    (acc, { key }) => (tools[key] ? acc + FILES_BY_TOOL[key].length : acc),
    0
  );

  const detectedOptions = TOOL_OPTIONS.filter((o) => detected[o.key]);
  const undetectedOptions = TOOL_OPTIONS.filter((o) => !detected[o.key]);

  const confirm = () => {
    setConfirmedTools(tools);
    postToExtension({ type: "onboarding:confirmTools", tools });
  };

  return (
    <div className="vindicate-screen-padded">
      <div className="vindicate-tsp-header">
        <p className="vindicate-fp-section-label">WHICH AGENTS ARE YOU USING ON THIS PROJECT?</p>
      </div>

      <p className="vindicate-screen-hint">
        <span className="vindicate-mono-label">RECOMMENDATION</span>
        {isRevisit
          ? "You can add more agents. Already-configured agents cannot be removed here — use the Config tab."
          : "Uncheck agents you don't use here to keep your project tree clean."}
      </p>

      <div className="vindicate-agent-list" role="group" aria-label="AI tools">
        {detectedOptions.map(({ key, label, hint }) => (
          <AgentCard
            key={key}
            toolKey={key}
            label={label}
            hint={hint}
            detected
            checked={tools[key]}
            locked={isRevisit && (confirmedTools?.[key] ?? false)}
            files={FILES_BY_TOOL[key]}
            onToggle={() => toggle(key)}
          />
        ))}
        {undetectedOptions.map(({ key, label, hint }) => (
          <AgentCard
            key={key}
            toolKey={key}
            label={label}
            hint={hint}
            detected={false}
            checked={tools[key]}
            locked={isRevisit && (confirmedTools?.[key] ?? false)}
            files={FILES_BY_TOOL[key]}
            onToggle={() => toggle(key)}
          />
        ))}
      </div>

      <div className="vindicate-screen-actions">
        <button
          type="button"
          className="vindicate-btn-primary w-full"
          disabled={selectedCount === 0}
          onClick={confirm}
        >
          {selectedCount === 0
            ? "Choose at least one agent to continue"
            : `Configure ${selectedCount} agent${selectedCount === 1 ? "" : "s"} · write ${fileCount} files →`}
        </button>
      </div>
    </div>
  );
}
