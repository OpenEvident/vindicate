import { postToExtension } from "../../lib/bridge";
import { MODE_CARDS } from "../../lib/modeContent";

const BUILD = MODE_CARDS.find((m) => m.id === "build")!;
const SOON_CARDS = MODE_CARDS.filter((m) => m.id !== "build");

export function ModeSelectionPanel() {
  const confirm = () => {
    postToExtension({ type: "onboarding:selectMode", mode: "build" });
  };

  return (
    <div className="vindicate-msp-root">
      <p className="vindicate-fp-section-label">WHERE IS THIS PROJECT STARTING FROM?</p>

      <p className="vindicate-screen-hint">
        <span className="vindicate-mono-label">RECOMMENDATION</span>
        Pick the mode that matches the state of this codebase today. You can switch modes later from
        the Vindicate panel.
      </p>

      {/* Build — the available mode */}
      <div className="vindicate-msp-featured">
        <div className="vindicate-msp-featured-head">
          <div className="vindicate-msp-featured-icon" aria-hidden>
            B
          </div>
          <div className="vindicate-msp-featured-title">
            <span className="vindicate-msp-mode-name">
              {BUILD.id.charAt(0).toUpperCase() + BUILD.id.slice(1)}
            </span>
          </div>
          <span className="vindicate-vpill vindicate-vpill--green" style={{ marginLeft: "auto" }}>
            AVAILABLE
          </span>
        </div>

        <p className="vindicate-msp-featured-desc">{BUILD.headline}</p>

        <ul className="vindicate-msp-bullets">
          {BUILD.symptoms.map((s) => (
            <li key={s} className="vindicate-msp-bullet">
              <span className="vindicate-msp-bullet-dot" aria-hidden />
              {s}
            </li>
          ))}
        </ul>

        <div className="vindicate-msp-vindicate-starts">
          <span className="vindicate-mono-label">VINDICATE STARTS BY</span>
          <p className="vindicate-msp-starts-text">{BUILD.vindicateStarts}</p>
        </div>

        <button type="button" className="vindicate-msp-cta" onClick={confirm}>
          Start with Build →
        </button>
      </div>

      {/* Coming soon modes */}
      <div className="vindicate-msp-soon-grid">
        {SOON_CARDS.map((m) => (
          <div key={m.id} className="vindicate-msp-soon-card" aria-disabled="true">
            <div className="vindicate-msp-soon-head">
              <div className="vindicate-msp-soon-icon" aria-hidden>
                {m.id.charAt(0).toUpperCase()}
              </div>
              <span className="vindicate-msp-soon-badge">SOON</span>
            </div>
            <div className="vindicate-msp-soon-name">
              {m.id.charAt(0).toUpperCase() + m.id.slice(1)}
            </div>
            <div className="vindicate-msp-soon-desc">{m.headline}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
