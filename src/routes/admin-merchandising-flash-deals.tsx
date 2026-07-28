import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Flame, Plus, Loader2, Search, Settings2, Upload } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { CollapsibleModule } from "@/components/admin/CollapsibleModule";
import { FlashKpiGrid } from "@/components/admin/flash/FlashKpiGrid";
import { FlashDealCard } from "@/components/admin/flash/FlashDealCard";
import { FlashDealWizard } from "@/components/admin/flash/FlashDealWizard";
import { FlashTimeline } from "@/components/admin/flash/FlashTimeline";
import { FlashRotationPanel } from "@/components/admin/flash/FlashRotationPanel";
import { FlashAuditTimeline } from "@/components/admin/flash/FlashAuditTimeline";
import { useFlashAdminData, type DealEntry, type FlashDealRow } from "@/lib/flash/use-flash-admin";
import { useFlashIntelligence } from "@/lib/flash/use-flash-intelligence";
import {
  FlashHomepageHealth, FlashAssistant, FlashHeroOptimizer,
} from "@/components/admin/flash/FlashIntelligencePanels";
import { FlashSimulator } from "@/components/admin/flash/FlashSimulator";
import { FlashCoveragePanel } from "@/components/admin/flash/FlashCoveragePanel";
import { FlashDealIntelligenceSheet } from "@/components/admin/flash/FlashDealIntelligenceSheet";
import { FlashDealTile, type TileActions } from "@/components/admin/flash/manage/FlashDealTile";
import { FlashSectionShell, FlashEmpty } from "@/components/admin/flash/manage/FlashSectionShell";
import { FlashAttentionList } from "@/components/admin/flash/manage/FlashAttentionList";
import { FlashSuggestedRail } from "@/components/admin/flash/manage/FlashSuggestedRail";
import { FlashPreviewCompact } from "@/components/admin/flash/manage/FlashPreviewCompact";
import { FlashQuickBar } from "@/components/admin/flash/manage/FlashQuickBar";
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
  const next = Math.ceil(now / six) * six;
  const mins = Math.max(0, Math.round((next - now) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function FlashManagePage() {
  const data = useFlashAdminData();
  const ai = useFlashIntelligence(data);
  const [query, setQuery] = useState("");
  const [wizard, setWizard] = useState<{
    open: boolean; deal: FlashDealRow | null;
    presetProduct?: Product | null; presetTemplate?: CampaignTemplate | null;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [intelKey, setIntelKey] = useState<string | null>(null);
  const dragKey = useRef<string | null>(null);

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

  const matches = useCallback(
    (e: DealEntry) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [e.product.name, e.product.sku ?? "", e.product.brand ?? "", e.product.category]
        .join(" ").toLowerCase().includes(q);
    },
    [query],
  );

  const active = useMemo(
    () => data.entries.filter((e) => matches(e) && (e.status === "active" || e.status === "paused"))
      .sort((a, b) => (b.deal?.priority ?? 0) - (a.deal?.priority ?? 0)),
    [data.entries, matches],
  );
  const scheduled = useMemo(
    () => data.entries.filter((e) => matches(e) && e.status === "scheduled")
      .sort((a, b) => new Date(a.deal!.start_at).getTime() - new Date(b.deal!.start_at).getTime()),
    [data.entries, matches],
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

  const actions: TileActions = {
    onEdit: (e) => setWizard({ open: true, deal: e.deal }),
    onPause: (e) => void updateDeal(e, { active: !e.deal!.active }, e.deal!.active ? "flash_deal_paused" : "flash_deal_resumed"),
    onEndNow: (e) => void updateDeal(e, { active: false, end_at: new Date().toISOString() }, "flash_deal_ended_early"),
    onDelete: (e) => void deleteDeal(e),
    onPin: (e) => void updateDeal(e, { priority: (e.deal!.priority ?? 0) > 0 ? 0 : 100 }, "flash_deal_priority_changed"),
    onOpenIntel: (key) => setIntelKey(key),
  };

  /** Drag reorder writes descending priorities on the visible active list. */
  async function reorder(targetKey: string) {
    const from = dragKey.current;
    dragKey.current = null;
    if (!from || from === targetKey) return;
    const order = active.map((e) => e.key);
    const fromIdx = order.indexOf(from);
    const toIdx = order.indexOf(targetKey);
    if (fromIdx < 0 || toIdx < 0) return;
    order.splice(toIdx, 0, order.splice(fromIdx, 1)[0]);
    const top = order.length;
    for (let i = 0; i < order.length; i++) {
      const entry = active.find((e) => e.key === order[i]);
      if (!entry?.deal) continue;
      await supabase.from("flash_deals").update({ priority: top - i }).eq("id", entry.deal.id);
    }
    logAction("flash_deal_priority_reordered", null, { order });
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

  async function pauseAll() {
    const live = data.entries.filter((e) => e.status === "active" && e.deal);
    if (live.length === 0) { toast.error("There are no active deals to pause"); return; }
    for (const e of live) await supabase.from("flash_deals").update({ active: false }).eq("id", e.deal!.id);
    logAction("flash_deal_bulk_deactivate", null, { count: live.length });
    toast.success(`${live.length} deal${live.length === 1 ? "" : "s"} paused`);
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

  const endingSoon = data.entries.filter(
    (e) => e.msRemaining != null && e.msRemaining < 6 * 3600_000,
  ).length;

  return (
    <AdminShell
      title="Flash Deals"
      subtitle="Manage what shoppers see right now"
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
      {data.loading ? (
        <div className="grid place-items-center py-24"><Loader2 className="size-6 animate-spin text-accent" /></div>
      ) : (
        <div className="space-y-8 pb-4">
          {/* Header strip: live status in one line + search */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
            <p className="min-w-0 truncate text-sm text-muted-foreground">
              <span className="text-foreground font-medium tabular-nums">{data.totals.active}</span> live ·{" "}
              <span className="tabular-nums">{data.totals.scheduled}</span> scheduled ·{" "}
              <span className="tabular-nums">{endingSoon}</span> ending soon · rotation in{" "}
              <span className="tabular-nums">{nextRotationLabel(data.now)}</span>
            </p>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input id="flash-search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search deals (press /)" aria-label="Search deals"
                className="w-full rounded-full border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:border-accent" />
            </div>
          </div>

          {/* 1 — Current active deals */}
          <FlashSectionShell eyebrow="Live now" title="Current deals" count={active.length}>
            {active.length === 0 ? (
              <FlashEmpty
                text="No live flash deals right now."
                action={
                  <button onClick={() => setWizard({ open: true, deal: null })}
                    className="inline-flex items-center gap-2 rounded-full bg-accent px-4 min-h-11 text-[10px] font-mono uppercase tracking-widest text-accent-foreground">
                    <Plus className="size-3.5" /> Create the first deal
                  </button>
                }
              />
            ) : (
              <div className="grid gap-2 xl:grid-cols-2">
                {active.map((e) => (
                  <FlashDealTile
                    key={e.key}
                    entry={e}
                    intel={ai.scores.get(e.key) ?? null}
                    draggable
                    onDragStart={() => { dragKey.current = e.key; }}
                    onDragOver={(ev) => ev.preventDefault()}
                    onDrop={() => void reorder(e.key)}
                    actions={actions}
                  />
                ))}
              </div>
            )}
          </FlashSectionShell>

          {/* 2 — Scheduled */}
          <FlashSectionShell eyebrow="Upcoming" title="Scheduled" count={scheduled.length}>
            {scheduled.length === 0 ? (
              <FlashEmpty text="Nothing scheduled yet — plan your next campaign." />
            ) : (
              <div className="grid gap-2 xl:grid-cols-2">
                {scheduled.map((e) => (
                  <FlashDealTile key={e.key} entry={e} intel={ai.scores.get(e.key) ?? null} actions={actions} />
                ))}
              </div>
            )}
          </FlashSectionShell>

          {/* 3 — Needs attention */}
          <FlashSectionShell eyebrow="Fix first" title="Needs attention" count={ai.conflicts.length}>
            <FlashAttentionList conflicts={ai.conflicts} onFix={(c) => void applyFix(c)} />
          </FlashSectionShell>

          {/* 4 — Suggested */}
          <FlashSectionShell eyebrow="Assistant" title="Suggested deals">
            <FlashSuggestedRail
              recommendations={ai.recommendations}
              onFeature={(product) => setWizard({ open: true, deal: null, presetProduct: product })}
            />
          </FlashSectionShell>

          {/* 5 — Homepage preview */}
          <FlashSectionShell eyebrow="Storefront" title="Homepage preview">
            <FlashPreviewCompact />
          </FlashSectionShell>

          {/* 6 — Analytics & advanced tools, collapsed by default */}
          <div className="space-y-3">
            <CollapsibleModule eyebrow="Optional" title="Performance & analytics" sectionId="flash-analytics" defaultOpen={false}>
              <div className="space-y-3">
                <FlashKpiGrid totals={data.totals} />
                <FlashHomepageHealth quality={ai.quality} />
                <div className="grid gap-3 lg:grid-cols-2">
                  <FlashAssistant insights={ai.insights} onOpen={(k) => setIntelKey(k)} />
                  <FlashHeroOptimizer hero={ai.hero} onReview={(k) => setIntelKey(k)} />
                </div>
              </div>
            </CollapsibleModule>

            <CollapsibleModule eyebrow="Optional" title="Rotation & simulator" sectionId="flash-rotation" defaultOpen={false}>
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

            <CollapsibleModule eyebrow="Optional" title="Timeline, full list & audit" sectionId="flash-advanced" defaultOpen={false}>
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

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
                  <Upload className="size-3.5" /> Import CSV
                  <input type="file" accept=".csv" className="sr-only"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
                </label>

                <div className="space-y-2">
                  {data.entries.filter(matches).map((e) => (
                    <FlashDealCard
                      key={e.key}
                      entry={e}
                      selected={false}
                      onSelect={() => {}}
                      onEdit={(x) => setWizard({ open: true, deal: x.deal })}
                      onToggle={(x) => updateDeal(x, { active: !x.deal!.active }, x.deal!.active ? "flash_deal_paused" : "flash_deal_resumed")}
                      onDelete={deleteDeal}
                      onPin={(x) => updateDeal(x, { priority: (x.deal!.priority ?? 0) > 0 ? 0 : 100 }, "flash_deal_priority_changed")}
                      onCreate={() => setWizard({ open: true, deal: null, presetProduct: e.product })}
                    />
                  ))}
                </div>

                <FlashAuditTimeline audit={data.audit} />
              </div>
            </CollapsibleModule>
          </div>

          {/* 7 — Quick actions */}
          <FlashQuickBar
            onNew={() => setWizard({ open: true, deal: null })}
            onSettings={() => setSettingsOpen(true)}
            onExport={exportCsv}
            onPauseAll={() => void pauseAll()}
            onReshuffled={data.refresh}
          />
        </div>
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
