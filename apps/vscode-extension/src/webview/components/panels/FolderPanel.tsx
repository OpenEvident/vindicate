import { postToExtension } from "../../lib/bridge";
import { useOnboardingStore } from "../../stores/onboardingStore";

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 4a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4z" />
    </svg>
  );
}

function formatRelative(path: string): string {
  const home = path.replace(/\\/g, "/");
  const parts = home.split("/");
  return `~/${parts.slice(-2).join("/")}`;
}

export function FolderPanel() {
  const hasFolder = useOnboardingStore((s) => s.hasFolder);
  const folderName = useOnboardingStore((s) => s.folderName);
  const recentFolders = useOnboardingStore((s) => s.recentFolders);

  return (
    <div className="vindicate-fp-root">
      {/* Current folder section */}
      {hasFolder && folderName ? (
        <div className="vindicate-fp-section">
          <p className="vindicate-fp-section-label">CURRENT WORKSPACE</p>
          <div className="vindicate-fp-current-folder">
            <div className="vindicate-fp-folder-icon" aria-hidden>
              <FolderIcon />
            </div>
            <div className="vindicate-fp-folder-info">
              <div className="vindicate-fp-folder-name">{folderName}</div>
              <div className="vindicate-fp-folder-ready">Ready for onboarding</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="vindicate-fp-section">
          <p className="vindicate-fp-section-label">NO FOLDER OPEN</p>
          <div className="vindicate-fp-open-cta">
            <div className="vindicate-fp-open-icon" aria-hidden>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
            </div>
            <p className="vindicate-fp-open-title">Open a project folder to begin</p>
            <p className="vindicate-fp-open-desc">
              Vindicate needs a project folder to configure agents, watch for scaffold files, and track your setup progress.
            </p>
            <button
              type="button"
              className="vindicate-btn-primary"
              onClick={() => postToExtension({ type: "nav:openFolder" })}
            >
              Open Folder…
            </button>
          </div>
        </div>
      )}

      {/* Recent folders */}
      {recentFolders.length > 0 && (
        <div className="vindicate-fp-section">
          <div className="vindicate-fp-recent-header">
            <p className="vindicate-fp-section-label">RECENT OPENS</p>
            <button
              type="button"
              className="vindicate-fp-open-link"
              onClick={() => postToExtension({ type: "nav:openFolder" })}
            >
              Open folder…
            </button>
          </div>
          <div className="vindicate-fp-recent-list">
            {recentFolders.slice(0, 6).map((folder) => {
              const name = folder.replace(/\\/g, "/").split("/").pop() ?? folder;
              const rel = formatRelative(folder);
              return (
                <button
                  key={folder}
                  type="button"
                  className="vindicate-fp-recent-item"
                  onClick={() => postToExtension({ type: "nav:openRecentFolder", path: folder })}
                >
                  <div className="vindicate-fp-recent-icon" aria-hidden>
                    <FolderIcon />
                  </div>
                  <div className="vindicate-fp-recent-info">
                    <div className="vindicate-fp-recent-name">{name}</div>
                    <div className="vindicate-fp-recent-path">{rel}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
