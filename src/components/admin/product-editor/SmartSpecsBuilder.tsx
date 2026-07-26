// ============================================================
// SmartSpecsBuilder — Product Editor 3.0
// Admin never builds specification cards by hand. They paste or
// type "Label : Value" rows; grouping into the exact cards the
// customer Product Details page renders happens automatically.
//
// Paste (Excel / Sheets / Alibaba / Amazon / PDF / CSV) · label
// normalization · duplicate merge · search · drag reordering.
// Pure UI over the existing specifications key/value field.
// ============================================================
import { useMemo, useRef, useState } from "react";
import {
  Plus, Trash2, GripVertical, ClipboardPaste, Wand2, Search, X, Layers, ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { SmartEmpty } from "@/components/admin/product-editor/EmptyStates";

import {
  parseSpecPaste, mergeSpecRows, cleanSpecRows, groupSpecs, groupForSpec, reorderRows, normalizeLabel,
  type SpecRow,
} from "@/lib/spec-intelligence";

export function SmartSpecsBuilder({
  rows,
  onChange,
}: {
  rows: SpecRow[];
  onChange: (rows: SpecRow[]) => void;
}) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [query, setQuery] = useState("");
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const groups = useMemo(() => groupSpecs(rows), [rows]);
  const filled = rows.filter((r) => r.k.trim()).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) =>
        !q ||
        r.k.toLowerCase().includes(q) ||
        r.v.toLowerCase().includes(q) ||
        groupForSpec(r.k).toLowerCase().includes(q),
      );
  }, [rows, query]);

  const update = (i: number, patch: Partial<SpecRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, { k: "", v: "" }]);

  function applyText(text: string) {
    const parsed = parseSpecPaste(text);
    if (!parsed.length) {
      toast.error("Nothing to import", { description: "Use “Label : Value” rows, or paste a table." });
      return;
    }
    const { rows: next, added, updated, skipped } = mergeSpecRows(rows, parsed);
    onChange(next);
    setPasteText("");
    setPasteOpen(false);
    toast.success(`${added} added · ${updated} updated`, {
      description: skipped ? `${skipped} duplicate row${skipped === 1 ? "" : "s"} skipped` : "Cards are grouped automatically.",
    });
  }

  function cleanUp() {
    const { rows: next, updated, skipped } = cleanSpecRows(rows);
    onChange(next);
    toast.success("Specifications cleaned", {
      description: `${updated} value${updated === 1 ? "" : "s"} merged · ${skipped} duplicate${skipped === 1 ? "" : "s"} removed`,
    });
  }

  function onDrop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragOver(null);
    if (from === null) return;
    onChange(reorderRows(rows, from, to));
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPasteOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-all hover:bg-accent/20 active:scale-[0.97]"
        >
          <ClipboardPaste className="size-3.5" /> Smart Paste
        </button>
        <button
          type="button"
          onClick={cleanUp}
          disabled={!filled}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-accent/40 hover:text-foreground active:scale-[0.97] disabled:opacity-40"
        >
          <Wand2 className="size-3.5" /> Clean up
        </button>
        <div className="relative ml-auto min-w-[8rem] flex-1 sm:max-w-[14rem]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search specifications"
            aria-label="Search specifications"
            className="w-full rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-7 text-xs focus:border-accent/40 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Paste surface */}
      {pasteOpen && (
        <div className="rounded-xl border border-accent/25 bg-accent/[0.04] p-3">
          <p className="text-[11px] text-muted-foreground">
            Paste from Excel, Google Sheets, Alibaba, Amazon, a PDF or plain text. Labels are
            title-cased, values cleaned, duplicates merged.
          </p>
          <textarea
            autoFocus
            value={pasteText}
            rows={6}
            onChange={(e) => setPasteText(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text/plain");
              if (text.trim()) {
                e.preventDefault();
                applyText(text);
              }
            }}
            placeholder={"Battery Capacity\t3000mAh\nCharging Time : 2 Hours\nMaterial: ABS\nWeight — 900g"}
            className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-xs focus:border-accent/40 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => applyText(pasteText)}
              className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110 active:scale-[0.97]"
            >
              Import specifications
            </button>
            <button
              type="button"
              onClick={() => { setPasteOpen(false); setPasteText(""); }}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Auto-generated card map (exactly what the customer page renders) */}
      {groups.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
          <p className="mb-2 flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            <Layers className="size-3" /> Auto-generated cards
          </p>
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <button
                key={g.group}
                type="button"
                onClick={() => setQuery(g.group)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-all hover:border-accent/40 hover:text-foreground active:scale-95"
              >
                {g.group}
                <span className="rounded-full bg-accent/15 px-1.5 text-[9px] font-mono text-accent">{g.rows.length}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rows */}
      {rows.length === 0 && (
        <SmartEmpty
          icon={ListChecks}
          title="Add your first specification"
          hint="Paste a spec sheet from Amazon, Excel or a PDF — cards are grouped for you automatically."
          actions={[
            { label: "Add specification", primary: true, run: () => onChange([...rows, { k: "", v: "" }]) },
            { label: "Paste specifications", run: () => window.dispatchEvent(new CustomEvent("editor-open-paste")) },
          ]}
        />
      )}

      {rows.length > 0 && visible.length === 0 && (
        <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-muted-foreground">
          No specifications match “{query}”.
        </p>
      )}

      <div className="space-y-2">
        {visible.map(({ r, i }) => (
          <div
            key={i}
            onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
            onDragLeave={() => setDragOver((d) => (d === i ? null : d))}
            onDrop={() => onDrop(i)}
            className={`flex items-center gap-2 rounded-lg border px-1.5 py-1.5 transition-colors ${
              dragOver === i ? "border-accent/50 bg-accent/[0.06]" : "border-transparent"
            }`}
          >
            <span
              draggable
              onDragStart={() => { dragFrom.current = i; }}
              onDragEnd={() => { dragFrom.current = null; setDragOver(null); }}
              role="button"
              tabIndex={0}
              aria-label={`Reorder ${r.k || "specification"}`}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") { e.preventDefault(); onChange(reorderRows(rows, i, i - 1)); }
                if (e.key === "ArrowDown") { e.preventDefault(); onChange(reorderRows(rows, i, i + 1)); }
              }}
              className="grid size-7 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground/60 hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-accent active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-1.5 sm:flex sm:items-center sm:gap-2 sm:space-y-0">
              <div className="relative min-w-0 flex-1">
                <input
                  value={r.k}
                  onChange={(e) => update(i, { k: e.target.value })}
                  onBlur={(e) => {
                    const norm = normalizeLabel(e.target.value);
                    if (norm !== r.k) update(i, { k: norm });
                  }}
                  placeholder="e.g. Battery Capacity"
                  aria-label="Specification label"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 pr-[5.5rem] text-sm focus:border-accent/40 focus:outline-none"
                />
                {r.k.trim() && (
                  <span className="pointer-events-none absolute right-2 top-1/2 max-w-[5rem] -translate-y-1/2 truncate rounded-full bg-accent/12 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-accent">
                    {groupForSpec(r.k)}
                  </span>
                )}
              </div>
              <input
                value={r.v}
                onChange={(e) => update(i, { v: e.target.value })}
                placeholder="e.g. 3000mAh"
                aria-label="Specification value"
                className="w-full min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm focus:border-accent/40 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${r.k || "specification"}`}
              className="grid size-8 shrink-0 place-items-center rounded-md border border-white/10 text-muted-foreground transition-all hover:border-destructive/50 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-accent/40 hover:text-foreground active:scale-[0.97]"
      >
        <Plus className="size-3.5" /> Add Specification
      </button>
    </div>
  );
}
