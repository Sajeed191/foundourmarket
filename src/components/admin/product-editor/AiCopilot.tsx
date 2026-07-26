import { useEffect, useMemo, useState } from "react";
import { Sparkles, ChevronDown, X, Undo2, Eye, ArrowRight, Bot } from "lucide-react";
import type { CopilotPriority, CopilotRec } from "@/lib/product-copilot";
import { focusEditorField } from "@/lib/editor-focus";

const PRIORITY: Record<CopilotPriority, { label: string; dot: string; text: string; ring: string }> = {
  high: { label: "High", dot: "bg-destructive", text: "text-destructive", ring: "border-destructive/25" },
  medium: { label: "Medium", dot: "bg-amber-400", text: "text-amber-400", ring: "border-amber-500/25" },
  low: { label: "Low", dot: "bg-accent", text: "text-accent", ring: "border-accent/25" },
};

function RecCard({
  rec,
  expanded,
  onToggle,
  onDismiss,
  onApplied,
}: {
  rec: CopilotRec;
  expanded: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onApplied: (rec: CopilotRec) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const p = PRIORITY[rec.priority];

  return (
    <li className={`overflow-hidden rounded-xl border ${p.ring} bg-white/[0.02]`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span className={`size-1.5 shrink-0 rounded-full ${p.dot}`} />
          <span className="min-w-0 truncate text-[13px] font-semibold">{rec.title}</span>
        </button>
        <span className="flex shrink-0 items-center gap-0.5">
          <span className={`text-[9px] font-mono uppercase tracking-[0.15em] ${p.text}`}>{p.label}</span>
          <ChevronDown
            className={`size-3.5 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </span>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.07] px-3 py-2.5">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">{rec.why}</p>
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-muted-foreground">
            <ArrowRight className="size-3" /> {rec.impact}
          </p>

          {showPreview && rec.preview && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/30 p-2 text-[10.5px] leading-relaxed text-muted-foreground">
              {rec.preview}
            </pre>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {rec.apply && (
              <button
                type="button"
                onClick={() => onApplied(rec)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/12 px-3 text-[11px] font-semibold text-accent transition-all duration-200 hover:bg-accent/20 active:scale-[0.98]"
              >
                <Sparkles className="size-3.5" /> {rec.applyLabel ?? "Apply"}
              </button>
            )}
            {rec.preview && (
              <button
                type="button"
                onClick={() => setShowPreview((s) => !s)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/12 px-3 text-[11px] font-medium text-muted-foreground transition-all duration-200 hover:text-foreground active:scale-[0.98]"
              >
                <Eye className="size-3.5" /> {showPreview ? "Hide preview" : "Preview"}
              </button>
            )}
            {rec.field && (
              <button
                type="button"
                onClick={() => focusEditorField(rec.field!)}
                className="inline-flex min-h-9 items-center rounded-full border border-white/12 px-3 text-[11px] font-medium text-muted-foreground transition-all duration-200 hover:text-foreground active:scale-[0.98]"
              >
                Jump to section
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-3.5" /> Dismiss
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * AI Copilot — one prioritized assistant for the whole editor.
 *
 * Docks to the right on desktop, becomes a bottom sheet on mobile. Only the
 * top recommendation is expanded by default; everything else is progressive
 * disclosure. The Copilot recommends — the admin decides.
 */
export function AiCopilot({
  recs,
  onUndo,
  canUndo,
}: {
  recs: CopilotRec[];
  onUndo?: () => void;
  canUndo?: boolean;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lastApplied, setLastApplied] = useState<string | null>(null);

  const visible = useMemo(() => recs.filter((r) => !dismissed.includes(r.id)), [recs, dismissed]);
  const top = visible[0]?.id ?? null;

  // Keep the top recommendation expanded until the admin opens another one.
  useEffect(() => {
    setOpenId((cur) => (cur && visible.some((r) => r.id === cur) ? cur : top));
  }, [top, visible]);

  function handleApplied(rec: CopilotRec) {
    rec.apply?.();
    setLastApplied(rec.title);
    setDismissed((d) => [...d, rec.id]);
  }

  const body = (
    <div className="space-y-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <Bot className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">AI Copilot</span>
            <span className="block truncate text-[10px] text-muted-foreground">
              {visible.length ? `${visible.length} recommendation${visible.length === 1 ? "" : "s"}` : "Everything looks good"}
            </span>
          </span>
        </span>
        {lastApplied && canUndo && (
          <button
            type="button"
            onClick={() => { onUndo?.(); setLastApplied(null); }}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-white/12 px-2.5 text-[11px] text-muted-foreground transition-all duration-200 hover:text-foreground active:scale-[0.98]"
          >
            <Undo2 className="size-3.5" /> Undo
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 text-[11.5px] text-emerald-300">
          No outstanding recommendations — this product is ready to publish.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((rec) => (
            <RecCard
              key={rec.id}
              rec={rec}
              expanded={openId === rec.id}
              onToggle={() => setOpenId((cur) => (cur === rec.id ? null : rec.id))}
              onDismiss={() => setDismissed((d) => [...d, rec.id])}
              onApplied={handleApplied}
            />
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop — docked panel */}
      <aside className="hidden lg:block" aria-label="AI Copilot">
        <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          {body}
        </div>
      </aside>

      {/* Mobile — launcher + bottom sheet */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-accent/25 bg-accent/[0.07] px-3 py-2.5 text-left transition-all duration-200 active:scale-[0.98]"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
            <Bot className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">AI Copilot</span>
            <span className="block truncate text-[10.5px] text-muted-foreground">
              {visible.length ? visible[0].title : "Everything looks good"}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-mono text-accent">
            {visible.length}
          </span>
        </button>

        {sheetOpen && (
          <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="AI Copilot">
            <button
              type="button"
              aria-label="Close AI Copilot"
              onClick={() => setSheetOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#0b0d12] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
              {body}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
