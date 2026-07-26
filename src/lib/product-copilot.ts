/**
 * AI Copilot — Product Editor 6.0.
 *
 * One prioritized recommendation stream for the whole editor. Deterministic,
 * explainable, offline. Every recommendation is advisory: it exposes an
 * optional one-click apply plus a human-readable preview of exactly what the
 * apply would change, so nothing ever surprises the admin.
 */

export type CopilotPriority = "high" | "medium" | "low";

export type CopilotRec = {
  id: string;
  title: string;
  /** Plain-language reason + expected impact. */
  why: string;
  impact: string;
  priority: CopilotPriority;
  /** Editor section to scroll to (data-editor-field key). */
  field?: string;
  /** What applying would insert/change — shown before the admin commits. */
  preview?: string;
  applyLabel?: string;
  apply?: () => void;
};

export type CopilotInput = {
  name: string;
  brand: string;
  productType: string;
  category: string;
  categories: string[];
  description: string;
  features: string[];
  specs: { k: string; v: string }[];
  seoTitle: string;
  seoDescription: string;
  keywords: string;
  videoUrl: string;
  imageCount: number;
  price: number;
  stock: number;
};

export type CopilotActions = {
  generateDescription?: () => void;
  descriptionPreview?: string;
  generateSeo?: () => void;
  seoPreview?: string;
  generateFeatures?: () => void;
  featuresPreview?: string;
  generateKeywords?: () => void;
  keywordsPreview?: string;
  openPricing?: () => void;
  openInventory?: () => void;
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const hasSpec = (f: CopilotInput, re: RegExp) => f.specs.some((s) => re.test(s.k) && s.v.trim());

const RANK: Record<CopilotPriority, number> = { high: 0, medium: 1, low: 2 };

/**
 * Build the prioritized recommendation list. Sorted high → low; the first
 * entry is the one the Copilot expands by default.
 */
export function buildCopilotRecs(f: CopilotInput, a: CopilotActions = {}): CopilotRec[] {
  const out: CopilotRec[] = [];

  if (f.imageCount === 0) {
    out.push({
      id: "images",
      title: "Add product images",
      why: "This product has no images, so the customer page renders an empty gallery.",
      impact: "Biggest single lift on conversion",
      priority: "high",
      field: "media",
    });
  } else if (f.imageCount < 3) {
    out.push({
      id: "images-thin",
      title: "Add more gallery angles",
      why: `Only ${f.imageCount} image${f.imageCount === 1 ? "" : "s"} — buyers expect front, back and detail shots.`,
      impact: "Fewer pre-purchase questions",
      priority: "medium",
      field: "media",
    });
  }

  if (f.price <= 0) {
    out.push({
      id: "price",
      title: "Set a selling price",
      why: "Without a price the product cannot be added to a cart or listed in browse rails.",
      impact: "Required to sell",
      priority: "high",
      applyLabel: "Open pricing",
      apply: a.openPricing,
    });
  }

  if (f.stock <= 0) {
    out.push({
      id: "stock",
      title: "Update stock",
      why: "Zero stock hides the buy button and demotes the product in recommendations.",
      impact: "Required to sell",
      priority: "high",
      applyLabel: "Open inventory",
      apply: a.openInventory,
    });
  }

  const descWords = words(f.description.replace(/[#*_>`-]/g, " "));
  if (descWords === 0) {
    out.push({
      id: "desc-empty",
      title: "Generate a structured description",
      why: "No description yet. A sectioned description (Overview, Benefits, Technical Details) reads better than one paragraph.",
      impact: "Higher time-on-page and search relevance",
      priority: "high",
      field: "description",
      preview: a.descriptionPreview,
      applyLabel: "Generate",
      apply: a.generateDescription,
    });
  } else if (descWords < 60) {
    out.push({
      id: "desc-short",
      title: "Description is too short",
      why: `${descWords} words — add the missing sections without touching what you wrote.`,
      impact: "Better ranking for long-tail search",
      priority: "medium",
      field: "description",
      preview: a.descriptionPreview,
      applyLabel: "Add sections",
      apply: a.generateDescription,
    });
  }

  if (!f.categories.length || !f.category.trim() || f.category.trim() === "Uncategorized") {
    out.push({
      id: "category",
      title: "Choose a category",
      why: "Category drives browse placement, filters and related-product intelligence.",
      impact: "Product becomes discoverable",
      priority: "high",
      field: "information",
    });
  }

  if (!f.specs.some((s) => s.k.trim())) {
    out.push({
      id: "specs",
      title: "Add specifications",
      why: "Shoppers compare specification cards before buying — paste any spec table and it is grouped automatically.",
      impact: "Fewer returns, stronger comparisons",
      priority: "high",
      field: "specs",
    });
  } else {
    const seen = new Map<string, number>();
    for (const s of f.specs) {
      if (!s.k.trim()) continue;
      const k = s.k.toLowerCase().replace(/[^a-z0-9]/g, "");
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const dupes = [...seen.values()].filter((n) => n > 1).length;
    if (dupes) {
      out.push({
        id: "spec-dupes",
        title: "Duplicate specifications found",
        why: `${dupes} label${dupes === 1 ? " appears" : "s appear"} more than once — the customer page will show them twice.`,
        impact: "Cleaner spec cards",
        priority: "medium",
        field: "specs",
      });
    }
    if (!hasSpec(f, /warranty|guarantee/i)) {
      out.push({
        id: "warranty",
        title: "Missing warranty information",
        why: "Warranty is one of the most-checked specs before checkout.",
        impact: "Builds purchase confidence",
        priority: "medium",
        field: "specs",
      });
    }
    if (!hasSpec(f, /in the box|box contents|package contents|includes/i)) {
      out.push({
        id: "box",
        title: 'Missing "What\'s in the Box"',
        why: "Buyers ask what is included more than any other question.",
        impact: "Fewer support tickets",
        priority: "medium",
        field: "specs",
      });
    }
    if (!hasSpec(f, /compat|support|interface|connectivity/i)) {
      out.push({
        id: "compat",
        title: "Add compatibility information",
        why: "Compatibility powers the Compatible Products rail on the customer page.",
        impact: "Unlocks cross-sell placements",
        priority: "low",
        field: "specs",
      });
    }
  }

  if (f.features.length < 3) {
    out.push({
      id: "features",
      title: "Feature list is incomplete",
      why: `${f.features.length} feature${f.features.length === 1 ? "" : "s"} — highlights are the first thing scanned on mobile.`,
      impact: "Better scannability",
      priority: "medium",
      field: "features",
      preview: a.featuresPreview,
      applyLabel: "Suggest features",
      apply: a.generateFeatures,
    });
  }

  const title = f.name.trim();
  if (title && title.length < 25) {
    out.push({
      id: "title-seo",
      title: "Improve the title for search",
      why: "Short titles miss model, capacity and colour keywords buyers actually type.",
      impact: "More organic impressions",
      priority: "medium",
      field: "information",
    });
  }

  if (!f.seoTitle.trim() || !f.seoDescription.trim()) {
    out.push({
      id: "seo",
      title: "Generate SEO title and meta",
      why: "Search engines and social previews fall back to generic text without these.",
      impact: "Better click-through from search",
      priority: "medium",
      field: "seo",
      preview: a.seoPreview,
      applyLabel: "Generate SEO",
      apply: a.generateSeo,
    });
  }

  if (!f.keywords.trim()) {
    out.push({
      id: "keywords",
      title: "Add search keywords",
      why: "Keywords feed internal search and related-product matching.",
      impact: "Stronger on-site search",
      priority: "low",
      field: "seo",
      preview: a.keywordsPreview,
      applyLabel: "Suggest keywords",
      apply: a.generateKeywords,
    });
  }

  if (!f.videoUrl.trim()) {
    out.push({
      id: "video",
      title: "No product video",
      why: "Video measurably lifts trust on higher-priced products.",
      impact: "Optional polish",
      priority: "low",
      field: "media",
    });
  }

  return out.sort((x, y) => RANK[x.priority] - RANK[y.priority]);
}
