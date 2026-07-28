/**
 * v11.0 — Workspace modes + Focus mode. Changes emphasis only: every section
 * still exists, modes decide what is worth showing right now.
 */
import { Focus } from "lucide-react";
import { WORKSPACE_MODES, type WorkspaceMode } from "@/lib/flash/flash-assistant";

export function FlashModeBar({
  mode, focus, onMode, onToggleFocus,
}: {
  mode: WorkspaceMode;
  focus: boolean;
  onMode: (m: WorkspaceMode) => void;
  onToggleFocus: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        aria-label="Workspace mode"
        className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {WORKSPACE_MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id && !focus}
            title={m.hint}
            onClick={() => onMode(m.id)}
            className={`inline-flex min-h-10 snap-start items-center rounded-full border px-3.5 text-[10px] font-mono uppercase tracking-widest transition ${
              mode === m.id && !focus
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-white/10 text-muted-foreground hover:bg-white/5"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <button
        onClick={onToggleFocus}
        aria-pressed={focus}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[10px] font-mono uppercase tracking-widest transition ${
          focus ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"
        }`}
      >
        <Focus className="size-3.5" /> Focus
      </button>
    </div>
  );
}
