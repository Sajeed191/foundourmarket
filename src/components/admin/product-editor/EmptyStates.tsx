import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

/* ---------------------------------------------------------------------------
 * Product Editor 11.0 — Invisible UX (presentation only).
 * Smart empty states, tiny AI chips and 5-second undo toasts.
 * ------------------------------------------------------------------------- */

export type EmptyAction = { label: string; run: () => void; primary?: boolean };

/**
 * Guiding empty state — never "No rows". Always says what to do next.
 */
export function SmartEmpty({
  icon: Icon, title, hint, actions = [],
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  actions?: EmptyAction[];
}) {
  return (
    <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.015] px-4 py-6 text-center">
      {Icon && (
        <span className="mx-auto mb-2.5 grid size-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted-foreground">
          <Icon className="size-4" />
        </span>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
      {actions.length > 0 && (
        <div className="mt-3.5 flex flex-wrap justify-center gap-2">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={a.run}
              className={`inline-flex min-h-11 items-center rounded-full px-4 text-xs font-semibold transition-[background-color,transform] duration-[var(--editor-motion-fast,160ms)] active:scale-[0.97] ${
                a.primary
                  ? "bg-accent text-accent-foreground"
                  : "border border-white/12 bg-white/[0.03] text-muted-foreground hover:text-foreground"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Tiny per-field AI chip — replaces giant AI panels. */
export function AiChip({
  label = "Improve", onClick, title,
}: {
  label?: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className="inline-flex min-h-8 items-center gap-1 rounded-full border border-accent/25 bg-accent/[0.07] px-2.5 text-[11px] font-semibold text-accent transition-[background-color,transform] duration-[var(--editor-motion-fast,160ms)] hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:scale-[0.97]"
    >
      <span aria-hidden="true">✨</span> {label}
    </button>
  );
}

/**
 * Undo everywhere — a 5 second toast with a single Undo action.
 * Purely presentational: the caller supplies the restore closure.
 */
export function undoableToast(message: string, undo: () => void) {
  toast.success(message, {
    duration: 5000,
    action: { label: "Undo", onClick: undo },
  });
}
