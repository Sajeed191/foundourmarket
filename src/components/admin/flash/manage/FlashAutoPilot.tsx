/**
 * v10.0 — AI Auto Pilot. Ranked optimisations with full explainability.
 * Nothing is ever applied automatically: every card requires an explicit
 * Approve, and Approve routes through the existing deal mutations.
 */
import { useState } from "react";
import { Sparkles, Check, X, Eye, ChevronDown, Info, AlertTriangle, Shuffle } from "lucide-react";
import type { QueueItem } from "@/lib/flash/flash-autonomy";
import type { Explanation } from "@/lib/flash/flash-executive";

const URGENCY: Record<QueueItem["urgency"], { label: string; cls: string }> = {
  now: { label: "Now", cls: "border-destructive/30 bg-destructive/10 text-destructive" },
  today: { label: "Today", cls: "border-orange-500/30 bg-orange-500/10 text-orange-300" },
  soon: { label: "Soon", cls: "border-white/10 bg-white/5 text-muted-foreground" },
};

const CONFIDENCE: Record<QueueItem["confidence"], string> = {
  high: "text-emerald-300",
  medium: "text-sky-300",
  low: "text-muted-foreground",
};

export function FlashAutoPilot({
  items, explain, onApprove, onReject, onPreview,
}: {
  items: QueueItem[];
  explain: (item: QueueItem) => Explanation;
  onApprove: (item: QueueItem) => void;
  onReject: (item: QueueItem) => void;
  onPreview: (item: QueueItem) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Auto Pilot has nothing to recommend — your flash deals are already tuned.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.slice(0, 12).map((item) => {
        const open = openId === item.id;
        const ex = open ? explain(item) : null;
        const u = URGENCY[item.urgency];
        return (
          <li key={item.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/10 text-accent">
                <Sparkles className="size-4" />
              </span>
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${u.cls}`}>{u.label}</span>
                  <span className={`text-[9px] font-mono uppercase tracking-widest ${CONFIDENCE[item.confidence]}`}>{item.confidence} confidence</span>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">{item.productName}</p>
                <p className="text-sm font-medium leading-snug">{item.title}</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{item.reason}</p>
                <p className="text-[11px] text-emerald-300">{item.impact}</p>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button onClick={() => onApprove(item)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[10px] font-mono uppercase tracking-widest text-accent-foreground transition hover:opacity-90">
                    <Check className="size-3.5" /> Approve
                  </button>
                  <button onClick={() => onPreview(item)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/10 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:bg-white/5">
                    <Eye className="size-3.5" /> Preview
                  </button>
                  <button onClick={() => onReject(item)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/10 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:bg-white/5">
                    <X className="size-3.5" /> Reject
                  </button>
                  <button onClick={() => setOpenId(open ? null : item.id)} aria-expanded={open}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:bg-white/5">
                    Why? <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>
            </div>

            {open && ex && (
              <div className="space-y-2.5 border-t border-white/5 bg-white/[0.02] p-3.5 text-[11px] leading-relaxed">
                <Row icon={Info} label="Why" text={ex.why} />
                <div>
                  <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Data used</p>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {ex.dataUsed.map((d) => <li key={d}>· {d}</li>)}
                  </ul>
                </div>
                <Row icon={Check} label="Expected improvement" text={ex.expectedImprovement} tone="text-emerald-300" />
                <Row icon={AlertTriangle} label="Possible downside" text={ex.downside} tone="text-orange-300" />
                <Row icon={Shuffle} label="Alternative" text={ex.alternative} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Row({ icon: Icon, label, text, tone = "text-foreground/80" }: {
  icon: typeof Info; label: string; text: string; tone?: string;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className={tone}>{text}</p>
      </div>
    </div>
  );
}
