/**
 * Smart Work Queue — One-Click Deep Linking (v2.0)
 *
 * NAVIGATION / UX ONLY. This module never touches data, validation,
 * intelligence or save logic. It answers exactly two questions:
 *
 *   1. "Which editor tab + section does this recommendation belong to?"
 *   2. "Where do I send the admin back after they save?"
 */

export type EditorTab =
  | "details"
  | "pricing"
  | "inventory"
  | "variants"
  | "seo"
  | "shipping"
  | "returns"
  | "merchandising";

export type DeepLinkTarget = {
  /** Editor tab route path (TanStack `to`). */
  to: string;
  /** Section key of the destination editor tab (used by SectionEditor). */
  section: EditorTab;
  /** `data-editor-field` key to scroll to + glow. */
  focus: string;
  /** Human label used in the "AI Recommendation" banner. */
  label: string;
};

const TAB_ROUTE: Record<EditorTab, string> = {
  details: "/admin-product/$slug/details",
  pricing: "/admin-product/$slug/pricing",
  inventory: "/admin-product/$slug/inventory",
  variants: "/admin-product/$slug/variants",
  seo: "/admin-product/$slug/seo",
  shipping: "/admin-product/$slug/shipping",
  returns: "/admin-product/$slug/returns",
  merchandising: "/admin-product/$slug/merchandising",
};

function target(section: EditorTab, focus: string, label: string): DeepLinkTarget {
  return { to: TAB_ROUTE[section], section, focus, label };
}

/** Module id → destination. Modules come from the frozen Intelligence contracts. */
const BY_MODULE: Record<string, DeepLinkTarget> = {
  seo_intelligence: target("seo", "seo", "SEO"),
  variant_intelligence: target("variants", "variants", "Variants"),
  pricing_intelligence: target("pricing", "pricing", "Pricing"),
  images: target("details", "media", "Images"),
  image_intelligence: target("details", "media", "Images"),
  attribute_intelligence: target("details", "specs", "Attributes"),
  attributes: target("details", "specs", "Attributes"),
  specs: target("details", "specs", "Specifications"),
  content_intelligence: target("details", "description", "Description"),
  description: target("details", "description", "Description"),
  inventory_intelligence: target("inventory", "inventory", "Inventory"),
  inventory: target("inventory", "inventory", "Inventory"),
  duplicate_intelligence: target("details", "information", "Duplicate review"),
  readiness: target("details", "publishing", "Publish readiness"),
};

/** Action label → destination (fallback when the module id is unknown). */
const BY_ACTION: { match: RegExp; target: DeepLinkTarget }[] = [
  { match: /attribute/i, target: target("details", "specs", "Attributes") },
  { match: /spec/i, target: target("details", "specs", "Specifications") },
  { match: /image|photo|media|gallery/i, target: target("details", "media", "Images") },
  { match: /seo|meta|slug|keyword/i, target: target("seo", "seo", "SEO") },
  { match: /pric|margin|cost|compare/i, target: target("pricing", "pricing", "Pricing") },
  { match: /variant|size|colou?r/i, target: target("variants", "variants", "Variants") },
  { match: /inventory|stock|sku|warehouse/i, target: target("inventory", "inventory", "Inventory") },
  { match: /descri|content|copy/i, target: target("details", "description", "Description") },
  { match: /ship|delivery|weight/i, target: target("shipping", "shipping", "Shipping") },
  { match: /return|warranty|replace/i, target: target("returns", "returns", "Returns") },
  { match: /badge|merchandis|placement/i, target: target("merchandising", "merchandising", "Merchandising") },
  { match: /duplicate/i, target: target("details", "information", "Duplicate review") },
  { match: /publish|complete listing|listing/i, target: target("details", "publishing", "Publish readiness") },
];

/**
 * Resolve the exact editor destination for a queue recommendation.
 * Always returns something — the safe default is the Details tab.
 */
export function resolveEditorTarget(input: {
  module?: string | null;
  action?: string | null;
  recommendation?: string | null;
}): DeepLinkTarget {
  const mod = (input.module ?? "").trim();
  if (mod && BY_MODULE[mod]) return BY_MODULE[mod];

  const text = `${input.action ?? ""} ${input.recommendation ?? ""}`;
  for (const rule of BY_ACTION) if (rule.match.test(text)) return rule.target;

  return target("details", "information", "Product details");
}

/* --------------------------- return experience --------------------------- */

export type QueueReturnState = {
  /** Where to go back to, e.g. "/admin-work-queue". */
  path: string;
  /** Active queue tab id. */
  queue?: string;
  /** Scroll offset in the queue list. */
  scrollY?: number;
  /** Card that was opened. */
  productId?: string;
  /** Free-form UI state (search text, filters) — presentation only. */
  ui?: Record<string, string | number | boolean | null>;
};

const RETURN_KEY = "fom.workqueue.return";
const RESTORE_KEY = "fom.workqueue.restore";

export function rememberQueueReturn(state: QueueReturnState) {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(RETURN_KEY, JSON.stringify(state));
  } catch {
    /* storage disabled — deep linking still works, just no restore */
  }
}

export function readQueueReturn(): QueueReturnState | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    return raw ? (JSON.parse(raw) as QueueReturnState) : null;
  } catch {
    return null;
  }
}

export function clearQueueReturn() {
  try { sessionStorage.removeItem(RETURN_KEY); } catch { /* noop */ }
}

/** Marks that the queue should restore its previous state on next mount. */
export function armQueueRestore(message?: string) {
  try {
    sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ message: message ?? null }));
  } catch { /* noop */ }
}

export function consumeQueueRestore(): { message: string | null } | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RESTORE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RESTORE_KEY);
    return JSON.parse(raw) as { message: string | null };
  } catch {
    return null;
  }
}
