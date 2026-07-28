/**
 * v12.0 — Marketplace impact chips. Explains, in one line each, what a flash
 * deal does for the marketplace. Pure presentation over `marketplaceImpact`.
 */
import type { ImpactTag } from "@/lib/flash/flash-marketplace";

const TONE: Record<ImpactTag["tone"], string> = {
  green: "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
  blue: "border-sky-500/25 bg-sky-500/10 text-sky-200",
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-200",
  red: "border-destructive/30 bg-destructive/10 text-destructive",
};

export function FlashImpactChips({ tags }: { tags: ImpactTag[] }) {
  if (tags.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1">
      {tags.map((t) => (
        <li key={t.key}>
          <span
            title={t.why}
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${TONE[t.tone]}`}
          >
            {t.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
