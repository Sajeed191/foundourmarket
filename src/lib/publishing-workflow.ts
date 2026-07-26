/**
 * Enterprise Workflow & Publishing — Product Editor 7.0.
 *
 * Pure, deterministic, client-side workflow layer. No schema changes, no API
 * changes: checklist / score / insights are derived from the editor state the
 * page already has, while timeline, version snapshots and schedules live in
 * per-admin local storage. Advisory only — publishing is never blocked.
 */

export type WorkflowStatus =
  | "draft"
  | "ready_for_review"
  | "approved"
  | "scheduled"
  | "published"
  | "archived";

export const WORKFLOW_LABEL: Record<WorkflowStatus, string> = {
  draft: "Draft",
  ready_for_review: "Ready for Review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

export const WORKFLOW_TONE: Record<WorkflowStatus, string> = {
  draft: "text-muted-foreground",
  ready_for_review: "text-accent",
  approved: "text-emerald-400",
  scheduled: "text-sky-400",
  published: "text-emerald-400",
  archived: "text-muted-foreground",
};

export function normalizeStatus(raw: string | null | undefined): WorkflowStatus {
  const v = String(raw ?? "draft").toLowerCase();
  return (["draft", "ready_for_review", "approved", "scheduled", "published", "archived"] as const)
    .includes(v as WorkflowStatus)
    ? (v as WorkflowStatus)
    : "draft";
}

/* ------------------------------- inputs ------------------------------- */

export type WorkflowInput = {
  slug: string;
  name: string;
  brand: string;
  category: string;
  categories: string[];
  description: string;
  features: string[];
  specCount: number;
  seoTitle: string;
  seoDescription: string;
  keywords: string;
  videoUrl: string;
  imageCount: number;
  heroImage: string;
  price: number;
  stock: number;
  sku: string;
  warranty: string;
  variantCount: number;
  variantIssues: number;
  status: WorkflowStatus;
};

export type Impact = "critical" | "high" | "medium" | "low";

export const IMPACT_RANK: Record<Impact, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export type ChecklistItem = {
  id: string;
  label: string;
  ok: boolean;
  impact: Impact;
  /** Plain-language explanation shown when the item is failing. */
  hint: string;
  /** Editor field key or route destination hint for one-click jump. */
  target: string;
};

export function buildChecklist(i: WorkflowInput): ChecklistItem[] {
  const desc = i.description.replace(/\s+/g, " ").trim();
  return [
    { id: "title", label: "Title", ok: i.name.trim().length >= 8, impact: "critical", hint: "A descriptive title of 8+ characters is required for search and browse.", target: "information" },
    { id: "brand", label: "Brand", ok: !!i.brand.trim(), impact: "medium", hint: "Brand powers filters, trust signals and marketplace matching.", target: "information" },
    { id: "category", label: "Category", ok: !!(i.categories[0] ?? i.category).trim() && (i.categories[0] ?? i.category).trim() !== "Uncategorized", impact: "high", hint: "Category drives browse placement and related-product intelligence.", target: "information" },
    { id: "price", label: "Price", ok: i.price > 0, impact: "critical", hint: "Without a price the product cannot be added to a cart.", target: "route:pricing" },
    { id: "stock", label: "Stock", ok: i.stock > 0, impact: "high", hint: "Zero stock hides the buy button and demotes the product everywhere.", target: "route:inventory" },
    { id: "images", label: "Images", ok: i.imageCount >= 3, impact: "high", hint: "Three or more images is the point where conversion stops improving slowly.", target: "media" },
    { id: "hero", label: "Hero Image", ok: !!i.heroImage.trim(), impact: "critical", hint: "The hero image is the card image used across the whole marketplace.", target: "media" },
    { id: "specs", label: "Specifications", ok: i.specCount >= 5, impact: "medium", hint: "Shoppers compare specs before buying; 5+ rows fill the spec cards.", target: "specs" },
    { id: "description", label: "Description", ok: desc.length >= 200, impact: "high", hint: "A 200+ character description gives the detail page and search real content.", target: "description" },
    { id: "warranty", label: "Warranty", ok: !!i.warranty.trim(), impact: "low", hint: "Warranty text is a strong trust signal on higher-priced products.", target: "specs" },
    { id: "seo", label: "SEO", ok: !!(i.seoTitle.trim() && i.seoDescription.trim() && i.keywords.trim()), impact: "medium", hint: "Search engines and social previews fall back to generic text without these.", target: "seo" },
    { id: "gallery", label: "Gallery Health", ok: i.imageCount >= 3 && !!i.heroImage.trim(), impact: "medium", hint: "A healthy gallery needs a hero plus supporting angles.", target: "media" },
    { id: "marketplace", label: "Marketplace Readiness", ok: i.imageCount > 0 && i.price > 0 && !!(i.categories[0] ?? i.category).trim() && i.specCount > 0, impact: "high", hint: "Marketplace surfaces need image, price, category and specs together.", target: "health" },
    { id: "variants", label: "Variant Validation", ok: i.variantIssues === 0, impact: i.variantCount > 0 ? "high" : "low", hint: "Some variants are missing price, stock or an image.", target: "route:variants" },
    { id: "slug", label: "Slug", ok: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(i.slug), impact: "medium", hint: "A clean lowercase slug keeps the product URL stable and indexable.", target: "information" },
    { id: "visibility", label: "Product Visibility", ok: i.status === "published" || i.status === "scheduled", impact: "low", hint: "This product is not visible to customers yet.", target: "publishing" },
  ];
}

/* --------------------------- quality score --------------------------- */

export type ScoreGroup = { id: string; label: string; score: number };

export type QualityScore = {
  overall: number;
  groups: ScoreGroup[];
  tone: "excellent" | "good" | "warn" | "bad";
  /** Single prioritized recommendation, plain language. */
  recommendation: string;
  /** Checklist id the recommendation points at. */
  recommendationTarget?: string;
};

const pct = (n: number, d: number) => (d <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((n / d) * 100))));

export function buildQualityScore(i: WorkflowInput, checklist: ChecklistItem[]): QualityScore {
  const desc = i.description.replace(/\s+/g, " ").trim();
  const groups: ScoreGroup[] = [
    { id: "content", label: "Content", score: Math.round((pct(Math.min(desc.length, 600), 600) + pct(Math.min(i.features.length, 6), 6)) / 2) },
    { id: "images", label: "Images", score: pct(Math.min(i.imageCount, 5), 5) },
    { id: "seo", label: "SEO", score: pct([i.seoTitle, i.seoDescription, i.keywords].filter((x) => x.trim()).length, 3) },
    { id: "trust", label: "Trust", score: pct([i.brand, i.warranty, i.sku, i.videoUrl].filter((x) => x.trim()).length, 4) },
    { id: "marketplace", label: "Marketplace", score: pct([i.price > 0, i.stock > 0, !!(i.categories[0] ?? i.category).trim(), !!i.heroImage.trim()].filter(Boolean).length, 4) },
    { id: "specs", label: "Specifications", score: pct(Math.min(i.specCount, 10), 10) },
    { id: "variants", label: "Variants", score: i.variantCount === 0 ? 100 : pct(i.variantCount - i.variantIssues, i.variantCount) },
    { id: "cx", label: "Customer Experience", score: pct([i.imageCount >= 3, desc.length >= 200, i.specCount >= 5, i.features.length >= 3].filter(Boolean).length, 4) },
  ];
  const overall = Math.round(groups.reduce((a, g) => a + g.score, 0) / groups.length);
  const tone = overall >= 90 ? "excellent" : overall >= 75 ? "good" : overall >= 50 ? "warn" : "bad";

  const top = [...checklist].filter((c) => !c.ok).sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact])[0];
  return {
    overall,
    groups,
    tone,
    recommendation: top ? `${top.label}: ${top.hint}` : "Everything checks out — this product is ready to publish.",
    recommendationTarget: top?.id,
  };
}

/* ------------------------------ insights ------------------------------ */

export type Insight = { id: string; label: string; value: string; tone: "excellent" | "good" | "warn" | "bad" };

const band = (n: number): Insight["tone"] => (n >= 90 ? "excellent" : n >= 75 ? "good" : n >= 50 ? "warn" : "bad");
const word = (n: number) => (n >= 90 ? "Excellent" : n >= 75 ? "High" : n >= 50 ? "Fair" : "Low");

export function buildInsights(score: QualityScore): Insight[] {
  const g = (id: string) => score.groups.find((x) => x.id === id)?.score ?? 0;
  const conversion = Math.round((g("images") + g("content") + g("marketplace")) / 3);
  return [
    { id: "seo", label: "SEO", value: word(g("seo")), tone: band(g("seo")) },
    { id: "visibility", label: "Marketplace Visibility", value: word(g("marketplace")), tone: band(g("marketplace")) },
    { id: "conversion", label: "Conversion Readiness", value: `${conversion}%`, tone: band(conversion) },
    { id: "content", label: "Content Quality", value: `${g("content")}%`, tone: band(g("content")) },
    { id: "gallery", label: "Gallery Quality", value: `${g("images")}%`, tone: band(g("images")) },
    { id: "trust", label: "Trust", value: `${g("trust")}%`, tone: band(g("trust")) },
  ];
}

/* --------------------- timeline / versions storage --------------------- */

export type TimelineEvent = {
  id: string;
  at: number;
  label: string;
  detail?: string;
  /** Optional version id this event can restore back to. */
  versionId?: string;
};

export type VersionKind = "draft" | "publish" | "manual" | "ai";

export type VersionSnapshot = {
  id: string;
  at: number;
  kind: VersionKind;
  label: string;
  /** Flat field map — compared and restored as-is. */
  data: Record<string, unknown>;
};

const MAX_EVENTS = 60;
const MAX_VERSIONS = 25;

const tkey = (slug: string) => `fom.editor.timeline.${slug}`;
const vkey = (slug: string) => `fom.editor.versions.${slug}`;
const skey = (slug: string) => `fom.editor.schedule.${slug}`;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — workflow history is best-effort */
  }
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function readTimeline(slug: string): TimelineEvent[] {
  return read<TimelineEvent[]>(tkey(slug), []);
}

export function logEvent(slug: string, label: string, detail?: string, versionId?: string): TimelineEvent[] {
  const next = [{ id: uid(), at: Date.now(), label, detail, versionId }, ...readTimeline(slug)].slice(0, MAX_EVENTS);
  write(tkey(slug), next);
  return next;
}

export function readVersions(slug: string): VersionSnapshot[] {
  return read<VersionSnapshot[]>(vkey(slug), []);
}

export function saveVersion(
  slug: string,
  kind: VersionKind,
  label: string,
  data: Record<string, unknown>,
): VersionSnapshot {
  const snap: VersionSnapshot = { id: uid(), at: Date.now(), kind, label, data };
  const existing = readVersions(slug);
  // Skip consecutive identical snapshots — history should read like real work.
  const last = existing[0];
  if (last && JSON.stringify(last.data) === JSON.stringify(data)) return last;
  write(vkey(slug), [snap, ...existing].slice(0, MAX_VERSIONS));
  return snap;
}

export function deleteVersion(slug: string, id: string): VersionSnapshot[] {
  const next = readVersions(slug).filter((v) => v.id !== id);
  write(vkey(slug), next);
  return next;
}

/* ------------------------------ compare ------------------------------ */

export type FieldDiff = {
  field: string;
  label: string;
  kind: "added" | "removed" | "modified";
  before: string;
  after: string;
};

const DIFF_LABELS: Record<string, string> = {
  name: "Title", brand: "Brand", product_type: "Product Type", category: "Category",
  categories: "Categories", tags: "Tags", description: "Description", features: "Features",
  specs: "Specifications", attrs: "Attributes", video_url: "Video",
  seo_title: "SEO Title", seo_description: "SEO Description", keywords: "Keywords",
  rating: "Rating", reviews: "Review Count", warranty: "Warranty",
};

function toText(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) {
    return v
      .map((x) => (x && typeof x === "object" ? Object.values(x as Record<string, unknown>).join(": ") : String(x)))
      .join("\n");
  }
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, x]) => `${k}: ${x}`).join("\n");
  return String(v);
}

export function diffSnapshots(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const out: FieldDiff[] = [];
  for (const k of keys) {
    const b = toText(before[k]);
    const a = toText(after[k]);
    if (b === a) continue;
    out.push({
      field: k,
      label: DIFF_LABELS[k] ?? k,
      kind: !b ? "added" : !a ? "removed" : "modified",
      before: b,
      after: a,
    });
  }
  return out.sort((x, y) => x.label.localeCompare(y.label));
}

/* ---------------------------- scheduling ---------------------------- */

export type ScheduleAction = "publish" | "archive" | "unpublish";

export type ScheduledJob = { action: ScheduleAction; at: number };

export function readSchedule(slug: string): ScheduledJob | null {
  return read<ScheduledJob | null>(skey(slug), null);
}

export function writeSchedule(slug: string, job: ScheduledJob | null) {
  if (typeof window === "undefined") return;
  if (!job) {
    try { window.localStorage.removeItem(skey(slug)); } catch { /* ignore */ }
    return;
  }
  write(skey(slug), job);
}

/* ------------------------- duplicate protection ------------------------- */

export type DuplicateHit = {
  slug: string;
  name: string;
  reason: "title" | "sku" | "barcode" | "image";
  confidence: "possible" | "likely";
};

export function normalizeTitle(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Rank duplicate candidates: exact identifiers beat fuzzy titles. */
export function rankDuplicates(hits: DuplicateHit[]): DuplicateHit[] {
  const order: Record<DuplicateHit["reason"], number> = { sku: 0, barcode: 1, image: 2, title: 3 };
  const seen = new Set<string>();
  return hits
    .sort((a, b) => order[a.reason] - order[b.reason])
    .filter((h) => (seen.has(h.slug) ? false : (seen.add(h.slug), true)));
}

export function formatClock(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatStamp(at: number) {
  return new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
