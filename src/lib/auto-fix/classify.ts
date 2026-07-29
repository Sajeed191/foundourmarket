/**
 * FoundOurMarket™ Universal AI Auto-Fix (v1.0) — Classification.
 *
 * Classifies an existing AI recommendation into one of three categories.
 * Presentation intelligence only: it reads recommendations that the frozen
 * Intelligence Platform already produced and never scores or detects anything.
 *
 *   auto    — safe, reversible, metadata-only. One-click Auto Fix.
 *   review  — AI has a suggestion, but a human must approve it.
 *   manual  — needs a human (uploads, legal, photography, custom copy).
 */
export type AutoFixCategory = "auto" | "review" | "manual";

export type ClassifiedIssue = {
  category: AutoFixCategory;
  label: string;
  /** Why the classifier landed here — shown under "Why". */
  reason: string;
  risk: "low" | "medium" | "high";
};

export const CATEGORY_LABEL: Record<AutoFixCategory, string> = {
  auto: "Auto Fix",
  review: "Review Required",
  manual: "Manual Fix",
};

export const CATEGORY_TONE: Record<AutoFixCategory, string> = {
  auto: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  review: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  manual: "border-sky-400/40 bg-sky-400/10 text-sky-300",
};

/**
 * Things AI must NEVER change on its own — matched defensively against the
 * recommendation text so a future module can't accidentally opt in.
 */
const NEVER_AUTO = [
  "price", "pricing", "margin", "discount", "delete", "remove", "publish",
  "unpublish", "inventory", "stock", "quantity", "flash deal", "variant",
  "payment", "shipping fee", "refund", "tax", "gst", "compliance", "legal",
  "certificate", "warranty terms",
];

const MANUAL_SIGNALS = [
  "image", "photo", "photography", "gallery", "upload", "certificate",
  "compliance", "legal", "document", "custom description", "video",
];

const REVIEW_SIGNALS = [
  "price", "pricing", "margin", "flash deal", "inventory", "stock",
  "vendor", "cross-sell", "cross sell", "upsell", "bundle", "category confidence",
];

const AUTO_SIGNALS = [
  "seo", "meta", "title", "slug", "alt text", "keyword", "tag", "casing",
  "capital", "whitespace", "spacing", "unit", "format", "normalis", "normaliz",
  "description length", "metadata",
];

function has(hay: string, needles: string[]): boolean {
  return needles.some((n) => hay.includes(n));
}

export function classifyIssue(input: {
  module?: string | null;
  action?: string | null;
  text?: string | null;
  confidence?: number | null;
  /** True when a concrete, safe patch was computed for this product. */
  hasSafeProposal?: boolean;
}): ClassifiedIssue {
  const hay = `${input.module ?? ""} ${input.action ?? ""} ${input.text ?? ""}`.toLowerCase();
  const confidence = input.confidence ?? 0;

  if (has(hay, MANUAL_SIGNALS)) {
    return {
      category: "manual",
      label: CATEGORY_LABEL.manual,
      reason: "Needs human input — media, documents or original copy cannot be generated safely.",
      risk: "low",
    };
  }

  if (has(hay, NEVER_AUTO) || has(hay, REVIEW_SIGNALS)) {
    return {
      category: "review",
      label: CATEGORY_LABEL.review,
      reason: "Commercial impact — this changes how the product sells, so it needs your approval.",
      risk: confidence >= 90 ? "medium" : "high",
    };
  }

  if (input.hasSafeProposal && (has(hay, AUTO_SIGNALS) || confidence >= 85)) {
    return {
      category: "auto",
      label: CATEGORY_LABEL.auto,
      reason: "Low-risk metadata formatting — reversible, and no commercial values change.",
      risk: "low",
    };
  }

  if (input.hasSafeProposal) {
    return {
      category: "auto",
      label: CATEGORY_LABEL.auto,
      reason: "A safe metadata improvement is available for this product.",
      risk: "low",
    };
  }

  return {
    category: "manual",
    label: CATEGORY_LABEL.manual,
    reason: "No safe automatic change could be derived — open the editor to resolve it.",
    risk: "low",
  };
}
