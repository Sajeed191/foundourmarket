import { useMemo, useState } from "react";
import {
  History, RotateCcw, GitCompare, Copy, Eye, Plus, Minus, PencilLine, Clock,
} from "lucide-react";
import {
  diffSnapshots, formatClock, formatStamp, readTimeline, readVersions,
  deleteVersion, type FieldDiff, type VersionSnapshot,
} from "@/lib/publishing-workflow";

/**
 * Product Timeline, Version History and Compare Changes — Editor 7.0.
 * Lazy-loaded: never part of the editor's initial bundle.
 */
export function TimelinePanel({
  slug,
  current,
  onRestore,
  onDuplicate,
  onPreview,
}: {
  slug: string;
  current: Record<string, unknown>;
  onRestore: (data: Record<string, unknown>) => void;
  onDuplicate: (data: Record<string, unknown>) => void;
  onPreview: (data: Record<string, unknown>) => void;
}) {
  const [tab, setTab] = useState<"timeline" | "versions">("timeline");
  const [events, setEvents] = useState(() => readTimeline(slug));
  const [versions, setVersions] = useState(() => readVersions(slug));
  const [compare, setCompare] = useState<VersionSnapshot | null>(null);

  const diffs = useMemo(
    () => (compare ? diffSnapshots(compare.data, current) : []),
    [compare, current],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
        {(["timeline", "versions"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setEvents(readTimeline(slug)); setVersions(readVersions(slug)); }}
            className={`min-h-9 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors duration-200 ${
              tab === t ? "bg-accent/15 text-accent" : "text-muted-foreground"
            }`}
          >
            {t === "timeline" ? "Timeline" : `Versions (${versions.length})`}
          </button>
        ))}
      </div>

      {tab === "timeline" ? (
        events.length === 0 ? (
          <Empty text="Activity appears here as you edit, save and publish." />
        ) : (
          <ol className="relative space-y-0 pl-4">
            <span aria-hidden className="absolute left-[5px] top-2 bottom-2 w-px bg-white/10" />
            {events.map((e) => (
              <li key={e.id} className="relative grid grid-cols-[auto_minmax(0,1fr)] gap-3 py-2">
                <span aria-hidden className="absolute -left-4 top-3.5 size-[9px] rounded-full border border-accent/50 bg-accent/25" />
                <span className="w-11 shrink-0 pt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
                  {formatClock(e.at)}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-medium">{e.label}</span>
                  {e.detail && <span className="mt-0.5 block text-[11px] text-muted-foreground">{e.detail}</span>}
                  {e.versionId && (
                    <button
                      type="button"
                      onClick={() => {
                        const v = readVersions(slug).find((x) => x.id === e.versionId);
                        if (v) onRestore(v.data);
                      }}
                      className="mt-1 inline-flex min-h-8 items-center gap-1 rounded-full border border-white/12 px-2.5 text-[10px] font-semibold text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    >
                      <RotateCcw className="size-3" /> Undo restore point
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )
      ) : versions.length === 0 ? (
        <Empty text="Snapshots are captured on save, publish and major AI applies." />
      ) : (
        <ul className="space-y-2">
          {versions.map((v) => (
            <li key={v.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex items-start gap-2">
                <History className="mt-0.5 size-3.5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium">{v.label}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="size-3" /> {formatStamp(v.at)}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <MiniBtn icon={GitCompare} label="Compare" onClick={() => setCompare(v)} />
                <MiniBtn icon={RotateCcw} label="Restore" onClick={() => onRestore(v.data)} />
                <MiniBtn icon={Copy} label="Duplicate" onClick={() => onDuplicate(v.data)} />
                <MiniBtn icon={Eye} label="Preview" onClick={() => onPreview(v.data)} />
                <MiniBtn
                  icon={Minus}
                  label="Delete"
                  onClick={() => setVersions(deleteVersion(slug, v.id))}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {compare && (
        <CompareView
          diffs={diffs}
          label={compare.label}
          onClose={() => setCompare(null)}
          onRestore={() => { onRestore(compare.data); setCompare(null); }}
        />
      )}
    </div>
  );
}

function MiniBtn({ icon: Icon, label, onClick }: { icon: typeof Eye; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.02] px-2.5 text-[11px] font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground active:scale-[0.98]"
    >
      <Icon className="size-3" /> {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[11px] text-muted-foreground">{text}</p>;
}

/* ------------------------------ compare view ------------------------------ */

function CompareView({
  diffs, label, onClose, onRestore,
}: { diffs: FieldDiff[]; label: string; onClose: () => void; onRestore: () => void }) {
  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Compare changes">
      <button type="button" aria-label="Close compare" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/12 bg-[#0b0d12] sm:rounded-3xl">
        <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-3">
          <GitCompare className="size-4 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Compare changes</p>
            <p className="truncate text-[11px] text-muted-foreground">{label} → current draft</p>
          </div>
          <button type="button" onClick={onClose} className="min-h-9 rounded-full border border-white/12 px-3 text-[11px] text-muted-foreground">Close</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {diffs.length === 0 ? (
            <Empty text="No differences — this snapshot matches the current draft." />
          ) : (
            <ul className="space-y-3">
              {diffs.map((d) => (
                <li key={d.field} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
                    {d.kind === "added" ? <Plus className="size-3 text-emerald-400" />
                      : d.kind === "removed" ? <Minus className="size-3 text-destructive" />
                      : <PencilLine className="size-3 text-amber-400" />}
                    {d.label}
                    <span className="text-[9px] font-mono text-muted-foreground">{d.kind}</span>
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-destructive/20 bg-destructive/[0.06] p-2 text-[11px] text-muted-foreground">{d.before || "—"}</pre>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-2 text-[11px]">{d.after || "—"}</pre>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.08] px-4 py-3">
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-4 text-xs font-semibold text-accent-foreground transition-transform duration-200 active:scale-[0.98]"
          >
            <RotateCcw className="size-3.5" /> Restore this version
          </button>
        </div>
      </div>
    </div>
  );
}
