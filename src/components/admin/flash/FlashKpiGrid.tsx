import { KpiCard } from "@/components/admin/KpiCard";
import {
  Flame, CalendarClock, Ban, Boxes, Percent, Wallet, Eye, MousePointerClick, ShoppingBag, TrendingUp,
} from "lucide-react";

export function FlashKpiGrid({ totals }: {
  totals: {
    active: number; scheduled: number; expired: number; eligible: number;
    avgDiscount: number; estRevenue: number; views: number; clicks: number;
    purchases: number; ctr: number; conversion: number;
  };
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      <KpiCard label="Active" value={totals.active} icon={<Flame className="size-4" />} />
      <KpiCard label="Scheduled" value={totals.scheduled} icon={<CalendarClock className="size-4" />} />
      <KpiCard label="Ended" value={totals.expired} icon={<Ban className="size-4" />} />
      <KpiCard label="Eligible" value={totals.eligible} icon={<Boxes className="size-4" />} />
      <KpiCard label="Avg discount" value={`${totals.avgDiscount.toFixed(0)}%`} icon={<Percent className="size-4" />} />
      <KpiCard label="Est. revenue" value={Math.round(totals.estRevenue).toLocaleString()} icon={<Wallet className="size-4" />} />
      <KpiCard label="Views" value={totals.views} icon={<Eye className="size-4" />} />
      <KpiCard label="Clicks" value={totals.clicks} icon={<MousePointerClick className="size-4" />} />
      <KpiCard label="Purchases" value={totals.purchases} icon={<ShoppingBag className="size-4" />} />
      <KpiCard
        label="CTR / Conv"
        value={`${totals.ctr.toFixed(1)}% / ${totals.conversion.toFixed(1)}%`}
        icon={<TrendingUp className="size-4" />}
      />
    </div>
  );
}
