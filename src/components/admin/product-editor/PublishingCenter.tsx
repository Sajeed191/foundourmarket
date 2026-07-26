import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Send, EyeOff, Archive, CalendarClock, CheckCircle2, AlertTriangle, ChevronRight,
  ShieldCheck, Users, History, Eye, Loader2, Copy, ArrowUpRight, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { DraftOverlay } from "@/lib/pdp-preview-channel";
import {
  buildChecklist, buildInsights, buildQualityScore, IMPACT_RANK, logEvent, normalizeTitle,
  rankDuplicates, readSchedule, writeSchedule, WORKFLOW_LABEL, WORKFLOW_TONE,
  type DuplicateHit, type Impact, type ScheduleAction, type WorkflowInput, type WorkflowStatus,
} from "@/lib/publishing-workflow";

const TimelinePanel = lazy(() =>
  import("@/components/admin/product-editor/TimelinePanel").then((m) => ({ default: m.TimelinePanel })),
);
const PublishingPreview = lazy(() =>
  import("@/components/admin/product-editor/PublishingPreview").then((m) => ({ default: m.PublishingPreview })),
);

const IMPACT_STYLE: Record<Impact, string> = {
  critical: "text-destructive",
  high: "text-amber-400",
  medium: "text-accent",
  low: "text-muted-foreground",
};

const TONE_TEXT = {
  excellent: "text-emerald-400",
  good: "text-accent",
  warn: "text-amber-400",
  bad: "text-destructive",
} as const;

export type PublishingCenterProps = {
  slug: string;
  input: WorkflowInput;
  overlay: DraftOverlay;
  images: string[];
  snapshot: Record<string, unknown>;
  busy: boolean;
  lastModified?: string | null;
  editorName?: string | null;
  onSetStatus: (status: WorkflowStatus) => void | Promise<void>;
  onJump: (target: string) => void;
  onRestore: (data: Record<string, unknown>) => void;
};

/**
 * Publishing Center — Product Editor 7.0.
 * Status, pre-publish checklist, quality score, readiness, insights,
 * scheduling, duplicate protection, timeline/versions and publish previews.
 * Publishing is never blocked — issues are advisory.
 */
export function PublishingCenter({
  slug, input, overlay, images, snapshot, busy, lastModified, editorName,
  onSetStatus, onJump, onRestore,
}: PublishingCenterProps) {
  const checklist = useMemo(() => buildChecklist(input), [input]);
  const score = useMemo(() => buildQualityScore(input, checklist), [input, checklist]);
  const insights = useMemo(() => buildInsights(score), [score]);

  const failing = useMemo(
    () => checklist.filter((c) => !c.ok).sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact]),
    [checklist],
  );
  const blockingCount = failing.filter((c) => c.impact === "critical" || c.impact === "high").length;

  const [panel, setPanel] = useState<"none" | "checklist" | "timeline" | "preview">("none");
  const [schedule, setSchedule] = useState(() => readSchedule(slug));
  const [dupes, setDupes] = useState<DuplicateHit[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const status = input.status;

  // Command palette can open a specific panel.
  useEffect(() => {
    const handler = (e: Event) => {
      const p = (e as CustomEvent<string>).detail;
      if (p === "checklist" || p === "timeline" || p === "preview") setPanel(p);
    };
    window.addEventListener("editor-publishing-panel", handler);
    return () => window.removeEventListener("editor-publishing-panel", handler);
  }, []);

  /* --- Scheduled publishing: applied while an admin has the editor open --- */
  useEffect(() => {
    if (!schedule) return;
    const tick = () => {
      const job = readSchedule(slug);
      if (!job || Date.now() < job.at) return;
      writeSchedule(slug, null);
      setSchedule(null);
      const next: WorkflowStatus = job.action === "publish" ? "published" : job.action === "archive" ? "archived" : "draft";
      logEvent(slug, `Scheduled ${job.action} ran`, WORKFLOW_LABEL[next]);
      void onSetStatus(next);
    };
    const id = window.setInterval(tick, 15_000);
    tick();
    return () => window.clearInterval(id);
  }, [schedule, slug, onSetStatus]);

  const runDuplicateScan = useCallback(async () => {
    setScanning(true);
    const hits: DuplicateHit[] = [];
    const title = normalizeTitle(input.name).split(" ").slice(0, 4).join(" ");
    const [byTitle, bySku] = await Promise.all([
      title
        ? supabase.from("products").select("slug,name").ilike("name", `%${title}%`).neq("slug", slug).limit(5)
        : Promise.resolve({ data: [] as { slug: string; name: string }[] }),
      input.sku.trim()
        ? supabase.from("products").select("slug,name").eq("sku", input.sku.trim()).neq("slug", slug).limit(5)
        : Promise.resolve({ data: [] as { slug: string; name: string }[] }),
    ]);
    for (const r of (bySku.data ?? []) as { slug: string; name: string }[]) {
      hits.push({ slug: r.slug, name: r.name, reason: "sku", confidence: "likely" });
    }
    for (const r of (byTitle.data ?? []) as { slug: string; name: string }[]) {
      hits.push({ slug: r.slug, name: r.name, reason: "title", confidence: "possible" });
    }
    setScanning(false);
    const ranked = rankDuplicates(hits);
    setDupes(ranked);
    return ranked;
  }, [input.name, input.sku, slug]);

  async function publishNow() {
    const found = await runDuplicateScan();
    if (found.length) return; // duplicate sheet takes over; admin can ignore & publish
    await onSetStatus("published");
    logEvent(slug, "Published", `${score.overall}/100 quality score`);
  }

  return (
    <section data-editor-field="publishing" className="card-premium overflow-hidden rounded-2xl">
      {/* Status + primary recommendation */}
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Publishing Center</p>
            <p className={`mt-0.5 text-[11px] font-mono uppercase tracking-wider ${WORKFLOW_TONE[status]}`}>
              {WORKFLOW_LABEL[status]}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-xl font-bold leading-none tabular-nums ${TONE_TEXT[score.tone]}`}>{score.overall}</p>
            <p className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">Score / 100</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => (failing.length ? setPanel(panel === "checklist" ? "none" : "checklist") : publishNow())}
          className="mt-3 grid w-full min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 text-left transition-colors duration-200 hover:border-white/20"
        >
          {failing.length === 0
            ? <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
            : <AlertTriangle className={`size-4 shrink-0 ${blockingCount ? "text-amber-400" : "text-muted-foreground"}`} />}
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold">
              {failing.length === 0 ? "Ready to publish" : `${failing.length} issue${failing.length === 1 ? "" : "s"} remaining`}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">{score.recommendation}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>

        {/* Primary actions */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {status !== "published" ? (
            <Action primary icon={Send} label="Publish now" busy={busy} onClick={publishNow} />
          ) : (
            <Action icon={EyeOff} label="Unpublish" busy={busy} onClick={() => onSetStatus("draft")} />
          )}
          <Action icon={CheckCircle2} label="Ready for review" busy={busy} onClick={() => onSetStatus("ready_for_review")} />
          <Action icon={ShieldCheck} label="Approve" busy={busy} onClick={() => onSetStatus("approved")} />
          <Action icon={Archive} label="Archive" busy={busy} onClick={() => onSetStatus("archived")} />
        </div>

        {/* Schedule */}
        <ScheduleRow
          slug={slug}
          schedule={schedule}
          onChange={(job) => { writeSchedule(slug, job); setSchedule(job); }}
        />
      </div>

      {/* Readiness card + insights */}
      <div className="border-t border-white/[0.08] p-3.5">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Ready for Marketplace</p>
              <p className={`mt-0.5 text-2xl font-bold leading-none tabular-nums ${TONE_TEXT[score.tone]}`}>{score.overall}%</p>
            </div>
            <div className="h-9 w-px bg-white/10" />
            <div className="grid flex-1 grid-cols-2 gap-2 text-[10px]">
              {insights.slice(0, 2).map((x) => (
                <span key={x.id} className="min-w-0">
                  <span className="block truncate text-muted-foreground">{x.label}</span>
                  <span className={`block truncate font-semibold ${TONE_TEXT[x.tone]}`}>{x.value}</span>
                </span>
              ))}
            </div>
          </div>
          {failing[0] && (
            <button
              type="button"
              onClick={() => onJump(failing[0].target)}
              className="mt-2.5 inline-flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border border-accent/25 bg-accent/[0.07] px-2.5 text-left text-[11px] transition-colors duration-200 hover:bg-accent/[0.12]"
            >
              <span className="min-w-0 truncate">{failing[0].hint}</span>
              <span className="shrink-0 font-semibold text-accent">Fix</span>
            </button>
          )}
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-1.5">
          {insights.map((x) => (
            <div key={x.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-center">
              <p className="truncate text-[8px] font-mono uppercase tracking-[0.14em] text-muted-foreground">{x.label}</p>
              <p className={`mt-0.5 truncate text-[12px] font-semibold ${TONE_TEXT[x.tone]}`}>{x.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Panels */}
      <div className="border-t border-white/[0.08] p-3.5">
        <div className="grid grid-cols-3 gap-1.5">
          <Tab icon={CheckCircle2} label="Checklist" active={panel === "checklist"} onClick={() => setPanel(panel === "checklist" ? "none" : "checklist")} />
          <Tab icon={History} label="History" active={panel === "timeline"} onClick={() => setPanel(panel === "timeline" ? "none" : "timeline")} />
          <Tab icon={Eye} label="Preview" active={panel === "preview"} onClick={() => setPanel(panel === "preview" ? "none" : "preview")} />
        </div>

        {panel === "checklist" && (
          <ul className="mt-3 space-y-1">
            {[...checklist].sort((a, b) => Number(a.ok) - Number(b.ok) || IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact]).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => !c.ok && onJump(c.target)}
                  className={`grid w-full min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 text-left transition-colors duration-200 ${c.ok ? "cursor-default" : "hover:bg-white/[0.04]"}`}
                >
                  {c.ok
                    ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                    : <AlertTriangle className={`size-3.5 shrink-0 ${IMPACT_STYLE[c.impact]}`} />}
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium">{c.label}</span>
                    {!c.ok && <span className="block truncate text-[11px] text-muted-foreground">{c.hint}</span>}
                  </span>
                  {!c.ok && (
                    <span className={`shrink-0 text-[9px] font-mono uppercase tracking-wider ${IMPACT_STYLE[c.impact]}`}>{c.impact}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {panel === "timeline" && (
          <div className="mt-3">
            <Suspense fallback={<PanelFallback />}>
              <TimelinePanel
                slug={slug}
                current={snapshot}
                onRestore={onRestore}
                onDuplicate={(data) => {
                  void navigator.clipboard?.writeText(JSON.stringify(data, null, 2));
                }}
                onPreview={(data) => onRestore(data)}
              />
            </Suspense>
          </div>
        )}

        {panel === "preview" && (
          <div className="mt-3">
            <Suspense fallback={<PanelFallback />}>
              <PublishingPreview slug={slug} overlay={overlay} images={images} price={input.price} brand={input.brand} />
            </Suspense>
          </div>
        )}
      </div>

      {/* Score breakdown */}
      <div className="border-t border-white/[0.08] p-3.5">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Quality breakdown</p>
        <ul className="mt-2 space-y-1.5">
          {score.groups.map((g) => (
            <li key={g.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <span className="min-w-0">
                <span className="block truncate text-[11.5px]">{g.label}</span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
                  <span
                    className={`block h-full rounded-full transition-[width] duration-200 ${g.score >= 90 ? "bg-emerald-400" : g.score >= 75 ? "bg-accent" : g.score >= 50 ? "bg-amber-400" : "bg-destructive"}`}
                    style={{ width: `${g.score}%` }}
                  />
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">{g.score}%</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Team-ready foundation */}
      <div className="grid grid-cols-2 gap-2 border-t border-white/[0.08] p-3.5 text-[11px]">
        <Meta label="Current editor" value={editorName || "You"} />
        <Meta label="Last modified" value={lastModified ? new Date(lastModified).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"} />
        <Meta label="Review status" value={WORKFLOW_LABEL[status]} />
        <Meta label="Assigned reviewer" value="Unassigned" />
        <div className="col-span-2 flex items-center gap-1.5 rounded-lg border border-dashed border-white/10 px-2.5 py-2 text-[10.5px] text-muted-foreground">
          <Users className="size-3.5 shrink-0" /> Comments and reviewer assignment arrive with team collaboration.
        </div>
      </div>

      {dupes && dupes.length > 0 && (
        <DuplicateSheet
          hits={dupes}
          scanning={scanning}
          onClose={() => setDupes(null)}
          onIgnore={async () => { setDupes(null); await onSetStatus("published"); logEvent(slug, "Published", "Duplicate warning ignored"); }}
        />
      )}
    </section>
  );
}

/* ------------------------------- pieces ------------------------------- */

function Action({ icon: Icon, label, onClick, busy, primary }: {
  icon: typeof Send; label: string; onClick: () => void; busy?: boolean; primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[11.5px] font-semibold transition-transform duration-200 active:scale-[0.98] disabled:opacity-50 ${
        primary ? "bg-accent text-accent-foreground" : "border border-white/12 text-muted-foreground hover:text-foreground"
      }`}
    >
      {busy && primary ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />} {label}
    </button>
  );
}

function Tab({ icon: Icon, label, active, onClick }: { icon: typeof Eye; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-[11.5px] font-semibold transition-colors duration-200 ${
        active ? "border-accent/40 bg-accent/15 text-accent" : "border-white/10 bg-white/[0.02] text-muted-foreground"
      }`}
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2">
      <p className="truncate text-[8px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-medium">{value}</p>
    </div>
  );
}

function PanelFallback() {
  return (
    <div className="grid min-h-24 place-items-center rounded-xl border border-white/10 bg-white/[0.02]">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function ScheduleRow({ slug, schedule, onChange }: {
  slug: string;
  schedule: { action: ScheduleAction; at: number } | null;
  onChange: (job: { action: ScheduleAction; at: number } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ScheduleAction>("publish");
  const [when, setWhen] = useState("");

  if (schedule) {
    return (
      <div className="mt-2.5 flex min-h-11 items-center gap-2 rounded-xl border border-sky-400/25 bg-sky-400/[0.07] px-3 text-[11.5px]">
        <CalendarClock className="size-3.5 shrink-0 text-sky-400" />
        <span className="min-w-0 flex-1 truncate">
          {schedule.action === "publish" ? "Publishes" : schedule.action === "archive" ? "Archives" : "Unpublishes"} on{" "}
          {new Date(schedule.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
        <button type="button" onClick={() => onChange(null)} className="shrink-0 font-semibold text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/12 px-3.5 text-[11.5px] font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground"
        >
          <CalendarClock className="size-3.5" /> Schedule
        </button>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(["publish", "unpublish", "archive"] as ScheduleAction[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAction(a)}
                className={`min-h-9 rounded-full px-3 text-[11px] font-semibold capitalize transition-colors duration-200 ${
                  action === a ? "bg-accent/15 text-accent" : "text-muted-foreground"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            aria-label="Schedule date and time"
            className="mt-2 min-h-11 w-full rounded-lg border border-white/12 bg-white/[0.03] px-2.5 text-[12px] outline-none focus:border-accent/40"
          />
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Runs from the admin workspace — keep this product open, or it applies the next time an admin opens it.
          </p>
          <div className="mt-2 flex justify-end gap-1.5">
            <button type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-full px-3 text-[11px] text-muted-foreground">Cancel</button>
            <button
              type="button"
              disabled={!when}
              onClick={() => {
                const at = new Date(when).getTime();
                if (!Number.isFinite(at)) return;
                onChange({ action, at });
                logEvent(slug, `Scheduled ${action}`, new Date(at).toLocaleString());
                setOpen(false);
              }}
              className="min-h-9 rounded-full bg-accent px-3.5 text-[11px] font-semibold text-accent-foreground disabled:opacity-50"
            >
              Schedule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DuplicateSheet({ hits, scanning, onClose, onIgnore }: {
  hits: DuplicateHit[]; scanning: boolean; onClose: () => void; onIgnore: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Possible duplicates">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-3xl border border-white/12 bg-[#0b0d12] sm:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-3">
          <Copy className="size-4 text-amber-400" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">Possible duplicate</p>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full border border-white/12 text-muted-foreground">
            <X className="size-3.5" />
          </button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-4">
          {scanning && <PanelFallback />}
          <ul className="space-y-2">
            {hits.map((h) => (
              <li key={`${h.reason}-${h.slug}`} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="truncate text-[12.5px] font-medium">{h.name}</p>
                <p className="mt-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {h.confidence} · matching {h.reason}
                </p>
                <a
                  href={`/admin-product/${h.slug}/details`}
                  className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-full border border-white/12 px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Open existing <ArrowUpRight className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] px-4 py-3">
          <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-white/12 px-3.5 text-[11.5px] font-semibold text-muted-foreground">Review first</button>
          <button type="button" onClick={onIgnore} className="min-h-11 rounded-full bg-accent px-3.5 text-[11.5px] font-semibold text-accent-foreground transition-transform duration-200 active:scale-[0.98]">
            Ignore & publish
          </button>
        </div>
      </div>
    </div>
  );
}
