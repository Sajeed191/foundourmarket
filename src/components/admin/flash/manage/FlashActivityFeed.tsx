/**
 * Live activity feed — a realtime, human-readable stream derived from the
 * existing flash deal events and the housekeeping audit log. Read-only.
 */
import { useMemo } from "react";
import { Activity, MousePointerClick, Eye, ShoppingBag, Play, Square, ShieldCheck } from "lucide-react";
import type { DealEntry, AuditRow } from "@/lib/flash/use-flash-admin";

type FeedItem = {
  id: string;
  at: number;
  text: string;
  icon: typeof Activity;
  tone: string;
};

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function FlashActivityFeed({
  entries, events, audit, now, limit = 12,
}: {
  entries: DealEntry[];
  events: { event_type: string; deal_id: string | null; created_at: string }[];
  audit: AuditRow[];
  now: number;
  limit?: number;
}) {
  const items = useMemo<FeedItem[]>(() => {
    const nameByDeal = new Map<string, string>();
    for (const e of entries) if (e.deal) nameByDeal.set(e.deal.id, e.product.name);

    const out: FeedItem[] = [];

    for (const e of entries) {
      if (!e.deal) continue;
      const start = new Date(e.deal.start_at).getTime();
      const end = new Date(e.deal.end_at).getTime();
      if (start <= now && start > now - 12 * 3600_000) {
        out.push({ id: `s:${e.deal.id}`, at: start, text: `${e.product.name} — deal started`, icon: Play, tone: "text-emerald-300" });
      }
      if (end <= now && end > now - 12 * 3600_000) {
        out.push({ id: `e:${e.deal.id}`, at: end, text: `${e.product.name} — countdown finished`, icon: Square, tone: "text-orange-300" });
      }
    }

    // Recent customer signals, collapsed per deal + type so the feed stays calm.
    const buckets = new Map<string, { count: number; at: number; type: string; deal: string }>();
    for (const ev of events) {
      if (!ev.deal_id) continue;
      const at = new Date(ev.created_at).getTime();
      if (at < now - 6 * 3600_000) continue;
      const k = `${ev.deal_id}:${ev.event_type}`;
      const cur = buckets.get(k);
      if (cur) { cur.count++; cur.at = Math.max(cur.at, at); }
      else buckets.set(k, { count: 1, at, type: ev.event_type, deal: ev.deal_id });
    }
    for (const [k, b] of buckets) {
      const name = nameByDeal.get(b.deal) ?? "A flash deal";
      if (b.type === "click") {
        out.push({
          id: k, at: b.at, tone: b.count >= 25 ? "text-accent" : "text-sky-300",
          icon: MousePointerClick,
          text: `${name} — ${b.count} click${b.count === 1 ? "" : "s"}${b.count >= 25 ? " (click spike)" : ""}`,
        });
      } else if (b.type === "purchase") {
        out.push({ id: k, at: b.at, tone: "text-emerald-300", icon: ShoppingBag, text: `${name} — ${b.count} order${b.count === 1 ? "" : "s"}` });
      } else if (b.type === "impression" && b.count >= 25) {
        out.push({ id: k, at: b.at, tone: "text-muted-foreground", icon: Eye, text: `${name} — ${b.count} views` });
      }
    }

    for (const a of audit.slice(0, 5)) {
      const changed = a.expired_deactivated + a.out_of_stock_deactivated + a.invalid_product_deactivated;
      out.push({
        id: `a:${a.id}`, at: new Date(a.ran_at).getTime(), icon: ShieldCheck, tone: "text-muted-foreground",
        text: changed > 0 ? `Housekeeping cleaned up ${changed} deal${changed === 1 ? "" : "s"}` : "Housekeeping ran — nothing to fix",
      });
    }

    return out.sort((a, b) => b.at - a.at).slice(0, limit);
  }, [entries, events, audit, now, limit]);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No flash deal activity in the last few hours.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {items.map((i) => {
        const Icon = i.icon;
        return (
          <li key={i.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
            <span className={`grid size-8 shrink-0 place-items-center rounded-full border border-white/10 ${i.tone}`}>
              <Icon className="size-3.5" />
            </span>
            <p className="min-w-0 truncate text-xs">{i.text}</p>
            <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest tabular-nums text-muted-foreground">
              {ago(now - i.at)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
