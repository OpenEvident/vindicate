import { postToExtension } from "../../lib/bridge";
import { getExtensionVersion, getLogoUri } from "../../lib/webviewAssets";

const EXT_VERSION = `v${getExtensionVersion()}`;

// ── Root ──────────────────────────────────────────────────────────────────────
export function OnboardingHeader() {
  const logoUri = getLogoUri();

  return (
    <header className="vindicate-ob-header">
      {/* Brand row */}
      <div className="vindicate-ob-brand-row">
        {logoUri && (
          <img src={logoUri} alt="Vindicate" className="vindicate-ob-brand-logo" aria-hidden />
        )}
        <div className="vindicate-ob-brand-info">
          <div className="vindicate-ob-brand-name">
            Vindicate AI
            <span className="vindicate-ob-pre-release-badge">PRE-RELEASE</span>
          </div>
          <button
            type="button"
            className="vindicate-ob-brand-url"
            onClick={() => postToExtension({ type: "nav:openWebsite" })}
          >
            vindicate.ai
          </button>
        </div>
        <div className="vindicate-ob-brand-version">{EXT_VERSION}</div>
      </div>

      {/* Description */}
      <p className="vindicate-ob-description">
        Autonomous quality for AI-native development teams. Vindicate closes the gap between
        AI-generated code and verified behaviour by generating tests that trace back to{" "}
        <em>intent</em>, not implementation, with full traceability from requirement to passing
        test.
      </p>
    </header>
  );
}
