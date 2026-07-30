import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Loader2,
  MessageSquarePlus, Search, Sparkles, Store, Bookmark, BookmarkPlus, Wallet,
} from "lucide-react";
import { SegmentedTabs } from "@/components/admin/SegmentedTabs";
import { EmptyState, Panel, StatKpi, money, when, ago } from "@/components/admin/payments/ui";
import type {
  ApprovalItem, FinanceNote, FinanceTask, FinanceWorkspace, SearchHit, TaskPriority, WorkspaceAction,
} from "@/lib/payments-workspace-v9.functions";

/** Saved views are per-admin and stored locally — no schema changes. */
type SavedFilter = { id: string; label: string; sub: SubTab; queue?: string; query?: string };
const SAVED_KEY = "fom.finance.saved-views.v9";

type SubTab = "tasks" | "calendar" | "approvals" | "vendors" | "search";

export type WorkspaceDecision = {
  ids: string[];
  queue: "refunds" | "payouts" | "reviews" | "exceptions";
  decision: "approved" | "rejected" | "reviewed";
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  critical: "text-destructive border-destructive/30 bg-destructive/10",
  high: "text-orange-400 border-orange-500/30 bg-orange-500/10",
  medium: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  low: "text-muted-foreground border-white/10 bg-white/5",
};

const RISK_TONE: Record<string, string> = {
  high: "text-destructive",
  medium: "text-amber-400",
  low: "text-emerald-400",
};

export function WorkspacePanel({
  data, loading, onAction, onOpenPayment, onSearch, onNote, onDecision,
}: {
  data: FinanceWorkspace;
  loading?: boolean;
  onAction: (a: WorkspaceAction) => void;
  onOpenPayment: (id: string) => void;
  onSearch: (q: string) => Promise<SearchHit[]>;
  onNote: (entityId: string, body: string, mention: string | null) => Promise<void>;
  onDecision: (d: WorkspaceDecision) => Promise<void>;
}) {
  const [sub, setSub] = useState<SubTab>("tasks");
  const [queue, setQueue] = useState<"refunds" | "payouts" | "reviews" | "exceptions">("refunds");
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(JSON.parse(raw) as SavedFilter[]);
    } catch { /* ignore corrupt local state */ }
  }, []);

  const persist = useCallback((next: SavedFilter[]) => {
    setSaved(next);
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* quota */ }
  }, []);

  const saveCurrent = useCallback(() => {
    const label =
      sub === "approvals" ? `${queue[0]!.toUpperCase()}${queue.slice(1)} queue`
      : sub === "search" && query ? `Search: ${query}`
      : sub === "vendors" ? "Vendor payouts"
      : sub === "calendar" ? "Finance calendar"
      : "My finance tasks";
    const id = `${sub}_${queue}_${query}`.toLowerCase();
    if (saved.some((s) => s.id === id)) return;
    persist([...saved, { id, label, sub, queue, query }].slice(0, 12));
  }, [sub, queue, query, saved, persist]);

  const openSaved = useCallback((f: SavedFilter) => {
    setSub(f.sub);
    if (f.queue) setQueue(f.queue as typeof queue);
    if (f.query) setQuery(f.query);
  }, []);

  const counts = data.approvals;
  const critical = data.tasks.filter((t) => t.priority === "critical").length;
  const totalImpact = data.tasks.reduce((s, t) => s + (t.impact ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Daily finance brief — one paragraph, real numbers only. */}
      <section className="glass border border-white/10 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          <Sparkles className="size-3 text-accent" /> Daily finance brief
          {loading && <Loader2 className="size-3 animate-spin text-accent" />}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/90">{data.brief.paragraph}</p>
        <p className="mt-1.5 text-[10px] text-muted-foreground/70">Generated {ago(data.brief.generated_at)}</p>
      </section>

      {/* One automation suggestion at a time. */}
      {data.suggestion && (
        <section className="glass border border-accent/25 bg-accent/[0.04] rounded-2xl p-4">
          <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.2em] text-accent">
            <Sparkles className="size-3" /> Recommended next action
          </div>
          <p className="mt-2 text-sm font-medium">{data.suggestion.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.suggestion.evidence}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onAction(data.suggestion!.action)}
              className="rounded-xl bg-accent/90 text-accent-foreground px-3 py-1.5 text-[11px] font-medium hover:bg-accent"
            >
              Do it now
            </button>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {Math.round(data.suggestion.confidence * 100)}% confidence
              {data.suggestion.impact != null && ` · ${money(data.suggestion.impact)} impact`}
            </span>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatKpi label="Open tasks" value={data.tasks.length} icon={<ClipboardList className="size-3" />}
          sub={`${critical} critical`} />
        <StatKpi label="Est. impact" value={money(totalImpact)} icon={<AlertTriangle className="size-3" />}
          sub="across open tasks" />
        <StatKpi label="Awaiting approval"
          value={counts.refunds.length + counts.payouts.length + counts.reviews.length + counts.exceptions.length}
          icon={<CheckCircle2 className="size-3" />} onClick={() => setSub("approvals")} drillHint="Open approval queues" />
        <StatKpi label="Pending payouts" value={data.brief.pending_payouts} icon={<Wallet className="size-3" />}
          onClick={() => setSub("vendors")} drillHint="Open vendor payout workspace" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedTabs
          value={sub}
          onChange={(v) => setSub(v as SubTab)}
          items={[
            { value: "tasks", label: "My tasks", icon: <ClipboardList className="size-3" /> },
            { value: "calendar", label: "Calendar", icon: <CalendarDays className="size-3" /> },
            { value: "approvals", label: "Approvals", icon: <CheckCircle2 className="size-3" /> },
            { value: "vendors", label: "Vendors", icon: <Store className="size-3" /> },
            { value: "search", label: "Search", icon: <Search className="size-3" /> },
          ]}
        />
        <button
          onClick={saveCurrent}
          title="Save this view"
          className="rounded-xl border border-white/10 px-2.5 py-2 text-[10px] hover:bg-white/5 inline-flex items-center gap-1.5"
        >
          <BookmarkPlus className="size-3" /> Save view
        </button>
      </div>

      {saved.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {saved.map((f) => (
            <span key={f.id} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] pl-2.5 pr-1 py-1 text-[10px]">
              <button onClick={() => openSaved(f)} className="inline-flex items-center gap-1 hover:text-accent">
                <Bookmark className="size-2.5" /> {f.label}
              </button>
              <button
                onClick={() => persist(saved.filter((s) => s.id !== f.id))}
                className="px-1 text-muted-foreground hover:text-destructive"
                title="Remove saved view"
              >×</button>
            </span>
          ))}
        </div>
      )}

      {sub === "tasks" && <TasksView tasks={data.tasks} notes={data.notes} onAction={onAction} onNote={onNote} />}
      {sub === "calendar" && <CalendarView events={data.calendar} />}
      {sub === "approvals" && (
        <ApprovalsView data={data} queue={queue} setQueue={setQueue} onDecision={onDecision} onOpenPayment={onOpenPayment} />
      )}
      {sub === "vendors" && <VendorsView data={data} />}
      {sub === "search" && <SearchView query={query} setQuery={setQuery} onSearch={onSearch} onOpenPayment={onOpenPayment} onAction={onAction} />}
    </div>
  );
}

/* ------------------------------------------------------------------ tasks */

function TasksView({
  tasks, notes, onAction, onNote,
}: {
  tasks: FinanceTask[];
  notes: FinanceNote[];
  onAction: (a: WorkspaceAction) => void;
  onNote: (entityId: string, body: string, mention: string | null) => Promise<void>;
}) {
  if (!tasks.length) {
    return (
      <Panel title="My finance tasks">
        <EmptyState title="Nothing needs your attention." hint="Tasks appear automatically when refunds, mismatches, payouts or gateway issues are detected in real data." />
      </Panel>
    );
  }
  return (
    <Panel title="My finance tasks" hint="Actionable work, highest impact first">
      <ul className="space-y-2.5">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} notes={notes.filter((n) => n.entity_id === t.id)} onAction={onAction} onNote={onNote} />
        ))}
      </ul>
    </Panel>
  );
}

function TaskRow({
  task, notes, onAction, onNote,
}: {
  task: FinanceTask;
  notes: FinanceNote[];
  onAction: (a: WorkspaceAction) => void;
  onNote: (entityId: string, body: string, mention: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [mention, setMention] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await onNote(task.id, body.trim(), mention.trim() || null);
      setBody(""); setMention("");
    } finally { setBusy(false); }
  };

  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.15em] ${PRIORITY_TONE[task.priority]}`}>
              {task.priority}
            </span>
            {task.assigned_to && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-muted-foreground">
                @{task.assigned_to}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm font-medium truncate">{task.title}</p>
          <p className="text-xs text-muted-foreground">{task.detail}</p>
          <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/80">
            {task.impact != null ? `${money(task.impact)} impact` : "impact not quantifiable"}
            {task.due_at && ` · due ${new Date(task.due_at).toLocaleDateString("en-IN")}`}
            {` · ${task.count} record${task.count === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            onClick={() => onAction(task.action)}
            className="rounded-xl bg-accent/90 text-accent-foreground px-3 py-1.5 text-[11px] font-medium hover:bg-accent"
          >
            Resolve
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl border border-white/10 px-3 py-1.5 text-[10px] hover:bg-white/5 inline-flex items-center gap-1"
          >
            <MessageSquarePlus className="size-3" /> Notes{notes.length ? ` (${notes.length})` : ""}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 border-t border-white/5 pt-3 space-y-2">
          {notes.length === 0 && <p className="text-[11px] text-muted-foreground">No internal notes yet.</p>}
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl bg-white/[0.03] border border-white/5 p-2.5">
              <p className="text-xs">{n.body}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {n.author ?? "admin"} · {when(n.at)}
                {n.mention && ` · @${n.mention}`}
                {n.resolved_by && ` · resolved by ${n.resolved_by}`}
              </p>
            </div>
          ))}
          <div className="grid gap-1.5 sm:grid-cols-[1fr_140px_auto]">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Internal note (team only)"
              className="bg-white/[0.03] border border-white/10 rounded-xl px-2.5 py-2 text-[11px] focus:outline-none focus:border-accent/40"
            />
            <input
              value={mention}
              onChange={(e) => setMention(e.target.value)}
              placeholder="Mention admin"
              className="bg-white/[0.03] border border-white/10 rounded-xl px-2.5 py-2 text-[11px] focus:outline-none focus:border-accent/40"
            />
            <button
              onClick={submit}
              disabled={busy || !body.trim()}
              className="rounded-xl border border-white/10 px-3 py-2 text-[11px] hover:bg-white/5 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Add note"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/* --------------------------------------------------------------- calendar */

const KIND_TONE: Record<string, string> = {
  settlement: "text-sky-400 border-sky-500/30 bg-sky-500/10",
  payout: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  refund_batch: "text-violet-300 border-violet-500/30 bg-violet-500/10",
  tax: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  export: "text-muted-foreground border-white/10 bg-white/5",
};

function CalendarView({ events }: { events: FinanceWorkspace["calendar"] }) {
  const [view, setView] = useState<"month" | "week" | "day">("month");

  const filtered = useMemo(() => {
    const now = Date.now();
    const span = view === "day" ? 1 : view === "week" ? 7 : 31;
    return events.filter((e) => {
      const d = new Date(`${e.date}T00:00:00Z`).getTime();
      return Math.abs(d - now) <= span * 86_400_000;
    });
  }, [events, view]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <Panel
      title="Finance calendar"
      hint="Settlements · payouts · refund batches · tax dates · exports"
      actions={
        <SegmentedTabs
          value={view}
          onChange={(v) => setView(v as typeof view)}
          items={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "day", label: "Day" }]}
        />
      }
    >
      {grouped.length === 0 ? (
        <EmptyState title="No data available" hint="Calendar entries appear as soon as payments, payouts, refunds or exports are recorded." />
      ) : (
        <ul className="space-y-3">
          {grouped.map(([date, list]) => (
            <li key={date}>
              <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {list.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.15em] ${KIND_TONE[e.kind]}`}>
                        {e.kind.replace("_", " ")}
                      </span>
                      <span className="text-xs truncate">{e.label}</span>
                      {e.indicative && <span className="text-[9px] text-muted-foreground/70">indicative</span>}
                    </span>
                    {e.amount != null && <span className="text-xs font-mono tabular-nums shrink-0">{money(e.amount)}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------- approvals */

function ApprovalsView({
  data, queue, setQueue, onDecision, onOpenPayment,
}: {
  data: FinanceWorkspace;
  queue: "refunds" | "payouts" | "reviews" | "exceptions";
  setQueue: (q: "refunds" | "payouts" | "reviews" | "exceptions") => void;
  onDecision: (d: WorkspaceDecision) => Promise<void>;
  onOpenPayment: (id: string) => void;
}) {
  const items: ApprovalItem[] = data.approvals[queue];
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSelected([]); }, [queue]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const decide = async (decision: "approved" | "rejected" | "reviewed") => {
    if (!selected.length) return;
    setBusy(true);
    try { await onDecision({ ids: selected, queue, decision }); setSelected([]); }
    finally { setBusy(false); }
  };

  return (
    <Panel
      title="Approval workspace"
      hint="Decisions are recorded in the audit trail; settlement stays with the existing engines"
      actions={
        <SegmentedTabs
          value={queue}
          onChange={(v) => setQueue(v as typeof queue)}
          items={[
            { value: "refunds", label: `Refunds (${data.approvals.refunds.length})` },
            { value: "payouts", label: `Payouts (${data.approvals.payouts.length})` },
            { value: "reviews", label: `Reviews (${data.approvals.reviews.length})` },
            { value: "exceptions", label: `Exceptions (${data.approvals.exceptions.length})` },
          ]}
        />
      }
    >
      {items.length === 0 ? (
        <EmptyState title="No data available" hint="This queue is empty — nothing is waiting on a finance decision." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            <button onClick={() => setSelected(items.map((i) => i.id))} className="text-[10px] text-muted-foreground hover:text-accent">
              Select all
            </button>
            <button onClick={() => setSelected([])} className="text-[10px] text-muted-foreground hover:text-accent">Clear</button>
            <span className="text-[10px] text-muted-foreground">{selected.length} selected</span>
            <div className="ml-auto flex gap-1.5">
              <button disabled={busy || !selected.length} onClick={() => decide("approved")}
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 px-3 py-1.5 text-[11px] disabled:opacity-40">
                Approve
              </button>
              <button disabled={busy || !selected.length} onClick={() => decide("rejected")}
                className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive px-3 py-1.5 text-[11px] disabled:opacity-40">
                Reject
              </button>
              <button disabled={busy || !selected.length} onClick={() => decide("reviewed")}
                className="rounded-xl border border-white/10 px-3 py-1.5 text-[11px] hover:bg-white/5 disabled:opacity-40">
                Mark reviewed
              </button>
            </div>
          </div>
          <ul className="space-y-1.5">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                <input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} className="accent-[var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{i.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{i.subtitle}</p>
                  <p className="text-[10px] text-muted-foreground/80">
                    <span className={RISK_TONE[i.risk]}>{i.risk} risk</span> · {i.reason} · {Math.round(i.age_hours)}h old
                    {i.reviewed && ` · reviewed ${i.reviewed_at ? ago(i.reviewed_at) : ""}`}
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums shrink-0">{i.amount != null ? money(i.amount, i.currency) : "—"}</span>
                {queue === "reviews" && (
                  <button onClick={() => onOpenPayment(i.id)} className="text-muted-foreground hover:text-accent" title="Open record">
                    <ChevronRight className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- vendors */

function VendorsView({ data }: { data: FinanceWorkspace }) {
  if (!data.vendors.length) {
    return (
      <Panel title="Vendor payout workspace">
        <EmptyState title="No data available" hint="Vendor balances appear once commissions or payouts are recorded." />
      </Panel>
    );
  }
  return (
    <Panel title="Vendor payout workspace" hint="Balances and payout schedule — read only">
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {data.vendors.map((v) => (
          <li key={v.vendor_id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{v.name}</p>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-mono uppercase tracking-[0.15em]">
                {v.payout_status}
              </span>
            </div>
            <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
              <Row label="Balance" value={money(v.balance, v.currency)} />
              <Row label="Pending payout" value={money(v.pending_payout, v.currency)} />
              <Row label="Revenue" value={money(v.revenue, v.currency)} />
              <Row label="Refunds" value={v.refunds == null ? "No data" : money(v.refunds, v.currency)} />
              <Row label="Last payout" value={v.last_payout ? `${money(v.last_payout.amount, v.currency)} · ${ago(v.last_payout.at)}` : "None"} />
              <Row label="Next payout" value={v.next_payout_date ?? "Not scheduled"} />
            </dl>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground">{label}</dt>
      <dd className="truncate tabular-nums">{value}</dd>
    </div>
  );
}

/* ----------------------------------------------------------------- search */

function SearchView({
  query, setQuery, onSearch, onOpenPayment, onAction,
}: {
  query: string;
  setQuery: (q: string) => void;
  onSearch: (q: string) => Promise<SearchHit[]>;
  onOpenPayment: (id: string) => void;
  onAction: (a: WorkspaceAction) => void;
}) {
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits(null); return; }
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      onSearch(q)
        .then((r) => { if (alive) setHits(r); })
        .catch(() => { if (alive) setHits([]); })
        .finally(() => { if (alive) setBusy(false); });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [query, onSearch]);

  return (
    <Panel title="Finance search" hint="Order · payment · refund · vendor · customer email · gateway · country · currency">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search anything in finance…"
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs focus:outline-none focus:border-accent/40"
        />
        {busy && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-accent" />}
      </div>

      {hits && hits.length === 0 && <div className="pt-4"><EmptyState title="No matching records." /></div>}
      {hits && hits.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {hits.map((h) => (
            <li key={`${h.kind}_${h.id}`}>
              <button
                onClick={() => {
                  if (h.open.paymentId) return onOpenPayment(h.open.paymentId);
                  if (h.open.tab === "vendors") return onAction("vendors");
                  onAction("ledger_all");
                }}
                className="w-full text-left flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 hover:border-accent/40"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium truncate">{h.label}</span>
                  <span className="block text-[10px] text-muted-foreground truncate">
                    {h.kind} · {h.detail}{h.at ? ` · ${when(h.at)}` : ""}
                  </span>
                </span>
                {h.amount != null && (
                  <span className="text-xs font-mono tabular-nums shrink-0">{money(h.amount, h.currency ?? "INR")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
