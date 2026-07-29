/**
 * FoundOurMarket™ Universal AI Auto-Fix (v1.0) — Planners.
 *
 * PURE FUNCTIONS ONLY. No database access, no mutations, no validation rules.
 * A planner inspects a product and, when it can safely improve a low-risk
 * presentation/metadata field, returns the proposed patch. Applying the patch
 * is done elsewhere, exclusively through the existing update mutation.
 *
 * SAFETY (hard rules, enforced by construction):
 *   Planners may ONLY touch: name, tagline, seoTitle, seoDescription,
 *   metaKeywords. They can never change price, stock, status, images,
 *   variants, payments, shipping, compliance or publication state.
 */
import type { Product } from "@/lib/products";

/** Fields the auto-fix layer is allowed to write. Nothing else, ever. */
export type AutoFixablePatch = Partial<
  Pick<Product, "name" | "tagline" | "seoTitle" | "seoDescription"> & { metaKeywords: string[] }
>;

export type AutoFixRisk = "low" | "medium";

export type AutoFixKind =
  | "title_formatting"
  | "whitespace"
  | "seo_title"
  | "seo_description"
  | "search_keywords"
  | "units";

export type FieldChange = {
  field: keyof AutoFixablePatch;
  label: string;
  before: string;
  after: string;
};

export type AutoFixProposal = {
  kind: AutoFixKind;
  /** Short human title, e.g. "Fix title formatting". */
  title: string;
  /** Plain-language reasoning shown to the admin. */
  reason: string;
  /** Expected impact sentence. */
  impact: string;
  confidence: number; // 0..100
  risk: AutoFixRisk;
  patch: AutoFixablePatch;
  changes: FieldChange[];
};

/* ------------------------------------------------------------------ utils */

const SMALL_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or",
  "the", "to", "vs", "via", "with",
]);

const UNIT_MAP: Record<string, string> = {
  kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg",
  g: "g", gram: "g", grams: "g", gm: "g", gms: "g",
  mg: "mg",
  cm: "cm", cms: "cm", centimeter: "cm", centimeters: "cm",
  mm: "mm", m: "m",
  ml: "ml", l: "L", ltr: "L", litre: "L", liter: "L", litres: "L", liters: "L",
  inch: "in", inches: "in", in: "in",
};

export function collapseSpaces(s: string): string {
  return s.replace(/[\u00a0\s]+/g, " ").trim();
}

export function titleCase(s: string): string {
  const words = collapseSpaces(s).split(" ");
  return words
    .map((w, i) => {
      // Preserve tokens that look intentional: model numbers, SKUs, acronyms
      // with digits, hyphenated codes.
      if (/\d/.test(w) || /^[A-Z0-9][A-Z0-9./-]*$/.test(w) === false && /[A-Z].*[A-Z]/.test(w) && w.length <= 5) {
        return w;
      }
      const lower = w.toLowerCase();
      if (i > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Standardise measurement units: "2 KG" → "2 kg", "10CM" → "10 cm". */
export function normalizeUnits(s: string): string {
  return s.replace(/(\d+(?:\.\d+)?)\s*([A-Za-z]{1,10})\b/g, (full, num: string, unit: string) => {
    const canonical = UNIT_MAP[unit.toLowerCase()];
    if (!canonical) return full;
    return `${num} ${canonical}`;
  });
}

function clip(s: string, max: number): string {
  const t = collapseSpaces(s);
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,\-–:;]$/, "").trim();
}

function change(field: keyof AutoFixablePatch, label: string, before: unknown, after: unknown): FieldChange {
  const fmt = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null || v === "" ? "—" : String(v));
  return { field, label, before: fmt(before), after: fmt(after) };
}

/* -------------------------------------------------------------- planners */

function planTitleFormatting(p: Product): AutoFixProposal | null {
  const raw = p.name ?? "";
  if (!raw.trim()) return null;
  const cleaned = collapseSpaces(raw);
  const isShouting = cleaned === cleaned.toUpperCase() && /[A-Z]{4,}/.test(cleaned);
  const isLower = cleaned === cleaned.toLowerCase() && /[a-z]/.test(cleaned);
  if (!isShouting && !isLower) return null;
  const next = titleCase(cleaned);
  if (next === raw) return null;
  return {
    kind: "title_formatting",
    title: "Correct product title casing",
    reason: isShouting
      ? "Title is written entirely in capitals, which reads as shouting in listings and search results."
      : "Title is written entirely in lowercase, which looks unfinished on storefront cards.",
    impact: "Improves listing presentation and search snippet quality.",
    confidence: 96,
    risk: "low",
    patch: { name: next },
    changes: [change("name", "Product title", raw, next)],
  };
}

function planWhitespace(p: Product): AutoFixProposal | null {
  const patch: AutoFixablePatch = {};
  const changes: FieldChange[] = [];
  const name = p.name ?? "";
  const tagline = p.tagline ?? "";
  if (name && collapseSpaces(name) !== name) {
    patch.name = collapseSpaces(name);
    changes.push(change("name", "Product title", name, patch.name));
  }
  if (tagline && collapseSpaces(tagline) !== tagline) {
    patch.tagline = collapseSpaces(tagline);
    changes.push(change("tagline", "Tagline", tagline, patch.tagline));
  }
  if (!changes.length) return null;
  return {
    kind: "whitespace",
    title: "Remove extra spaces",
    reason: "Duplicate or trailing spaces were found in text fields.",
    impact: "Cleaner titles across cards, search and metadata.",
    confidence: 99,
    risk: "low",
    patch,
    changes,
  };
}

function planUnits(p: Product): AutoFixProposal | null {
  const tagline = p.tagline ?? "";
  if (!tagline.trim()) return null;
  const next = normalizeUnits(collapseSpaces(tagline));
  if (next === tagline) return null;
  return {
    kind: "units",
    title: "Standardise measurement units",
    reason: "Units were written inconsistently (spacing or casing) in the tagline.",
    impact: "Consistent specification formatting across the catalog.",
    confidence: 95,
    risk: "low",
    patch: { tagline: next },
    changes: [change("tagline", "Tagline", tagline, next)],
  };
}

function planSeoTitle(p: Product): AutoFixProposal | null {
  const current = (p.seoTitle ?? "").trim();
  if (current && current.length >= 25 && current.length <= 60) return null;
  const base = collapseSpaces(p.name ?? "");
  if (!base) return null;
  const brand = (p.brand ?? "").trim();
  const category = (p.category ?? "").trim();
  const parts = [base];
  if (brand && !base.toLowerCase().includes(brand.toLowerCase())) parts.push(brand);
  else if (category && !base.toLowerCase().includes(category.toLowerCase())) parts.push(category);
  const next = clip(parts.join(" — "), 60);
  if (!next || next === current) return null;
  return {
    kind: "seo_title",
    title: current ? "Rewrite SEO title to optimal length" : "Generate SEO title",
    reason: current
      ? `Current SEO title is ${current.length} characters — search engines truncate outside 25–60.`
      : "No SEO title is set, so search engines fall back to the raw product name.",
    impact: "Better search snippet and click-through on product listings.",
    confidence: 94,
    risk: "low",
    patch: { seoTitle: next },
    changes: [change("seoTitle", "SEO title", current, next)],
  };
}

function planSeoDescription(p: Product): AutoFixProposal | null {
  const current = (p.seoDescription ?? "").trim();
  if (current && current.length >= 70 && current.length <= 160) return null;
  const source = collapseSpaces(p.description || p.tagline || "");
  const name = collapseSpaces(p.name ?? "");
  if (!name) return null;
  const stripped = source.replace(/<[^>]*>/g, " ");
  const body = stripped ? clip(stripped, 150) : clip(`${name}${p.category ? ` — premium ${p.category.toLowerCase()}` : ""} available at FoundOurMarket with fast, tracked delivery.`, 150);
  const next = clip(body, 155);
  if (!next || next === current || next.length < 50) return null;
  return {
    kind: "seo_description",
    title: current ? "Rewrite meta description" : "Generate meta description",
    reason: current
      ? `Meta description is ${current.length} characters — outside the 70–160 range search engines display.`
      : "No meta description is set for this product.",
    impact: "Improves how this product appears in search results.",
    confidence: 92,
    risk: "low",
    patch: { seoDescription: next },
    changes: [change("seoDescription", "Meta description", current, next)],
  };
}

const STOP = new Set(["the", "and", "for", "with", "from", "your", "our", "new", "premium"]);

function planKeywords(p: Product): AutoFixProposal | null {
  const current = (p.metaKeywords ?? []).filter(Boolean);
  const normalizedCurrent = Array.from(
    new Set(current.map((k) => collapseSpaces(k).toLowerCase()).filter(Boolean)),
  );
  const needsNormalize = normalizedCurrent.length > 0 && normalizedCurrent.join("|") !== current.join("|");
  if (current.length >= 4 && !needsNormalize) return null;

  const tokens = collapseSpaces(`${p.name ?? ""} ${p.category ?? ""} ${p.brand ?? ""}`)
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
  const generated = Array.from(new Set([...normalizedCurrent, ...tokens])).slice(0, 12);
  if (!generated.length || generated.join("|") === current.join("|")) return null;

  return {
    kind: "search_keywords",
    title: needsNormalize && current.length >= 4 ? "Normalise search keywords" : "Generate search keywords",
    reason: "Keywords derived from the existing product title, category and brand — no new facts invented.",
    impact: "Improves internal search recall and metadata completeness.",
    confidence: 93,
    risk: "low",
    patch: { metaKeywords: generated },
    changes: [change("metaKeywords", "Search keywords", current, generated)],
  };
}

const PLANNERS: Array<(p: Product) => AutoFixProposal | null> = [
  planWhitespace,
  planTitleFormatting,
  planUnits,
  planSeoTitle,
  planSeoDescription,
  planKeywords,
];

/** Every safe fix available for a product, highest confidence first. */
export function planAutoFixes(product: Product): AutoFixProposal[] {
  const out: AutoFixProposal[] = [];
  for (const plan of PLANNERS) {
    try {
      const r = plan(product);
      if (r && r.changes.length) out.push(r);
    } catch {
      /* a planner must never break the admin UI */
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Merge several proposals into one patch + change list (batch / apply-all). */
export function mergeProposals(proposals: AutoFixProposal[]): { patch: AutoFixablePatch; changes: FieldChange[] } {
  const patch: AutoFixablePatch = {};
  const changes: FieldChange[] = [];
  for (const p of proposals) {
    Object.assign(patch, p.patch);
    changes.push(...p.changes);
  }
  // De-duplicate by field, keeping the last write (matches the merged patch).
  const byField = new Map<string, FieldChange>();
  for (const c of changes) {
    const existing = byField.get(c.field);
    byField.set(c.field, existing ? { ...c, before: existing.before } : c);
  }
  return { patch, changes: [...byField.values()] };
}
