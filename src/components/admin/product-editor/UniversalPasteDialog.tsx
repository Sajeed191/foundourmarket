// ============================================================
// UniversalPasteDialog — Product Editor 4.0
//
// The admin presses CTRL+V anywhere in the editor (outside a field)
// and this floating parser shows exactly what was detected, lets
// them review each block, then applies it into the SAME form state
// the Live Preview and Product Details page already read.
//
// Presentation only: no schema, no API, no rendering duplication.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import {
  ClipboardPaste, Check, X, ChevronDown, Sparkles, Layers, FileText,
  ListChecks, ShieldCheck, Package, Tag, FolderTree,
} from "lucide-react";
import { groupForSpec, type SpecRow } from "@/lib/spec-intelligence";
import {
  parseListing, suggestCategory, matchCategorySlugs,
  type ParsedListing, type CategorySuggestion,
} from "@/lib/product-import";

export type PasteApplyPayload = {
  specs?: SpecRow[];
  description?: string;
  features?: string[];
  brand?: string;
  name?: string;
  categorySlugs?: string[];
};

type BlockKey = "specs" | "description" | "features" | "warranty" | "package" | "identity" | "category";

/** Captures a raw clipboard paste made outside a form field. */
export function useUniversalPaste(onText: (text: string) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    function handler(e: ClipboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return;
      }
      const html = e.clipboardData?.getData("text/html");
      const text = e.clipboardData?.getData("text/plain");
      const payload = (html && html.trim().length > (text?.length ?? 0) ? html : text) ?? "";
      if (!payload.trim()) return;
      e.preventDefault();
      onText(payload);
    }
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [onText, enabled]);
}

function Row({
  icon, label, count, on, toggle, children,
}: {
  icon: React.ReactNode; label: string; count: string; on: boolean;
  toggle: () => void; children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border transition-colors ${on ? "border-accent/30 bg-accent/[0.05]" : "border-white/10 bg-white/[0.02]"}`}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          type="button"
          onClick={toggle}
          role="switch"
          aria-checked={on}
          aria-label={`${on ? "Skip" : "Import"} ${label}`}
          className={`grid size-5 shrink-0 place-items-center rounded-md border transition-all active:scale-90 ${
            on ? "border-accent bg-accent text-accent-foreground" : "border-white/20 text-transparent"
          }`}
        >
          <Check className="size-3.5" />
        </button>
        <span className="shrink-0 text-accent">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{label}</span>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{count}</span>
        {children && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={`${open ? "Hide" : "Review"} ${label}`}
            aria-expanded={open}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      {open && children && (
        <div className="max-h-52 overflow-y-auto border-t border-white/10 px-2.5 py-2 text-[11px] text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}

export function UniversalPasteDialog({
  raw,
  categories,
  onApply,
  onClose,
}: {
  /** Raw clipboard payload — dialog is open whenever this is non-empty. */
  raw: string;
  categories: Array<{ name: string; slug: string }>;
  onApply: (payload: PasteApplyPayload) => void;
  onClose: () => void;
}) {
  const parsed = useMemo<ParsedListing>(() => parseListing(raw), [raw]);
  const suggestion = useMemo<CategorySuggestion | null>(
    () => suggestCategory({ name: parsed.name, brand: parsed.brand, description: parsed.description, specs: parsed.specs }),
    [parsed],
  );
  const slugs = useMemo(
    () => (suggestion ? matchCategorySlugs(suggestion.path, categories) : []),
    [suggestion, categories],
  );

  const [off, setOff] = useState<Set<BlockKey>>(new Set());
  const on = (k: BlockKey) => !off.has(k);
  const toggle = (k: BlockKey) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); apply(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [off, parsed]);

  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of parsed.specs) map.set(groupForSpec(s.k), (map.get(groupForSpec(s.k)) ?? 0) + 1);
    return [...map.entries()];
  }, [parsed.specs]);

  function apply() {
    const specs: SpecRow[] = on("specs") ? [...parsed.specs] : [];
    if (on("warranty") && parsed.warranty) specs.push({ k: "Warranty", v: parsed.warranty });
    if (on("package") && parsed.packageContents.length) {
      specs.push({ k: "In The Box", v: parsed.packageContents.join(", ") });
    }
    onApply({
      specs: specs.length ? specs : undefined,
      description: on("description") && parsed.description ? parsed.description : undefined,
      features: on("features") && parsed.features.length ? parsed.features : undefined,
      brand: on("identity") && parsed.brand ? parsed.brand : undefined,
      name: on("identity") && parsed.name ? parsed.name : undefined,
      categorySlugs: on("category") && slugs.length ? slugs : undefined,
    });
    onClose();
  }

  const nothing =
    !parsed.specs.length && !parsed.description && !parsed.features.length &&
    !parsed.warranty && !parsed.packageContents.length && !parsed.brand;

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Smart paste parser">
      <button type="button" aria-label="Close parser" onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-3xl border border-white/10 bg-[#0b0d12]/95 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
            <ClipboardPaste className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Smart Paste detected content</p>
            <p className="truncate text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Source · {parsed.source}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="grid size-9 place-items-center rounded-xl border border-white/10 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
          {nothing && (
            <p className="rounded-xl border border-dashed border-white/15 px-3 py-6 text-center text-xs text-muted-foreground">
              Nothing recognisable in that paste. Try copying the listing’s specification table or “About this item” block.
            </p>
          )}

          {parsed.specs.length > 0 && (
            <Row icon={<Layers className="size-3.5" />} label="Specifications"
              count={`${parsed.specs.length} rows`} on={on("specs")} toggle={() => toggle("specs")}>
              <ul className="space-y-1">
                {parsed.specs.slice(0, 60).map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-32 shrink-0 truncate text-foreground/80">{s.k}</span>
                    <span className="min-w-0 flex-1 truncate">{s.v}</span>
                  </li>
                ))}
              </ul>
              {groups.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1">
                  {groups.map(([g, n]) => (
                    <span key={g} className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider">
                      {g} {n}
                    </span>
                  ))}
                </p>
              )}
            </Row>
          )}

          {parsed.description && (
            <Row icon={<FileText className="size-3.5" />} label="Description"
              count={`${parsed.description.length} chars`} on={on("description")} toggle={() => toggle("description")}>
              <p className="whitespace-pre-wrap">{parsed.description.slice(0, 900)}</p>
            </Row>
          )}

          {parsed.features.length > 0 && (
            <Row icon={<ListChecks className="size-3.5" />} label="Features"
              count={`${parsed.features.length} items`} on={on("features")} toggle={() => toggle("features")}>
              <ul className="list-disc space-y-0.5 pl-4">
                {parsed.features.slice(0, 40).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </Row>
          )}

          {parsed.warranty && (
            <Row icon={<ShieldCheck className="size-3.5" />} label="Warranty"
              count="1 row" on={on("warranty")} toggle={() => toggle("warranty")}>
              <p>{parsed.warranty}</p>
            </Row>
          )}

          {parsed.packageContents.length > 0 && (
            <Row icon={<Package className="size-3.5" />} label="Package contents"
              count={`${parsed.packageContents.length} items`} on={on("package")} toggle={() => toggle("package")}>
              <ul className="list-disc space-y-0.5 pl-4">
                {parsed.packageContents.map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </Row>
          )}

          {(parsed.brand || parsed.name) && (
            <Row icon={<Tag className="size-3.5" />} label="Brand & title"
              count={parsed.brand || "title"} on={on("identity")} toggle={() => toggle("identity")}>
              <p>{parsed.brand ? `Brand: ${parsed.brand}` : ""}{parsed.name ? `${parsed.brand ? " · " : ""}Title: ${parsed.name}` : ""}</p>
            </Row>
          )}

          {suggestion && (
            <div className={`rounded-xl border px-2.5 py-2.5 ${on("category") ? "border-accent/30 bg-accent/[0.05]" : "border-white/10 bg-white/[0.02]"}`}>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => toggle("category")} role="switch" aria-checked={on("category")}
                  aria-label="Apply suggested category"
                  className={`grid size-5 shrink-0 place-items-center rounded-md border transition-all active:scale-90 ${
                    on("category") ? "border-accent bg-accent text-accent-foreground" : "border-white/20 text-transparent"
                  }`}>
                  <Check className="size-3.5" />
                </button>
                <FolderTree className="size-3.5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{suggestion.path.join(" › ")}</span>
                <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 font-mono text-[10px] text-accent">
                  {suggestion.confidence}%
                </span>
              </div>
              <p className="mt-1.5 pl-7 text-[10px] text-muted-foreground">
                {slugs.length
                  ? `Matches ${slugs.length} existing categor${slugs.length === 1 ? "y" : "ies"} in your catalog.`
                  : "No matching category exists yet — create it in Product Information."}
                {suggestion.matched.length ? ` Signals: ${suggestion.matched.join(", ")}.` : ""}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 bg-white/[0.02] px-3 py-3">
          <button type="button" onClick={onClose}
            className="min-h-11 rounded-full border border-white/10 px-4 text-xs font-medium text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button type="button" onClick={apply} disabled={nothing}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-40">
            <Sparkles className="size-3.5" /> Apply to product
          </button>
        </div>
      </div>
    </div>
  );
}
