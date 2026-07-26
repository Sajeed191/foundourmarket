import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { Check, ChevronDown, HelpCircle, Search, Settings2, Sparkles, X } from "lucide-react";

import {
  EDITOR_STEPS, STEP_OF_FIELD, readEditorMode, readEditorSearch, readEditorStep,
  searchFields, writeEditorMode, writeEditorSearch, writeEditorStep,
  type EditorMode, type EditorStepId,
} from "@/lib/editor-mode";
import { focusEditorField } from "@/lib/editor-focus";

/* ------------------------------- context ------------------------------- */

type WorkflowCtx = {
  mode: EditorMode;
  setMode: (m: EditorMode) => void;
  step: EditorStepId;
  setStep: (s: EditorStepId) => void;
};

const Ctx = createContext<WorkflowCtx | null>(null);

export function useEditorWorkflow(): WorkflowCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useEditorWorkflow must be used inside <GuidedWorkflow>");
  return ctx;
}

const STEP_IDS = new Set<string>(EDITOR_STEPS.map((s) => s.id));

export function GuidedWorkflow({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<EditorMode>("simple");
  const [step, setStepState] = useState<EditorStepId>("basic");

  // Section memory — restore preferred mode + last opened step after hydration.
  useEffect(() => {
    setModeState(readEditorMode());
    const remembered = readEditorStep();
    if (remembered && STEP_IDS.has(remembered)) setStepState(remembered as EditorStepId);
  }, []);

  const setMode = useCallback((m: EditorMode) => {
    setModeState(m);
    writeEditorMode(m);
  }, []);

  const setStep = useCallback((s: EditorStepId) => {
    setStepState(s);
    writeEditorStep(s);
  }, []);

  // Jumping to a field opens the step that owns it.
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent<string>).detail;
      const owner = STEP_OF_FIELD[key];
      if (owner) setStep(owner);
    };
    window.addEventListener("editor-focus-field", handler);
    return () => window.removeEventListener("editor-focus-field", handler);
  }, [setStep]);

  const value = useMemo(() => ({ mode, setMode, step, setStep }), [mode, setMode, step, setStep]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}


/* ------------------------------ mode switch ----------------------------- */

export function ModeSwitch() {
  const { mode, setMode } = useEditorWorkflow();
  return (
    <div role="radiogroup" aria-label="Editor mode" className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
      {(["simple", "advanced"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          className={`min-h-9 rounded-full px-3.5 text-xs font-semibold capitalize transition-[background-color,color] duration-[var(--editor-motion-fast,160ms)] ${
            mode === m ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {m} mode
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ help bubble ----------------------------- */

export function HelpDot({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={open ? "Hide help" : "Show help"}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="grid size-5 place-items-center rounded-full border border-white/15 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <HelpCircle className="size-3" />
      </button>
      {open && (
        <span
          role="note"
          onClick={(e) => e.stopPropagation()}
          className="absolute left-1/2 top-[calc(100%+0.4rem)] z-30 w-56 -translate-x-1/2 rounded-xl border border-white/12 bg-background/95 p-2.5 text-[11px] leading-relaxed text-muted-foreground shadow-xl backdrop-blur-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}

/* ----------------------------- field search ----------------------------- */

export function FieldSearch() {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const results = searchFields(q);

  // Section memory — restore the last search after hydration.
  useEffect(() => setQ(readEditorSearch()), []);
  useEffect(() => { writeEditorSearch(q); }, [q]);

  // Ctrl/Cmd + F focuses field search · Esc clears and blurs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }}
        placeholder="Search fields…"
        aria-label="Search fields"
        title="Search fields — Ctrl/⌘ F"
        className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-9 pr-9 text-sm placeholder:text-muted-foreground focus-visible:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
      />
      {q && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setQ("")}
          className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
      {results.length > 0 && (
        <div className="absolute inset-x-0 top-[calc(100%+0.4rem)] z-30 overflow-hidden rounded-xl border border-white/12 bg-background/95 shadow-xl backdrop-blur-xl">
          {results.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => { setQ(""); focusEditorField(r.key); }}
              className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left text-sm hover:bg-white/5"
            >
              <Sparkles className="size-3.5 shrink-0 text-accent" />
              <span className="truncate">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- progress header --------------------------- */

/** Completion chips replace raw percentages per step. */
export type StepLevel = "complete" | "recommended" | "missing";
export type StepState = { id: EditorStepId; done: boolean; note?: string; level?: StepLevel };

const CHIP: Record<StepLevel, { label: string; cls: string; dot: string }> = {
  complete: { label: "Complete", cls: "text-emerald-400", dot: "bg-emerald-500/20 text-emerald-400" },
  recommended: { label: "Recommended", cls: "text-amber-400", dot: "bg-amber-500/20 text-amber-400" },
  missing: { label: "Missing", cls: "text-muted-foreground", dot: "bg-white/8 text-muted-foreground" },
};

function levelOf(st?: StepState): StepLevel {
  if (!st) return "missing";
  return st.level ?? (st.done ? "complete" : "recommended");
}

export function StepProgress({ states, readiness }: { states: StepState[]; readiness: number }) {
  const { step, setStep } = useEditorWorkflow();
  const done = states.filter((s) => levelOf(s) === "complete").length;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Progress</p>
        <p className="text-xs font-semibold text-accent">{done} of {states.length} steps complete</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full origin-left rounded-full bg-accent transition-transform duration-[var(--editor-motion-base,220ms)]"
          style={{ transform: `scaleX(${Math.max(0.03, Math.min(1, readiness / 100))})`, width: "100%" }}
        />
      </div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {EDITOR_STEPS.map((s, i) => {
          const st = states.find((x) => x.id === s.id);
          const level = levelOf(st);
          const chip = CHIP[level];
          const active = step === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              aria-current={active ? "step" : undefined}
              aria-label={`${s.label} — ${chip.label}`}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition-colors duration-[var(--editor-motion-fast,160ms)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                active
                  ? "border-accent/50 bg-accent/12 text-accent"
                  : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className={`grid size-4 shrink-0 place-items-center rounded-full text-[9px] ${chip.dot}`}>
                {level === "complete" ? <Check className="size-2.5" /> : i + 1}
              </span>
              {s.label}
              <span className={`text-[10px] ${active ? "text-accent/80" : chip.cls}`}>{chip.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


/* -------------------------------- a step -------------------------------- */

export function Step({
  id, index, title, desc, help, badge, fieldKey, children,
}: {
  id: EditorStepId;
  index: number;
  title: string;
  desc?: string;
  help?: string;
  badge?: ReactNode;
  fieldKey?: string;
  children: ReactNode;
}) {
  const { step, setStep } = useEditorWorkflow();
  const open = step === id;
  return (
    <section data-editor-field={fieldKey} className="editor-surface overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setStep(open ? id : id)}
        onDoubleClick={() => setStep(id)}
        aria-expanded={open}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl border text-sm font-semibold ${open ? "border-accent/40 bg-accent/12 text-accent" : "border-white/12 bg-white/[0.03] text-muted-foreground"}`}>
          {index}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{title}</span>
            {badge}
            {help && <HelpDot text={help} />}
          </span>
          {desc && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{desc}</span>}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--editor-motion-base,220ms)] ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-white/10 p-4">{children}</div>}
    </section>
  );
}

/* -------------------------- advanced tools ------------------------------ */

const ADVANCED_FIELDS = new Set(["seo", "health", "diagnostics", "faq", "rating", "attributes"]);

export function AdvancedSettings({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Jumping to an advanced field (SEO, health…) reveals the panel automatically.
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent<string>).detail;
      if (ADVANCED_FIELDS.has(key)) setOpen(true);
    };
    window.addEventListener("editor-focus-field", handler);
    return () => window.removeEventListener("editor-focus-field", handler);
  }, []);
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <Settings2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-sm font-semibold">Advanced Tools</span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--editor-motion-base,220ms)] ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-3 border-t border-white/10 p-4">{children}</div>}
    </section>
  );
}

/* ---------------------------- start options ----------------------------- */

export function StartOptions({ onPaste, onImport, onScratch }: {
  onPaste: () => void; onImport: () => void; onScratch: () => void;
}) {
  const items = [
    { icon: "📋", label: "Paste Product Details", hint: "Amazon, Excel or PDF text", run: onPaste },
    { icon: "🌐", label: "Import from URL", hint: "Paste a listing link", run: onImport },
    { icon: "✏️", label: "Start from Scratch", hint: "Fill it in yourself", run: onScratch },
  ];
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-semibold">How would you like to start?</p>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={it.run}
            className="flex min-h-20 flex-col items-start justify-center gap-1 rounded-2xl border border-white/12 bg-white/[0.03] p-4 text-left transition-[transform,background-color] duration-[var(--editor-motion-fast,160ms)] hover:bg-white/[0.06] active:scale-[0.99]"
          >
            <span className="text-lg" aria-hidden="true">{it.icon}</span>
            <span className="text-sm font-semibold">{it.label}</span>
            <span className="text-[11px] text-muted-foreground">{it.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
