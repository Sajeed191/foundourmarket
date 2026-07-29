import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Save, Package, Check, AlertTriangle, RotateCcw, Eye, MoreVertical, Copy, Archive, FileText, X, Undo2, Redo2, Send } from "lucide-react";

import { toast } from "sonner";
import { useEditorDeepLink } from "@/lib/use-editor-deeplink";
import { useIssueNav } from "@/lib/use-issue-nav";
import { SmartRecommendationBanner } from "@/components/admin/SmartFixLink";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { resolveImage } from "@/lib/products";
import { invalidateProducts } from "@/lib/use-products";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { recordMetric } from "@/lib/editor-perf";
import { writeLocalDraft, readLocalDraft, clearLocalDraft, type SaveState } from "@/lib/drafts";
import { COMPLETION_COLS, COMPLETION_SECTIONS, computeCompletion, type SectionCompletion, type SectionKey } from "@/lib/product-completion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DRAFT_ENTITY = "product_section";
const draftId = (slug: string, sectionKey: string) => `${slug}:${sectionKey}`;

function relativeAge(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "moments";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

type Role = "admin" | "super_admin" | "manager" | "support" | "fulfillment" | "warehouse_staff" | "editor";

/** Columns every section loads so the product header strip can render. */
const HEADER_COLS = ["id", "slug", "name", "image", "sku", "status", "category"] as const;

export type ProductHeaderInfo = {
  id: string; slug: string; name: string; image: string | null;
  sku: string | null; status: string | null; category: string | null;
};

export const inr = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v) || 0);
export const usd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(v) || 0);

export const STATUS_OPTIONS = [
  "draft", "published", "hidden", "archived", "scheduled", "preorder", "out_of_stock",
] as const;

export const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
export const parseList = (text: string): string[] => text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
export function kvToText(obj: Record<string, string> | null | undefined): string {
  if (!obj) return "";
  return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join("\n");
}
export function textToKv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

/* ----------------------------- small inputs ----------------------------- */

export function Field({ label, value, onChange, type = "text", placeholder, className, hint }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
  placeholder?: string; className?: string; hint?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40" />
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Area({ label, value, onChange, rows = 4, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">{label}</label>
      <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40 resize-y" />
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/40">
        {options.map((o) => <option key={o.value} value={o.value} className="bg-background">{o.label}</option>)}
      </select>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 hover:border-white/20 transition-colors">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
      <span className="flex-1">
        <span className="block leading-tight">{label}</span>
        {hint && <span className="block text-[10px] text-muted-foreground mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

/* ----------------------------- data loading ----------------------------- */

/**
 * Loads ONLY the header columns + the section's editable columns for one
 * product. Each section instantiates this independently — there is no shared
 * product object across sections, so editing one section can never mutate or
 * re-save another.
 */
function useProductRow(slug: string, cols: string[]) {
  const [row, setRow] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const select = Array.from(new Set([...HEADER_COLS, ...cols])).join(",");
    supabase.from("products").select(select).eq("slug", slug).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setRow(data as Record<string, any>);
      setLoading(false);
    });
    return () => { active = false; };
  }, [slug, cols]);

  return { row, loading, notFound };
}

/* ----------------------------- editor nav bar ----------------------------- */

export function EditorNavBar({ slug, sectionKey }: { slug: string; sectionKey?: string }) {
  const navigate = useNavigate();
  const isOverview = !sectionKey;
  return (
    <div className="sticky top-0 z-40 -mx-4 -mt-4 lg:-mx-10 lg:-mt-6 mb-3 border-b border-white/10 bg-background/85 px-4 py-2.5 backdrop-blur-xl lg:px-10">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: isOverview ? "/admin-products" : "/admin-product/$slug", params: isOverview ? undefined : { slug } })}
          aria-label={isOverview ? "Back to products" : "Back to overview"}
          className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground transition-all hover:text-foreground hover:border-white/20 active:scale-95"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-muted-foreground">
            {isOverview ? "Product Overview" : "Product Editor"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/admin-products" })}
          aria-label="Close"
          className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground transition-all hover:text-foreground hover:border-white/20 active:scale-95"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- section shell ----------------------------- */

const SECTIONS = [
  { key: "details", to: "/admin-product/$slug/details", label: "Product Details" },
  { key: "pricing", to: "/admin-product/$slug/pricing", label: "Pricing" },
  { key: "inventory", to: "/admin-product/$slug/inventory", label: "Inventory" },
  { key: "variants", to: "/admin-product/$slug/variants", label: "Variants" },
  { key: "shipping", to: "/admin-product/$slug/shipping", label: "Shipping" },
  { key: "returns", to: "/admin-product/$slug/returns", label: "Returns" },
  { key: "seo", to: "/admin-product/$slug/seo", label: "SEO" },
  { key: "merchandising", to: "/admin-product/$slug/merchandising", label: "Merchandising" },
  { key: "analytics", to: "/admin-product/$slug/analytics", label: "Analytics" },
  { key: "preview", to: "/admin-product/$slug/preview", label: "Preview" },
] as const;

export const PRODUCT_SECTIONS = SECTIONS;

function useCompletion(slug: string, active?: string) {
  const [data, setData] = useState<{ sections: SectionCompletion; percent: number } | null>(null);
  useEffect(() => {
    let on = true;
    supabase.from("products").select(COMPLETION_COLS.join(",")).eq("slug", slug).maybeSingle()
      .then(({ data: row }) => { if (on) setData(computeCompletion(row as Record<string, any>)); });
    return () => { on = false; };
    // refetch when switching sections so progress reflects recent saves
  }, [slug, active]);
  return data;
}

export function ProductHeaderStrip({ h, active }: { h: ProductHeaderInfo; active?: string }) {
  const completion = useCompletion(h.slug, active);
  return (
    <div className="card-premium rounded-2xl p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <Link to="/admin-product/$slug" params={{ slug: h.slug }}
          className="size-14 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0 grid place-items-center">
          {h.image ? <img loading="lazy" decoding="async" src={resolveImage(h.image)} alt={h.name} className="size-full object-cover" /> : <Package className="size-5 text-muted-foreground" />}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{h.name || "Untitled product"}</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
            <span className="font-mono">SKU: {h.sku || "—"}</span>
            <span className="capitalize">{(h.status || "draft").replace(/_/g, " ")}</span>
            <span>{h.category || "Uncategorized"}</span>
          </div>
        </div>
        {completion && (
          <div className="shrink-0 text-right">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Complete</p>
            <p className={`text-lg font-semibold leading-none mt-0.5 ${completion.percent === 100 ? "text-emerald-400" : "text-accent"}`}>{completion.percent}%</p>
          </div>
        )}
      </div>
      {completion && (
        <div className="mt-3 h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${completion.percent === 100 ? "bg-emerald-500" : "bg-accent"}`} style={{ width: `${completion.percent}%` }} />
        </div>
      )}
      {active && (
        <div className="flex gap-1 overflow-x-auto mt-3 -mx-1 px-1">
          {SECTIONS.map((s) => {
            const done = completion?.sections[s.key as SectionKey];
            const isData = (COMPLETION_SECTIONS as readonly string[]).includes(s.key);
            return (
              <Link key={s.key} to={s.to} params={{ slug: h.slug }}
                className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active === s.key ? "bg-accent/15 text-accent border border-accent/40" : "text-muted-foreground border border-transparent hover:bg-white/5"
                }`}>
                {isData && completion && (
                  done
                    ? <Check className="size-3 text-emerald-400" />
                    : <span className="size-1.5 rounded-full bg-amber-500" />
                )}
                {s.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Self-contained editor for a single product section.
 *
 * - Loads only `cols` (+ header cols).
 * - Holds isolated local form state, seeded once from the loaded row.
 * - "Save Changes" writes ONLY the columns produced by `toPatch` — unrelated
 *   product fields are never touched.
 * - Detects unsaved changes and warns before leaving.
 */
export function SectionEditor<T extends Record<string, any>>({
  slug, sectionKey, title, icon, cols, toForm, toPatch, validate, allow, autosave = false, children,
}: {
  slug: string;
  sectionKey: string;
  title: string;
  icon: ReactNode;
  cols: string[];
  toForm: (row: Record<string, any>) => T;
  toPatch: (form: T) => Record<string, unknown>;
  validate?: (form: T) => string | null;
  allow?: Role[];
  /** Debounced 2s autosave of changed fields. Off by default — saving is manual. */
  autosave?: boolean;
  children: (form: T, set: (patch: Partial<T>) => void, row: Record<string, any>) => ReactNode;
}) {
  const { row, loading, notFound } = useProductRow(slug, cols);
  const [form, setForm] = useState<T | null>(null);
  const baseline = useRef<string>("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const savedFlash = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const [recovery, setRecovery] = useState<{ data: T; savedAt: string } | null>(null);
  const recoveryChecked = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<T | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  formRef.current = form;

  // Smart Work Queue deep link — scroll/highlight on arrival, return on save.
  const deepLink = useEditorDeepLink(!!form);
  const deepLinkRef = useRef(deepLink);
  deepLinkRef.current = deepLink;

  // Diagnostics only: time from editor mount to the first interactive form.
  const mountedAt = useRef<number>(typeof performance !== "undefined" ? performance.now() : 0);
  const startupLogged = useRef(false);
  useEffect(() => {
    if (!form || startupLogged.current) return;
    startupLogged.current = true;
    recordMetric("editor-startup", performance.now() - mountedAt.current, sectionKey);
  }, [form, sectionKey]);



  // Seed isolated state once from the loaded row, and surface any newer local draft.
  useEffect(() => {
    if (!row) return;
    const f = toForm(row);
    setForm(f);
    baseline.current = JSON.stringify(f);
    if (!recoveryChecked.current) {
      recoveryChecked.current = true;
      const local = readLocalDraft(DRAFT_ENTITY, draftId(slug, sectionKey));
      if (local && JSON.stringify(local.data) !== baseline.current) {
        setRecovery({ data: local.data as T, savedAt: local.savedAt });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);

  const changedKeys = useMemo<string[]>(() => {
    if (!form || !baseline.current) return [];
    let base: Record<string, any> = {};
    try { base = JSON.parse(baseline.current); } catch { /* noop */ }
    return Object.keys(form).filter((k) => JSON.stringify(form[k]) !== JSON.stringify(base[k]));
  }, [form]);

  const dirty = changedKeys.length > 0;
  const validationError = form ? validate?.(form) ?? null : null;
  useUnsavedGuard(dirty);

  // Raise floating controls (support orb, toolbars) above the sticky action bar.
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.style.getPropertyValue("--floating-bottom-offset");
    el.style.setProperty("--floating-bottom-offset", "calc(var(--app-bottom-nav-height) + 8rem)");
    return () => {
      if (prev) el.style.setProperty("--floating-bottom-offset", prev);
      else el.style.removeProperty("--floating-bottom-offset");
    };
  }, []);


  /* ---- unlimited editor history (Ctrl+Z / Ctrl+Y) ---- */
  const past = useRef<T[]>([]);
  const future = useRef<T[]>([]);
  const [, bumpHistory] = useState(0);
  const tickHistory = useCallback(() => bumpHistory((n) => n + 1), []);

  const set = useCallback((patch: Partial<T>) => {
    const cur = formRef.current;
    if (!cur) return;
    past.current = [...past.current, cur].slice(-300);
    future.current = [];
    tickHistory();
    setForm({ ...cur, ...patch });
  }, [tickHistory]);

  const undo = useCallback(() => {
    const cur = formRef.current;
    if (!cur || past.current.length === 0) return;
    const prev = past.current[past.current.length - 1];
    past.current = past.current.slice(0, -1);
    future.current = [cur, ...future.current].slice(0, 300);
    tickHistory();
    setForm(prev);
  }, [tickHistory]);

  const redo = useCallback(() => {
    const cur = formRef.current;
    if (!cur || future.current.length === 0) return;
    const next = future.current[0];
    future.current = future.current.slice(1);
    past.current = [...past.current, cur].slice(-300);
    tickHistory();
    setForm(next);
  }, [tickHistory]);

  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;


  const doSave = useCallback(
    async (silent: boolean) => {
      const current = formRef.current;
      if (!current || inFlight.current) return;
      const err = validate?.(current);
      if (err) {
        if (!silent) toast.error(err);
        return; // never persist invalid data; manual button is also disabled
      }
      inFlight.current = true;
      setSaveState("saving");
      const startedAt = performance.now();
      const patch = { ...toPatch(current), updated_at: new Date().toISOString() };
      const { error } = await supabase.from("products").update(patch).eq("slug", slug);
      recordMetric("autosave", performance.now() - startedAt, silent ? "auto" : "manual");
      inFlight.current = false;
      if (error) {
        setSaveState("error");
        if (!silent) toast.error("Save failed", { description: error.message });
        return;
      }
      baseline.current = JSON.stringify(current);
      clearLocalDraft(DRAFT_ENTITY, draftId(slug, sectionKey));
      setForm({ ...current }); // refresh dirty comparison
      setSaveState("saved");
      setLastSavedAt(new Date());
      setJustSaved(true);
      if (savedFlash.current) clearTimeout(savedFlash.current);
      savedFlash.current = setTimeout(() => setJustSaved(false), 2000);
      logActivity("product_updated", "product", row?.id, { slug, section: sectionKey, auto: silent });
      invalidateProducts();
      if (!silent) {
        // Quiet confirmation — self-dismisses, never blocks the workspace.
        toast.success("Draft saved", { duration: 2000 });
        // Deep-link return: came from the Smart Work Queue → go back to it.
        if (deepLinkRef.current?.active) {
          deepLinkRef.current.returnToQueue(`${deepLinkRef.current.label ?? title} warning resolved`);
        }
      }

    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, sectionKey, title, row?.id],
  );

  // Local draft cache + debounced 2s autosave while dirty and valid.
  useEffect(() => {
    if (!form || !dirty) return;
    writeLocalDraft(DRAFT_ENTITY, draftId(slug, sectionKey), form);
    setSaveState("dirty");
    if (!autosave || validationError) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void doSave(true), 2000);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(form), dirty, autosave, validationError]);

  const restoreDraft = () => {
    if (!recovery) return;
    setForm(recovery.data);
    setRecovery(null);
  };
  const discardDraft = () => {
    clearLocalDraft(DRAFT_ENTITY, draftId(slug, sectionKey));
    setRecovery(null);
  };

  // More Actions menu + product-level operations.
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  async function duplicateProduct() {
    setActionBusy(true);
    try {
      const { data, error } = await supabase.from("products").select("*").eq("slug", slug).maybeSingle();
      if (error || !data) throw new Error(error?.message || "Product not found");
      const copy: Record<string, any> = { ...data };
      delete copy.id; delete copy.created_at; delete copy.updated_at;
      const suffix = Math.random().toString(36).slice(2, 6);
      copy.slug = `${data.slug}-copy-${suffix}`;
      copy.sku = data.sku ? `${data.sku}-COPY-${suffix.toUpperCase()}` : null;
      copy.name = `${data.name ?? "Product"} (Copy)`;
      copy.status = "draft";
      const { error: insErr } = await supabase.from("products").insert(copy);
      if (insErr) throw new Error(insErr.message);
      await invalidateProducts();
      logActivity("product_duplicated", "product", row?.id, { from: slug, to: copy.slug });
      toast.success("Product duplicated as a draft");
      setMenuOpen(false);
      navigate({ to: "/admin-product/$slug/details", params: { slug: copy.slug } });
    } catch (e) {
      toast.error("Duplicate failed", { description: e instanceof Error ? e.message : "Try again." });
    } finally { setActionBusy(false); }
  }

  async function archiveProduct() {
    setActionBusy(true);
    try {
      const { error } = await supabase.from("products").update({ status: "archived", updated_at: new Date().toISOString() }).eq("slug", slug);
      if (error) throw new Error(error.message);
      await invalidateProducts();
      logActivity("product_archived", "product", row?.id, { slug });
      toast.success("Product archived");
      setMenuOpen(false);
      navigate({ to: "/admin-products" });
    } catch (e) {
      toast.error("Archive failed", { description: e instanceof Error ? e.message : "Try again." });
    } finally { setActionBusy(false); }
  }

  /* ---- keyboard-first workspace: Ctrl/Cmd + S / P / D / Z / Y ---- */
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); if (dirtyRef.current) void doSave(false); return; }
      if (k === "p") { e.preventDefault(); navigate({ to: "/admin-product/$slug/preview", params: { slug } }); return; }
      if (k === "d") { e.preventDefault(); void duplicateProduct(); return; }
      if (typing) return; // let the browser own text-level undo inside fields
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doSave, undo, redo, slug]);


  const header: ProductHeaderInfo | null = row
    ? { id: row.id, slug: row.slug, name: row.name, image: row.image, sku: row.sku, status: row.status, category: row.category }
    : null;

  const sectionStatus: "saved" | "editing" | "error" =
    saveState === "error" ? "error" : dirty || saveState === "saving" ? "editing" : "saved";
  const statusMeta = {
    saved: { dot: "bg-emerald-500", label: "Saved", tone: "text-emerald-400" },
    editing: { dot: "bg-amber-500", label: "Editing", tone: "text-amber-400" },
    error: { dot: "bg-destructive", label: "Error", tone: "text-destructive" },
  }[sectionStatus];

  return (
    <AdminShell title={title} subtitle="Edit this section in isolation — changes never touch other sections." allow={allow ?? ["admin", "super_admin", "manager"]}>
      {loading || !form || !header ? (
        notFound ? (
          <div className="card-premium rounded-2xl p-10 text-center">
            <p className="text-sm">Product not found.</p>
            <Link to="/admin-products" className="mt-3 inline-block text-xs text-accent hover:underline">← Back to products</Link>
          </div>
        ) : (
          <div className="grid place-items-center py-24"><Loader2 className="size-5 animate-spin text-accent" /></div>
        )
      ) : (
        <div className="space-y-5 pb-[calc(var(--mobile-nav-clearance)+5.5rem)] lg:pb-24">
          <EditorNavBar slug={slug} sectionKey={sectionKey} />
          <ProductHeaderStrip h={header} active={sectionKey} />

          {recovery && (
            <div className="card-premium rounded-2xl p-4 border border-amber-500/30">
              <div className="flex items-start gap-3">
                <RotateCcw className="size-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Continue editing?</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Unsaved draft found · saved {new Date(recovery.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {" "}({relativeAge(recovery.savedAt)} ago). It stays on this device until you save.
                  </p>
                  <div className="flex gap-2 mt-2.5">
                    <button onClick={restoreDraft} className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground hover:brightness-110">Continue</button>
                    <button onClick={discardDraft} className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">Discard</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {deepLink.active && (
            <DeepLinkBanner label={deepLink.label} origin={deepLink.origin} />
          )}


          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            data-editor-field={sectionKey}
            className="card-premium rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-sm font-medium flex items-center gap-2"><span className="text-accent">{icon}</span> {title}</h2>
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${statusMeta.tone}`}>
                <span className={`size-2 rounded-full ${statusMeta.dot}`} /> {statusMeta.label}
              </span>
            </div>
            {validationError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <AlertTriangle className="size-3.5 shrink-0" /> {validationError}
              </div>
            )}
            <div onKeyDown={advanceOnEnter}>{children(form, set, row!)}</div>
          </motion.div>

          {/* Flush bottom action bar — edge-to-edge, no floating card */}
          <div
            className="fixed bottom-0 inset-x-0 lg:left-[17.5rem] z-[75] border-t border-border bg-background/95 backdrop-blur-xl"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          >
            {/* Workspace strip — live state + history, one thumb reach */}
            <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 pt-1.5">
              <span
                className={`inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium ${statusMeta.tone}`}
                aria-live="polite"
              >
                <span className={`size-1.5 shrink-0 rounded-full ${statusMeta.dot}`} aria-hidden="true" />
                <span className="truncate">
                  {saveState === "saving"
                    ? "Saving…"
                    : dirty
                      ? `Unsaved changes · ${changedKeys.length} field${changedKeys.length === 1 ? "" : "s"}`
                      : "Draft"}
                </span>
                {lastSavedAt && saveState !== "saving" && (
                  <span className="hidden shrink-0 text-muted-foreground sm:inline">
                    · saved {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={undo}
                  disabled={!canUndo}
                  aria-label="Undo (Ctrl+Z)"
                  title="Undo — Ctrl+Z"
                  className="grid size-11 place-items-center rounded-lg border border-white/12 bg-white/[0.03] text-muted-foreground transition-all hover:text-foreground hover:border-white/25 active:scale-95 disabled:opacity-30"
                >
                  <Undo2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={redo}
                  disabled={!canRedo}
                  aria-label="Redo (Ctrl+Y)"
                  title="Redo — Ctrl+Y"
                  className="grid size-11 place-items-center rounded-lg border border-white/12 bg-white/[0.03] text-muted-foreground transition-all hover:text-foreground hover:border-white/25 active:scale-95 disabled:opacity-30"
                >
                  <Redo2 className="size-4" />
                </button>
              </span>
            </div>
            <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 pt-2 pb-1">

              {/* More Actions */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((o) => !o)}
                  className="grid size-11 place-items-center rounded-lg border border-white/12 bg-white/[0.03] text-muted-foreground transition-all hover:text-foreground hover:border-white/25 active:scale-95"
                >
                  <MoreVertical className="size-4" />
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-[-1]" onClick={() => setMenuOpen(false)} />
                    <div
                      role="menu"
                      className="absolute bottom-[calc(100%+0.5rem)] left-0 w-52 overflow-hidden rounded-xl border border-white/10 bg-background/95 shadow-xl backdrop-blur-xl"
                    >
                      <MenuItem
                        icon={<FileText className="size-4" />}
                        label="Save Draft"
                        disabled={!dirty || saveState === "saving" || !!validationError}
                        onClick={() => { setMenuOpen(false); setConfirmOpen(true); }}
                      />
                      <MenuItem
                        icon={<Copy className="size-4" />}
                        label="Duplicate Product"
                        disabled={actionBusy}
                        onClick={() => void duplicateProduct()}
                      />
                      <MenuItem
                        icon={<Archive className="size-4" />}
                        label="Archive Product"
                        disabled={actionBusy}
                        danger
                        onClick={() => void archiveProduct()}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Preview — secondary CTA (35%) */}
              <button
                type="button"
                onClick={() => navigate({ to: "/admin-product/$slug/preview", params: { slug } })}
                title="Preview — Ctrl/⌘ P"
                className="inline-flex h-11 basis-[35%] grow-0 items-center justify-center gap-1.5 rounded-lg border border-accent/35 bg-accent/10 px-3 text-xs font-semibold text-accent transition-[background-color,transform] duration-[var(--editor-motion-fast,160ms)] hover:bg-accent/20 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Eye className="size-4" /> Preview
              </button>

              {/* Publish — jumps to the Review & Publish step (always reachable) */}
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("editor-focus-field", { detail: "publish" }))}
                aria-label="Go to review and publish"
                title="Review & Publish — Ctrl/⌘ Enter"
                className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/12 bg-white/[0.03] text-muted-foreground transition-[background-color,transform] duration-[var(--editor-motion-fast,160ms)] hover:border-white/25 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Send className="size-4" />
              </button>

              {/* Save Changes — primary CTA (65%) */}
              <button
                type="button"
                onClick={() => { if (dirty) setConfirmOpen(true); else void doSave(false); }}
                disabled={(!dirty && !justSaved) || saveState === "saving" || !!validationError}
                title="Save Draft — Ctrl/⌘ S"
                className={`inline-flex h-11 basis-[65%] grow items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-[background-color,transform] duration-[var(--editor-motion-fast,160ms)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${justSaved ? "bg-emerald-500 text-white" : "bg-accent text-accent-foreground hover:brightness-110"}`}
              >

                {saveState === "saving" ? (
                  <><Loader2 className="size-4 animate-spin" /> Saving…</>
                ) : justSaved ? (
                  <><Check className="size-4" /> Draft Saved</>
                ) : (
                  <><Save className="size-4" /> Save Draft{dirty ? ` (${changedKeys.length})` : ""}</>
                )}
              </button>
            </div>
          </div>

          {/* Save Confirmation Dialog */}
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent className="bg-background border-white/10">
              <AlertDialogHeader>
                <AlertDialogTitle>Save changes?</AlertDialogTitle>
                <AlertDialogDescription>
                  You have made {changedKeys.length} change{changedKeys.length === 1 ? "" : "s"} to this product. Are you sure you want to save these edits?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmOpen(false)}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { setConfirmOpen(false); void doSave(false); }}
                  className="bg-accent text-accent-foreground hover:brightness-110"
                >
                  Save Changes
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </AdminShell>
  );
}

/** Enter moves to the next input instead of doing nothing (textareas keep newlines). */
function advanceOnEnter(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey) return;
  const el = e.target as HTMLElement | null;
  if (!el || el.tagName !== "INPUT") return;
  const input = el as HTMLInputElement;
  if (input.type === "checkbox" || input.type === "radio" || input.type === "submit") return;
  const focusables = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>("input, select, textarea, button:not([disabled])"),
  ).filter((n) => n.offsetParent !== null && n.tabIndex !== -1);
  const i = focusables.indexOf(input);
  if (i === -1) return;
  const next = focusables[i + 1];
  if (!next) return;
  e.preventDefault();
  next.focus();
  if (next instanceof HTMLInputElement) next.select();
}

function MenuItem({ icon, label, onClick, disabled, danger }: {
  icon: ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-white/5"
      }`}
    >
      <span className={danger ? "text-destructive" : "text-muted-foreground"}>{icon}</span>
      {label}
    </button>
  );
}

/** Read-only section frame (Analytics insights, Preview). */
export function ReadOnlySection({
  slug, sectionKey, title, icon, cols, allow, children,
}: {
  slug: string; sectionKey: string; title: string; icon: ReactNode; cols: string[];
  allow?: Role[]; children: (row: Record<string, any>) => ReactNode;
}) {
  const { row, loading, notFound } = useProductRow(slug, cols);
  const header: ProductHeaderInfo | null = row
    ? { id: row.id, slug: row.slug, name: row.name, image: row.image, sku: row.sku, status: row.status, category: row.category }
    : null;
  return (
    <AdminShell title={title} subtitle="Read-only view — no changes are saved from this page." allow={allow ?? ["admin", "super_admin", "manager"]}>
      {loading || !header ? (
        notFound ? (
          <div className="card-premium rounded-2xl p-10 text-center">
            <p className="text-sm">Product not found.</p>
            <Link to="/admin-products" className="mt-3 inline-block text-xs text-accent hover:underline">← Back to products</Link>
          </div>
        ) : (
          <div className="grid place-items-center py-24"><Loader2 className="size-5 animate-spin text-accent" /></div>
        )
      ) : (
        <div className="space-y-5">
          <EditorNavBar slug={slug} sectionKey={sectionKey} />
          <ProductHeaderStrip h={header} active={sectionKey} />
          {children(row!)}
        </div>
      )}
    </AdminShell>
  );
}

export function BackToOverview({ slug }: { slug: string }) {
  return (
    <Link to="/admin-product/$slug" params={{ slug }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent">
      <ArrowLeft className="size-3.5" /> Overview
    </Link>
  );
}

export { useNavigate };

/**
 * Universal Smart Navigation banner — shown when the admin arrived from a
 * recommendation anywhere in the admin. Presentation only.
 */
function DeepLinkBanner({ label, origin }: { label: string | null; origin: string | null }) {
  const nav = useIssueNav();
  const originLabel = origin === "work-queue" ? "the Smart Work Queue" : "where you came from";
  return <SmartRecommendationBanner label={label} originLabel={originLabel} nav={nav} />;
}
