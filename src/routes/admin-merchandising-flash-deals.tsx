import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Flame, Plus, Loader2, Search, Settings2, Upload, Download, RefreshCw, SquarePen } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { CollapsibleModule } from "@/components/admin/CollapsibleModule";
import { FlashKpiGrid } from "@/components/admin/flash/FlashKpiGrid";
import { FlashDealWizard } from "@/components/admin/flash/FlashDealWizard";
import { FlashTimeline } from "@/components/admin/flash/FlashTimeline";
import { FlashRotationPanel } from "@/components/admin/flash/FlashRotationPanel";
import { FlashAuditTimeline } from "@/components/admin/flash/FlashAuditTimeline";
import { useFlashAdminData, type DealEntry, type FlashDealRow } from "@/lib/flash/use-flash-admin";
import { useFlashIntelligence } from "@/lib/flash/use-flash-intelligence";
import {
  FlashHomepageHealth, FlashAssistant, FlashHeroOptimizer, FlashConflictCenter,
} from "@/components/admin/flash/FlashIntelligencePanels";
import { FlashRecommendationCenter } from "@/components/admin/flash/FlashRecommendationCenter";
import { FlashSimulator } from "@/components/admin/flash/FlashSimulator";
import { FlashCoveragePanel } from "@/components/admin/flash/FlashCoveragePanel";
import { FlashDealIntelligenceSheet } from "@/components/admin/flash/FlashDealIntelligenceSheet";
import { FlashDealTile, tileStatus, type TileActions } from "@/components/admin/flash/manage/FlashDealTile";
import { FlashSectionShell, FlashEmpty } from "@/components/admin/flash/manage/FlashSectionShell";
import { FlashCriticalAlerts } from "@/components/admin/flash/manage/FlashCriticalAlerts";
import { FlashSuggestedRail } from "@/components/admin/flash/manage/FlashSuggestedRail";
import { FlashPreviewCompact } from "@/components/admin/flash/manage/FlashPreviewCompact";
import { FlashQuickBar } from "@/components/admin/flash/manage/FlashQuickBar";
import { FlashKpiV7 } from "@/components/admin/flash/manage/FlashKpiV7";
import { FlashActivityFeed } from "@/components/admin/flash/manage/FlashActivityFeed";
import { FlashAdviceSheet } from "@/components/admin/flash/manage/FlashAdviceSheet";
import { dealAdvice, type AdviceAction, type DealAdvice } from "@/lib/flash/flash-advice";
import { FlashBriefing } from "@/components/admin/flash/manage/FlashBriefing";
import { FlashPriorityQueue } from "@/components/admin/flash/manage/FlashPriorityQueue";
import { FlashCompareSheet } from "@/components/admin/flash/manage/FlashCompareSheet";
import { FlashRotationHeatmap } from "@/components/admin/flash/manage/FlashRotationHeatmap";
import { FlashRevenueSimulator } from "@/components/admin/flash/manage/FlashRevenueSimulator";
import { FlashSavedViews, useSavedViews, type SavedView } from "@/components/admin/flash/manage/FlashSavedViews";
import { morningBriefing, priorityQueue, rotationHeatmap, type QueueItem } from "@/lib/flash/flash-autonomy";


import { FlashFilterChips, FLASH_FILTERS, type FlashFilter } from "@/components/admin/flash/manage/FlashFilterChips";
import { FlashScheduledGroups } from "@/components/admin/flash/manage/FlashScheduledGroups";
import { FlashBulkSheet, type BulkPatch } from "@/components/admin/flash/manage/FlashBulkSheet";
import type { Conflict } from "@/lib/flash/flash-intelligence";
import type { CampaignTemplate } from "@/lib/flash/campaign-templates";
import type { Product } from "@/lib/products";
import { FLASH_CAMPAIGNS, saveFlashOps } from "@/lib/flash/flash-ops";
import { assignBadge } from "@/lib/use-product-badges";

export const Route = createFileRoute("/admin-merchandising-flash-deals")({
  head: () => ({
    meta: [
      { title: "Flash Deals — Manage" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FlashManagePage,
});

/** How many tiles render before the "show more" cursor grows (keeps long lists cheap). */
const PAGE_SIZE = 20;

function logAction(action: string, dealId: string | null, metadata: Record<string, unknown>) {
  void supabase.rpc("log_admin_activity", {
    _action: action,
    _entity_type: "flash_deal",
    _entity_id: dealId ?? undefined,
    _metadata: metadata as never,
  });
}

function nextRotationLabel(now: number) {
  const six = 6 * 3600_000;
  const mins = Math.max(0, Math.round((Math.ceil(now / six) * six - now) / 60_000));
  const h = Math.floor(mins / 60);
  return h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

function FlashManagePage() {
  const data = useFlashAdminData();
  const ai = useFlashIntelligence(data);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FlashFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [wizard, setWizard] = useState<{
    open: boolean; deal: FlashDealRow | null;
    presetProduct?: Product | null; presetTemplate?: CampaignTemplate | null;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [intelKey, setIntelKey] = useState<string | null>(null);
  const [adviceKey, setAdviceKey] = useState<string | null>(null);
  /** v9 — suggestion ids the admin ignored or snoozed for this session. */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const savedViews = useSavedViews();


  const dragKey = useRef<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const undoStack = useRef<{ label: string; run: () => Promise<void> }[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  const pushUndo = useCallback((label: string, run: () => Promise<void>) => {
    undoStack.current = [...undoStack.current.slice(-9), { label, run }];
    setUndoCount(undoStack.current.length);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "/") { e.preventDefault(); document.getElementById("flash-search")?.focus(); }
      else if (e.key.toLowerCase() === "n") { e.preventDefault(); setWizard({ open: true, deal: null }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Universal search: product, sku, campaign, status, category, brand, priority. */
  const matches = useCallback(
    (e: DealEntry) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [
        e.product.name, e.product.sku ?? "", e.product.brand ?? "", e.product.category,
        e.campaign ?? "", tileStatus(e), String(e.deal?.priority ?? ""),
      ].join(" ").toLowerCase().includes(q);
    },
    [query],
  );

  const searched = useMemo(() => data.entries.filter(matches), [data.entries, matches]);

  const passesFilter = useCallback((e: DealEntry, f: FlashFilter) => {
    const s = tileStatus(e);
    switch (f) {
      case "all": return true;
      case "active": return s === "active" || s === "ending_soon";
      case "scheduled": return s === "scheduled";
      case "ending_soon": return s === "ending_soon";
      case "expired": return s === "expired";
      case "paused": return s === "paused";
      case "low_stock": return (e.product.stockQuantity ?? 0) <= 5;
      case "conflict": return e.warnings.length > 0;
    }
  }, []);

  const counts = useMemo(() => {
    const out = {} as Record<FlashFilter, number>;
    for (const f of FLASH_FILTERS) out[f] = searched.filter((e) => passesFilter(e, f)).length;
    return out;
  }, [searched, passesFilter]);

  const filtered = useMemo(() => searched.filter((e) => passesFilter(e, filter)), [searched, filter, passesFilter]);

  const liveList = useMemo(
    () =>
      filtered
        .filter((e) => ["active", "ending_soon", "paused"].includes(tileStatus(e)))
        .sort((a, b) => (b.deal?.priority ?? 0) - (a.deal?.priority ?? 0)),
    [filtered],
  );
  const scheduledList = useMemo(
    () => filtered.filter((e) => tileStatus(e) === "scheduled"),
    [filtered],
  );
  const otherList = useMemo(
    () => filtered.filter((e) => ["expired", "no_deal"].includes(tileStatus(e))),
    [filtered],
  );

  useEffect(() => setVisible(PAGE_SIZE), [filter, query]);

  

  /** v7 — the five questions. "Ending soon" is strictly the next two hours. */
  const endingTwoHours = useMemo(
    () => data.entries.filter((e) => e.msRemaining != null && e.msRemaining > 0 && e.msRemaining <= 2 * 3600_000).length,
    [data.entries],
  );
  const revenuePotential = useMemo(
    () =>
      data.entries
        .filter((e) => e.status === "active")
        .reduce((a, e) => a + e.dealPrice * Math.max(0, e.product.stockQuantity ?? 0), 0),
    [data.entries],
  );

  /** Share of visible homepage slots per category / brand, for advice context. */
  const shares = useMemo(() => {
    const cat = new Map<string, number>();
    const brand = new Map<string, number>();
    const total = Math.max(1, ai.visibleEntries.length);
    for (const e of ai.visibleEntries) {
      const c = e.product.category || "Unspecified";
      const b = e.product.brand || "Unbranded";
      cat.set(c, (cat.get(c) ?? 0) + 1 / total);
      brand.set(b, (brand.get(b) ?? 0) + 1 / total);
    }
    return { cat, brand };
  }, [ai.visibleEntries]);

  const adviceByKey = useMemo(() => {
    const m = new Map<string, DealAdvice[]>();
    for (const e of data.entries) {
      m.set(
        e.key,
        dealAdvice(e, {
          avgCtr: ai.averages.avgCtr,
          maxDiscountPct: data.ops.maxDiscountPct,
          categoryShare: shares.cat.get(e.product.category || "Unspecified") ?? 0,
          brandShare: shares.brand.get(e.product.brand || "Unbranded") ?? 0,
          rotationStreak: ai.rotationStreaks.get(e.product.slug) ?? 0,
          cap: data.cap,
        }),
      );
    }
    return m;
  }, [data.entries, data.ops.maxDiscountPct, data.cap, ai.averages, ai.rotationStreaks, shares]);

  /* ---------------------------------------------- v9 — autonomous layer */

  const briefing = useMemo(
    () => morningBriefing(data.entries, ai.conflicts, adviceByKey, data.now),
    [data.entries, ai.conflicts, adviceByKey, data.now],
  );

  const queue = useMemo(
    () => priorityQueue(data.entries, adviceByKey, ai.scores, dismissed),
    [data.entries, adviceByKey, ai.scores, dismissed],
  );

  const heatRows = useMemo(() => {
    const meta = new Map(data.products.map((p) => [p.slug, { name: p.name, image: p.image ?? null }]));
    const windows = ai.windows.map((w) => ({
      startsAt: w.startsAt,
      slugs: [w.hero?.slug, ...w.mini.map((p) => p.slug), ...w.hidden.map((p) => p.slug)].filter(Boolean) as string[],
    }));
    return rotationHeatmap(windows, data.cap, meta, data.now);
  }, [ai.windows, data.products, data.cap, data.now]);

  const applyQueueItem = useCallback(
    (item: QueueItem) => {
      const entry = data.entries.find((e) => e.key === item.entryKey);
      if (!entry) { toast.error("That deal is no longer available"); return; }
      void applyAdvice(entry, item.advice.action);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [data.entries],
  );


  /* ------------------------------------------------------------- mutations */

  async function updateDeal(entry: DealEntry, patch: Partial<FlashDealRow>, action: string, undoable = true) {
    if (!entry.deal) return;
    const before = entry.deal;
    const { error } = await supabase.from("flash_deals").update(patch).eq("id", before.id);
    if (error) { toast.error(error.message); return; }
    logAction(action, before.id, { before, after: patch });
    if (undoable) {
      pushUndo(action, async () => {
        await supabase.from("flash_deals").update({
          flash_price: before.flash_price, start_at: before.start_at,
          end_at: before.end_at, priority: before.priority, active: before.active,
        }).eq("id", before.id);
      });
    }
    data.refresh();
  }

  async function deleteDeal(entry: DealEntry) {
    if (!entry.deal) return;
    const row = entry.deal;
    const { error } = await supabase.from("flash_deals").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    logAction("flash_deal_deleted", row.id, { before: row });
    pushUndo("delete", async () => {
      await supabase.from("flash_deals").insert({
        product_id: row.product_id, flash_price: row.flash_price, start_at: row.start_at,
        end_at: row.end_at, priority: row.priority, active: row.active,
      });
    });
    toast.success("Flash deal removed");
    data.refresh();
  }

  async function duplicateDeal(entry: DealEntry) {
    if (!entry.deal) return;
    const d = entry.deal;
    const duration = new Date(d.end_at).getTime() - new Date(d.start_at).getTime();
    const start = new Date(Math.max(Date.now(), new Date(d.end_at).getTime()));
    const { data: inserted, error } = await supabase.from("flash_deals").insert({
      product_id: d.product_id, flash_price: d.flash_price,
      start_at: start.toISOString(), end_at: new Date(start.getTime() + duration).toISOString(),
      priority: d.priority, active: false,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    logAction("flash_deal_duplicated", d.id, { source: d.id });
    if (inserted?.id) {
      pushUndo("duplicate", async () => { await supabase.from("flash_deals").delete().eq("id", inserted.id); });
    }
    toast.success("Duplicated as a paused deal — review the schedule");
    data.refresh();
  }

  async function undo() {
    const last = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (!last) return;
    await last.run();
    toast.success("Last change undone");
    data.refresh();
  }

  const actions: TileActions = useMemo(() => ({
    onEdit: (e) => setWizard({ open: true, deal: e.deal }),
    onPause: (e) => void updateDeal(e, { active: !e.deal!.active }, e.deal!.active ? "flash_deal_paused" : "flash_deal_resumed"),
    onDuplicate: (e) => void duplicateDeal(e),
    onShift: (e, h) => void updateDeal(e, {
      start_at: new Date(new Date(e.deal!.start_at).getTime() + h * 3600_000).toISOString(),
      end_at: new Date(new Date(e.deal!.end_at).getTime() + h * 3600_000).toISOString(),
    }, "flash_deal_window_moved"),
    onEndNow: (e) => void updateDeal(e, { active: false, end_at: new Date().toISOString() }, "flash_deal_ended_early"),
    onDelete: (e) => void deleteDeal(e),
    onOpenIntel: (key) => setIntelKey(key),
    onOpenAdvice: (key) => setAdviceKey(key),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data.entries]);

  /** Applies one approved recommendation using the existing deal mutations. */
  async function applyAdvice(entry: DealEntry, action: AdviceAction) {
    if (action.kind === "edit" || !entry.deal) {
      setAdviceKey(null);
      setWizard({ open: true, deal: entry.deal });
      return;
    }
    const deal = entry.deal;
    if (action.kind === "discount") {
      const nextPct = Math.max(0, Math.min(95, entry.discountPct + action.deltaPct));
      const price = Math.max(1, Math.round(entry.regularPrice * (1 - nextPct / 100)));
      await updateDeal(entry, { flash_price: price }, "flash_deal_price_changed");
      toast.success(`Discount set to ${nextPct}%`);
    } else if (action.kind === "priority") {
      await updateDeal(entry, { priority: Math.max(0, deal.priority + action.delta) }, "flash_deal_priority_changed");
      toast.success("Priority updated");
    } else if (action.kind === "shift" || action.kind === "tomorrow") {
      const hours = action.kind === "tomorrow" ? 24 : action.hours;
      await updateDeal(entry, {
        start_at: new Date(new Date(deal.start_at).getTime() + hours * 3600_000).toISOString(),
        end_at: new Date(new Date(deal.end_at).getTime() + hours * 3600_000).toISOString(),
      }, "flash_deal_window_moved");
      toast.success(`Schedule moved by ${hours}h`);
    } else if (action.kind === "evening") {
      const duration = new Date(deal.end_at).getTime() - new Date(deal.start_at).getTime();
      const start = new Date(deal.start_at);
      start.setHours(19, 0, 0, 0);
      if (start.getTime() < Date.now()) start.setDate(start.getDate() + 1);
      await updateDeal(entry, {
        start_at: start.toISOString(),
        end_at: new Date(start.getTime() + duration).toISOString(),
      }, "flash_deal_window_moved");
      toast.success("Moved to the evening window");
    }
    setAdviceKey(null);
  }

  /** Inline quick edit — reuses the existing deal update mutation. */
  const quickSave = useCallback(
    async (entry: DealEntry, patch: Partial<FlashDealRow>) => {
      await updateDeal(entry, patch, "flash_deal_quick_edited");
      toast.success("Deal updated");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.entries],
  );


  const toggleSelect = useCallback((key: string, next: boolean) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (next) s.add(key); else s.delete(key);
      return s;
    });
  }, []);

  /** Drag reorder writes descending priorities using the existing priority field. */
  async function reorder(targetKey: string) {
    const from = dragKey.current;
    dragKey.current = null;
    if (!from || from === targetKey) return;
    const order = liveList.map((e) => e.key);
    const fromIdx = order.indexOf(from);
    const toIdx = order.indexOf(targetKey);
    if (fromIdx < 0 || toIdx < 0) return;
    order.splice(toIdx, 0, order.splice(fromIdx, 1)[0]);
    const before = liveList.map((e) => ({ id: e.deal?.id, priority: e.deal?.priority ?? 0 }));
    for (let i = 0; i < order.length; i++) {
      const entry = liveList.find((e) => e.key === order[i]);
      if (!entry?.deal) continue;
      await supabase.from("flash_deals").update({ priority: order.length - i }).eq("id", entry.deal.id);
    }
    logAction("flash_deal_priority_reordered", null, { order });
    pushUndo("reorder", async () => {
      for (const b of before) if (b.id) await supabase.from("flash_deals").update({ priority: b.priority }).eq("id", b.id);
    });
    toast.success("Display order updated");
    data.refresh();
  }

  async function applyFix(c: Conflict) {
    const fix = c.fix;
    if (!fix) return;
    if (fix.kind === "review") { setIntelKey(fix.entryKey); return; }
    if (fix.kind === "create_deal") {
      const product = data.products.find((p) => p.slug === fix.slug) ?? null;
      setWizard({ open: true, deal: null, presetProduct: product });
      return;
    }
    if (fix.kind === "assign_badge") {
      const badge = data.badgeTypes.find((b) => b.badgeKey === "flash_deal" && b.enabled && !b.archived);
      if (!badge) { toast.error("The flash deal badge is not available"); return; }
      try {
        await assignBadge(fix.slug, badge.id);
        logAction("flash_deal_badge_assigned", null, { slug: fix.slug, source: "manage" });
        toast.success("Flash badge assigned");
        data.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not assign the badge");
      }
      return;
    }
    const entry = data.entries.find((e) => e.key === fix.entryKey);
    if (!entry?.deal) { toast.error("That deal is no longer available"); return; }
    if (fix.kind === "end_deal") {
      await updateDeal(entry, { active: false, end_at: new Date().toISOString() }, "flash_deal_ended_early");
      toast.success("Deal ended");
    } else if (fix.kind === "extend_deal") {
      await updateDeal(entry, {
        end_at: new Date(new Date(entry.deal.end_at).getTime() + 24 * 3600_000).toISOString(),
      }, "flash_deal_duration_changed");
      toast.success("Deal extended by 24 hours");
    } else if (fix.kind === "clear_priority") {
      await updateDeal(entry, { priority: 0 }, "flash_deal_priority_changed");
      toast.success("Priority cleared");
    }
  }

  const selectedEntries = useMemo(
    () => data.entries.filter((e) => selected.has(e.key)),
    [data.entries, selected],
  );

  async function applyBulk(patch: BulkPatch) {
    const flashBadge = data.badgeTypes.find((b) => b.badgeKey === "flash_deal" && b.enabled && !b.archived);
    const before = selectedEntries.filter((e) => e.deal).map((e) => ({ ...e.deal! }));
    let ok = 0;
    for (const e of selectedEntries) {
      if (patch.assignBadge && flashBadge && !e.hasBadge) {
        try { await assignBadge(e.product.slug, flashBadge.id); } catch { /* keep going */ }
      }
      if (!e.deal) continue;
      const update: Partial<FlashDealRow> = {};
      if (patch.activate != null) update.active = patch.activate;
      if (patch.extendHours) update.end_at = new Date(new Date(e.deal.end_at).getTime() + patch.extendHours * 3600_000).toISOString();
      if (patch.priority != null && !Number.isNaN(patch.priority)) update.priority = patch.priority;
      if (Object.keys(update).length === 0) continue;
      const { error } = await supabase.from("flash_deals").update(update).eq("id", e.deal.id);
      if (!error) ok++;
    }
    logAction("flash_deal_bulk_edit", null, { count: ok, patch });
    pushUndo("bulk edit", async () => {
      for (const b of before) {
        await supabase.from("flash_deals").update({
          active: b.active, end_at: b.end_at, priority: b.priority,
        }).eq("id", b.id);
      }
    });
    toast.success(`${ok} deal${ok === 1 ? "" : "s"} updated`);
    setSelected(new Set());
    data.refresh();
  }

  async function bulkDelete() {
    const rows = selectedEntries.filter((e) => e.deal).map((e) => ({ ...e.deal! }));
    if (rows.length === 0) { toast.error("Select at least one deal"); return; }
    for (const r of rows) await supabase.from("flash_deals").delete().eq("id", r.id);
    logAction("flash_deal_bulk_delete", null, { count: rows.length });
    pushUndo("bulk delete", async () => {
      for (const r of rows) {
        await supabase.from("flash_deals").insert({
          product_id: r.product_id, flash_price: r.flash_price, start_at: r.start_at,
          end_at: r.end_at, priority: r.priority, active: r.active,
        });
      }
    });
    toast.success(`${rows.length} deal${rows.length === 1 ? "" : "s"} deleted`);
    setSelected(new Set());
    data.refresh();
  }

  function exportCsv() {
    const header = "product,sku,regular,flash,discount_pct,status,start,end,priority,views,clicks,purchases";
    const lines = data.entries.map((e) =>
      [
        JSON.stringify(e.product.name), e.product.sku ?? "", e.regularPrice, e.dealPrice, e.discountPct, e.status,
        e.deal?.start_at ?? "", e.deal?.end_at ?? "", e.deal?.priority ?? 0,
        e.stats.views, e.stats.clicks, e.stats.purchases,
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flash-deals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const rows = text.split(/\r?\n/).slice(1).filter(Boolean);
    let ok = 0;
    for (const row of rows) {
      const cols = row.split(",");
      const sku = cols[1]?.trim();
      const flash = Number(cols[3]);
      const start = cols[6]?.trim();
      const end = cols[7]?.trim();
      const product = data.products.find((p) => p.sku && p.sku === sku);
      if (!product?.id || !(flash > 0) || !start || !end) continue;
      const { error } = await supabase.from("flash_deals").insert({
        product_id: product.id, flash_price: flash, start_at: start, end_at: end,
        priority: Number(cols[8]) || 0, active: true,
      });
      if (!error) ok++;
    }
    toast.success(`${ok} deal${ok === 1 ? "" : "s"} imported`);
    data.refresh();
  }

  const headerBtn = "size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition";

  return (
    <AdminShell
      title="Flash Deals"
      subtitle="Manage every active and scheduled flash deal from one place."
      allow={["admin", "super_admin", "manager"]}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => setBulkOpen(true)} disabled={selected.size === 0} aria-label="Bulk actions"
            className={`${headerBtn} disabled:opacity-40`}><SquarePen className="size-4" /></button>
          <button onClick={data.refresh} aria-label="Refresh" className={headerBtn}><RefreshCw className="size-4" /></button>
          <button onClick={() => setSettingsOpen(true)} aria-label="Flash deal settings" className={headerBtn}>
            <Settings2 className="size-4" />
          </button>
          <button onClick={() => setWizard({ open: true, deal: null })}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 min-h-11 text-xs font-mono uppercase tracking-widest text-accent-foreground transition hover:opacity-90">
            <Plus className="size-3.5" /> New deal
          </button>
        </div>
      }
    >
      {data.loading ? (
        <div className="grid place-items-center py-24"><Loader2 className="size-6 animate-spin text-accent" /></div>
      ) : (
        <div className="space-y-8 pb-4">
          {/* 0 — Today's brief */}
          <FlashBriefing
            briefing={briefing}
            queueCount={queue.length}
            onOptimize={() => document.getElementById("flash-priority-queue")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />

          {/* Search + compact KPIs + filter chips */}

          <div className="space-y-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input id="flash-search" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search product, SKU, campaign, brand…" aria-label="Search deals"
                  className="w-full rounded-full border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-accent" />
              </div>
              <p className="shrink-0 text-[10px] font-mono uppercase tracking-widest tabular-nums text-muted-foreground">
                rotation {nextRotationLabel(data.now)}
              </p>
            </div>

            <FlashKpiV7
              live={data.totals.active}
              scheduled={data.totals.scheduled}
              endingSoon={endingTwoHours}
              revenuePotential={revenuePotential}
              attention={ai.conflicts.length}
              onSelect={(k) =>
                setFilter(k === "attention" ? "conflict" : k === "revenue" ? "active" : k)
              }
            />


            <FlashFilterChips value={filter} counts={counts} onChange={setFilter} />
          </div>

          {/* 1 — Critical alerts: what needs attention right now */}
          <FlashSectionShell eyebrow="Fix first" title="Critical alerts" count={ai.conflicts.length}>
            <FlashCriticalAlerts conflicts={ai.conflicts} onFix={(c) => void applyFix(c)} />
          </FlashSectionShell>

          {/* 2 — Active flash deals */}
          <FlashSectionShell eyebrow="Live now" title="Active flash deals" count={liveList.length}>
            {liveList.length === 0 ? (
              <FlashEmpty
                text="No live flash deals match this view."
                action={
                  <button onClick={() => setWizard({ open: true, deal: null })}
                    className="inline-flex items-center gap-2 rounded-full bg-accent px-4 min-h-11 text-[10px] font-mono uppercase tracking-widest text-accent-foreground">
                    <Plus className="size-3.5" /> Create a deal
                  </button>
                }
              />
            ) : (
              <>
                <div className="grid gap-2 xl:grid-cols-2">
                  {liveList.slice(0, visible).map((e) => (
                    <FlashDealTile
                      key={e.key}
                      entry={e}
                      intel={ai.scores.get(e.key) ?? null}
                      selected={selected.has(e.key)}
                      onSelect={toggleSelect}
                      draggable
                      onDragStart={() => { dragKey.current = e.key; }}
                      onDragOver={(ev) => ev.preventDefault()}
                      onDrop={() => void reorder(e.key)}
                      cap={data.cap}
                      adviceCount={adviceByKey.get(e.key)?.length ?? 0}
                      actions={actions}
                      onQuickSave={quickSave}
                    />
                  ))}
                </div>
                {liveList.length > visible && (
                  <button onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="w-full rounded-full border border-white/10 min-h-11 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:bg-white/5">
                    Show more ({liveList.length - visible})
                  </button>
                )}
              </>
            )}
          </FlashSectionShell>




          {/* 3 — Scheduled */}
          <FlashSectionShell eyebrow="Upcoming" title="Scheduled deals" count={scheduledList.length}>
            {scheduledList.length === 0 ? (
              <FlashEmpty text="Nothing scheduled yet — plan your next campaign." />
            ) : (
              <FlashScheduledGroups
                entries={scheduledList}
                onEdit={(e) => setWizard({ open: true, deal: e.deal })}
                onDuplicate={(e) => void duplicateDeal(e)}
                onCancel={(e) => void deleteDeal(e)}
              />
            )}
          </FlashSectionShell>

          {/* 4 — Suggested products */}
          <FlashSectionShell eyebrow="Assistant" title="Suggested products">
            <FlashSuggestedRail
              recommendations={ai.recommendations}
              onFeature={(product) => setWizard({ open: true, deal: null, presetProduct: product })}
            />
          </FlashSectionShell>

          {/* 5 — Homepage preview */}
          <div ref={previewRef}>
            <FlashSectionShell eyebrow="Storefront" title="Homepage preview">
              <FlashPreviewCompact />
            </FlashSectionShell>
          </div>

          {/* 6 — Live activity */}
          <FlashSectionShell eyebrow="Realtime" title="Live activity">
            <FlashActivityFeed entries={data.entries} events={data.events} audit={data.audit} now={data.now} />
          </FlashSectionShell>


          {/* 6 — Advanced tools, collapsed by default */}
          <div className="space-y-3">
            <CollapsibleModule eyebrow="Optional" title="Analytics" sectionId="flash-analytics" defaultOpen={false}>
              <div className="space-y-3">
                <FlashKpiGrid totals={data.totals} />
                <FlashHomepageHealth quality={ai.quality} />
                <div className="grid gap-3 lg:grid-cols-2">
                  <FlashAssistant insights={ai.insights} onOpen={(k) => setIntelKey(k)} />
                  <FlashHeroOptimizer hero={ai.hero} onReview={(k) => setIntelKey(k)} />
                </div>
              </div>
            </CollapsibleModule>

            <CollapsibleModule eyebrow="Optional" title="Conflict resolver" sectionId="flash-conflicts" defaultOpen={false}>
              <FlashConflictCenter conflicts={ai.conflicts} onFix={(c) => void applyFix(c)} />
            </CollapsibleModule>

            <CollapsibleModule eyebrow="Optional" title="Recommendations & campaign templates" sectionId="flash-recommend" defaultOpen={false}>
              <FlashRecommendationCenter
                recommendations={ai.recommendations}
                onCreate={(product, template) =>
                  setWizard({ open: true, deal: null, presetProduct: product, presetTemplate: template })
                }
              />
            </CollapsibleModule>

            <CollapsibleModule eyebrow="Optional" title="Rotation, simulator & coverage" sectionId="flash-rotation" defaultOpen={false}>
              <div className="space-y-3">
                <FlashRotationPanel
                  rotation={data.rotation}
                  nextRotation={data.nextRotation}
                  prevRotation={data.prevRotation}
                  seed={data.seed}
                  nonce={data.nonce}
                  cap={data.cap}
                  ops={data.ops}
                  onChanged={data.refresh}
                />
                <FlashSimulator windows={ai.windows} cap={data.cap} nonce={data.nonce} />
                <FlashCoveragePanel
                  categories={ai.categories}
                  brands={ai.brands}
                  fairness={ai.fairness}
                  stock={ai.stock}
                  rotationStreaks={ai.rotationStreaks}
                  cap={data.cap}
                />
              </div>
            </CollapsibleModule>

            <CollapsibleModule eyebrow="Optional" title="Timeline, ended deals & audit" sectionId="flash-advanced" defaultOpen={false}>
              <div className="space-y-3">
                <FlashTimeline
                  entries={data.entries}
                  now={data.now}
                  onEdit={(e) => setWizard({ open: true, deal: e.deal })}
                  onShift={(e, h) =>
                    updateDeal(e, {
                      start_at: new Date(new Date(e.deal!.start_at).getTime() + h * 3600_000).toISOString(),
                      end_at: new Date(new Date(e.deal!.end_at).getTime() + h * 3600_000).toISOString(),
                    }, "flash_deal_window_moved")
                  }
                  onResize={(e, h) => {
                    const next = new Date(e.deal!.end_at).getTime() + h * 3600_000;
                    if (next <= new Date(e.deal!.start_at).getTime()) { toast.error("Duration cannot go below zero"); return; }
                    updateDeal(e, { end_at: new Date(next).toISOString() }, "flash_deal_duration_changed");
                  }}
                />
                <div className="grid gap-2 xl:grid-cols-2">
                  {otherList.slice(0, 30).map((e) => (
                    <FlashDealTile key={e.key} entry={e} selected={selected.has(e.key)} onSelect={toggleSelect} actions={actions} />
                  ))}
                </div>
                <FlashAuditTimeline audit={data.audit} />
              </div>
            </CollapsibleModule>

            <CollapsibleModule eyebrow="Optional" title="Import / export" sectionId="flash-io" defaultOpen={false}>
              <div className="flex flex-wrap gap-2">
                <button onClick={exportCsv}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3.5 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
                  <Download className="size-3.5" /> Export CSV
                </button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 px-3.5 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
                  <Upload className="size-3.5" /> Import CSV
                  <input type="file" accept=".csv" className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
                </label>
              </div>
            </CollapsibleModule>
          </div>

          {/* 7 — Floating quick bar */}
          <FlashQuickBar
            selectedCount={selected.size}
            canUndo={undoCount > 0}
            onNew={() => setWizard({ open: true, deal: null })}
            onBulkEdit={() => setBulkOpen(true)}
            onBulkDelete={() => void bulkDelete()}
            onPreview={() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            onUndo={() => void undo()}
            onReshuffled={data.refresh}
          />
        </div>
      )}

      {bulkOpen && (
        <FlashBulkSheet
          count={selected.size}
          onApply={applyBulk}
          onClose={() => setBulkOpen(false)}
        />
      )}

      {wizard?.open && (
        <FlashDealWizard
          products={data.products}
          badgeTypes={data.badgeTypes}
          ops={data.ops}
          deal={wizard.deal}
          presetProduct={wizard.presetProduct ?? null}
          presetTemplate={wizard.presetTemplate ?? null}
          onClose={() => setWizard(null)}
          onSaved={data.refresh}
        />
      )}

      {intelKey && (() => {
        const entry = data.entries.find((e) => e.key === intelKey);
        const intel = ai.scores.get(intelKey);
        if (!entry || !intel) return null;
        return (
          <FlashDealIntelligenceSheet
            entry={entry}
            intel={intel}
            averages={ai.averages}
            onClose={() => setIntelKey(null)}
          />
        );
      })()}

      {adviceKey && (() => {
        const entry = data.entries.find((e) => e.key === adviceKey);
        if (!entry) return null;
        return (
          <FlashAdviceSheet
            entry={entry}
            intel={ai.scores.get(adviceKey) ?? null}
            advice={adviceByKey.get(adviceKey) ?? []}
            onApply={(e, action) => void applyAdvice(e, action)}
            onClose={() => setAdviceKey(null)}
          />
        );
      })()}



      {settingsOpen && (
        <FlashSettings ops={data.ops} onClose={() => setSettingsOpen(false)} onSaved={data.refresh} />
      )}
    </AdminShell>
  );
}

function FlashSettings({ ops, onClose, onSaved }: {
  ops: ReturnType<typeof useFlashAdminData>["ops"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [campaignLabel, setCampaignLabel] = useState(ops.campaignLabel ?? "");
  const [keepBadge, setKeepBadge] = useState(ops.keepBadgeOnExpiry);
  const [maxPct, setMaxPct] = useState(String(ops.maxDiscountPct));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await saveFlashOps({
        ...ops,
        campaignLabel: campaignLabel || null,
        keepBadgeOnExpiry: keepBadge,
        maxDiscountPct: Number(maxPct) || ops.maxDiscountPct,
      });
      toast.success("Flash deal settings saved");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onClick={onClose}>
      <div className="w-full space-y-4 rounded-t-3xl border border-border bg-card p-5 sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Flash deal settings">
        <h3 className="flex items-center gap-2 font-display font-semibold"><Flame className="size-4 text-accent" /> Flash Deal settings</h3>

        <label className="block space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Storefront campaign label</span>
          <select value={campaignLabel} onChange={(e) => setCampaignLabel(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent">
            <option value="">Automatic (rotating)</option>
            {FLASH_CAMPAIGNS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Discount guardrail (%)</span>
          <input type="number" min={5} max={95} value={maxPct} onChange={(e) => setMaxPct(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
        </label>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={keepBadge} onChange={(e) => setKeepBadge(e.target.checked)}
            className="size-4 accent-[var(--color-accent)]" />
          Keep the flash badge after a deal expires
        </label>

        <button onClick={save} disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-medium text-accent-foreground disabled:opacity-60">
          {saving && <Loader2 className="size-4 animate-spin" />} Save settings
        </button>
      </div>
    </div>
  );
}
