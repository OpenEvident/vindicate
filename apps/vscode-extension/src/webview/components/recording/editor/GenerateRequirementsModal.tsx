import { CopyButton } from "@/components/recording/ui/CopyButton";
import { RECORDING_REQUIREMENTS_PROMPT } from "@/lib/prompts";

interface GenerateRequirementsModalProps {
  readonly path: string;
  readonly name: string;
  readonly projectRoot: string;
  readonly onClose: () => void;
}

export function GenerateRequirementsModal({
  path,
  name,
  projectRoot,
  onClose
}: GenerateRequirementsModalProps) {
  const prompt = RECORDING_REQUIREMENTS_PROMPT({ path, name, projectRoot });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generate-requirements-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-vs-border bg-vs-bg p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="generate-requirements-title" className="m-0 text-ui-lg font-semibold text-vs-text">
              Generate requirements
            </h2>
            <p className="mt-1 text-ui-sm text-vs-text-dim">
              Copy this prompt into your agent chat to draft a requirements/story doc from this recording (no tests).
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

        <textarea
          readOnly
          value={prompt}
          aria-label="Generate requirements prompt"
          className="h-64 w-full resize-y rounded-lg border border-vs-border bg-vs-input-bg p-3 font-mono text-[11.5px] leading-relaxed text-vs-text outline-none"
        />

        <div className="mt-3 flex justify-end">
          <CopyButton text={prompt} label="Copy prompt" size="md" iconSize={13} />
        </div>
      </div>
    </div>
  );
}
