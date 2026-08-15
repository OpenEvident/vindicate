import { useState } from "react";
import { postToExtension } from "../../lib/bridge";
import type { FailingTest } from "../../../shared/types";

export function FailingTestsCard({ failures }: { failures: FailingTest[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openFailureFile = (fileRef: string) => {
    const match = fileRef.match(/^(.*):(\d+)$/);
    if (match?.[1]) {
      postToExtension({ type: "nav:openFile", file: match[1], line: Number(match[2]) });
      return;
    }
    postToExtension({ type: "nav:openFile", file: fileRef });
  };

  return (
    <section>
      <div className="dash-section-h">
        <h4>
          Failing tests
          <span className="count">{failures.length}</span>
        </h4>
      </div>
      <div className="flex flex-col gap-2">
        {failures.map((failure) => (
          <article
            key={failure.id}
            className="rounded-[9px] border border-[var(--vs-border)] bg-[rgba(127,127,127,0.025)] px-[13px] py-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10.5px] text-[var(--ord-red)]"
                  style={{ background: "color-mix(in oklab, var(--ord-red) 14%, transparent)" }}
                >
                  {failure.ac}
                </span>
                <span className="font-mono text-[10.5px] text-[var(--vs-text-dim)]">
                  {failure.feature}
                </span>
                {failure.flaky && <span className="run-pill flak">flaky</span>}
                <span className="run-pill">{failure.duration}</span>
              </div>
              <button
                type="button"
                className="vbtn"
                style={{ fontSize: 11, padding: "4px 8px" }}
                onClick={() => toggle(failure.id)}
              >
                {expanded[failure.id] ? "Hide details" : "Show details"}
              </button>
            </div>
            <div className="text-[12.5px] text-[var(--vs-text)]">{failure.title}</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="font-mono text-[10.5px] text-[var(--vs-text-dim)]">
                {failure.file}
              </div>
              <button
                type="button"
                className="vbtn"
                style={{ fontSize: 10.5, padding: "4px 7px" }}
                title="Open file"
                onClick={() => openFailureFile(failure.file)}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden
                >
                  <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10" />
                  <path d="M9 2h5v5" />
                  <path d="M14 2L7 9" />
                </svg>
              </button>
            </div>
            {expanded[failure.id] && (
              <div className="mt-2 rounded-[7px] border border-[var(--vs-border)] bg-[rgba(0,0,0,0.18)] px-3 py-2">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--vs-text-dim)]">
                  Error details
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.5] text-[var(--ord-red)]">
                  {failure.message}
                </pre>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
