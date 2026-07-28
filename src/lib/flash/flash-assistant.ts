/**
 * Flash Deals v11.0 — Autonomous Operations (pure derivations).
 *
 * Presentation intelligence only. Nothing here writes to the database, and it
 * never touches rotation, countdown, pricing, RLS, analytics or the existing
 * flash deal mutations. It re-reads contracts the platform already exposes
 * (`DealEntry`, `Conflict`, `QueueItem`, `BalanceReport`) and turns them into a
 * daily brief, a task inbox, a health audit, reminders and a next best action.
 */
import type { DealEntry } from "@/lib/flash/use-flash-admin";
import type { Conflict } from "@/lib/flash/flash-intelligence";
import type { DealIntelligence } from "@/lib/flash/flash-intelligence";
import type { QueueItem } from "@/lib/flash/flash-autonomy";
import type { BalanceReport } from "@/lib/flash/flash-executive";

const HOUR = 3600_000;

/* ------------------------------------------------------------ workspace */

export type WorkspaceMode = "operations" | "marketing" | "analytics" | "executive";

export const WORKSPACE_MODES: { id: WorkspaceMode; label: string; hint: string }[] = [
  { id: "operations", label: "Operations", hint: "Run today's deals" },
  { id: "marketing", label: "Marketing", hint: "Plan campaigns" },
  { id: "analytics", label: "Analytics", hint: "Measure performance" },
  { id: "executive", label: "Executive", hint: "Summary and reports" },
];

/** Section ids used to emphasise (never duplicate) content per mode. */
export type SectionId =
  | "brief" | "next" | "inbox" | "audit" | "reminders" | "notes" | "history"
  | "active" | "scheduled" | "suggested" | "preview" | "alerts"
  | "campaigns" | "forecast" | "schedule" | "balance" | "lifecycle"
  | "feed" | "report" | "heatmap" | "summary" | "advanced";

const MODE_SECTIONS: Record<WorkspaceMode, SectionId[]> = {
  operations: [
    "brief", "next", "inbox", "audit", "reminders", "alerts", "active",
    "scheduled", "suggested", "preview", "notes", "history", "feed", "advanced",
  ],
  marketing: [
    "brief", "next", "inbox", "alerts", "active", "scheduled", "suggested",
    "preview", "schedule", "balance", "campaigns", "notes", "advanced",
  ],
  analytics: [
    "summary", "campaigns", "forecast", "balance", "lifecycle", "heatmap",
    "feed", "report", "active", "advanced",
  ],
  executive: [
    "summary", "brief", "next", "inbox", "forecast", "campaigns", "report",
    "balance", "history",
  ],
};

/** Focus mode keeps only fast daily operations on screen. */
const FOCUS_SECTIONS: SectionId[] = ["brief", "next", "inbox", "audit", "alerts", "active", "preview"];

export function sectionVisible(mode: WorkspaceMode, focus: boolean, id: SectionId): boolean {
  if (focus) return FOCUS_SECTIONS.includes(id);
  return MODE_SECTIONS[mode].includes(id);
}

/* ----------------------------------------------------------- daily brief */

export type DailyBrief = {
  greeting: string;
  lines: string[];
  opportunity: { text: string; item: QueueItem } | null;
  tone: "green" | "blue" | "amber" | "red";
};

function greetingFor(now: number) {
  const h = new Date(now).getHours();
  if (h < 12) return "Good morning.";
  if (h < 17) return "Good afternoon.";
  return "Good evening.";
}

function revenueVerdict(entries: DealEntry[]): string {
  const live = entries.filter((e) => e.status === "active");
  const potential = live.reduce((a, e) => a + e.dealPrice * Math.max(0, e.product.stockQuantity ?? 0), 0);
  if (live.length === 0) return "Estimated revenue today: none — nothing is live.";
  if (potential > 500_000) return "Estimated revenue today: Excellent.";
  if (potential > 150_000) return "Estimated revenue today: Strong.";
  if (potential > 40_000) return "Estimated revenue today: Steady.";
  return "Estimated revenue today: Light.";
}

export function dailyBrief(args: {
  entries: DealEntry[];
  conflicts: Conflict[];
  queue: QueueItem[];
  now: number;
}): DailyBrief {
  const { entries, conflicts, queue, now } = args;
  const live = entries.filter((e) => e.status === "active");
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const endingToday = entries.filter(
    (e) => e.deal && new Date(e.deal.end_at).getTime() > now && new Date(e.deal.end_at).getTime() <= endOfDay.getTime(),
  ).length;
  const sellOutRisk = live.filter((e) => (e.product.stockQuantity ?? 0) > 0 && (e.product.stockQuantity ?? 0) <= 5).length;
  const critical = conflicts.filter((c) => c.severity === "critical").length;

  const lines = [
    `${live.length} Flash Deal${live.length === 1 ? " is" : "s are"} active.`,
    endingToday > 0 ? `${endingToday} campaign${endingToday === 1 ? "" : "s"} end today.` : "No campaigns end today.",
    sellOutRisk > 0 ? `${sellOutRisk} product${sellOutRisk === 1 ? " may" : "s may"} sell out.` : "No sell-out risk detected.",
    revenueVerdict(entries),
  ];
  if (critical > 0) lines.push(`${critical} critical issue${critical === 1 ? "" : "s"} need review.`);

  const best = queue.find((q) => q.confidence === "high") ?? queue[0] ?? null;
  const opportunity = best
    ? { text: `${best.title} — ${best.productName} (+${Math.max(1, Math.round(best.ctrDelta + 6))}% projected revenue).`, item: best }
    : null;

  const tone: DailyBrief["tone"] =
    critical > 0 ? "red" : sellOutRisk > 0 || endingToday > 2 ? "amber" : live.length === 0 ? "blue" : "green";

  return { greeting: greetingFor(now), lines, opportunity, tone };
}

/* ------------------------------------------------------------ task inbox */

export type TaskCategory =
  | "discount" | "schedule" | "hero" | "priority" | "stock" | "ctr" | "balance" | "other";

export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = {
  discount: "Discount",
  schedule: "Schedule",
  hero: "Hero",
  priority: "Priority",
  stock: "Stock risk",
  ctr: "Low CTR",
  balance: "Homepage balance",
  other: "General",
};

export function taskCategory(item: QueueItem): TaskCategory {
  const id = `${item.advice.id} ${item.title}`.toLowerCase();
  if (item.advice.action.kind === "discount") return "discount";
  if (["shift", "tomorrow", "evening"].includes(item.advice.action.kind)) return "schedule";
  if (id.includes("hero")) return "hero";
  if (item.advice.action.kind === "priority") return "priority";
  if (id.includes("stock") || id.includes("sell")) return "stock";
  if (id.includes("ctr") || id.includes("click")) return "ctr";
  if (id.includes("categor") || id.includes("brand") || id.includes("rotation")) return "balance";
  return "other";
}

export type TaskDiff = { current: string; suggested: string; expected: string };

function money(n: number) {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/** Human-readable Current → Suggested → Expected preview for one recommendation. */
export function taskDiff(item: QueueItem, entry: DealEntry | undefined): TaskDiff {
  const a = item.advice.action;
  if (!entry || !entry.deal) {
    return {
      current: "No live flash deal configured",
      suggested: item.advice.actionLabel,
      expected: item.impact,
    };
  }
  const deal = entry.deal;
  if (a.kind === "discount") {
    const next = Math.max(0, Math.min(95, entry.discountPct + a.deltaPct));
    const price = Math.max(1, Math.round(entry.regularPrice * (1 - next / 100)));
    return {
      current: `${entry.discountPct}% off · ${money(entry.dealPrice)}`,
      suggested: `${next}% off · ${money(price)}`,
      expected: `≈ +${money(item.revenueDelta)} revenue, +${item.ctrDelta}% CTR`,
    };
  }
  if (a.kind === "priority") {
    return {
      current: `Priority ${deal.priority}`,
      suggested: `Priority ${Math.max(0, deal.priority + a.delta)}`,
      expected: a.delta > 0 ? "Higher homepage placement" : "Frees a homepage slot for a stronger deal",
    };
  }
  if (a.kind === "shift" || a.kind === "tomorrow") {
    const hours = a.kind === "tomorrow" ? 24 : a.hours;
    const fmt = (t: number) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    return {
      current: `${fmt(new Date(deal.start_at).getTime())} → ${fmt(new Date(deal.end_at).getTime())}`,
      suggested: `${fmt(new Date(deal.start_at).getTime() + hours * HOUR)} → ${fmt(new Date(deal.end_at).getTime() + hours * HOUR)}`,
      expected: `Runs inside a higher-traffic window (+${item.ctrDelta}% CTR)`,
    };
  }
  if (a.kind === "evening") {
    return {
      current: `Starts ${new Date(deal.start_at).getHours()}:00`,
      suggested: "Starts 19:00 (peak evening window)",
      expected: `≈ +${money(item.revenueDelta)} revenue at the same discount`,
    };
  }
  return { current: "Current configuration", suggested: "Open the editor to review", expected: item.impact };
}

/* ---------------------------------------------------------- health audit */

export type AuditSeverity = "critical" | "warning" | "info";

export type AuditIssue = {
  id: string;
  severity: AuditSeverity;
  title: string;
  detail: string;
  /** Optional filter chip the admin can jump to. */
  jump?: "active" | "scheduled" | "expired" | "low_stock" | "conflict";
  entryKey?: string;
};

/** Silent audit run on every load. Surfaces only actionable problems. */
export function healthAudit(args: {
  entries: DealEntry[];
  conflicts: Conflict[];
  balance: BalanceReport;
  now: number;
}): AuditIssue[] {
  const { entries, conflicts, balance, now } = args;
  const out: AuditIssue[] = [];

  const expired = entries.filter((e) => e.deal?.active && new Date(e.deal.end_at).getTime() <= now);
  if (expired.length) {
    out.push({
      id: "expired",
      severity: "warning",
      title: `${expired.length} expired campaign${expired.length === 1 ? "" : "s"} still marked active`,
      detail: "End or reschedule them so the homepage only promotes live pricing.",
      jump: "expired",
    });
  }

  const missingBadge = entries.filter((e) => e.status === "active" && !e.hasBadge);
  if (missingBadge.length) {
    out.push({
      id: "missing-badge",
      severity: "critical",
      title: `${missingBadge.length} live deal${missingBadge.length === 1 ? "" : "s"} missing the flash badge`,
      detail: "Without the badge these deals never surface on the homepage rail.",
      jump: "active",
    });
  }

  const missingImage = entries.filter((e) => e.status === "active" && !e.product.image);
  if (missingImage.length) {
    out.push({
      id: "missing-image",
      severity: "warning",
      title: `${missingImage.length} live deal${missingImage.length === 1 ? "" : "s"} without a product image`,
      detail: "Image-less cards lose most of their click-through on mobile.",
      jump: "active",
    });
  }

  const lowStock = entries.filter((e) => e.status === "active" && (e.product.stockQuantity ?? 0) <= 5);
  if (lowStock.length) {
    out.push({
      id: "low-stock",
      severity: "warning",
      title: `${lowStock.length} live deal${lowStock.length === 1 ? "" : "s"} at sell-out risk`,
      detail: "Five units or fewer remaining — consider ending early or restocking.",
      jump: "low_stock",
    });
  }

  const broken = entries.filter((e) => e.deal && (e.dealPrice <= 0 || e.dealPrice >= e.regularPrice));
  if (broken.length) {
    out.push({
      id: "broken-pricing",
      severity: "critical",
      title: `${broken.length} deal${broken.length === 1 ? " has" : "s have"} invalid flash pricing`,
      detail: "The flash price is not below the regular price, so shoppers see no saving.",
      jump: "conflict",
    });
  }

  const byProduct = new Map<string, number>();
  for (const e of entries) {
    if (!e.deal?.active) continue;
    byProduct.set(e.product.slug, (byProduct.get(e.product.slug) ?? 0) + 1);
  }
  const dupes = [...byProduct.values()].filter((n) => n > 1).length;
  if (dupes) {
    out.push({
      id: "duplicates",
      severity: "warning",
      title: `${dupes} product${dupes === 1 ? "" : "s"} promoted by more than one deal`,
      detail: "Duplicate promotions split performance data and can show conflicting prices.",
      jump: "conflict",
    });
  }

  const scheduled = entries.filter((e) => e.deal && new Date(e.deal.start_at).getTime() > now);
  if (scheduled.length === 0) {
    out.push({
      id: "gap",
      severity: "info",
      title: "No campaigns scheduled ahead",
      detail: "Once today's deals end the homepage rail will be empty. Plan the next window.",
      jump: "scheduled",
    });
  }

  const worst = balance.dimensions
    .flatMap((d) => d.bars.map((b) => ({ dim: d.label, ...b })))
    .find((b) => b.tone === "red");
  if (worst) {
    out.push({
      id: "imbalance",
      severity: "warning",
      title: `Homepage over-indexed on ${worst.label}`,
      detail: `${worst.dim} share is ${Math.round(worst.pct)}% of visible slots — vary the mix to avoid repetition.`,
    });
  }

  for (const c of conflicts.filter((x) => x.severity === "critical").slice(0, 4)) {
    out.push({ id: `conflict:${c.id}`, severity: "critical", title: c.title, detail: c.detail, jump: "conflict" });
  }

  const rank: Record<AuditSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ------------------------------------------------------ next best action */

export type NextBestAction = {
  title: string;
  why: string;
  actionLabel: string;
  kind: "task" | "fix" | "create" | "reshuffle";
  item?: QueueItem;
  issue?: AuditIssue;
};

export function nextBestAction(args: {
  queue: QueueItem[];
  audit: AuditIssue[];
  entries: DealEntry[];
  balance: BalanceReport;
}): NextBestAction {
  const { queue, audit, entries, balance } = args;

  const critical = audit.find((a) => a.severity === "critical");
  if (critical) {
    return { title: critical.title, why: critical.detail, actionLabel: "Take action", kind: "fix", issue: critical };
  }

  const urgent = queue.find((q) => q.urgency === "now" && q.confidence !== "low") ?? queue.find((q) => q.confidence === "high");
  if (urgent) {
    return {
      title: `${urgent.title} — ${urgent.productName}`,
      why: urgent.reason,
      actionLabel: "Take action",
      kind: "task",
      item: urgent,
    };
  }

  if (entries.filter((e) => e.status === "active").length === 0) {
    return {
      title: "Create your first live campaign",
      why: "Nothing is promoted on the homepage right now.",
      actionLabel: "Take action",
      kind: "create",
    };
  }

  if (balance.score < 70) {
    return {
      title: "Rebalance the homepage rotation",
      why: "The visible mix repeats the same categories or brands too often.",
      actionLabel: "Take action",
      kind: "reshuffle",
    };
  }

  return {
    title: "Schedule the next campaign window",
    why: "Everything live is healthy — the best use of your time is planning ahead.",
    actionLabel: "Take action",
    kind: "create",
  };
}

/* ------------------------------------------------------------- reminders */

export type Reminder = {
  id: string;
  title: string;
  detail: string;
  due: string;
};

export function suggestedReminders(args: { entries: DealEntry[]; balance: BalanceReport; now: number }): Reminder[] {
  const { entries, balance, now } = args;
  const out: Reminder[] = [];
  const day = new Date(now).getDay();

  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const endingToday = entries.filter(
    (e) => e.deal && new Date(e.deal.end_at).getTime() > now && new Date(e.deal.end_at).getTime() <= endOfDay.getTime(),
  ).length;
  if (endingToday > 0) {
    out.push({ id: "ending", title: "Review today's ending deals", detail: `${endingToday} campaign${endingToday === 1 ? "" : "s"} finish before midnight.`, due: "Today" });
  }

  const scheduled = entries.filter((e) => e.deal && new Date(e.deal.start_at).getTime() > now).length;
  if (scheduled === 0) {
    out.push({ id: "tomorrow", title: "Prepare tomorrow's campaign", detail: "Nothing is queued after today's deals expire.", due: "Today" });
  }

  if (day >= 3 && day <= 5) {
    out.push({ id: "weekend", title: "Weekend campaign ready?", detail: "Weekend traffic peaks — confirm the Saturday window is scheduled.", due: "Before Friday" });
  }

  const month = new Date(now).getMonth();
  if ([9, 10, 11].includes(month)) {
    out.push({ id: "holiday", title: "Holiday campaign needed", detail: "Festive demand is rising — plan a themed flash campaign.", due: "This month" });
  }

  if (entries.some((e) => e.status === "active" && (e.product.stockQuantity ?? 0) <= 10)) {
    out.push({ id: "stock", title: "Stock review", detail: "Some promoted products are running low.", due: "Today" });
  }

  if (balance.score < 75) {
    out.push({ id: "balance", title: "Category imbalance", detail: "Homepage exposure is concentrated — vary the selection.", due: "This week" });
  }

  return out;
}

/* ----------------------------------------------------------- smart search */

export type SearchIntent = {
  text: string;
  filter?: "active" | "scheduled" | "ending_soon" | "expired" | "low_stock" | "conflict";
  sort?: "revenue" | "ctr" | "score" | "stock";
  minScore?: number;
  category?: string;
  endingToday?: boolean;
  /** True when at least one intent rule matched — used to show the smart hint. */
  matched: boolean;
  label: string | null;
};

const SCORE_RE = /(?:flash\s*score|score)\s*(?:above|over|>|>=)\s*(\d{1,3})/i;

export function parseSearchIntent(raw: string): SearchIntent {
  const q = raw.trim().toLowerCase();
  const intent: SearchIntent = { text: raw.trim(), matched: false, label: null };
  if (!q) return intent;

  const labels: string[] = [];
  const consume = (re: RegExp) => {
    if (!re.test(q)) return false;
    intent.text = intent.text.replace(re, " ").replace(/\s+/g, " ").trim();
    intent.matched = true;
    return true;
  };

  const score = q.match(SCORE_RE);
  if (score) {
    intent.minScore = Math.min(100, Number(score[1]));
    consume(SCORE_RE);
    labels.push(`Flash Score above ${intent.minScore}`);
  }
  if (consume(/\bending\s+today\b/)) { intent.endingToday = true; labels.push("Ending today"); }
  if (consume(/\bending\s+soon\b/)) { intent.filter = "ending_soon"; labels.push("Ending soon"); }
  if (consume(/\blow\s+stock\b/)) { intent.filter = "low_stock"; labels.push("Low stock"); }
  if (consume(/\bneeds?\s+attention\b/)) { intent.filter = "conflict"; labels.push("Needs attention"); }
  if (consume(/\bexpired\b/)) { intent.filter = "expired"; labels.push("Expired"); }
  if (consume(/\bscheduled\b|\bupcoming\b/)) { intent.filter = "scheduled"; labels.push("Scheduled"); }
  if (consume(/\b(live|active)\b/)) { intent.filter = intent.filter ?? "active"; labels.push("Live"); }
  if (consume(/\bhighest\s+revenue\b|\btop\s+revenue\b|\bbest\s+selling\b/)) { intent.sort = "revenue"; labels.push("Highest revenue"); }
  if (consume(/\bhigh(est)?\s+ctr\b/)) { intent.sort = "ctr"; labels.push("Highest CTR"); }
  if (consume(/\bbest\b/)) { intent.sort = intent.sort ?? "score"; labels.push("Best performing"); }

  intent.label = labels.length ? labels.join(" · ") : null;
  return intent;
}

/** Applies the parsed sort/threshold parts of an intent. Text/filter stay with the page. */
export function applyIntent(
  entries: DealEntry[],
  intent: SearchIntent,
  scores: Map<string, DealIntelligence>,
  now: number,
): DealEntry[] {
  let out = entries;
  if (intent.minScore != null) {
    const min = intent.minScore;
    out = out.filter((e) => (scores.get(e.key)?.score ?? 0) >= min);
  }
  if (intent.endingToday) {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    out = out.filter((e) => e.deal && new Date(e.deal.end_at).getTime() > now && new Date(e.deal.end_at).getTime() <= end.getTime());
  }
  if (intent.sort) {
    const value = (e: DealEntry) => {
      if (intent.sort === "revenue") return e.stats.purchases * e.dealPrice;
      if (intent.sort === "ctr") return e.stats.views > 0 ? e.stats.clicks / e.stats.views : 0;
      if (intent.sort === "stock") return -(e.product.stockQuantity ?? 0);
      return scores.get(e.key)?.score ?? 0;
    };
    out = [...out].sort((a, b) => value(b) - value(a));
  }
  return out;
}

export const SEARCH_EXAMPLES = [
  "Deals ending today",
  "Low stock",
  "Highest revenue",
  "High CTR",
  "Needs attention",
  "Flash Score above 90",
];
