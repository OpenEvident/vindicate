import { useMemo, useState } from "react";
import { Search, LayoutGrid, List } from "lucide-react";
import { StatsRow } from "./StatsRow";
import { ResumeBar } from "./ResumeBar";
import { SessionCard } from "./SessionCard";
import { EmptyState } from "./EmptyState";
import { useRecordingStore } from "@/stores/recordingStore";
import type { RecordingSession } from "@/lib/recording-ui-types";

type DashboardFilter = "all" | "review" | "finalized" | "recording";

const FILTERS: { id: DashboardFilter; label: string; dot?: string }[] = [
  { id: "all", label: "All" },
  { id: "recording", label: "Recording", dot: "bg-tone-red" },
  { id: "review", label: "In review", dot: "bg-tone-amber" },
  { id: "finalized", label: "Finalized", dot: "bg-tone-emerald" }
];

export function Dashboard() {
  const sessions = useRecordingStore((s) => s.dashboardSessions);
  const loading = useRecordingStore((s) => s.dashboardLoading);
  const dashboardError = useRecordingStore((s) => s.dashboardError);
  const workerOnline = useRecordingStore((s) => s.workerOnline);
  const openSession = useRecordingStore((s) => s.openSession);
  const openArtifact = useRecordingStore((s) => s.openArtifact);
  const setView = useRecordingStore((s) => s.setView);
  const loadDashboard = useRecordingStore((s) => s.loadDashboard);

  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const counts = useMemo(() => {
    const c = { all: sessions.length, recording: 0, review: 0, finalized: 0 };
    for (const s of sessions) {
      if (s.status === "recording") c.recording++;
      if (s.status === "review") c.review++;
      if (s.status === "finalized") c.finalized++;
    }
    return c;
  }, [sessions]);

  const filtered = useMemo(
    () =>
      sessions.filter((s) => {
        if (filter !== "all" && s.status !== filter) return false;
        const q = query.trim().toLowerCase();
        return (
          q.length === 0 ||
          s.name.toLowerCase().includes(q) ||
          s.targetUrl.toLowerCase().includes(q) ||
          (s.summary?.toLowerCase().includes(q) ?? false)
        );
      }),
    [sessions, filter, query]
  );

  const resumeSession = sessions.find((s) => s.status === "review");

  return (
    <div className="max-w-[1080px] mx-auto px-7 py-6 pb-12">
      {!workerOnline && (
        <div className="mb-4 rounded-lg border border-tone-amber/40 bg-tone-amber/10 px-4 py-3 text-ui-md text-tone-amber">
          Worker is offline. Recordings are unavailable until it reconnects.
        </div>
      )}
      {dashboardError !== null && (
        <div className="mb-4 rounded-lg border border-tone-red/40 bg-tone-red/10 px-4 py-3 text-ui-md text-tone-red">
          {dashboardError}
        </div>
      )}

      <div className="flex items-center justify-between gap-6 mb-5">
        <div className="min-w-0">
          <h1 className="text-ui-display font-semibold tracking-tight leading-none">
            Your <span className="text-vs-text-dim font-medium">recordings</span>
          </h1>
          <p className="mt-2 max-w-[460px] text-ui-md text-vs-text-dim leading-relaxed">
            Record browser sessions, review steps, and export artifacts your agent turns into tests.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setView("new")}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 bg-tone-red text-white text-ui-md font-semibold border-0 cursor-pointer"
        >
          New recording
        </button>
      </div>

      <StatsRow sessions={sessions as RecordingSession[]} />

      {resumeSession !== undefined && filter === "all" && query.length === 0 && (
        <ResumeBar session={resumeSession} onResume={() => openSession(resumeSession)} onPreview={() => openSession(resumeSession)} />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex min-w-[200px] max-w-[360px] flex-1 items-center gap-2 rounded-lg border border-vs-border bg-vs-hover px-2.5 py-2">
          <Search size={13} className="shrink-0" />
          <input
            type="text"
            value={query}
            placeholder="Search recordings or targets…"
            aria-label="Search recordings or targets"
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-vs-text outline-none placeholder:text-vs-text-dim"
          />
        </div>

        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] cursor-pointer",
                filter === f.id
                  ? "bg-vs-accent/15 border-vs-accent/40 text-vs-accent"
                  : "border-vs-border bg-transparent text-vs-text-dim hover:text-vs-text"
              ].join(" ")}
            >
              {f.dot !== undefined && <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />}
              {f.label}
              <span className="rounded-full bg-vs-hover/50 px-1.5 font-mono text-[9.5px]">{counts[f.id]}</span>
            </button>
          ))}
        </div>

        <button type="button" onClick={() => loadDashboard()} className="text-ui-sm text-vs-text-dim hover:text-vs-text bg-transparent border-0 cursor-pointer">
          Refresh
        </button>

        <div className="ml-auto flex gap-0.5 rounded-lg border border-vs-border bg-vs-hover p-0.5">
          {(["grid", "list"] as const).map((vm) => (
            <button
              key={vm}
              type="button"
              onClick={() => setViewMode(vm)}
              className={[
                "flex h-[26px] w-[30px] items-center justify-center rounded-md border-0 cursor-pointer",
                viewMode === vm ? "bg-vs-bg text-vs-text shadow-sm" : "bg-transparent text-vs-text-dim"
              ].join(" ")}
            >
              {vm === "grid" ? <LayoutGrid size={14} /> : <List size={14} />}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-ui-md text-vs-text-dim">Loading recordings…</div>
      ) : sessions.length === 0 ? (
        <EmptyState onNewRecording={() => setView("new")} />
      ) : (
        <div className={["grid gap-3", viewMode === "grid" ? "grid-cols-2" : "grid-cols-1"].join(" ")}>
          {filtered.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              listMode={viewMode === "list"}
              onOpen={() => openSession(s)}
              onOpenArtifact={openArtifact}
            />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-2 py-10 text-center text-[12.5px] text-vs-text-dim">
              Nothing found. Try a different search or filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
