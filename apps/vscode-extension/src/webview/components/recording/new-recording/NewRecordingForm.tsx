import { ArrowLeft, Sparkles, MousePointerClick, Keyboard, Navigation, Camera } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/recording/ui/Button";
import { Tooltip } from "@/components/recording/ui/Tooltip";
import { HintPopover } from "@/components/recording/ui/HintPopover";
import { useRecordingStore } from "@/stores/recordingStore";
import type { BrowserEngine } from "@/lib/recording-ui-types";
import { validateRecordingName } from "../../../../shared/recording-name";
import { PreconditionRecordingsField } from "./PreconditionRecordingsField";

const PRECONDITION_URL_HINT = {
  title: "Why is this locked?",
  body: "With pre-conditions, Vindicate opens the browser at the first pre-condition recording's start URL, replays each recording in order, then begins your new recording from that final page state."
} as const;

const BROWSERS: { id: BrowserEngine; label: string; disabled?: boolean }[] = [
  { id: "chromium", label: "Chromium" },
  { id: "firefox", label: "Firefox", disabled: true },
  { id: "webkit", label: "WebKit", disabled: true }
];

const CAPTURE_ITEMS = [
  {
    tone: "bg-tone-blue/15 text-tone-blue",
    icon: <MousePointerClick size={13} />,
    title: "Clicks & taps",
    desc: "Interactive targets with selector candidates."
  },
  {
    tone: "bg-tone-violet/15 text-tone-violet",
    icon: <Keyboard size={13} />,
    title: "Typing & input",
    desc: "Field values and the element they were typed into."
  },
  {
    tone: "bg-tone-amber/15 text-tone-amber",
    icon: <Navigation size={13} />,
    title: "Navigation",
    desc: "URL changes and page loads as you move around."
  },
  {
    tone: "bg-tone-emerald/15 text-tone-emerald",
    icon: <Camera size={13} />,
    title: "Snapshots",
    desc: "Full page state, validation errors and alerts."
  }
] as const;

export function NewRecordingForm() {
  const newForm = useRecordingStore((s) => s.newForm);
  const dashboardSessions = useRecordingStore((s) => s.dashboardSessions);
  const playback = useRecordingStore((s) => s.playback);
  const isStartingRecording = useRecordingStore((s) => s.isStartingRecording);
  const updateNewForm = useRecordingStore((s) => s.updateNewForm);
  const startRecordingFromForm = useRecordingStore((s) => s.startRecordingFromForm);
  const setView = useRecordingStore((s) => s.setView);
  const loadDashboard = useRecordingStore((s) => s.loadDashboard);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const [nameEdited, setNameEdited] = useState(false);
  const firstPreconditionName = newForm.preconditionRecordings[0];
  const urlLockedByPrecondition = firstPreconditionName !== undefined;

  useEffect(() => {
    if (firstPreconditionName === undefined) {
      return;
    }
    const match = dashboardSessions.find((s) => s.name === firstPreconditionName);
    if (match !== undefined && match.targetUrl.trim().length > 0) {
      updateNewForm("url", match.targetUrl);
    }
  }, [firstPreconditionName, dashboardSessions, updateNewForm]);

  const nameValidation = useMemo(
    () =>
      validateRecordingName(newForm.name, dashboardSessions, {
        requireNonEmpty: nameEdited
      }),
    [newForm.name, dashboardSessions, nameEdited]
  );
  const nameErrorMessage = nameValidation.message;
  const canSubmit = nameValidation.ok && newForm.url.trim().length > 0;
  const formLocked = isStartingRecording;

  const statusLabel = (() => {
    if (playback.status === "failed") {
      return playback.failedStep > 0
        ? `Setup failed at step ${playback.failedStep}: ${playback.error}`
        : playback.error;
    }
    if (!isStartingRecording) {
      return null;
    }
    if (playback.status === "running") {
      return `Running pre-conditions… (${playback.current ?? 0}/${playback.total})${playback.recordingName ? `: ${playback.recordingName}` : ""}`;
    }
    if (playback.status === "done") {
      return "Starting recorder…";
    }
    return "Opening browser and preparing session…";
  })();

  return (
    <div className="max-w-[720px] mx-auto px-7 py-7 pb-12">
      <button
        type="button"
        onClick={() => setView("dashboard")}
        disabled={formLocked}
        className="mb-5 inline-flex items-center gap-1.5 bg-transparent border-0 cursor-pointer text-ui-base text-vs-text-dim hover:text-vs-text disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ArrowLeft size={13} /> All recordings
      </button>

      <div className="mb-5">
        <h1 className="text-ui-display font-semibold tracking-tight m-0">Start a new recording</h1>
        <p className="mt-2 text-ui-md text-vs-text-dim">
          Vindicate opens a browser and records every step automatically.
        </p>
      </div>

      <div className="rounded-xl border border-vs-border bg-vs-bg overflow-hidden mb-4">
        <div className="px-4 py-4">
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.1em] text-vs-text-dim">
            Recording name
          </label>
          <input
            type="text"
            value={newForm.name}
            disabled={formLocked}
            onChange={(e) => {
              setNameEdited(true);
              updateNewForm("name", e.target.value);
            }}
            onBlur={() => setNameEdited(true)}
            aria-invalid={nameErrorMessage !== null}
            aria-describedby={nameErrorMessage !== null ? "recording-name-error" : undefined}
            className={[
              "w-full rounded-lg border bg-vs-hover px-3 py-2.5 text-ui-md outline-none disabled:opacity-60",
              nameErrorMessage !== null ? "border-tone-red/50" : "border-vs-border"
            ].join(" ")}
            placeholder="e.g. Login flow"
          />
          {nameErrorMessage !== null && (
            <p id="recording-name-error" className="mt-2 text-ui-sm text-tone-red" role="alert">
              {nameErrorMessage}
            </p>
          )}
        </div>
        <div className="h-px bg-vs-border" />
        <div className="px-4 py-4">
          <div className="mb-2 flex items-center gap-2">
            <label className="block font-mono text-[10px] uppercase tracking-[0.1em] text-vs-text-dim">
              Target URL
            </label>
            {urlLockedByPrecondition && (
              <HintPopover title={PRECONDITION_URL_HINT.title} body={PRECONDITION_URL_HINT.body} />
            )}
          </div>
          <input
            type="text"
            value={newForm.url}
            readOnly={urlLockedByPrecondition}
            disabled={formLocked}
            onChange={(e) => updateNewForm("url", e.target.value)}
            aria-describedby={
              urlLockedByPrecondition ? "recording-url-precondition-hint" : undefined
            }
            className={[
              "w-full rounded-lg border border-vs-border bg-vs-hover px-3 py-2.5 font-mono text-ui-md outline-none",
              formLocked || urlLockedByPrecondition ? "opacity-60 cursor-not-allowed" : ""
            ].join(" ")}
            placeholder="app.example.com/login"
          />
          {urlLockedByPrecondition && (
            <p
              id="recording-url-precondition-hint"
              className="mt-2 text-[11px] leading-snug text-vs-text-dim"
            >
              From the start of <span className="text-vs-text">{firstPreconditionName}</span>.
              Reorder pre-conditions to change this URL.
            </p>
          )}
        </div>
        <div className="h-px bg-vs-border" />
        <div className="px-4 py-4">
          <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.1em] text-vs-text-dim">
            Browser engine
          </label>
          <div className="inline-flex gap-0.5 rounded-lg border border-vs-border bg-vs-hover p-0.5">
            {BROWSERS.map((b) => {
              const button = (
                <button
                  type="button"
                  disabled={b.disabled || formLocked}
                  onClick={() => !b.disabled && updateNewForm("browser", b.id)}
                  className={[
                    "rounded-md px-3 py-1.5 text-[11.5px] border-0 transition-all",
                    b.disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                    newForm.browser === b.id
                      ? "bg-vs-bg text-vs-text font-semibold shadow-sm"
                      : "bg-transparent text-vs-text-dim"
                  ].join(" ")}
                >
                  {b.label}
                </button>
              );
              return b.disabled ? (
                <Tooltip key={b.id} content="Coming soon">
                  {button}
                </Tooltip>
              ) : (
                <span key={b.id}>{button}</span>
              );
            })}
          </div>
        </div>
        <div className="h-px bg-vs-border" />
        <div className="px-4 py-4">
          <PreconditionRecordingsField
            sessions={dashboardSessions}
            value={newForm.preconditionRecordings}
            disabled={formLocked}
            onChange={(names) => updateNewForm("preconditionRecordings", names)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-vs-border bg-vs-bg px-4 py-4 mb-5">
        <div className="grid grid-cols-2 gap-x-5 gap-y-2.5">
          {CAPTURE_ITEMS.map((item) => (
            <div key={item.title} className="flex items-start gap-2.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${item.tone}`}
              >
                {item.icon}
              </span>
              <div>
                <p className="text-[11.5px] font-medium">{item.title}</p>
                <p className="text-[10.5px] text-vs-text-dim">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {statusLabel !== null && (
        <p
          className={[
            "mb-3 text-ui-md",
            playback.status === "failed" ? "text-tone-red" : "text-vs-text-dim"
          ].join(" ")}
          role={isStartingRecording ? "status" : undefined}
          aria-live={isStartingRecording ? "polite" : undefined}
        >
          {statusLabel}
        </p>
      )}

      <Button
        variant="primary"
        size="md"
        loading={isStartingRecording}
        onClick={startRecordingFromForm}
        disabled={!canSubmit || isStartingRecording}
      >
        <Sparkles size={13} /> {isStartingRecording ? "Starting…" : "Start recording"}
      </Button>
    </div>
  );
}
