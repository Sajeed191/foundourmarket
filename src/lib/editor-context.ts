/**
 * Product Editor 10.0 — Smart Context (presentation only).
 *
 * Maps the product's category to the specifications an admin actually needs,
 * so the editor never shows irrelevant field templates. Pure data + string
 * helpers: no API, schema or product behaviour depends on this module.
 */

export type SpecTemplate = {
  /** Canonical context id. */
  id: string;
  /** Human label shown on the suggestion strip. */
  label: string;
  /** Keywords matched against category / type / tags / product name. */
  match: string[];
  /** The specification keys most listings in this context carry. */
  specs: string[];
};

export const SPEC_TEMPLATES: SpecTemplate[] = [
  {
    id: "phones",
    label: "Mobile Phone",
    match: ["phone", "mobile", "smartphone", "iphone", "android"],
    specs: ["Display", "Processor", "RAM", "Storage", "Battery", "Camera", "Operating System"],
  },
  {
    id: "laptops",
    label: "Laptop",
    match: ["laptop", "notebook", "macbook", "ultrabook", "computer"],
    specs: ["Processor", "RAM", "Storage", "Display", "Graphics", "Battery", "Weight"],
  },
  {
    id: "audio",
    label: "Audio",
    match: ["headphone", "earbud", "earphone", "speaker", "audio", "soundbar"],
    specs: ["Type", "Connectivity", "Battery Life", "Noise Cancellation", "Driver Size", "Weight"],
  },
  {
    id: "watches",
    label: "Watch",
    match: ["watch", "smartwatch", "timepiece"],
    specs: ["Movement", "Display", "Water Resistance", "Strap Material", "Case Diameter", "Battery"],
  },
  {
    id: "electronics",
    label: "Electronics",
    match: ["electronic", "tv", "television", "camera", "monitor", "console", "gadget", "appliance"],
    specs: ["Display", "Power", "Connectivity", "Dimensions", "Weight", "Warranty"],
  },
  {
    id: "clothing",
    label: "Clothing",
    match: ["cloth", "apparel", "shirt", "tshirt", "dress", "jean", "wear", "fashion", "jacket"],
    specs: ["Size", "Material", "Fit", "Colour", "Care Instructions", "Gender"],
  },
  {
    id: "footwear",
    label: "Footwear",
    match: ["shoe", "sneaker", "footwear", "sandal", "boot"],
    specs: ["Size", "Material", "Sole", "Closure", "Gender", "Colour"],
  },
  {
    id: "furniture",
    label: "Furniture",
    match: ["furniture", "sofa", "chair", "table", "bed", "desk", "cabinet", "wardrobe"],
    specs: ["Dimensions", "Weight", "Material", "Assembly Required", "Weight Capacity", "Finish"],
  },
  {
    id: "food",
    label: "Food",
    match: ["food", "snack", "grocery", "beverage", "coffee", "tea", "supplement", "nutrition"],
    specs: ["Ingredients", "Nutrition", "Net Weight", "Shelf Life", "Allergens", "Storage"],
  },
  {
    id: "beauty",
    label: "Beauty",
    match: ["beauty", "skincare", "cosmetic", "makeup", "fragrance", "hair"],
    specs: ["Type", "Skin Type", "Volume", "Ingredients", "Fragrance", "Shelf Life"],
  },
  {
    id: "bags",
    label: "Bags",
    match: ["bag", "backpack", "luggage", "wallet", "purse"],
    specs: ["Material", "Dimensions", "Capacity", "Closure", "Colour", "Warranty"],
  },
];

/** Context signals available to the editor. */
export type ContextInput = {
  name?: string;
  category?: string;
  categories?: string[];
  productType?: string;
  tags?: string;
};

function haystack(i: ContextInput): string {
  return [i.category, ...(i.categories ?? []), i.productType, i.tags, i.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Resolve the best template for the current product, or null when unclear. */
export function resolveTemplate(i: ContextInput): SpecTemplate | null {
  const h = haystack(i);
  if (!h.trim()) return null;
  let best: { t: SpecTemplate; hits: number } | null = null;
  for (const t of SPEC_TEMPLATES) {
    const hits = t.match.reduce((n, m) => (h.includes(m) ? n + 1 : n), 0);
    if (hits > 0 && (!best || hits > best.hits)) best = { t, hits };
  }
  return best?.t ?? null;
}

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Template specs that are not on the product yet. */
export function missingTemplateSpecs(
  template: SpecTemplate | null,
  rows: { k: string }[],
): string[] {
  if (!template) return [];
  const have = new Set(rows.map((r) => norm(r.k)).filter(Boolean));
  return template.specs.filter((s) => !have.has(norm(s)));
}

/** Should the editor bother showing video / attribute style extras? */
export function contextFlags(i: ContextInput) {
  const t = resolveTemplate(i);
  const id = t?.id ?? "";
  return {
    template: t,
    /** Sizing/fit products benefit from a variant nudge. */
    sizeDriven: id === "clothing" || id === "footwear",
    /** Dimension-led products (shipping accuracy matters more). */
    dimensionDriven: id === "furniture" || id === "bags",
    /** Consumables need compliance-ish fields. */
    consumable: id === "food" || id === "beauty",
  };
}
