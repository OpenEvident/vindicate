import { CopyButton } from "@/components/recording/ui/CopyButton";
import { RECORDING_CODEGEN_PROMPT } from "@/lib/prompts";

interface GenerateTestModalProps {
  readonly path: string;
  readonly name: string;
  readonly isAgentRecorded: boolean;
  readonly projectRoot: string;
  readonly onClose: () => void;
}

export function GenerateTestModal({
  path,
  name,
  isAgentRecorded,
  projectRoot,
  onClose
}: GenerateTestModalProps) {
  const prompt = RECORDING_CODEGEN_PROMPT({ path, name, isAgentRecorded, projectRoot });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-test-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-vs-border bg-vs-bg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="generate-test-title" className="m-0 text-ui-lg font-semibold text-vs-text">
              Generate test
            </h2>
            <p className="mt-1 text-ui-sm text-vs-text-dim">
              Copy this prompt into your agent chat to generate a Playwright test from this
              recording.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border-0 bg-transparent px-2 py-1 text-ui-sm text-vs-text-dim hover:text-vs-text cursor-pointer"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {isAgentRecorded && (
          <div className="mb-3 rounded-lg border border-tone-amber/30 bg-tone-amber/10 px-3 py-2 text-ui-sm text-vs-text">
            This recording was done by your agent — a test might already have been generated. Check{" "}
            <code className="font-mono text-[11px]">tests/</code> before regenerating.
          </div>
        )}

        <textarea
          readOnly
          value={prompt}
          aria-label="Generate test prompt"
          className="h-64 w-full resize-y rounded-lg border border-vs-border bg-vs-input-bg p-3 font-mono text-[11.5px] leading-relaxed text-vs-text outline-none"
        />

        <div className="mt-3 flex justify-end">
          <CopyButton text={prompt} label="Copy prompt" size="md" iconSize={13} />
        </div>
      </div>
    </div>
  );
}
