/**
 * Category / brand coverage, rotation fairness and stock intelligence.
 * All three are read-only explanations with plain-language recommendations.
 */
import { Boxes, Layers3, Repeat, Tag } from "lucide-react";
import type { CoverageRow } from "@/lib/flash/flash-intelligence";
import type { DealEntry } from "@/lib/flash/use-flash-admin";

function Bar({ row }: { row: CoverageRow }) {
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate">{row.label}</span>
        <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
          {row.shown} shown · {row.waiting} waiting
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${row.share > 0.5 ? "bg-amber-400/70" : "bg-accent/70"}`}
          style={{ width: `${Math.round(row.share * 100)}%` }} />
      </div>
    </li>
  );
}

function CoverageCard({ title, icon, rows, advice }: {
  title: string; icon: React.ReactNode; rows: CoverageRow[]; advice: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
        {icon} {title}
      </p>
      <ul className="space-y-2.5">{rows.slice(0, 8).map((r) => <Bar key={r.label} row={r} />)}</ul>
      <p className="mt-3 text-[11px] text-muted-foreground">{advice}</p>
    </section>
  );
}

function NameList({ items, empty }: { items: DealEntry[]; empty: string }) {
  if (items.length === 0) return <p className="text-[11px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1">
      {items.slice(0, 8).map((e) => (
        <li key={e.key} className="text-xs truncate">{e.product.name}</li>
      ))}
      {items.length > 8 && <li className="text-[11px] text-muted-foreground">+{items.length - 8} more</li>}
    </ul>
  );
}

export function FlashCoveragePanel({
  categories, brands, fairness, stock, rotationStreaks, cap,
}: {
  categories: CoverageRow[];
  brands: CoverageRow[];
  fairness: { featuredNow: DealEntry[]; upcoming: DealEntry[]; waiting: DealEntry[] };
  stock: { critical: DealEntry[]; healthy: DealEntry[]; excess: DealEntry[] };
  rotationStreaks: Map<string, number>;
  cap: number;
}) {
  const topCategory = categories[0];
  const topBrand = brands[0];

  return (
    <div className="grid lg:grid-cols-2 gap-3">
      <CoverageCard
        title="Category coverage"
        icon={<Layers3 className="size-3.5 text-accent" />}
        rows={categories}
        advice={
          topCategory && topCategory.share > 0.5
            ? `🟡 ${topCategory.label} holds ${Math.round(topCategory.share * 100)}% of homepage slots — consider featuring another category.`
            : "🟢 Categories are reasonably balanced on the homepage today."
        }
      />
      <CoverageCard
        title="Brand coverage"
        icon={<Tag className="size-3.5 text-accent" />}
        rows={brands}
        advice={
          topBrand && topBrand.share > 0.5
            ? `🟡 ${topBrand.label} dominates the band — consider featuring another brand.`
            : "🟢 No single brand dominates Flash Deals right now."
        }
      />

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
          <Repeat className="size-3.5 text-accent" /> Rotation fairness
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Featured now</p>
            <NameList items={fairness.featuredNow} empty="Nothing is visible right now." />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Coming up</p>
            <NameList items={fairness.upcoming} empty="No products queued for upcoming windows." />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Never featured</p>
            <NameList items={fairness.waiting} empty="Every eligible product gets a turn." />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Selection is deterministic: the seeded shuffle picks the first {cap} eligible products each 6-hour window.
          {[...rotationStreaks.entries()].some(([, n]) => n >= 3)
            ? " 🟡 Some products stay visible for three or more windows in a row — reshuffle for fresher exposure."
            : " 🟢 Exposure is spreading evenly across eligible products."}
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
          <Boxes className="size-3.5 text-accent" /> Stock intelligence
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-destructive mb-1">Critical</p>
            <NameList items={stock.critical} empty="No critical stock levels." />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-300 mb-1">Healthy</p>
            <NameList items={stock.healthy} empty="No healthy-stock deals yet." />
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-sky-300 mb-1">Excess</p>
            <NameList items={stock.excess} empty="No excess inventory detected." />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {stock.critical.length > 0
            ? "🔴 Restock or end the critical deals early so the homepage stays honest."
            : stock.excess.length > 0
              ? "🔵 Excess inventory is a good candidate for a deeper clearance discount."
              : "🟢 Stock levels across Flash Deals look healthy."}
        </p>
      </section>
    </div>
  );
}
