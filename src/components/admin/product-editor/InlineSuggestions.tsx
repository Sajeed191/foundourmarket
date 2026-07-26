import { Sparkles, Info, AlertTriangle } from "lucide-react";

export type FieldSuggestion = {
  id: string;
  /** Short, plain-language advice. Never auto-applied. */
  text: string;
  tone?: "info" | "warn";
  /** Optional one-click apply. Suggestions without this are advisory only. */
  actionLabel?: string;
  onApply?: () => void;
};

/**
 * Inline AI-style suggestions rendered directly under a field.
 * Advisory only — nothing here ever overwrites what the admin typed.
 */
export function InlineSuggestions({ items }: { items: FieldSuggestion[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggestions">
      {items.map((s) => {
        const warn = s.tone === "warn";
        const Icon = warn ? AlertTriangle : s.onApply ? Sparkles : Info;
        return (
          <li key={s.id}>
            <span
              className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] leading-tight ${
                warn
                  ? "border-amber-500/25 bg-amber-500/[0.07] text-amber-300"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground"
              }`}
            >
              <Icon className="size-3 shrink-0" />
              <span className="min-w-0">{s.text}</span>
              {s.onApply && (
                <button
                  type="button"
                  onClick={s.onApply}
                  className="ml-0.5 shrink-0 rounded-full px-1.5 py-0.5 font-semibold text-accent transition-colors hover:bg-accent/15"
                >
                  {s.actionLabel ?? "Apply"}
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
