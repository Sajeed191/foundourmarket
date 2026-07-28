/**
 * One-click Flash Deal creation / editing.
 * Product -> Discount -> Time -> Preview -> Publish (max 4 clicks).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, X, Check, AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/products";
import type { BadgeType } from "@/lib/use-product-badges";
import { assignBadge } from "@/lib/use-product-badges";
import { FLASH_CAMPAIGNS, saveFlashOps, type FlashOps } from "@/lib/flash/flash-ops";
import type { FlashDealRow } from "@/lib/flash/use-flash-admin";

type Step = 0 | 1 | 2 | 3;
const STEP_LABELS = ["Product", "Discount", "Time", "Publish"];

function toLocalInput(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function FlashDealWizard({
  products, badgeTypes, ops, deal, presetProduct, presetTemplate, onClose, onSaved,
}: {
  products: Product[];
  badgeTypes: BadgeType[];
  ops: FlashOps;
  deal: FlashDealRow | null;
  /** Prefilled product coming from a recommendation or one-click fix. */
  presetProduct?: Product | null;
  /** Campaign template prefilling duration, discount, priority and label. */
  presetTemplate?: CampaignTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialProduct = deal
    ? products.find((p) => p.id === deal.product_id) ?? null
    : presetProduct ?? null;
  const [step, setStep] = useState<Step>(deal || presetProduct ? 1 : 0);
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [price, setPrice] = useState(() => {
    if (deal) return String(deal.flash_price);
    if (presetProduct) {
      const pct = presetTemplate?.discountPct ?? 20;
      return String(Math.max(0, Math.round(presetProduct.price * (1 - pct / 100))));
    }
    return "";
  });
  const [startAt, setStartAt] = useState(toLocalInput(deal?.start_at ?? new Date().toISOString()));
  const [endAt, setEndAt] = useState(
    toLocalInput(
      deal?.end_at ??
        new Date(Date.now() + (presetTemplate?.durationHours ?? 24) * 3600_000).toISOString(),
    ),
  );
  const [priority, setPriority] = useState(String(deal?.priority ?? presetTemplate?.priority ?? 0));
  const [campaign, setCampaign] = useState(
    deal ? ops.dealCampaigns[deal.id] ?? "" : presetTemplate?.label ?? "",
  );
  const [autoBadge, setAutoBadge] = useState(true);
  const [saving, setSaving] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = products.filter((p) => p.status !== "archived");
    if (!q) return pool.slice(0, 30);
    return pool
      .filter((p) =>
        [p.name, p.sku ?? "", p.barcode ?? "", p.brand ?? "", p.category, ...(p.categories ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 30);
  }, [products, query]);

  const regular = product?.price ?? 0;
  const flash = Number(price) || 0;
  const pct = regular > 0 && flash > 0 && flash < regular ? Math.round(((regular - flash) / regular) * 100) : 0;
  const savings = Math.max(0, regular - flash);
  const cost = product?.costPriceInr ?? null;
  const margin = cost != null && flash > 0 ? flash - cost : null;
  const overLimit = pct > ops.maxDiscountPct;

  const flashBadge = badgeTypes.find((b) => b.badgeKey === "flash_deal" && b.enabled && !b.archived) ?? null;

  function setPct(next: number) {
    if (regular <= 0) return;
    setPrice(String(Math.max(0, Math.round(regular * (1 - next / 100)))));
  }

  async function publish() {
    if (!product?.id) return toast.error("Pick a product first");
    if (!(flash > 0)) return toast.error("Enter a valid flash price");
    if (new Date(endAt).getTime() <= new Date(startAt).getTime())
      return toast.error("End must be after start");

    setSaving(true);
    const payload = {
      product_id: product.id,
      flash_price: flash,
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      priority: Number(priority) || 0,
      active: true,
    };
    const res = deal
      ? await supabase.from("flash_deals").update(payload).eq("id", deal.id).select("id").maybeSingle()
      : await supabase.from("flash_deals").insert(payload).select("id").maybeSingle();

    if (res.error) {
      setSaving(false);
      toast.error(
        res.error.code === "23505" ? "This product already has an active flash deal" : res.error.message,
      );
      return;
    }

    const dealId = (res.data as { id?: string } | null)?.id ?? deal?.id ?? null;

    if (campaign && dealId) {
      try {
        await saveFlashOps({ ...ops, dealCampaigns: { ...ops.dealCampaigns, [dealId]: campaign } });
      } catch { /* campaign tag is cosmetic — never block publishing */ }
    }

    if (autoBadge && flashBadge) {
      try { await assignBadge(product.slug, flashBadge.id); }
      catch { toast.message("Deal saved — badge could not be assigned automatically"); }
    }

    setSaving(false);
    toast.success(deal ? "Flash deal updated" : "Flash deal published");
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-border bg-card p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={deal ? "Edit flash deal" : "Create flash deal"}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold">{deal ? "Edit Flash Deal" : "New Flash Deal"}</h3>
          <button onClick={onClose} aria-label="Close" className="size-11 grid place-items-center rounded-full hover:bg-white/5">
            <X className="size-4" />
          </button>
        </div>

        <ol className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
          {STEP_LABELS.map((l, i) => (
            <li key={l} className="flex items-center gap-2">
              <button
                onClick={() => setStep(i as Step)}
                className={`rounded-full px-2.5 py-1 border transition ${
                  i === step ? "border-accent/50 text-accent bg-accent/10" : "border-white/10 text-muted-foreground"
                }`}
              >
                {l}
              </button>
              {i < STEP_LABELS.length - 1 && <ChevronRight className="size-3 text-muted-foreground/50" />}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, SKU, barcode, brand or category…"
                aria-label="Search products"
                className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {results.map((p) => (
                <button
                  key={p.slug}
                  onClick={() => { setProduct(p); setPrice(String(Math.round(p.price * 0.8))); setStep(1); }}
                  className="w-full flex items-center gap-3 rounded-xl border border-border bg-background/40 p-2.5 text-left hover:border-accent/40 transition min-h-11"
                >
                  <div className="size-10 shrink-0 rounded-lg overflow-hidden bg-black/40 ring-1 ring-white/10">
                    {p.image && <img loading="lazy" decoding="async" src={p.image} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {p.price} · stock {p.stockQuantity} · {p.brand || p.category}
                    </p>
                  </div>
                  {p.id === product?.id && <Check className="size-4 text-accent" />}
                </button>
              ))}
              {results.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">No products match that search.</p>
              )}
            </div>
          </div>
        )}

        {step === 1 && product && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/10">
                {product.image && <img src={product.image} alt="" className="size-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{product.name}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">Regular {regular}</p>
              </div>
            </div>

            <input
              type="range"
              min={0}
              max={90}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              aria-label="Discount percentage"
              className="w-full accent-[var(--color-accent)]"
            />

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Flash price</span>
                <input
                  type="number" min={0} value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Priority</span>
                <input
                  type="number" value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm rounded-2xl border border-border bg-background/40 p-3">
              <div><dt className="text-[11px] text-muted-foreground">Regular</dt><dd className="tabular-nums">{regular}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Flash</dt><dd className="tabular-nums text-accent font-semibold">{flash}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Savings</dt><dd className="tabular-nums">{savings}</dd></div>
              <div><dt className="text-[11px] text-muted-foreground">Discount</dt><dd className="tabular-nums">{pct}%</dd></div>
              {margin != null && (
                <div className="col-span-2">
                  <dt className="text-[11px] text-muted-foreground">Profit impact (per unit)</dt>
                  <dd className={`tabular-nums ${margin < 0 ? "text-destructive" : "text-emerald-300"}`}>{margin}</dd>
                </div>
              )}
            </dl>

            {overLimit && (
              <p className="flex items-center gap-2 text-xs text-amber-300">
                <AlertTriangle className="size-3.5" /> Above your {ops.maxDiscountPct}% discount guardrail.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Start</span>
                <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">End</span>
                <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {[6, 12, 24, 48, 72].map((h) => (
                <button key={h}
                  onClick={() => setEndAt(toLocalInput(new Date(new Date(startAt).getTime() + h * 3600_000).toISOString()))}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest hover:border-accent/40 transition">
                  {h}h
                </button>
              ))}
            </div>
            <label className="block space-y-1">
              <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Campaign</span>
              <select value={campaign} onChange={(e) => setCampaign(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent">
                <option value="">No campaign</option>
                {FLASH_CAMPAIGNS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
        )}

        {step === 3 && product && (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-background/40 p-4 space-y-2">
              <p className="text-sm font-medium">{product.name}</p>
              <p className="text-sm tabular-nums">
                <span className="line-through text-muted-foreground mr-2">{regular}</span>
                <span className="text-accent font-semibold text-lg">{flash}</span>
                {pct > 0 && <span className="ml-2 text-accent">-{pct}%</span>}
              </p>
              <p className="text-[11px] font-mono text-muted-foreground">
                {new Date(startAt).toLocaleString()} → {new Date(endAt).toLocaleString()}
              </p>
              {campaign && <p className="text-[11px] text-muted-foreground">Campaign: {campaign}</p>}
            </div>
            <label className="flex items-center gap-2 text-sm min-h-11">
              <input type="checkbox" checked={autoBadge} onChange={(e) => setAutoBadge(e.target.checked)}
                className="size-4 accent-[var(--color-accent)]" />
              Assign the Flash Deal badge automatically
            </label>
            {!flashBadge && (
              <p className="text-xs text-amber-300">No enabled “flash_deal” badge type found — assign a badge manually.</p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            onClick={() => setStep((s) => (Math.max(0, s - 1) as Step))}
            disabled={step === 0}
            className="rounded-full border border-white/10 px-4 py-2.5 text-xs font-mono uppercase tracking-widest disabled:opacity-40 min-h-11"
          >
            Back
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep((s) => (Math.min(3, s + 1) as Step))}
              disabled={!product}
              className="rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-xs font-mono uppercase tracking-widest disabled:opacity-40 min-h-11"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={publish}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-xs font-mono uppercase tracking-widest disabled:opacity-60 min-h-11"
            >
              {saving && <Loader2 className="size-3.5 animate-spin" />}
              {deal ? "Save changes" : "Publish deal"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
