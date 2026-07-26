import { createFileRoute } from "@tanstack/react-router";
import { lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  normalizeStatus, logEvent, saveVersion, type WorkflowInput, type WorkflowStatus,
} from "@/lib/publishing-workflow";

const PublishingCenter = lazy(() =>
  import("@/components/admin/product-editor/PublishingCenter").then((m) => ({ default: m.PublishingCenter })),
);
const EditorDiagnostics = lazy(() =>
  import("@/components/admin/product-editor/EditorDiagnostics").then((m) => ({ default: m.EditorDiagnostics })),
);

import {
  FileText, ImageIcon, Film, Tag, Layers, ListChecks, Search, Activity,
  ChevronDown, Sparkles, CheckCircle2, AlertTriangle, Send, EyeOff, Eye,
  Package, Star, HelpCircle,
} from "lucide-react";
import {
  buildDescriptionSections, mergeDescriptionSections, generateFeatureChips,
  generateKeywordChips, type DescriptionInput,
} from "@/lib/description-builder";
import { buildCopilotRecs } from "@/lib/product-copilot";
import { AiCopilot } from "@/components/admin/product-editor/AiCopilot";
import {
  EditorCommandPalette, type EditorCommand,
} from "@/components/admin/product-editor/EditorCommandPalette";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invalidateProducts } from "@/lib/use-products";
import { resolveImage } from "@/lib/products";
import { useAdminCategories } from "@/lib/use-categories";
import { SectionEditor, Field, parseList, useNavigate } from "@/components/admin/product-editor/kit";
import { ProductMediaGallery, ProductVideoUploader } from "@/components/admin/product-editor/media-fields";
import { CategorySelector } from "@/components/admin/product-editor/category-selector";
import { ProductFaqManager } from "@/components/admin/ProductFaqManager";
import {
  FeaturesBuilder, KeyValueBuilder, RichTextEditor, kvToArray, arrayToKv, type KV,
} from "@/components/admin/product-editor/field-builders";
import { SmartSpecsBuilder } from "@/components/admin/product-editor/SmartSpecsBuilder";
import { LivePreviewShell } from "@/components/admin/product-editor/LivePreviewShell";
import {
  UniversalPasteDialog, useUniversalPaste, type PasteApplyPayload,
} from "@/components/admin/product-editor/UniversalPasteDialog";
import { ValidationCards, type ValidationIssue } from "@/components/admin/product-editor/ValidationCards";
import { HealthDashboard, type HealthCard } from "@/components/admin/product-editor/HealthDashboard";
import { InlineSuggestions } from "@/components/admin/product-editor/InlineSuggestions";
import {
  titleSuggestions, descriptionSuggestions, featureSuggestions, specSuggestions, seoSuggestions,
  type SuggestInput,
} from "@/lib/product-suggestions";
import { focusEditorField, focusFirstApplied } from "@/lib/editor-focus";
import { LazyPanel } from "@/components/admin/product-editor/LazyPanel";
import { recordMetric } from "@/lib/editor-perf";
import {
  GuidedWorkflow, ModeSwitch, FieldSearch, StepProgress, Step, AdvancedSettings,
  StartOptions, HelpDot, useEditorWorkflow, type StepState,
} from "@/components/admin/product-editor/GuidedWorkflow";
import { mergeSpecRows } from "@/lib/spec-intelligence";
import { contextFlags, missingTemplateSpecs } from "@/lib/editor-context";
import { PublishConfidence, SpecTemplateStrip } from "@/components/admin/product-editor/InvisibleUX";
import { AiChip } from "@/components/admin/product-editor/EmptyStates";

import type { DraftOverlay } from "@/lib/pdp-preview-channel";




/** Unsaved editor state → live PDP overlay (presentation only). */
function draftOverlayFromForm(f: Form): DraftOverlay {
  const specs: Record<string, string> = {};
  for (const s of f.specs) if (s.k.trim()) specs[s.k.trim()] = s.v;
  const attrs: Record<string, string> = {};
  for (const a of f.attrs) if (a.k.trim()) attrs[a.k.trim()] = a.v;
  return {
    name: f.name,
    brand: f.brand || null,
    productType: f.product_type || null,
    category: f.categories[0] ?? f.category,
    categories: f.categories,
    description: f.description,
    features: f.features.filter((x) => x.trim()),
    specifications: specs,
    attributes: attrs,
    videoUrl: f.video_url || null,
    seoTitle: f.seo_title || null,
    seoDescription: f.seo_description || null,
    rating: Number(f.rating) || 0,
    reviews: Number(f.reviews) || 0,
  };
}



export const Route = createFileRoute("/admin-product/$slug/details")({ component: DetailsPage });

const COLS = [
  "name", "slug", "description", "image", "brand", "product_type", "category", "categories", "tags",
  "features", "specifications", "attributes", "video_url",
  "seo_title", "seo_description", "meta_keywords",
  "price", "price_inr", "stock_quantity",
  "rating", "reviews", "rating_source",
];

type Form = {
  name: string; brand: string; product_type: string; category: string; categories: string[]; tags: string;
  description: string;
  features: string[];
  specs: KV[];
  attrs: KV[];
  video_url: string;
  seo_title: string; seo_description: string; keywords: string;
  rating: number; reviews: number; rating_source: string;
};

function DetailsPage() {
  const { slug } = Route.useParams();
  return (
    <SectionEditor<Form>
      slug={slug} sectionKey="details" title="Product Details" icon={<FileText className="size-4" />} cols={COLS}
      toForm={(r) => ({
        name: r.name ?? "", brand: r.brand ?? "", product_type: r.product_type ?? "",
        category: r.category ?? "",
        categories: ((r.categories ?? []) as string[]).length
          ? ((r.categories ?? []) as string[])
          : (r.category ? [r.category] : []),
        tags: (r.tags ?? []).join(", "),
        description: r.description ?? "",
        features: (r.features ?? []) as string[],
        specs: kvToArray(r.specifications), attrs: kvToArray(r.attributes),
        video_url: r.video_url ?? "",
        seo_title: r.seo_title ?? "", seo_description: r.seo_description ?? "",
        keywords: (r.meta_keywords ?? []).join(", "),
        rating: Number(r.rating) || 0,
        reviews: Number(r.reviews) || 0,
        rating_source: r.rating_source ?? "imported_supplier",
      })}
      toPatch={(f) => ({
        name: f.name.trim(),
        brand: f.brand.trim() || null,
        product_type: f.product_type.trim() || null,
        category: (f.categories[0] ?? f.category.trim()) || null,
        categories: f.categories,
        tags: parseList(f.tags),
        description: f.description.trim() || null,
        features: f.features.map((x) => x.trim()).filter(Boolean),
        specifications: arrayToKv(f.specs),
        attributes: arrayToKv(f.attrs),
        video_url: f.video_url.trim() || null,
        seo_title: f.seo_title.trim() || null,
        seo_description: f.seo_description.trim() || null,
        meta_keywords: parseList(f.keywords),
        rating: Math.max(0, Math.min(5, Number(f.rating) || 0)),
        reviews: Math.max(0, Math.floor(Number(f.reviews) || 0)),
        rating_source: f.rating_source || "imported_supplier",
      })}
      validate={(f) => (f.name.trim() ? null : "Product name is required.")}
    >
      {(f, set, row) => (
        <LivePreviewShell slug={slug} overlay={draftOverlayFromForm(f)}>
          <CommandCenter slug={slug} f={f} set={set} row={row} />
        </LivePreviewShell>
      )}

    </SectionEditor>
  );
}

/* ----------------------------- shell pieces ----------------------------- */

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-center">
      <p className="text-[8px] font-mono uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}


function Collapsible({ title, icon, desc, defaultOpen = true, badge, fieldKey, children }: {
  title: string; icon: React.ReactNode; desc?: string; defaultOpen?: boolean;
  badge?: React.ReactNode; fieldKey?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Auto Field Focus can target a collapsed section — open it on demand.
  useEffect(() => {
    if (!fieldKey) return;
    const handler = (e: Event) => {
      if ((e as CustomEvent<string>).detail === fieldKey) setOpen(true);
    };
    window.addEventListener("editor-focus-field", handler);
    return () => window.removeEventListener("editor-focus-field", handler);
  }, [fieldKey]);

  return (
    <section data-editor-field={fieldKey} className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            {badge}
          </span>
          {desc && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{desc}</span>}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-white/10 p-4">{children}</div>}
    </section>
  );
}


/* ----------------------------- rating manager ----------------------------- */

// Allowed values must match the DB check constraint products_rating_source_check.
const RATING_SOURCES: { value: string; label: string; hint: string }[] = [
  { value: "customer_reviews", label: "Customer", hint: "Rating reflects real customer reviews on this product." },
  { value: "imported_supplier", label: "Supplier", hint: "Rating imported from the supplier / source listing." },
  { value: "marketplace_imported", label: "Marketplace", hint: "Rating imported from an external marketplace." },
];

const DEFAULT_RATING_SOURCE = "imported_supplier";

function RatingManager({ f, set }: {
  f: Form; set: (patch: Partial<Form>) => void;
}) {
  const rating = Number(f.rating) || 0;
  const reviews = Number(f.reviews) || 0;
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? rating;

  function setStar(value: number) {
    // click on same star toggles half / full for fine control
    set({ rating: value });
  }


  return (
    <div className="space-y-4">
      {/* Interactive star picker (supports half steps) */}
      <div>
        <label className="mb-2 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Star Rating</label>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
            {[1, 2, 3, 4, 5].map((i) => {
              const filled = display >= i;
              const half = !filled && display >= i - 0.5;
              return (
                <div key={i} className="relative">
                  <Star className={`size-7 ${filled ? "fill-amber-400 text-amber-400" : "text-white/20"}`} />
                  {half && (
                    <Star className="absolute inset-0 size-7 fill-amber-400 text-amber-400"
                      style={{ clipPath: "inset(0 50% 0 0)" }} />
                  )}
                  {/* left half hit area = i-0.5, right half = i */}
                  <button type="button" aria-label={`${i - 0.5} stars`}
                    className="absolute inset-y-0 left-0 w-1/2"
                    onMouseEnter={() => setHover(i - 0.5)} onClick={() => setStar(i - 0.5)} />
                  <button type="button" aria-label={`${i} stars`}
                    className="absolute inset-y-0 right-0 w-1/2"
                    onMouseEnter={() => setHover(i)} onClick={() => setStar(i)} />
                </div>
              );
            })}
          </div>
          <span className="text-lg font-bold text-amber-400 tabular-nums">{rating.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">/ 5.0</span>
        </div>
      </div>

      {/* Manual numeric controls */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rating (0–5)" type="number" value={String(rating)}
          onChange={(v) => set({ rating: Math.max(0, Math.min(5, Number(v) || 0)) })}
          hint="Supports decimals e.g. 4.5" />
        <Field label="Review Count" type="number" value={String(reviews)}
          onChange={(v) => set({ reviews: Math.max(0, Math.floor(Number(v) || 0)) })}
          hint="Total number of reviews" />
      </div>

      {/* Source */}
      <div>
        <label className="mb-1.5 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Rating Source</label>
        <div className="grid grid-cols-3 gap-2">
          {RATING_SOURCES.map((src) => (
            <button key={src.value} type="button" onClick={() => set({ rating_source: src.value })}
              className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition-all active:scale-[0.98] ${
                f.rating_source === src.value
                  ? "border-accent/40 bg-accent/15 text-accent"
                  : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground"
              }`}>
              {src.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {RATING_SOURCES.find((s) => s.value === f.rating_source)?.hint
            ?? "Choose where this product's rating comes from."}
        </p>
      </div>


      {/* Quick presets */}
      <div className="flex flex-wrap gap-1.5">
        {[5, 4.5, 4, 3.5, 0].map((preset) => (
          <button key={preset} type="button"
            onClick={() => set({ rating: preset })}
            className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-all hover:text-foreground active:scale-95">
            {preset === 0 ? "Reset" : `${preset}★`}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- command center ----------------------------- */


function CommandCenter({ slug, f, set, row }: {
  slug: string; f: Form; set: (patch: Partial<Form>) => void; row: Record<string, any>;
}) {
  const navigate = useNavigate();
  const [primaryUrl, setPrimaryUrl] = useState<string>(row.image ?? "");
  const [imageCount, setImageCount] = useState<number>(row.image ? 1 : 0);
  const [status, setStatus] = useState<string>(row.status ?? "draft");
  const [pubBusy, setPubBusy] = useState(false);

  /* --- Universal Smart Paste (CTRL+V anywhere outside a field) --- */
  const [pasteRaw, setPasteRaw] = useState("");
  const { categories } = useAdminCategories(true);
  const catOptions = useMemo(
    () => categories.map((c) => ({ name: c.name, slug: c.slug })),
    [categories],
  );
  const onPaste = useCallback((text: string) => setPasteRaw(text), []);
  useUniversalPaste(onPaste);

  function applyPaste(p: PasteApplyPayload) {
    const patch: Partial<Form> = {};
    const notes: string[] = [];
    if (p.specs?.length) {
      const { rows, added, updated } = mergeSpecRows(f.specs, p.specs);
      patch.specs = rows;
      notes.push(`${added} specs added${updated ? `, ${updated} updated` : ""}`);
    }
    if (p.description && !f.description.trim()) {
      patch.description = p.description;
      notes.push("description");
    } else if (p.description) {
      patch.description = `${f.description.trim()}\n\n${p.description}`;
      notes.push("description appended");
    }
    if (p.features?.length) {
      const seen = new Set(f.features.map((x) => x.toLowerCase().trim()));
      const merged = [...f.features];
      for (const x of p.features) if (!seen.has(x.toLowerCase().trim())) merged.push(x);
      patch.features = merged;
      notes.push(`${merged.length - f.features.length} features`);
    }
    if (p.brand && !f.brand.trim()) { patch.brand = p.brand; notes.push("brand"); }
    if (p.name && !f.name.trim()) { patch.name = p.name; notes.push("title"); }
    if (p.categorySlugs?.length) {
      const merged = [...new Set([...p.categorySlugs, ...f.categories])];
      patch.categories = merged;
      patch.category = merged[0] ?? f.category;
      notes.push("category");
    }
    if (!Object.keys(patch).length) {
      toast.info("Nothing new to import", { description: "Everything pasted already exists on this product." });
      return;
    }
    set(patch);
    // Auto Field Focus — scroll to the most important destination that changed.
    focusFirstApplied(
      (["name", "brand", "categories", "description", "features", "specs"] as const)
        .filter((k) => k in patch)
        .map((k) => (k === "brand" || k === "categories" ? "information" : k === "name" ? "information" : k)),
    );
    toast.success("Imported into product", {
      description: `${notes.join(" · ")} — live preview updated. Save to publish.`,
    });
  }



  const sellPrice = Number(row.price_inr ?? row.price ?? 0);
  const stock = Number(row.stock_quantity ?? 0);

  const checks = useMemo(() => [
    { key: "Images", ok: imageCount > 0, icon: ImageIcon },
    { key: "Pricing", ok: sellPrice > 0, icon: Tag },
    { key: "Inventory", ok: stock > 0, icon: Package },
    { key: "SEO", ok: !!(f.seo_title.trim() && f.seo_description.trim()), icon: Search },
    { key: "Video", ok: !!f.video_url.trim(), icon: Film },
    { key: "SKU", ok: !!(row.sku && String(row.sku).trim()), icon: Layers },
    { key: "Category", ok: !!(f.category.trim() && f.category.trim() !== "Uncategorized"), icon: Tag },
    { key: "Specifications", ok: f.specs.some((s) => s.k.trim()), icon: ListChecks },
  ], [imageCount, sellPrice, stock, f.seo_title, f.seo_description, f.video_url, row.sku, f.category, f.specs]);

  const okCount = checks.filter((c) => c.ok).length;
  const score = Math.round((okCount / checks.length) * 100);
  const warnings = checks.filter((c) => !c.ok);

  const RULES: Record<string, { title: string; why: string; impact: ValidationIssue["impact"]; action: string }> = {
    Images: { title: "No product images", impact: "high", action: "Add images", why: "Customers almost never buy a product they can't see. At least one hero image is expected." },
    Pricing: { title: "Selling price missing", impact: "high", action: "Set price", why: "Without a price the product can't be added to a cart or shown in browse rails." },
    Inventory: { title: "Out of stock", impact: "high", action: "Update stock", why: "Zero stock hides the buy button and drops this product in recommendations." },
    Category: { title: "Category not set", impact: "medium", action: "Choose category", why: "Category drives browse placement, filters and related-product intelligence." },
    Specifications: { title: "No specifications", impact: "medium", action: "Smart paste specs", why: "Shoppers in this segment compare specifications before buying — spec cards raise conversion." },
    SEO: { title: "SEO title or meta missing", impact: "medium", action: "Auto-generate SEO", why: "Search engines and social previews fall back to generic text without these fields." },
    SKU: { title: "SKU not assigned", impact: "low", action: "Open inventory", why: "SKUs keep stock, returns and supplier reconciliation accurate." },
    Video: { title: "No product video", impact: "low", action: "Add video", why: "Product videos measurably lift trust on higher-priced items." },
  };

  const issues: ValidationIssue[] = warnings.map((w) => {
    const rule = RULES[w.key];
    return {
      id: w.key,
      title: rule?.title ?? `Missing ${w.key}`,
      why: rule?.why ?? "Complete this field so the customer page renders fully.",
      impact: rule?.impact ?? "medium",
      actionLabel: rule?.action ?? "Fix now",
      onAction: () => {
        if (w.key === "Pricing") { navigate({ to: "/admin-product/$slug/pricing", params: { slug } }); return; }
        if (w.key === "Inventory" || w.key === "SKU") { navigate({ to: "/admin-product/$slug/inventory", params: { slug } }); return; }
        if (w.key === "SEO") { generateSeo(); focusEditorField("seo"); return; }
        const target: Record<string, string> = {
          Images: "media", Video: "media", Category: "information", Specifications: "specs",
        };
        focusEditorField(target[w.key] ?? "information");
      },
    };
  });

  /* ---- inline field intelligence (suggestions only, never auto-applied) ---- */
  const suggestInput: SuggestInput = {
    name: f.name, brand: f.brand, description: f.description, features: f.features,
    specs: f.specs, seoTitle: f.seo_title, seoDescription: f.seo_description,
  };
  const nameTips = titleSuggestions(suggestInput, (name) => set({ name }));
  const descTips = descriptionSuggestions(suggestInput);
  const featTips = featureSuggestions(suggestInput);
  const specTips = specSuggestions(suggestInput);
  const seoTips = seoSuggestions(suggestInput);

  /* ---- health dashboard cards (traffic-light, one-click fix) ---- */
  const healthCards: HealthCard[] = checks.map((c) => {
    const rule = RULES[c.key];
    const tone: HealthCard["tone"] = c.ok
      ? "excellent"
      : rule?.impact === "high" ? "bad" : rule?.impact === "low" ? "good" : "warn";
    const issue = issues.find((i) => i.id === c.key);
    return {
      id: c.key,
      label: c.key,
      status: c.ok ? "Complete" : (rule?.title ?? "Missing"),
      detail: c.ok ? undefined : rule?.action,
      tone,
      icon: c.icon,
      onFix: c.ok ? undefined : issue?.onAction,
      fixLabel: rule?.action,
    };
  });


  const tone = score >= 85 ? { t: "text-emerald-400", b: "bg-emerald-500", r: "stroke-emerald-400" }
    : score >= 60 ? { t: "text-accent", b: "bg-accent", r: "stroke-accent" }
    : score >= 40 ? { t: "text-amber-400", b: "bg-amber-500", r: "stroke-amber-400" }
    : { t: "text-destructive", b: "bg-destructive", r: "stroke-destructive" };

  // Status changes flow through the Publishing Center (setWorkflowStatus).



  function generateSeo() {
    const title = f.seo_title.trim() || `${f.name.trim()}${f.brand.trim() ? ` by ${f.brand.trim()}` : ""}`.slice(0, 60);
    const plain = f.description.replace(/[#*_>`-]/g, "").replace(/\s+/g, " ").trim();
    const desc = f.seo_description.trim() || (plain ? plain.slice(0, 155) : `Shop ${f.name.trim()} on FoundOurMarket.`);
    const kw = f.keywords.trim() || parseList([f.name, f.brand, f.category, f.product_type, f.tags].filter(Boolean).join(", ")).join(", ");
    set({ seo_title: title, seo_description: desc, keywords: kw });
    toast.success("SEO content generated — review & save");
  }

  const canonical = `https://foundourmarket.com/products/${slug}`;
  const seoOk = !!(f.seo_title.trim() && f.seo_description.trim() && f.keywords.trim());
  const seoScore = [f.seo_title, f.seo_description, f.keywords].filter((x) => x.trim()).length;

  /* --------------- Enterprise Workflow & Publishing (7.0) --------------- */

  const warranty = f.specs.find((s) => /warrant/i.test(s.k))?.v ?? "";

  const workflowInput: WorkflowInput = {
    slug,
    name: f.name, brand: f.brand,
    category: f.category, categories: f.categories,
    description: f.description, features: f.features,
    specCount: f.specs.filter((s) => s.k.trim()).length,
    seoTitle: f.seo_title, seoDescription: f.seo_description, keywords: f.keywords,
    videoUrl: f.video_url,
    imageCount, heroImage: primaryUrl,
    price: sellPrice, stock, sku: String(row.sku ?? ""),
    warranty,
    variantCount: Number(row.variant_count ?? 0),
    variantIssues: 0,
    status: normalizeStatus(status),
  };

  /** Flat, comparable snapshot of everything this editor owns. */
  const snapshot = useMemo<Record<string, unknown>>(() => ({
    name: f.name, brand: f.brand, product_type: f.product_type,
    category: f.category, categories: f.categories, tags: f.tags,
    description: f.description, features: f.features,
    specs: f.specs, attrs: f.attrs, video_url: f.video_url,
    seo_title: f.seo_title, seo_description: f.seo_description, keywords: f.keywords,
    rating: f.rating, reviews: f.reviews,
  }), [f]);

  // Auto-snapshot: first mount + whenever the draft settles after edits.
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  useEffect(() => {
    saveVersion(slug, "draft", "Draft opened", snapRef.current);
    logEvent(slug, "Editor opened");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const setWorkflowStatus = useCallback(async (next: WorkflowStatus) => {
    setPubBusy(true);
    const startedAt = performance.now();
    const { error } = await supabase
      .from("products")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("slug", slug);
    recordMetric("publish-prepare", performance.now() - startedAt, next);
    setPubBusy(false);
    if (error) { toast.error("Update failed", { description: error.message }); return; }
    setStatus(next);
    await invalidateProducts();
    if (next === "published") saveVersion(slug, "publish", "Published snapshot", snapRef.current);
    logEvent(slug, `Status → ${next.replace(/_/g, " ")}`);
    toast.success(`Moved to ${next.replace(/_/g, " ")}`);
  }, [slug]);

  const jumpToTarget = useCallback((target: string) => {
    if (target === "route:pricing") { navigate({ to: "/admin-product/$slug/pricing", params: { slug } }); return; }
    if (target === "route:inventory") { navigate({ to: "/admin-product/$slug/inventory", params: { slug } }); return; }
    if (target === "route:variants") { navigate({ to: "/admin-product/$slug/variants", params: { slug } }); return; }
    focusEditorField(target);
  }, [navigate, slug]);


  const restoreSnapshot = useCallback((data: Record<string, unknown>) => {
    saveVersion(slug, "manual", "Before restore", snapRef.current);
    set(data as Partial<Form>);
    logEvent(slug, "Version restored");
    toast.success("Version restored into the draft", { description: "Nothing is saved until you save." });
  }, [set, slug]);


  /* ------------------------- AI Copilot & automation ------------------------- */

  const descInput: DescriptionInput = {
    name: f.name, brand: f.brand, productType: f.product_type,
    category: f.categories[0] ?? f.category, features: f.features, specs: f.specs,
  };

  // One-step undo for anything the Copilot applies.
  const [undoPatch, setUndoPatch] = useState<Partial<Form> | null>(null);
  const applyWithUndo = useCallback((patch: Partial<Form>, before: Partial<Form>) => {
    setUndoPatch(before);
    set(patch);
  }, [set]);

  const draftSections = useMemo(() => buildDescriptionSections(descInput), [
    f.name, f.brand, f.product_type, f.category, f.categories, f.features, f.specs,
  ]);
  const draftMerge = useMemo(
    () => mergeDescriptionSections(f.description, draftSections),
    [f.description, draftSections],
  );
  const featureChips = useMemo(() => generateFeatureChips(descInput), [f.features, f.specs]);
  const keywordChips = useMemo(() => generateKeywordChips(descInput), [
    f.name, f.brand, f.product_type, f.category, f.categories, f.specs,
  ]);

  function generateDescription() {
    if (!draftMerge.addedSections.length) {
      toast.info("Description already covers every section");
      return;
    }
    const startedAt = performance.now();
    applyWithUndo({ description: draftMerge.text }, { description: f.description });
    recordMetric("ai-generate", performance.now() - startedAt, "description");
    focusEditorField("description");
    toast.success(`Added ${draftMerge.addedSections.length} section${draftMerge.addedSections.length === 1 ? "" : "s"}`, {
      description: `${draftMerge.addedSections.join(" · ")} — your existing text was left untouched.`,
    });
  }

  function generateFeatures() {
    const merged = [...f.features, ...featureChips].slice(0, 12);
    if (merged.length === f.features.length) { toast.info("No new features to suggest"); return; }
    applyWithUndo({ features: merged }, { features: f.features });
    focusEditorField("features");
    toast.success(`${merged.length - f.features.length} feature suggestions added`);
  }

  function generateKeywords() {
    if (!keywordChips.length) { toast.info("Add a title or specs first"); return; }
    applyWithUndo({ keywords: keywordChips.join(", ") }, { keywords: f.keywords });
    focusEditorField("seo");
    toast.success(`${keywordChips.length} keywords generated`);
  }

  const copilotRecs = buildCopilotRecs(
    {
      name: f.name, brand: f.brand, productType: f.product_type,
      category: f.categories[0] ?? f.category, categories: f.categories,
      description: f.description, features: f.features, specs: f.specs,
      seoTitle: f.seo_title, seoDescription: f.seo_description, keywords: f.keywords,
      videoUrl: f.video_url, imageCount, price: sellPrice, stock,
    },
    {
      generateDescription,
      descriptionPreview: draftMerge.addedSections.length
        ? draftSections
            .filter((s) => draftMerge.addedSections.includes(s.name))
            .map((s) => `## ${s.name}\n${s.body}`)
            .join("\n\n")
        : undefined,
      generateSeo,
      seoPreview: `Title: ${f.seo_title.trim() || `${f.name}${f.brand ? ` by ${f.brand}` : ""}`.slice(0, 60)}`,
      generateFeatures,
      featuresPreview: featureChips.slice(0, 6).map((x) => `• ${x}`).join("\n") || undefined,
      generateKeywords,
      keywordsPreview: keywordChips.join(", ") || undefined,
      openPricing: () => navigate({ to: "/admin-product/$slug/pricing", params: { slug } }),
      openInventory: () => navigate({ to: "/admin-product/$slug/inventory", params: { slug } }),
    },
  );

  const openPublishingPanel = useCallback((p: "checklist" | "timeline" | "preview") => {
    focusEditorField("publishing");
    window.dispatchEvent(new CustomEvent("editor-publishing-panel", { detail: p }));
  }, []);

  function generateReport() {
    const lines = [
      `# ${f.name || slug}`,
      `Status: ${status.replace(/_/g, " ")}`,
      `Price: ${sellPrice > 0 ? `₹${sellPrice}` : "not set"} · Stock: ${stock} · Images: ${imageCount}`,
      `Specs: ${f.specs.filter((s) => s.k.trim()).length} · Features: ${f.features.length}`,
      `SEO: ${seoOk ? "complete" : `${seoScore}/3 fields`}`,
      "",
      "## Outstanding",
      ...(warnings.length ? warnings.map((w) => `- ${RULES[w.key]?.title ?? w.key}`) : ["- Nothing outstanding"]),
    ];
    void navigator.clipboard?.writeText(lines.join("\n"));
    toast.success("Product report copied to clipboard");
  }

  // Ctrl/Cmd + Shift + P — publish from anywhere in the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void setWorkflowStatus(status === "published" ? "draft" : "published");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setWorkflowStatus, status]);

  const commands: EditorCommand[] = [
    { id: "publish", group: "Publish", icon: Send, label: status === "published" ? "Unpublish product" : "Publish product", hint: "⇧⌘P", run: () => void setWorkflowStatus(status === "published" ? "draft" : "published") },
    { id: "draft", group: "Publish", icon: FileText, label: "Save as draft", run: () => void setWorkflowStatus("draft") },
    { id: "review", group: "Publish", icon: CheckCircle2, label: "Mark ready for review", run: () => void setWorkflowStatus("ready_for_review") },
    { id: "archive", group: "Publish", icon: EyeOff, label: "Archive product", run: () => void setWorkflowStatus("archived") },
    { id: "checklist", group: "Workflow", icon: ListChecks, label: "Open pre-publish checklist", run: () => openPublishingPanel("checklist") },
    { id: "timeline", group: "Workflow", icon: Activity, label: "Open timeline & version history", run: () => openPublishingPanel("timeline") },
    { id: "compare", group: "Workflow", icon: Layers, label: "Compare versions", run: () => openPublishingPanel("timeline") },
    { id: "restore", group: "Workflow", icon: Activity, label: "Restore a version", run: () => openPublishingPanel("timeline") },
    { id: "pv-mobile", group: "Workflow", icon: Eye, label: "Publishing preview — mobile & desktop", run: () => openPublishingPanel("preview") },
    { id: "j-validation", group: "Workflow", icon: AlertTriangle, label: "Jump to validation", run: () => focusEditorField("health") },
    { id: "diagnostics", group: "Workflow", icon: Activity, label: "Open editor performance diagnostics", run: () => focusEditorField("health") },
    { id: "report", group: "Workflow", icon: FileText, label: "Generate product report", run: generateReport },
    { id: "preview", group: "Publish", icon: Eye, label: "Open customer preview", run: () => navigate({ to: "/admin-product/$slug/preview", params: { slug } }) },

    { id: "gen-desc", group: "Generate", icon: Sparkles, label: "Generate description sections", run: generateDescription },
    { id: "gen-seo", group: "Generate", icon: Search, label: "Generate SEO title & meta", run: generateSeo },
    { id: "gen-feat", group: "Generate", icon: ListChecks, label: "Suggest features", run: generateFeatures },
    { id: "gen-kw", group: "Generate", icon: Sparkles, label: "Suggest search keywords", run: generateKeywords },
    { id: "j-media", group: "Jump to", icon: ImageIcon, label: "Jump to Media", run: () => focusEditorField("media") },
    { id: "j-info", group: "Jump to", icon: Tag, label: "Jump to Product Information", run: () => focusEditorField("information") },
    { id: "j-desc", group: "Jump to", icon: FileText, label: "Jump to Description", run: () => focusEditorField("description") },
    { id: "j-specs", group: "Jump to", icon: Layers, label: "Jump to Specifications", run: () => focusEditorField("specs") },
    { id: "j-seo", group: "Jump to", icon: Search, label: "Jump to SEO Center", run: () => focusEditorField("seo") },
    { id: "j-health", group: "Jump to", icon: Activity, label: "Jump to Product Health", run: () => focusEditorField("health") },
    { id: "g-pricing", group: "Go to", icon: Tag, label: "Pricing", run: () => navigate({ to: "/admin-product/$slug/pricing", params: { slug } }) },
    { id: "g-inventory", group: "Go to", icon: Package, label: "Inventory", run: () => navigate({ to: "/admin-product/$slug/inventory", params: { slug } }) },
    { id: "g-seo", group: "Go to", icon: Search, label: "SEO workspace", run: () => navigate({ to: "/admin-product/$slug/seo", params: { slug } }) },
  ];


  const specCount = f.specs.filter((s) => s.k.trim()).length;
  const stepStates: StepState[] = [
    {
      id: "basic",
      done: !!f.name.trim() && f.categories.length > 0,
      level: f.name.trim() && f.categories.length > 0 ? "complete" : f.name.trim() ? "recommended" : "missing",
    },
    { id: "images", done: imageCount > 0, level: imageCount > 0 ? "complete" : "missing" },
    { id: "pricing", done: sellPrice > 0, level: sellPrice > 0 ? "complete" : "missing" },
    {
      id: "specs",
      done: specCount >= 3,
      level: specCount >= 3 ? "complete" : specCount > 0 ? "recommended" : "missing",
    },
    { id: "inventory", done: stock > 0, level: stock > 0 ? "complete" : "missing" },
    {
      id: "publish",
      done: status === "published",
      level: status === "published" ? "complete" : score >= 60 ? "recommended" : "missing",
    },
  ];

  // Ctrl/Cmd + Enter — publish from anywhere in the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void setWorkflowStatus(status === "published" ? "draft" : "published");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setWorkflowStatus, status]);

  // Publish confidence — a single prioritized suggestion, never a raw list.
  const topIssue = [...issues].sort((a, b) => {
    const w = { high: 0, medium: 1, low: 2 } as const;
    return w[a.impact] - w[b.impact];
  })[0];


  return (
    <GuidedWorkflow>
      <WorkflowBody
        slug={slug} f={f} set={set} row={row}
        stepStates={stepStates} score={score} tone={tone} status={status}
        stock={stock} sellPrice={sellPrice} imageCount={imageCount} setImageCount={setImageCount}
        primaryUrl={primaryUrl} setPrimaryUrl={setPrimaryUrl}
        workflowInput={workflowInput} snapshot={snapshot} pubBusy={pubBusy}
        setWorkflowStatus={setWorkflowStatus} jumpToTarget={jumpToTarget} restoreSnapshot={restoreSnapshot}
        nameTips={nameTips} descTips={descTips} featTips={featTips} specTips={specTips} seoTips={seoTips}
        seoOk={seoOk} seoScore={seoScore} canonical={canonical} generateSeo={generateSeo}
        checks={checks} okCount={okCount} healthCards={healthCards} issues={issues}
        healthReady={warnings.every((w) => RULES[w.key]?.impact !== "high")} copilotRecs={copilotRecs} undoPatch={undoPatch} setUndoPatch={setUndoPatch}
        commands={commands} pasteRaw={pasteRaw} setPasteRaw={setPasteRaw}
        catOptions={catOptions} applyPaste={applyPaste} navigate={navigate}
        topIssue={topIssue}
        generateDescription={generateDescription} generateFeatures={generateFeatures}
        generateKeywords={generateKeywords}


      />
    </GuidedWorkflow>
  );
}

/* ---------------- guided workflow body (Product Editor 9.0) ---------------- */

function WorkflowBody(p: any) {
  const {
    slug, f, set, row, stepStates, score, tone, status, stock, sellPrice,
    imageCount, setImageCount, primaryUrl, setPrimaryUrl,
    workflowInput, snapshot, pubBusy, setWorkflowStatus, jumpToTarget, restoreSnapshot,
    nameTips, descTips, featTips, specTips, seoTips, seoOk, seoScore, canonical, generateSeo,
    checks, okCount, healthCards, issues, healthReady, copilotRecs, undoPatch, setUndoPatch,
    commands, pasteRaw, setPasteRaw, catOptions, applyPaste, navigate, topIssue,
    generateDescription, generateFeatures, generateKeywords,

  } = p;
  const { mode, setStep } = useEditorWorkflow();
  const advanced = mode === "advanced";
  const isEmpty = !f.name.trim() && imageCount === 0;

  // Smart Context — only surface the spec template that fits this product.
  const ctx = contextFlags({
    name: f.name, category: f.category, categories: f.categories,
    productType: f.product_type, tags: f.tags,
  });
  const [tplDismissed, setTplDismissed] = useState<string | null>(null);
  const missingTpl = missingTemplateSpecs(ctx.template, f.specs);
  const showTpl = !!ctx.template && ctx.template.id !== tplDismissed && missingTpl.length > 0;

  function addTemplateSpecs() {
    if (!ctx.template) return;
    set({ specs: [...f.specs, ...missingTpl.map((k: string) => ({ k, v: "" }))] });
    focusEditorField("specs");
    toast.success(`${missingTpl.length} ${ctx.template.label.toLowerCase()} specs added`, {
      duration: 2000,
      description: "Fill in the values — nothing is saved until you save.",
    });
  }

  function importFromUrl() {
    const url = window.prompt("Paste the product listing URL");
    if (url && url.trim()) setPasteRaw(url.trim());
  }

  // "Paste specifications" empty-state action opens the universal paste flow.
  useEffect(() => {
    const open = () => setPasteRaw(" ");
    window.addEventListener("editor-open-paste", open);
    return () => window.removeEventListener("editor-open-paste", open);
  }, [setPasteRaw]);

  /* One Clear Start — a brand-new product shows three cards and nothing else. */
  const [started, setStarted] = useState(false);
  if (isEmpty && !started) {
    return (
      <div className="mx-auto max-w-3xl py-6">
        <StartOptions
          onPaste={() => { setStarted(true); setPasteRaw(" "); }}
          onImport={() => { setStarted(true); importFromUrl(); }}
          onScratch={() => { setStarted(true); setStep("basic"); focusEditorField("information"); }}
        />
        {pasteRaw && (
          <UniversalPasteDialog
            raw={pasteRaw}
            categories={catOptions}
            onApply={applyPaste}
            onClose={() => setPasteRaw("")}
          />
        )}
      </div>
    );
  }




  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0 space-y-4">

        {/* Mode + universal field search */}
        <div className="grid gap-2.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <ModeSwitch />
          <FieldSearch />
        </div>

        {/* Compact summary + health ring */}
        <div className="card-premium rounded-2xl p-3.5">
          <div className="flex items-center gap-3">
            <div className="size-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/5 grid place-items-center">
              {primaryUrl ? <img loading="lazy" decoding="async" src={resolveImage(primaryUrl)} alt={f.name} className="size-full object-cover" /> : <Package className="size-6 text-muted-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{f.name || "Untitled product"}</p>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="font-mono truncate">SKU {row.sku || "—"}</span>
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-mono uppercase tracking-wider ${status === "published" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                  {status.replace(/_/g, " ")}
                </span>
              </div>
            </div>
            <div className="relative size-16 shrink-0">
              <svg viewBox="0 0 36 36" className="size-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" className="fill-none stroke-white/10" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" className={`fill-none ${tone.r}`} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${(score / 100) * 97.4} 97.4`} />
              </svg>
              <div className="absolute inset-0 grid place-content-center text-center">
                <span className={`text-base font-bold leading-none ${tone.t}`}>{score}%</span>
                <span className="text-[7px] font-mono uppercase tracking-widest text-muted-foreground">Complete</span>
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <SummaryStat label="Stock" value={String(stock)} />
            <SummaryStat label="Price" value={sellPrice > 0 ? `₹${sellPrice.toLocaleString("en-IN")}` : "—"} />
            <SummaryStat label="Images" value={String(imageCount)} />
          </div>
        </div>

        <StepProgress states={stepStates} readiness={score} />

        {/* Publish confidence — one number, one suggestion, one button */}
        <PublishConfidence
          score={score}
          topSuggestion={topIssue?.title}
          actionLabel={topIssue?.actionLabel}
          onFix={topIssue?.onAction}
        />


        {/* ① Basic information */}
        <Step id="basic" index={1} title="Basic Information" fieldKey="information"
          desc="Name, brand & category" help="Start with the product name — everything else gets easier once it is set.">
          <div className="space-y-4">
            <div>
              <Field label="Product Name" value={f.name} onChange={(v: string) => set({ name: v })} />
              <InlineSuggestions items={nameTips} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Brand" value={f.brand} onChange={(v: string) => set({ brand: v })} />
              {advanced && <Field label="Product Type" value={f.product_type} onChange={(v: string) => set({ product_type: v })} />}
            </div>
            <CategorySelector value={f.categories} onChange={(v: string[]) => set({ categories: v, category: v[0] ?? "" })} />
            {advanced && <Field label="Tags (comma separated)" value={f.tags} onChange={(v: string) => set({ tags: v })} />}
            <div data-editor-field="description">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                  Description <HelpDot text="Short, factual copy. Buyers scan it — three tight paragraphs beat one long one." />
                </p>
                <AiChip label={f.description.trim() ? "Rewrite" : "Generate"} onClick={generateDescription} />
              </div>
              <RichTextEditor value={f.description} onChange={(v: string) => set({ description: v })} rows={7} />
              <InlineSuggestions items={descTips} />
            </div>

            <NextStep label="Next — Images" onClick={() => setStep("images")} />
          </div>
        </Step>

        {/* ② Images */}
        <Step id="images" index={2} title="Images" fieldKey="media"
          desc={`${imageCount} image${imageCount === 1 ? "" : "s"} • ${primaryUrl ? "hero set" : "no hero"}`}
          help="Add the hero image first — it is what customers see everywhere on the marketplace.">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] ${imageCount > 0 ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" : "border-amber-500/20 bg-amber-500/5 text-amber-400"}`}>
                {imageCount > 0 ? <CheckCircle2 className="size-3.5 shrink-0" /> : <AlertTriangle className="size-3.5 shrink-0" />}
                {imageCount > 0 ? "Images Added" : "Missing Images"}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] ${f.video_url.trim() ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400" : "border-white/10 bg-white/[0.02] text-muted-foreground"}`}>
                {f.video_url.trim() ? <CheckCircle2 className="size-3.5 shrink-0" /> : <Film className="size-3.5 shrink-0" />}
                {f.video_url.trim() ? "Video Added" : "Video Optional"}
              </span>
            </div>
            <ProductMediaGallery slug={slug} name={f.name} primaryUrl={primaryUrl}
              onPrimaryChange={(u: string | null) => setPrimaryUrl(u)} onCountChange={setImageCount} />
            {advanced && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                  <Film className="size-3.5 text-accent" /> Product Video
                </div>
                <ProductVideoUploader slug={slug} value={f.video_url} onChange={(u: string) => set({ video_url: u })} />
              </div>
            )}
            <NextStep label="Next — Pricing" onClick={() => setStep("pricing")} />
          </div>
        </Step>

        {/* ③ Pricing */}
        <Step id="pricing" index={3} title="Pricing" fieldKey="pricing"
          desc={sellPrice > 0 ? `₹${sellPrice.toLocaleString("en-IN")}` : "Not priced yet"}
          help="Selling price, MRP and margins live in the pricing workspace so currency rules stay consistent.">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              <SummaryStat label="Selling price" value={sellPrice > 0 ? `₹${sellPrice.toLocaleString("en-IN")}` : "—"} />
              <SummaryStat label="Status" value={status.replace(/_/g, " ")} />
            </div>
            <button type="button" onClick={() => navigate({ to: "/admin-product/$slug/pricing", params: { slug } })}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-4 text-sm font-semibold text-accent transition-all hover:bg-accent/20 active:scale-[0.98]">
              <Tag className="size-4" /> Open pricing
            </button>
            <NextStep label="Next — Specifications" onClick={() => setStep("specs")} />
          </div>
        </Step>

        {/* ④ Specifications */}
        <Step id="specs" index={4} title="Specifications" fieldKey="specs"
          desc="Paste anything — cards are built automatically"
          help="Paste a spec sheet from Amazon, Excel or a PDF. It is cleaned up and grouped for you."
          badge={
            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-accent">
              {f.specs.filter((s: KV) => s.k.trim()).length}
            </span>
          }>
          <div className="space-y-4">
            <div data-editor-field="features">
              <p className="mb-1.5 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Key Features</p>
              <FeaturesBuilder value={f.features} onChange={(v: string[]) => set({ features: v })} />
              <InlineSuggestions items={featTips} />
            </div>
            {showTpl && (
              <SpecTemplateStrip
                label={ctx.template!.label}
                missing={missingTpl}
                onAddAll={addTemplateSpecs}
                onDismiss={() => setTplDismissed(ctx.template!.id)}
              />
            )}
            <SmartSpecsBuilder rows={f.specs} onChange={(v: KV[]) => set({ specs: v })} />

            <InlineSuggestions items={specTips} />
            {advanced && (
              <div>
                <p className="mb-1.5 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Attributes</p>
                <KeyValueBuilder rows={f.attrs} onChange={(v: KV[]) => set({ attrs: v })}
                  keyPlaceholder="e.g. Color" valuePlaceholder="e.g. Black" addLabel="Add Attribute" />
              </div>
            )}
            <NextStep label="Next — Inventory" onClick={() => setStep("inventory")} />
          </div>
        </Step>

        {/* ⑤ Inventory */}
        <Step id="inventory" index={5} title="Inventory" fieldKey="inventory"
          desc={stock > 0 ? `${stock} in stock` : "No stock recorded"}
          help="Stock, SKU and warehouse rules live in the inventory workspace.">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              <SummaryStat label="Stock" value={String(stock)} />
              <SummaryStat label="SKU" value={row.sku || "—"} />
            </div>
            <button type="button" onClick={() => navigate({ to: "/admin-product/$slug/inventory", params: { slug } })}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-4 text-sm font-semibold text-accent transition-all hover:bg-accent/20 active:scale-[0.98]">
              <Package className="size-4" /> Open inventory
            </button>
            <NextStep label="Next — Review & Publish" onClick={() => setStep("publish")} />
          </div>
        </Step>

        {/* ⑥ Review & publish */}
        <Step id="publish" index={6} title="Review & Publish" fieldKey="publish"
          desc={`${okCount}/${checks.length} checks passing`}
          help="Everything below is optional polish. Publish when the checklist is green.">
          <div className="space-y-3">
            <LazyPanel name="Publishing Center" lines={4}>
              <PublishingCenter
                slug={slug}
                input={workflowInput}
                overlay={draftOverlayFromForm(f)}
                images={primaryUrl ? [primaryUrl] : []}
                snapshot={snapshot}
                busy={pubBusy}
                lastModified={row.updated_at ?? null}
                onSetStatus={setWorkflowStatus}
                onJump={jumpToTarget}
                onRestore={restoreSnapshot}
              />
            </LazyPanel>

          </div>
        </Step>

        {/* Advanced Tools — everything heavy, on demand */}
        <AdvancedSettings>
            {/* SEO */}
            <div data-editor-field="seo" className="space-y-3">
              <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                SEO Center
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${seoOk ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>{seoScore}/3</span>
              </p>
              <button type="button" onClick={generateSeo}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3.5 text-xs font-semibold text-accent transition-all hover:bg-accent/20 active:scale-[0.97]">
                <Sparkles className="size-3.5" /> Improve
              </button>
              <Field label="SEO Title" value={f.seo_title} onChange={(v: string) => set({ seo_title: v })} hint={`${f.seo_title.length}/60 characters`} />
              <div>
                <label className="mb-1.5 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Meta Description</label>
                <textarea value={f.seo_description} rows={3} onChange={(e) => set({ seo_description: e.target.value })}
                  className="w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm focus:border-accent/40 focus:outline-none" />
                <p className="mt-1 text-[10px] text-muted-foreground">{f.seo_description.length}/160 characters</p>
              </div>
              <Field label="Keywords (comma separated)" value={f.keywords} onChange={(v: string) => set({ keywords: v })} />
              <p className="truncate rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground">{canonical}</p>
              <InlineSuggestions items={seoTips} />
            </div>

            {/* FAQs */}
            <div className="space-y-2 border-t border-white/8 pt-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Product FAQs</p>
              <ProductFaqManager productSlug={slug} />
            </div>

            {/* Rating */}
            <div className="space-y-2 border-t border-white/8 pt-3">
              <p className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                Rating Management
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-amber-400">
                  <Star className="size-2.5 fill-current" /> {(Number(f.rating) || 0).toFixed(1)}
                </span>
              </p>
              <RatingManager f={f} set={set} />
            </div>

            {/* Health & diagnostics */}
            <div data-editor-field="health" className="space-y-3 border-t border-white/8 pt-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Product Health</p>
              <HealthDashboard score={score} ready={healthReady} cards={healthCards} />
              <ValidationCards issues={issues} />
              <LazyPanel name="Editor performance" lines={5}>
                <EditorDiagnostics />
              </LazyPanel>
            </div>
          </AdvancedSettings>

        {pasteRaw && (
          <UniversalPasteDialog
            raw={pasteRaw}
            categories={catOptions}
            onApply={applyPaste}
            onClose={() => setPasteRaw("")}
          />
        )}
      </div>

      {/* AI Copilot — advanced mode only, so simple mode stays quiet */}
      {advanced && (
        <AiCopilot
          recs={copilotRecs}
          canUndo={!!undoPatch}
          onUndo={() => { if (undoPatch) { set(undoPatch); setUndoPatch(null); toast.success("Reverted"); } }}
        />
      )}

      <EditorCommandPalette commands={commands} />
    </div>
  );
}

function NextStep({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.03] px-4 text-sm font-semibold text-foreground transition-[background-color,transform] duration-[var(--editor-motion-fast,160ms)] hover:bg-white/[0.07] active:scale-[0.99] sm:w-auto">
      {label} <ChevronDown className="size-4 -rotate-90" />
    </button>
  );
}
