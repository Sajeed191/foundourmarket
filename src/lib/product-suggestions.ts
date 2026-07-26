import type { FieldSuggestion } from "@/components/admin/product-editor/InlineSuggestions";

/**
 * Product Editor 5.0 — inline field intelligence.
 *
 * Deterministic, explainable, presentation-only heuristics. Every result is a
 * *suggestion*: the editor never rewrites a field on its own.
 */

export type SuggestInput = {
  name: string;
  brand: string;
  description: string;
  features: string[];
  specs: { k: string; v: string }[];
  seoTitle: string;
  seoDescription: string;
};

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function titleSuggestions(f: SuggestInput, apply?: (name: string) => void): FieldSuggestion[] {
  const out: FieldSuggestion[] = [];
  const name = f.name.trim();
  if (!name) return out;

  const brand = f.brand.trim();
  if (brand) {
    const re = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const hits = name.match(re)?.length ?? 0;
    if (hits > 1) {
      out.push({
        id: "dupe-brand",
        text: "Brand name repeats in the title",
        tone: "warn",
        actionLabel: "Remove duplicate",
        onApply: apply
          ? () => {
              let seen = false;
              const cleaned = name
                .replace(re, (m) => (seen ? "" : ((seen = true), m)))
                .replace(/\s{2,}/g, " ")
                .trim();
              apply(cleaned);
            }
          : undefined,
      });
    }
  }
  if (name.length > 80) out.push({ id: "title-long", text: `${name.length} characters — aim for under 80`, tone: "warn" });
  else if (name.length < 20) out.push({ id: "title-short", text: "Title is short — add model, size or key spec" });
  if (!/\d/.test(name)) out.push({ id: "title-model", text: "Add a model number or capacity for search" });
  return out;
}

export function descriptionSuggestions(f: SuggestInput): FieldSuggestion[] {
  const out: FieldSuggestion[] = [];
  const words = wordCount(f.description.replace(/[#*_>`-]/g, " "));
  if (words === 0) return [{ id: "desc-empty", text: "No description yet — buyers skip products without one", tone: "warn" }];
  if (words < 40) out.push({ id: "desc-short", text: `${words} words — 80+ converts better`, tone: "warn" });
  if (!/\b(how to use|usage|instructions|setup|getting started)\b/i.test(f.description))
    out.push({ id: "desc-usage", text: "Missing usage instructions" });
  if (!/\b(box|includes?|package contents)\b/i.test(f.description))
    out.push({ id: "desc-box", text: "Mention what's in the box" });
  return out;
}

export function featureSuggestions(f: SuggestInput): FieldSuggestion[] {
  const count = f.features.filter((x) => x.trim()).length;
  if (count === 0) return [{ id: "feat-none", text: "No features — 8 is the sweet spot", tone: "warn" }];
  if (count < 5) return [{ id: "feat-few", text: `Only ${count} found — 8 recommended` }];
  const longOnes = f.features.filter((x) => x.trim().length > 90).length;
  return longOnes ? [{ id: "feat-long", text: `${longOnes} feature${longOnes === 1 ? "" : "s"} too long — keep them scannable` }] : [];
}

export function specSuggestions(f: SuggestInput): FieldSuggestion[] {
  const out: FieldSuggestion[] = [];
  const rows = f.specs.filter((s) => s.k.trim());
  if (rows.length === 0) return [{ id: "spec-none", text: "No specifications — paste a table with Ctrl+V", tone: "warn" }];
  if (rows.length < 8) out.push({ id: "spec-few", text: `${rows.length} specs — comparable products list 12+` });
  const keys = rows.map((r) => r.k.toLowerCase());
  if (!keys.some((k) => /warrant/.test(k))) out.push({ id: "spec-warranty", text: "Warranty duration missing" });
  if (!keys.some((k) => /weight/.test(k))) out.push({ id: "spec-weight", text: "Weight missing — affects shipping trust" });
  if (!keys.some((k) => /dimension|size/.test(k))) out.push({ id: "spec-dims", text: "Dimensions missing" });
  return out;
}

export function seoSuggestions(f: SuggestInput): FieldSuggestion[] {
  const out: FieldSuggestion[] = [];
  if (f.seoTitle.length > 60) out.push({ id: "seo-title-long", text: `${f.seoTitle.length}/60 — Google will truncate`, tone: "warn" });
  if (f.seoDescription && f.seoDescription.length > 160)
    out.push({ id: "seo-desc-long", text: `${f.seoDescription.length}/160 — trim the meta description`, tone: "warn" });
  if (f.seoDescription && f.seoDescription.length < 70)
    out.push({ id: "seo-desc-short", text: "Meta description under 70 characters looks thin" });
  return out;
}
