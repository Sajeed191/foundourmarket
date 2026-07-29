/**
 * FoundOurMarket™ Universal Smart Navigation (v1.0)
 *
 * NAVIGATION / UX ONLY. No data, validation, intelligence or save logic here.
 *
 * Any warning, recommendation, AI suggestion, health issue or alert anywhere in
 * the admin can be turned into a one-click deep link that opens the exact page,
 * tab, section and field required to resolve it — and returns the admin to the
 * originating screen (scroll, filters, tab) once it is saved.
 *
 * Future modules only need to emit `{ entity, entityId, module, action, text }`
 * — this resolver does the rest, so new recommendations get deep linking for
 * free.
 */
import { resolveEditorTarget, rememberQueueReturn, type QueueReturnState } from "@/lib/editor-deeplink";

export type SmartEntity =
  | "product"
  | "vendor"
  | "order"
  | "customer"
  | "campaign"
  | "flash_deal"
  | "duplicate"
  | "inventory"
  | "category"
  | "seo"
  | "image"
  | "email"
  | "unknown";

export type SmartTarget = {
  /** TanStack route path. */
  to: string;
  /** Route params (e.g. `{ slug }`) when the destination is dynamic. */
  params?: Record<string, string>;
  /** Search params carrying the focus hint. */
  search: Record<string, string>;
  /** Friendly destination label ("SEO", "Vendor profile", …). */
  label: string;
  /** `data-editor-field` / `data-smart-target` key highlighted on arrival. */
  focus: string;
  entity: SmartEntity;
};

export type SmartIssue = {
  entity?: SmartEntity | null;
  /** Product slug (products) or entity id (vendor/order/campaign/…). */
  entityId?: string | null;
  /** Intelligence module id, when known. */
  module?: string | null;
  /** Action label ("Add brand", "Fix images"…). */
  action?: string | null;
  /** Full recommendation text — used as a fallback signal. */
  text?: string | null;
  /** Explicit overrides, when a module already knows exactly where to go. */
  to?: string | null;
  focus?: string | null;
  label?: string | null;
};

/* ------------------------------ destinations ----------------------------- */

const ENTITY_ROUTE: Record<Exclude<SmartEntity, "product" | "unknown">, { to: string; label: string; focus: string }> = {
  vendor: { to: "/admin-vendors", label: "Vendor profile", focus: "vendor" },
  order: { to: "/admin-orders-ops", label: "Order detail", focus: "order" },
  customer: { to: "/admin-customers", label: "Customer", focus: "customer" },
  campaign: { to: "/admin-marketing-automation", label: "Campaign editor", focus: "campaign" },
  flash_deal: { to: "/admin-flash-deals", label: "Flash deal", focus: "flash-deal" },
  duplicate: { to: "/admin-duplicate-intelligence", label: "Duplicate review", focus: "duplicate" },
  inventory: { to: "/admin-inventory", label: "Inventory", focus: "inventory" },
  category: { to: "/admin-categories-manage", label: "Category", focus: "category" },
  seo: { to: "/admin-seo-intelligence", label: "SEO health", focus: "seo" },
  image: { to: "/admin-image-intelligence", label: "Gallery health", focus: "images" },
  email: { to: "/admin-email-health", label: "Email health", focus: "email" },
};

/** Text signals that imply a non-product destination when no entity is given. */
const TEXT_ENTITY: { match: RegExp; entity: SmartEntity }[] = [
  { match: /vendor|supplier|seller verification/i, entity: "vendor" },
  { match: /\border\b|fulfil|shipment|refund/i, entity: "order" },
  { match: /campaign|newsletter|broadcast/i, entity: "campaign" },
  { match: /flash deal|flash sale/i, entity: "flash_deal" },
  { match: /duplicate/i, entity: "duplicate" },
  { match: /deliverab|bounce|inbox placement/i, entity: "email" },
];

/**
 * Resolve the exact destination for any recommendation, anywhere.
 * Always returns something — never a generic page for known signals.
 */
export function resolveSmartTarget(issue: SmartIssue, origin = "admin"): SmartTarget {
  const text = `${issue.action ?? ""} ${issue.text ?? ""}`;

  // Explicit override from the emitting module.
  if (issue.to) {
    return {
      to: issue.to,
      params: issue.entityId ? { slug: issue.entityId } : undefined,
      search: buildSearch(issue.focus ?? "", issue.label ?? "Recommendation", origin, issue.entityId),
      label: issue.label ?? "Recommendation",
      focus: issue.focus ?? "",
      entity: (issue.entity as SmartEntity) ?? "unknown",
    };
  }

  let entity: SmartEntity = issue.entity ?? "unknown";
  if (entity === "unknown") {
    entity = TEXT_ENTITY.find((r) => r.match.test(text))?.entity ?? "product";
  }

  if (entity === "product") {
    const t = resolveEditorTarget({
      module: issue.module,
      action: issue.action,
      recommendation: issue.text,
    });
    return {
      to: t.to,
      params: issue.entityId ? { slug: issue.entityId } : undefined,
      search: buildSearch(t.focus, t.label, origin),
      label: t.label,
      focus: t.focus,
      entity: "product",
    };
  }

  const dest = ENTITY_ROUTE[entity as Exclude<SmartEntity, "product" | "unknown">];
  return {
    to: dest.to,
    search: buildSearch(dest.focus, dest.label, origin, issue.entityId),
    label: dest.label,
    focus: dest.focus,
    entity,
  };
}

function buildSearch(focus: string, label: string, origin: string, entityId?: string | null) {
  const search: Record<string, string> = { focus, dl: label, from: origin };
  if (entityId) search.eid = entityId;
  return search;
}

/* ------------------------------- return trip ----------------------------- */

/**
 * Capture the current screen (path, scroll, tab, filters) so the destination
 * can restore it exactly after the fix is saved. Presentation state only.
 */
export function rememberOrigin(state: Partial<QueueReturnState> & { path?: string } = {}) {
  if (typeof window === "undefined") return;
  rememberQueueReturn({
    path: state.path ?? window.location.pathname,
    queue: state.queue,
    scrollY: state.scrollY ?? window.scrollY,
    productId: state.productId,
    ui: { ...(state.ui ?? {}), search: window.location.search },
  });
  try {
    sessionStorage.setItem("fom.smartnav.scroll", String(window.scrollY));
  } catch {
    /* storage disabled — navigation still works */
  }
}

/* ---------------------------- multi-issue queue --------------------------- */

const ISSUE_KEY = "fom.smartnav.issues";

export type IssueQueueEntry = { to: string; params?: Record<string, string>; search: Record<string, string>; label: string };

/** Store the full list of issues so the destination can offer Previous / Next. */
export function rememberIssueQueue(entries: IssueQueueEntry[], index: number) {
  if (typeof sessionStorage === "undefined" || entries.length < 2) return;
  try {
    sessionStorage.setItem(ISSUE_KEY, JSON.stringify({ entries, index }));
  } catch {
    /* noop */
  }
}

export function readIssueQueue(): { entries: IssueQueueEntry[]; index: number } | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ISSUE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { entries: IssueQueueEntry[]; index: number };
    return parsed?.entries?.length ? parsed : null;
  } catch {
    return null;
  }
}

export function setIssueQueueIndex(index: number) {
  const q = readIssueQueue();
  if (!q) return;
  try {
    sessionStorage.setItem(ISSUE_KEY, JSON.stringify({ ...q, index }));
  } catch {
    /* noop */
  }
}

export function clearIssueQueue() {
  try { sessionStorage.removeItem(ISSUE_KEY); } catch { /* noop */ }
}
