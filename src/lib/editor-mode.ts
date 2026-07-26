/**
 * Product Editor 9.0 — Simplicity First.
 *
 * Presentation-only preferences for the guided editor workflow:
 *  - simple vs advanced mode (remembered per admin, locally)
 *  - which guided step is currently open
 *
 * No data, API or schema behaviour depends on this module.
 */

export type EditorMode = "simple" | "advanced";

const MODE_KEY = "fom_editor_mode";

export function readEditorMode(): EditorMode {
  if (typeof localStorage === "undefined") return "simple";
  try {
    return localStorage.getItem(MODE_KEY) === "advanced" ? "advanced" : "simple";
  } catch {
    return "simple";
  }
}

export function writeEditorMode(mode: EditorMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage may be blocked */
  }
}

/** Steps of the guided workflow, in order. */
export const EDITOR_STEPS = [
  { id: "basic", label: "Basic" },
  { id: "images", label: "Images" },
  { id: "pricing", label: "Pricing" },
  { id: "specs", label: "Specs" },
  { id: "inventory", label: "Inventory" },
  { id: "publish", label: "Review" },
] as const;

export type EditorStepId = (typeof EDITOR_STEPS)[number]["id"];

/** Which guided step owns a given focus target (so search + fixes can jump). */
export const STEP_OF_FIELD: Record<string, EditorStepId> = {
  information: "basic",
  description: "basic",
  media: "images",
  pricing: "pricing",
  features: "specs",
  specs: "specs",
  inventory: "inventory",
  seo: "publish",
  health: "publish",
  publish: "publish",
};

/** Searchable field index for the universal "Search fields…" box. */
export const FIELD_INDEX: { key: string; label: string; terms: string[] }[] = [
  { key: "information", label: "Product name, brand & category", terms: ["name", "title", "brand", "category", "type", "tags"] },
  { key: "description", label: "Description", terms: ["description", "about", "copy", "story"] },
  { key: "media", label: "Images & video", terms: ["image", "images", "photo", "gallery", "video", "media", "hero"] },
  { key: "pricing", label: "Pricing", terms: ["price", "mrp", "discount", "cost", "margin", "tax", "currency"] },
  { key: "features", label: "Features", terms: ["feature", "features", "highlights", "benefits"] },
  { key: "specs", label: "Specifications", terms: ["spec", "specs", "specification", "battery", "weight", "display", "size", "material"] },
  { key: "inventory", label: "Inventory & SKU", terms: ["stock", "inventory", "sku", "barcode", "quantity", "warehouse"] },
  { key: "seo", label: "SEO title, meta & keywords", terms: ["seo", "meta", "keywords", "search", "google", "slug"] },
  { key: "health", label: "Product health & diagnostics", terms: ["health", "score", "issues", "diagnostics", "performance", "validation"] },
  { key: "publish", label: "Review & publish", terms: ["publish", "status", "draft", "review", "live", "checklist"] },
];

export function searchFields(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return FIELD_INDEX.filter(
    (f) => f.label.toLowerCase().includes(q) || f.terms.some((t) => t.includes(q)),
  ).slice(0, 6);
}
