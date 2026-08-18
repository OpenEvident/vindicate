import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computePopperPosition } from "../../lib/geometry";
import { postToExtension } from "../../lib/bridge";
import type { TestSuiteOption } from "../../../shared/types";

const MENU_W = 280;

interface RunTestsControlProps {
  suites: TestSuiteOption[];
  fullWidth?: boolean;
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <path d="M3 2.5v9l8-4.5z" />
    </svg>
  );
}

export function RunTestsControl({ suites, fullWidth = false }: RunTestsControlProps) {
  const [mode, setMode] = useState<"all" | "subset">("all");
  const [explicit, setExplicit] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const knownPaths = useMemo(() => suites.map((suite) => suite.relativePath), [suites]);
  const selectedPaths = useMemo(
    () => (mode === "all" ? knownPaths : knownPaths.filter((path) => explicit.has(path))),
    [mode, knownPaths, explicit]
  );
  const runningAll = mode === "all";
  const selectedCount = selectedPaths.length;
  const label = runningAll
    ? "Run all tests"
    : selectedCount === 0
      ? "Select a suite"
      : selectedCount === 1
        ? "Run 1 suite"
        : `Run ${selectedCount} suites`;

  useEffect(() => {
    if (!open || !chevronRef.current || !menuRef.current) return;
    const rect = chevronRef.current.getBoundingClientRect();
    setPos(computePopperPosition(rect, MENU_W, menuRef.current.offsetHeight, "bottom", 6, 8));
  }, [open, suites.length, selectedCount]);

  useEffect(() => {
    if (!open) return;
    const onMouse = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || wrapRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleSuite = (relativePath: string) => {
    if (mode === "all") {
      setMode("subset");
      setExplicit(new Set(knownPaths.filter((path) => path !== relativePath)));
      return;
    }
    const next = new Set(explicit);
    if (next.has(relativePath)) next.delete(relativePath);
    else next.add(relativePath);
    if (knownPaths.length > 0 && knownPaths.every((path) => next.has(path))) {
      setMode("all");
      setExplicit(new Set());
      return;
    }
    setExplicit(next);
  };

  const toggleAll = () => {
    if (runningAll) {
      setMode("subset");
      setExplicit(new Set());
      return;
    }
    setMode("all");
    setExplicit(new Set());
  };

  const run = () => {
    if (runningAll) {
      postToExtension({ type: "tests:runAll" });
    } else if (selectedCount > 0) {
      postToExtension({ type: "tests:runAll", suites: selectedPaths });
    }
    setOpen(false);
  };

  const checkedPaths = new Set(selectedPaths);

  return (
    <div
      ref={wrapRef}
      className={`vindicate-run-tests${fullWidth ? " full" : ""}${suites.length > 0 ? " split" : ""}`}
    >
      <button type="button" className="vbtn primary" onClick={run} disabled={!runningAll && selectedCount === 0}>
        <PlayIcon />
        {label}
      </button>
      {suites.length > 0 && (
        <button
          ref={chevronRef}
          type="button"
          className="vbtn primary vindicate-run-tests-chevron"
          aria-label="Choose test suites"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => {
            setPos(null);
            setOpen((value) => !value);
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
            <path d="M2 3.5 5 7l3-3.5H2z" />
          </svg>
        </button>
      )}
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="vindicate-run-tests-menu"
            role="listbox"
            aria-multiselectable="true"
            aria-label="Test suites"
            style={
              pos
                ? { position: "fixed", top: pos.top, left: pos.left, width: MENU_W, opacity: 1 }
                : { position: "fixed", top: -9999, left: -9999, width: MENU_W, opacity: 0 }
            }
          >
            <label className="vindicate-run-tests-row all">
              <input
                type="checkbox"
                ref={(node) => {
                  if (node) node.indeterminate = !runningAll && selectedCount > 0;
                }}
                checked={runningAll}
                onChange={toggleAll}
              />
              <span>Select all</span>
            </label>
            <div className="vindicate-run-tests-list">
              {suites.map((suite) => {
                const checked = runningAll || checkedPaths.has(suite.relativePath);
                return (
                  <label key={suite.relativePath} className="vindicate-run-tests-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSuite(suite.relativePath)}
                    />
                    <span className="vindicate-run-tests-copy">
                      <span className="name">{suite.label}</span>
                      <span className="path">{suite.relativePath}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
