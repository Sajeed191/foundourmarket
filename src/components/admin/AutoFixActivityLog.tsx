/**
 * FoundOurMarket™ Universal AI Auto-Fix (v1.0) — Activity log panel.
 *
 * Shows what changed, old → new, AI confidence, timestamp, admin and undo
 * availability for every Auto Fix applied in this workspace session.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { History, RotateCcw, ArrowRight } from "lucide-react";
import {
  canUndo, readAutoFixLog, subscribeAutoFixLog, type AutoFixLogEntry,
} from "@/lib/auto-fix/log";
import { useAutoFix } from "@/lib/auto-fix/use-auto-fix";

function ago(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return new Date(ts).toLocaleString();
}

export function AutoFixActivityLog({ limit = 8 }: { limit?: number }) {
  const [entries, setEntries] = useState<AutoFixLogEntry[]>([]);
  const [, setTick] = useState(0);
  const { undo } = useAutoFix();

  useEffect(() => {
    setEntries(readAutoFixLog());
    const off = subscribeAutoFixLog(setEntries);
    const t = window.setInterval(() => setTick((n) => n + 1), 5000);
    return () => {
      off();
      window.clearInterval(t);
    };
  }, []);

  if (!entries.length) return null;

  return (
    <div className="rounded-2xl border border-border/40 bg-card/30 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground/80">
        <History className="size-3.5 text-accent" /> Auto-Fix activity
      </div>
      <div className="mt-3 space-y-2">
        {entries.slice(0, limit).map((e) => (
          <div key={e.id} className="rounded-xl border border-border/30 bg-card/40 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-medium text-foreground/90">{e.productName}</span>
              <span className="rounded-full border border-border/40 bg-card/60 px-2 py-0.5 tabular-nums text-muted-foreground">
                {e.confidence}% confidence
              </span>
              <span className="text-muted-foreground">{e.actor}</span>
              <span className="text-muted-foreground">· {ago(e.at)}</span>
              {e.undone && <span className="text-amber-300">· reverted</span>}
              {canUndo(e) && (
                <button
                  onClick={() =>
                    undo(e)
                      .then(() => toast.success("Reverted to previous values."))
                      .catch((err) => toast.error(err instanceof Error ? err.message : "Undo failed."))
                  }
                  className="ml-auto inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground transition hover:text-foreground"
                >
                  <RotateCcw className="size-3" /> Undo
                </button>
              )}
            </div>
            <div className="mt-1.5 space-y-1">
              {e.changes.map((c) => (
                <div key={`${e.id}-${c.field}`} className="flex items-start gap-2 text-[11px]">
                  <span className="shrink-0 text-muted-foreground">{c.label}:</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground opacity-70">{c.before}</span>
                  <ArrowRight className="mt-0.5 size-3 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate text-foreground">{c.after}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
