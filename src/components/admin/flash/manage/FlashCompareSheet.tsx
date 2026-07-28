/**
 * Deal comparison — select two or more deals and see who wins on the metrics
 * that matter, with a suggested replacement for the weakest performer.
 */
import { Trophy, X } from "lucide-react";
import { compareRows, compareWinner } from "@/lib/flash/flash-autonomy";
import type { DealEntry } from "@/lib/flash/use-flash-admin";
import type { DealIntelligence } from "@/lib/flash/flash-intelligence";

const METRICS = [
  { key: "ctr", label: "CTR", fmt: (v: number) => `${v.toFixed(1)}%` },
  { key: "conversion", label: "Conversion", fmt: (v: number) => `${v.toFixed(1)}%` },
  { key: "revenue", label: "Revenue", fmt: (v: number) => Math.round(v).toLocaleString() },
  { key: "views", label: "Views", fmt: (v: number) => Math.round(v).toLocaleString() },
  { key: "discountPct", label: "Discount", fmt: (v: number) => `${v}%` },
  { key: "stock", label: "Stock", fmt: (v: number) => String(v) },
  { key: "health", label: "Health", fmt: (v: number) => String(Math.round(v)) },
  { key: "flashScore", label: "Flash score", fmt: (v: number) => String(Math.round(v)) },
] as const;

export function FlashCompareSheet({
  entries, scores, onClose, onReplace,
}: {
  entries: DealEntry[];
  scores: Map<string, DealIntelligence>;
  onClose: () => void;
  onReplace: (entry: DealEntry) => void;
}) {
  const rows = compareRows(entries, scores);
  const winner = compareWinner(rows);
  const loser = [...rows].sort((a, b) => a.revenue - b.revenue || a.flashScore - b.flashScore)[0] ?? null;
  const loserEntry = loser ? entries.find((e) => e.key === loser.key) ?? null : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <p className="min-w-0 truncate text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
          Comparing {rows.length} deals
        </p>
        <button onClick={onClose} aria-label="Close comparison"
          className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 hover:bg-white/5">
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-32 py-2 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Metric</th>
              {rows.map((r) => (
                <th key={r.key} className="px-2 py-2 text-left">
                  <span className="flex items-center gap-1.5">
                    {r.key === winner && <Trophy className="size-3.5 shrink-0 text-accent" />}
                    <span className="line-clamp-1 text-xs font-medium">{r.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const best = Math.max(...rows.map((r) => r[m.key] as number));
              return (
                <tr key={m.key} className="border-t border-white/5">
                  <td className="py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{m.label}</td>
                  {rows.map((r) => {
                    const v = r[m.key] as number;
                    return (
                      <td key={r.key} className={`px-2 py-2 tabular-nums ${v === best && best > 0 ? "text-accent" : ""}`}>
                        {m.fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loserEntry && rows.length > 1 && (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3">
          <p className="min-w-0 text-xs text-amber-100">
            <span className="font-medium">{loser?.name}</span> is the weakest performer in this set — consider
            replacing it with a stronger product.
          </p>
          <button onClick={() => onReplace(loserEntry)}
            className="min-h-11 shrink-0 rounded-full border border-accent/40 px-3 text-[10px] font-mono uppercase tracking-widest text-accent hover:bg-accent/10">
            Replace
          </button>
        </div>
      )}
    </div>
  );
}
