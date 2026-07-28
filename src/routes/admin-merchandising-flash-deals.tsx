import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Flame, Plus, Loader2, Download, Upload, Search, Settings2, Sparkles,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { FlashKpiGrid } from "@/components/admin/flash/FlashKpiGrid";
import { FlashDealCard } from "@/components/admin/flash/FlashDealCard";
import { FlashDealWizard } from "@/components/admin/flash/FlashDealWizard";
import { FlashTimeline } from "@/components/admin/flash/FlashTimeline";
import { FlashRotationPanel } from "@/components/admin/flash/FlashRotationPanel";
import { FlashLivePreview } from "@/components/admin/flash/FlashLivePreview";
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
import type { Conflict } from "@/lib/flash/flash-intelligence";
import type { CampaignTemplate } from "@/lib/flash/campaign-templates";
import type { Product } from "@/lib/products";
import { FLASH_CAMPAIGNS, saveFlashOps } from "@/lib/flash/flash-ops";
import { assignBadge, unassignBadge } from "@/lib/use-product-badges";

export const Route = createFileRoute("/admin-merchandising-flash-deals")({
  head: () => ({
    meta: [
      { title: "Flash Deals Command Center — Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FlashCommandCenter,
});

const TABS = [
  "Overview", "Intelligence", "Recommend", "Deals", "Timeline", "Simulator", "Coverage", "Rotation", "Preview", "Audit",
] as const;
type Tab = (typeof TABS)[number];

type StatusFilter = "all" | "active" | "scheduled" | "expired" | "paused" | "no_deal" | "warning";

function logAction(action: string, dealId: string | null, metadata: Record<string, unknown>) {
  void supabase.rpc("log_admin_activity", {
    _action: action,
    _entity_type: "flash_deal",
    _entity_id: dealId ?? undefined,
    _metadata: metadata as never,
  });
}

function FlashCommandCenter() {
  const data = useFlashAdminData();
  const ai = useFlashIntelligence(data);
  const [tab, setTab] = useState<Tab>("Overview");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [wizard, setWizard] = useState<{
    open: boolean; deal: FlashDealRow | null;
    presetProduct?: Product | null; presetTemplate?: CampaignTemplate | null;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [intelKey, setIntelKey] = useState<string | null>(null);

  // Keyboard shortcuts: "/" search, "n" new deal, "r" reshuffle tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.key === "/") { e.preventDefault(); document.getElementById("flash-search")?.focus(); }
      else if (e.key.toLowerCase() === "n") { e.preventDefault(); setWizard({ open: true, deal: null }); }
      else if (e.key.toLowerCase() === "r") { e.preventDefault(); setTab("Rotation"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(data.entries.map((e) => e.product.category).filter(Boolean))).sort(),
    [data.entries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.entries.filter((e) => {
      if (q && ![e.product.name, e.product.sku ?? "", e.product.brand ?? "", e.product.category].join(" ").toLowerCase().includes(q))
        return false;
      if (category !== "all" && e.product.category !== category) return false;
      if (campaignFilter !== "all" && (e.campaign ?? "") !== campaignFilter) return false;
      if (status === "warning") return e.warnings.length > 0;
      if (status !== "all" && e.status !== status) return false;
      return true;
    });
  }, [data.entries, query, category, campaignFilter, status]);

  const recommendations = useMemo(() => {
    const badged = new Set(data.entries.map((e) => e.product.slug));
    return data.products
      .filter((p) => p.status === "published" && p.inStock && p.stockQuantity > 0 && !badged.has(p.slug))
      .map((p) => {
        const margin = p.costPriceInr != null ? p.price - p.costPriceInr : 0;
        const score = p.soldCount * 3 + p.viewsCount * 0.2 + Math.max(0, margin) * 0.05 + Math.min(p.stockQuantity, 100) * 0.2;
        const reason =
          p.soldCount > 5 ? "Selling fast" :
          margin > p.price * 0.4 ? "High margin" :
          p.stockQuantity > 50 ? "High stock" :
          p.viewsCount > 100 ? "Recently viewed a lot" : "Never featured";
        return { product: p, score, reason };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [data.products, data.entries]);

  const toggleSelect = useCallback((key: string, next: boolean) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (next) s.add(key); else s.delete(key);
      return s;
    });
  }, []);

  const selectedEntries = useMemo(
    () => filtered.filter((e) => selected.has(e.key)),
    [filtered, selected],
  );

  async function updateDeal(entry: DealEntry, patch: Partial<FlashDealRow>, action: string) {
    if (!entry.deal) return;
    const { error } = await supabase.from("flash_deals").update(patch).eq("id", entry.deal.id);
    if (error) { toast.error(error.message); return; }
    logAction(action, entry.deal.id, { before: entry.deal, after: patch });
    data.refresh();
  }

  async function deleteDeal(entry: DealEntry) {
    if (!entry.deal) return;
    const { error } = await supabase.from("flash_deals").delete().eq("id", entry.deal.id);
    if (error) { toast.error(error.message); return; }
    logAction("flash_deal_deleted", entry.deal.id, { before: entry.deal });
    toast.success("Flash deal removed");
    data.refresh();
  }

  /** Opens the read-only intelligence sheet for a deal. */
  const openIntel = useCallback((key: string) => setIntelKey(key), []);

  /** One-click fixes coming from the assistant, hero optimizer and conflict center. */
  async function applyFix(c: Conflict) {
    const fix = c.fix;
    if (!fix) return;
    const byKey = (k: string) => data.entries.find((e) => e.key === k);
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
        logAction("flash_deal_badge_assigned", null, { slug: fix.slug, source: "intelligence" });
        toast.success("Flash badge assigned");
        data.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not assign the badge");
      }
      return;
    }
    const entry = byKey(fix.entryKey);
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



  async function bulk(action: "activate" | "deactivate" | "delete" | "badge" | "unbadge" | "extend") {
    if (selectedEntries.length === 0) return toast.error("Select at least one deal");
    const flashBadge = data.badgeTypes.find((b) => b.badgeKey === "flash_deal" && b.enabled && !b.archived);
    let ok = 0;
    for (const e of selectedEntries) {
      try {
        if (action === "badge" && flashBadge) { await assignBadge(e.product.slug, flashBadge.id); ok++; continue; }
        if (action === "unbadge" && flashBadge) { await unassignBadge(e.product.slug, flashBadge.id); ok++; continue; }
        if (!e.deal) continue;
        if (action === "delete") await supabase.from("flash_deals").delete().eq("id", e.deal.id);
        else if (action === "extend")
          await supabase.from("flash_deals")
            .update({ end_at: new Date(new Date(e.deal.end_at).getTime() + 24 * 3600_000).toISOString() })
            .eq("id", e.deal.id);
        else
          await supabase.from("flash_deals").update({ active: action === "activate" }).eq("id", e.deal.id);
        ok++;
      } catch { /* continue with the rest of the batch */ }
    }
    logAction(`flash_deal_bulk_${action}`, null, { count: ok, keys: selectedEntries.map((e) => e.key) });
    toast.success(`${ok} deal${ok === 1 ? "" : "s"} updated`);
    setSelected(new Set());
    data.refresh();
  }

  function exportCsv() {
    const header = "product,sku,regular,flash,discount_pct,status,start,end,priority,views,clicks,purchases";
    const lines = filtered.map((e) =>
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

  const warnCount = data.entries.filter((e) => e.warnings.length > 0).length;

  return (
    <AdminShell
      title="Flash Deals"
      subtitle="Command center — schedule, price, preview, rotate and monitor every flash deal"
      allow={["admin", "super_admin", "manager"]}
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => setSettingsOpen(true)} aria-label="Flash deal settings"
            className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5">
            <Settings2 className="size-4" />
          </button>
          <button onClick={() => setWizard({ open: true, deal: null })}
            className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-4 min-h-11 text-xs font-mono uppercase tracking-widest hover:opacity-90 transition">
            <Plus className="size-3.5" /> New deal
          </button>
        </div>
      }
    >
      <nav className="flex gap-1.5 overflow-x-auto pb-1 mb-4" aria-label="Flash deal sections">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 min-h-11 text-[11px] font-mono uppercase tracking-widest border transition ${
              tab === t ? "border-accent/50 text-accent bg-accent/10" : "border-white/10 text-muted-foreground hover:bg-white/5"
            }`}>
            {t}
          </button>
        ))}
      </nav>

      {data.loading ? (
        <div className="grid place-items-center py-24"><Loader2 className="size-6 animate-spin text-accent" /></div>
      ) : (
        <>
          {tab === "Overview" && (
            <div className="space-y-5">
              <FlashKpiGrid totals={data.totals} />

              {warnCount > 0 && (
                <button onClick={() => { setTab("Deals"); setStatus("warning"); }}
                  className="w-full rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 text-left">
                  <p className="text-sm text-amber-200">{warnCount} deal{warnCount === 1 ? "" : "s"} need attention</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tap to review expired, out-of-stock, badge-missing and conflicting deals.</p>
                </button>
              )}

              <FlashHomepageHealth quality={ai.quality} />

              <section className="rounded-2xl border border-border bg-card p-4">
                <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
                  <Sparkles className="size-3.5 text-accent" /> Suggested products
                </p>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {ai.recommendations.slice(0, 6).map((r) => (
                    <div key={r.product.slug} className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-2.5">
                      <div className="size-10 shrink-0 rounded-lg overflow-hidden bg-black/40 ring-1 ring-white/10">
                        {r.product.image && <img loading="lazy" decoding="async" src={r.product.image} alt="" className="size-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{r.product.name}</p>
                        <p className="text-[11px] text-muted-foreground">{r.reasons[0]}</p>
                      </div>
                      <button onClick={() => setWizard({ open: true, deal: null, presetProduct: r.product })}
                        className="rounded-full border border-accent/40 text-accent px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-accent/10">
                        Feature
                      </button>
                    </div>
                  ))}
                  {ai.recommendations.length === 0 && (
                    <p className="text-xs text-muted-foreground">Every eligible product is already featured.</p>
                  )}
                </div>
              </section>
            </div>
          )}

          {tab === "Intelligence" && (
            <div className="space-y-3">
              <FlashHomepageHealth quality={ai.quality} />
              <div className="grid lg:grid-cols-2 gap-3">
                <FlashAssistant insights={ai.insights} onOpen={openIntel} />
                <FlashHeroOptimizer hero={ai.hero} onReview={openIntel} />
              </div>
              <FlashConflictCenter conflicts={ai.conflicts} onFix={(c) => void applyFix(c)} />
            </div>
          )}

          {tab === "Recommend" && (
            <FlashRecommendationCenter
              recommendations={ai.recommendations}
              onCreate={(product, template) =>
                setWizard({ open: true, deal: null, presetProduct: product, presetTemplate: template })
              }
            />
          )}

          {tab === "Simulator" && (
            <FlashSimulator windows={ai.windows} cap={data.cap} nonce={data.nonce} />
          )}

          {tab === "Coverage" && (
            <FlashCoveragePanel
              categories={ai.categories}
              brands={ai.brands}
              fairness={ai.fairness}
              stock={ai.stock}
              rotationStreaks={ai.rotationStreaks}
              cap={data.cap}
            />
          )}


          {tab === "Deals" && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="relative sm:col-span-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input id="flash-search" value={query} onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search deals (press /)" aria-label="Search deals"
                    className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:border-accent" />
                </div>
                <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label="Filter by status"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent">
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="paused">Paused</option>
                  <option value="expired">Expired</option>
                  <option value="no_deal">Badge only</option>
                  <option value="warning">Needs attention</option>
                </select>
                <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent">
                  <option value="all">All categories</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} aria-label="Filter by campaign"
                  className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent">
                  <option value="all">All campaigns</option>
                  <option value="">No campaign</option>
                  {FLASH_CAMPAIGNS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex gap-2">
                  <button onClick={exportCsv}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 min-h-11 text-[11px] font-mono uppercase tracking-widest hover:bg-white/5">
                    <Download className="size-3.5" /> Export
                  </button>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 min-h-11 text-[11px] font-mono uppercase tracking-widest hover:bg-white/5 cursor-pointer">
                    <Upload className="size-3.5" /> Import
                    <input type="file" accept=".csv" className="sr-only"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
                  </label>
                </div>
              </div>

              {selected.size > 0 && (
                <div className="sticky top-2 z-10 flex flex-wrap items-center gap-1.5 rounded-2xl border border-accent/30 bg-card/95 backdrop-blur p-2.5">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mr-1">{selected.size} selected</span>
                  {([
                    ["activate", "Activate"], ["deactivate", "Pause"], ["extend", "+24h"],
                    ["badge", "Assign badge"], ["unbadge", "Remove badge"], ["delete", "Delete"],
                  ] as const).map(([a, label]) => (
                    <button key={a} onClick={() => bulk(a)}
                      className={`rounded-full border px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5 ${
                        a === "delete" ? "border-destructive/30 text-destructive" : "border-white/10"
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {filtered.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                  No deals match these filters.
                </p>
              ) : (
                <div className="space-y-2">
                  {filtered.map((e) => (
                    <FlashDealCard
                      key={e.key}
                      entry={e}
                      selected={selected.has(e.key)}
                      onSelect={toggleSelect}
                      onEdit={(x) => setWizard({ open: true, deal: x.deal })}
                      onToggle={(x) => updateDeal(x, { active: !x.deal!.active }, x.deal!.active ? "flash_deal_paused" : "flash_deal_resumed")}
                      onDelete={deleteDeal}
                      onPin={(x) => updateDeal(x, { priority: (x.deal!.priority ?? 0) > 0 ? 0 : 100 }, "flash_deal_priority_changed")}
                      onCreate={() => setWizard({ open: true, deal: null })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "Timeline" && (
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
          )}

          {tab === "Rotation" && (
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
          )}

          {tab === "Preview" && <FlashLivePreview />}

          {tab === "Audit" && <FlashAuditTimeline audit={data.audit} />}
        </>
      )}

      {wizard?.open && (
        <FlashDealWizard
          products={data.products}
          badgeTypes={data.badgeTypes}
          ops={data.ops}
          deal={wizard.deal}
          onClose={() => setWizard(null)}
          onSaved={data.refresh}
        />
      )}

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
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-border bg-card p-5 space-y-4"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Flash deal settings">
        <h3 className="font-display font-semibold flex items-center gap-2"><Flame className="size-4 text-accent" /> Flash Deal settings</h3>

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

        <label className="flex items-center gap-2 text-sm min-h-11">
          <input type="checkbox" checked={keepBadge} onChange={(e) => setKeepBadge(e.target.checked)}
            className="size-4 accent-[var(--color-accent)]" />
          Keep the flash badge after a deal expires
        </label>

        <button onClick={save} disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-3 text-sm font-medium disabled:opacity-60">
          {saving && <Loader2 className="size-4 animate-spin" />} Save settings
        </button>
      </div>
    </div>
  );
}
