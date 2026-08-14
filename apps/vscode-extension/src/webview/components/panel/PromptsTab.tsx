import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  FileText,
  FlaskConical,
  FolderPen,
  Globe,
  List,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Search,
  Shield,
  SendHorizontal,
  Sparkles,
  X
} from "lucide-react";
import type { PromptCategory, PromptTemplate } from "../../../shared/types";
import { postToExtension } from "../../lib/bridge";
import { BUILT_IN_PROMPTS } from "../../lib/prompts";
import { usePromptsStore } from "../../stores/promptsStore";

type PromptFilter =
  | "all"
  | "pinned"
  | "onboarding"
  | "domain"
  | "specs"
  | "tests"
  | "custom";

interface PromptItem {
  id: string;
  name: string;
  description: string;
  category: PromptCategory;
  text: string;
  editable: boolean;
}

const FILTER_LABELS: Record<PromptFilter, string> = {
  all: "All prompts",
  pinned: "Pinned",
  onboarding: "Onboarding",
  domain: "Domain",
  specs: "Feature specs",
  tests: "Tests",
  custom: "My templates"
};

const FILTER_ICONS = {
  all: List,
  pinned: Pin,
  onboarding: Sparkles,
  domain: Globe,
  specs: FileText,
  tests: FlaskConical,
  custom: FolderPen
} satisfies Record<PromptFilter, typeof List>;

const CATEGORY_ICONS = {
  onboarding: Sparkles,
  domain: Globe,
  specs: FileText,
  tests: FlaskConical,
  custom: FolderPen
} satisfies Record<PromptCategory, typeof List>;

const CATEGORY_OPTIONS: Array<{ value: Exclude<PromptCategory, "custom">; label: string }> = [
  { value: "onboarding", label: "Onboarding" },
  { value: "domain", label: "Domain" },
  { value: "specs", label: "Feature specs" },
  { value: "tests", label: "Tests" }
];

interface TemplateModalState {
  mode: "create" | "edit";
  templateId: string | null;
}

function emptyTemplateDraft() {
  return {
    name: "",
    description: "",
    category: "onboarding" as Exclude<PromptCategory, "custom">,
    text: "",
    outputPath: ""
  };
}

function uid() {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{[^}]+\}\}/g) ?? [];
  return matches.slice(0, 3);
}

function formatUsed(id: string): string {
  if (id === "builtin:domain") return "USED 12m ago";
  if (id === "builtin:context") return "USED 6h ago";
  if (id === "builtin:features") return "USED 4h ago";
  if (id === "builtin:tests") return "USED yesterday";
  return "USED recently";
}

function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    void navigator.clipboard.writeText(text);
  }
}

function mergeAndPersist(templates: PromptTemplate[]) {
  postToExtension({ type: "prompts:saveTemplates", templates });
}

export function PromptsTab() {
  const templates = usePromptsStore((s) => s.templates);
  const [activeFilter, setActiveFilter] = useState<PromptFilter>("all");
  const [query, setQuery] = useState("");
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set(["builtin:domain"]));
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [modal, setModal] = useState<TemplateModalState | null>(null);
  const [draft, setDraft] = useState(emptyTemplateDraft());

  const items = useMemo<PromptItem[]>(() => {
    const builtIn: PromptItem[] = BUILT_IN_PROMPTS.map((prompt) => ({
      id: `builtin:${prompt.id}`,
      name: prompt.title,
      description: prompt.description,
      category: prompt.category,
      text: prompt.text,
      editable: false
    }));
    const custom: PromptItem[] = templates.map((template) => ({
      id: `custom:${template.id}`,
      name: template.name,
      description: template.description,
      category: "custom",
      text: template.text,
      editable: true
    }));
    return [...builtIn, ...custom];
  }, [templates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (activeFilter === "pinned" && !pinnedIds.has(item.id)) return false;
      if (activeFilter !== "all" && activeFilter !== "pinned" && item.category !== activeFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.text.toLowerCase().includes(q)
      );
    });
  }, [activeFilter, items, pinnedIds, query]);

  const counts = useMemo(() => {
    const base: Record<PromptFilter, number> = {
      all: items.length,
      pinned: 0,
      onboarding: 0,
      domain: 0,
      specs: 0,
      tests: 0,
      custom: 0
    };
    for (const item of items) {
      base[item.category] += 1;
      if (pinnedIds.has(item.id)) base.pinned += 1;
    }
    return base;
  }, [items, pinnedIds]);

  const closeModal = () => {
    setModal(null);
    setDraft(emptyTemplateDraft());
  };

  const openCreateModal = () => {
    setDraft(emptyTemplateDraft());
    setModal({ mode: "create", templateId: null });
  };

  const openEditModal = (templateId: string) => {
    const current = templates.find((t) => t.id === templateId);
    if (!current) return;
    setDraft({
      name: current.name,
      description: current.description,
      category: current.category === "custom" ? "onboarding" : current.category,
      text: current.text,
      outputPath: ""
    });
    setModal({ mode: "edit", templateId });
    setMenuForId(null);
  };

  const saveTemplate = () => {
    if (!modal) return;
    const now = new Date().toISOString();
    if (!draft.name.trim() || !draft.text.trim()) return;
    if (modal.mode === "create") {
      mergeAndPersist([
        ...templates,
        {
          id: uid(),
          name: draft.name.trim(),
          description: draft.description.trim(),
          category: draft.category,
          text: draft.text.trim(),
          createdAt: now,
          updatedAt: now
        }
      ]);
    } else {
      const next = templates.map((template) =>
        template.id === modal.templateId
          ? {
              ...template,
              name: draft.name.trim(),
              description: draft.description.trim(),
              category: draft.category,
              text: draft.text.trim(),
              updatedAt: now
            }
          : template
      );
      mergeAndPersist(next);
    }
    closeModal();
  };

  const removeTemplate = (templateId: string) => {
    mergeAndPersist(templates.filter((template) => template.id !== templateId));
    setMenuForId(null);
  };

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sorted = [...filtered].sort((a, b) => {
    const pinDelta = Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id));
    if (pinDelta !== 0) return pinDelta;
    return a.name.localeCompare(b.name);
  });

  const pinned = sorted.filter((item) => pinnedIds.has(item.id));
  const rest = sorted.filter((item) => !pinnedIds.has(item.id));
  const groups: Array<{ id: string; title: string; items: PromptItem[] }> = [
    { id: "pinned", title: "Pinned", items: pinned },
    { id: "onboarding", title: "Onboarding", items: rest.filter((item) => item.category === "onboarding") },
    { id: "domain", title: "Domain", items: rest.filter((item) => item.category === "domain") },
    { id: "specs", title: "Feature specs", items: rest.filter((item) => item.category === "specs") },
    { id: "tests", title: "Tests", items: rest.filter((item) => item.category === "tests") },
    { id: "custom", title: "My templates", items: rest.filter((item) => item.category === "custom") }
  ];
  const detectedVariables = useMemo(() => extractVariables(draft.text), [draft.text]);

  return (
    <div className="vindicate-prompts-v2">
      <aside className="vindicate-prompts-v2-sidebar">
        <h3 className="vindicate-prompts-v2-sidebar-title">Library</h3>
        {(["all", "pinned"] as PromptFilter[]).map((filter) => (
          (() => {
            const Icon = FILTER_ICONS[filter];
            return (
          <button
            key={filter}
            type="button"
            className={`vindicate-prompts-v2-filter${activeFilter === filter ? " is-active" : ""}`}
            onClick={() => setActiveFilter(filter)}
          >
            <span className="vindicate-prompts-v2-filter-label">
              <Icon size={12} strokeWidth={2} />
              {FILTER_LABELS[filter]}
            </span>
            <span className="vindicate-prompts-v2-filter-count">{counts[filter]}</span>
          </button>
            );
          })()
        ))}
        <h3 className="vindicate-prompts-v2-sidebar-title">Built-in</h3>
        {(["onboarding", "domain", "specs", "tests"] as PromptFilter[]).map((filter) => (
          (() => {
            const Icon = FILTER_ICONS[filter];
            return (
          <button
            key={filter}
            type="button"
            className={`vindicate-prompts-v2-filter${activeFilter === filter ? " is-active" : ""}`}
            onClick={() => setActiveFilter(filter)}
          >
            <span className="vindicate-prompts-v2-filter-label">
              <Icon size={12} strokeWidth={2} />
              {FILTER_LABELS[filter]}
            </span>
            <span className="vindicate-prompts-v2-filter-count">{counts[filter]}</span>
          </button>
            );
          })()
        ))}
        <h3 className="vindicate-prompts-v2-sidebar-title">Yours</h3>
        {(() => {
          const Icon = FILTER_ICONS.custom;
          return (
        <button
          type="button"
          className={`vindicate-prompts-v2-filter${activeFilter === "custom" ? " is-active" : ""}`}
          onClick={() => setActiveFilter("custom")}
        >
          <span className="vindicate-prompts-v2-filter-label">
            <Icon size={12} strokeWidth={2} />
            {FILTER_LABELS.custom}
          </span>
          <span className="vindicate-prompts-v2-filter-count">{counts.custom}</span>
        </button>
          );
        })()}
      </aside>

      <section className="vindicate-prompts-v2-main">
        <div className="vindicate-prompts-v2-toolbar">
          <span className="vindicate-prompts-v2-search-icon" aria-hidden>
            <Search size={12} strokeWidth={2} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search templates, variables, content..."
            className="vindicate-prompts-v2-search"
            aria-label="Search prompts"
          />
          <button type="button" className="vindicate-prompts-v2-new" onClick={openCreateModal}>
            <Plus size={13} strokeWidth={2.2} />
            New template
          </button>
        </div>

        {sorted.length === 0 ? (
          <div className="vindicate-prompts-v2-empty">No prompts match this filter. Try a different category.</div>
        ) : (
          groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section key={group.id} className="vindicate-prompts-v2-group">
                <header className="vindicate-prompts-v2-group-head">
                  <h4>{group.title}</h4>
                  <span>{group.items.length} TEMPLATE</span>
                </header>
                <ul className="vindicate-prompts-v2-list">
                  {group.items.map((item, idx) => {
                    const customId = item.editable ? item.id.replace("custom:", "") : null;
                    const menuOpen = menuForId === item.id;
                    const variables = extractVariables(item.text);
                    return (
                      <li
                        key={item.id}
                        className={`vindicate-prompts-v2-row${
                          group.id === "pinned" && idx === 0 ? " is-pinned-highlight" : ""
                        }`}
                      >
                        {(() => {
                          const CategoryIcon = CATEGORY_ICONS[item.category];
                          return (
                        <div className={`vindicate-prompts-v2-icon cat-${item.category}`} aria-hidden>
                              <CategoryIcon size={13} strokeWidth={2} />
                        </div>
                          );
                        })()}
                        <div className="vindicate-prompts-v2-row-main">
                          <div className="vindicate-prompts-v2-row-titleline">
                            <p className="vindicate-prompts-v2-row-title">{item.name}</p>
                            <span className="vindicate-prompts-v2-row-badge">{FILTER_LABELS[item.category]}</span>
                            {pinnedIds.has(item.id) && (
                              <span className="vindicate-prompts-v2-row-badge pinned">Pinned</span>
                            )}
                          </div>
                          <p className="vindicate-prompts-v2-row-desc">{item.description}</p>
                          <div className="vindicate-prompts-v2-row-meta">
                            <span className="meta-key">CREATES</span>
                            <span className="meta-path">
                              {item.category === "domain"
                                ? ".vindicate/domain.md"
                                : item.category === "specs"
                                  ? ".vindicate/stories/*.story.md"
                                  : item.category === "tests"
                                    ? "tests/**/*.spec.ts"
                                    : ".vindicate/context.md"}
                            </span>
                            {variables.map((variable) => (
                              <span key={`${item.id}-${variable}`} className="meta-chip">
                                {variable}
                              </span>
                            ))}
                            <span className="meta-used">{formatUsed(item.id)}</span>
                          </div>
                        </div>
                        <div className="vindicate-prompts-v2-row-actions">
                          <button
                            type="button"
                            className="iconbtn primary"
                            aria-label="Copy prompt"
                            onClick={() => copyToClipboard(item.text)}
                          >
                            <Copy size={12} strokeWidth={2} />
                          </button>
                          <button type="button" className="iconbtn" disabled aria-label="Send prompt">
                            <SendHorizontal size={12} strokeWidth={2} />
                          </button>
                          <button
                            type="button"
                            className="iconbtn"
                            aria-label={pinnedIds.has(item.id) ? "Unpin prompt" : "Pin prompt"}
                            onClick={() => togglePin(item.id)}
                          >
                            {pinnedIds.has(item.id) ? (
                              <PinOff size={12} strokeWidth={2} />
                            ) : (
                              <Pin size={12} strokeWidth={2} />
                            )}
                          </button>
                          {item.editable && customId && (
                            <div className="vindicate-prompts-v2-menu-wrap">
                              <button
                                type="button"
                                className="iconbtn"
                                onClick={() => setMenuForId(menuOpen ? null : item.id)}
                                aria-label="Open prompt actions"
                              >
                                <MoreHorizontal size={12} strokeWidth={2} />
                              </button>
                              {menuOpen && (
                                <div className="vindicate-prompts-v2-menu" role="menu">
                                  <button type="button" onClick={() => openEditModal(customId)}>
                                    Edit
                                  </button>
                                  <button type="button" onClick={() => removeTemplate(customId)}>
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
        )}
      </section>

      {modal && (
        <div className="vindicate-prompts-v2-modal-backdrop" role="presentation">
          <div className="vindicate-prompts-v2-modal" role="dialog" aria-modal="true">
            <header className="vindicate-prompts-v2-modal-head">
              <div className="vindicate-prompts-v2-modal-title-wrap">
                <span className="vindicate-prompts-v2-modal-title-icon" aria-hidden>
                  <FileText size={16} strokeWidth={1.9} />
                </span>
                <h3>{modal.mode === "create" ? "New prompt template" : "Edit prompt template"}</h3>
                <span className="vindicate-prompts-v2-modal-badge">
                  {modal.mode === "create" ? "Draft" : "Custom"}
                </span>
              </div>
              <button
                type="button"
                className="vindicate-prompts-v2-modal-close"
                onClick={closeModal}
                aria-label="Close template modal"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </header>

            <div className="vindicate-prompts-v2-modal-body">
              <label>
                Name
                <input
                  value={draft.name}
                  placeholder="e.g. Generate integration tests"
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>

              <div className="vindicate-prompts-v2-modal-row2">
                <label>
                  Category
                  <select
                    value={draft.category}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        category: event.target.value as Exclude<PromptCategory, "custom">
                      }))
                    }
                  >
                    <option value="onboarding">My templates</option>
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Creates (optional)
                  <input
                    value={draft.outputPath}
                    placeholder="path/to/output.md"
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, outputPath: event.target.value }))
                    }
                  />
                </label>
              </div>

              <label>
                Description
                <input
                  value={draft.description}
                  placeholder="One sentence — what does this prompt do?"
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, description: event.target.value }))
                  }
                />
              </label>

              <label>
                Prompt body
                <textarea
                  value={draft.text}
                  rows={10}
                  placeholder={
                    "Write your prompt here. Use {{variable_name}} for substitutions.\n\nExample:\nRead {{readme}} and write a 1-paragraph summary to {{output_path}}."
                  }
                  onChange={(event) => setDraft((prev) => ({ ...prev, text: event.target.value }))}
                />
              </label>
              <p className="vindicate-prompts-v2-modal-vars">
                Variables detected:{" "}
                {detectedVariables.length > 0
                  ? detectedVariables.map((item) => (
                      <span key={item} className="meta-chip">
                        {item}
                      </span>
                    ))
                  : "none yet"}
              </p>
            </div>

            <div className="vindicate-prompts-v2-modal-actions">
              <span className="vindicate-prompts-v2-modal-footnote">
                <Shield size={14} strokeWidth={1.9} />
                Saved inside the extension - private to you, no files in repo
              </span>
              <div className="vindicate-prompts-v2-modal-actions-right">
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveTemplate}
                  disabled={!draft.name.trim() || !draft.text.trim()}
                >
                  <Check size={14} strokeWidth={2.2} />
                  Save template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
