import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  Package, LayoutGrid, Sofa, UtensilsCrossed, Gamepad2, Cpu, ToyBrick, PawPrint, Car, Shirt, Dumbbell,
  Watch, Headphones, Gem, Baby, Wrench, BookOpen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PremiumSectionHeading } from "@/components/site/PremiumSectionHeading";
import { Reveal } from "@/components/site/Reveal";
import type { Category } from "@/lib/use-categories";

const CATEGORY_ICON_RULES: { match: string[]; icon: LucideIcon }[] = [
  { match: ["kitchen"], icon: UtensilsCrossed },
  { match: ["home", "decor", "furnitur"], icon: Sofa },
  { match: ["gaming", "game"], icon: Gamepad2 },
  { match: ["electronic", "tech", "gadget"], icon: Cpu },
  { match: ["beauty", "cosmetic", "skin"], icon: Gem },
  { match: ["toy", "kids"], icon: ToyBrick },
  { match: ["pet", "animal"], icon: PawPrint },
  { match: ["vehicle", "car", "auto", "moto"], icon: Car },
  { match: ["cloth", "apparel", "wear"], icon: Shirt },
  { match: ["fitness", "sport", "gym"], icon: Dumbbell },
  { match: ["watch", "accessor"], icon: Watch },
  { match: ["audio", "headphone", "sound"], icon: Headphones },
  { match: ["baby", "infant"], icon: Baby },
  { match: ["tool", "hardware", "diy"], icon: Wrench },
  { match: ["book", "stationery", "office"], icon: BookOpen },
];

function iconForCategory(slug: string, name: string): LucideIcon {
  const hay = `${slug} ${name}`.toLowerCase();
  for (const rule of CATEGORY_ICON_RULES) {
    if (rule.match.some((m) => hay.includes(m))) return rule.icon;
  }
  return Package;
}

export function CategoryBento({
  categories,
  isAdmin,
  onEdit,
}: {
  categories: Category[];
  isAdmin: boolean;
  onEdit: () => void;
}) {
  return (
    <section id="categories" className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto scroll-mt-24">
      <div className="relative">
        <PremiumSectionHeading
          title="Main Categories"
          eyebrow="Browse"
          subtitle="Explore curated collections chosen for every lifestyle."
        />
        {isAdmin && (
          <button
            onClick={onEdit}
            className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/70 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-accent backdrop-blur-md hover:bg-accent/15"
          >
            Edit
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {categories.map((cat, i) => {
          const Icon = iconForCategory(cat.slug, cat.name);
          const hasImage = !!(cat.image || cat.mobile_image);
          return (
            <Reveal key={cat.slug} delay={i}>
              <Link
                to="/category/$slug"
                params={{ slug: cat.slug }}
                onClick={() => { void supabase.rpc("track_category_event", { _id: cat.id, _event: "click" }); }}
                className={`group relative flex flex-col items-center gap-2.5 sm:gap-3 p-2.5 sm:p-4 text-center rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_8px_32px_-8px_oklch(0.74_0.19_49/0.45)] active:scale-[0.97] ${isAdmin && !cat.homepage_visible ? "opacity-50" : ""}`}
              >
                <div className="relative w-full aspect-square overflow-hidden rounded-2xl border border-border bg-muted/60">
                  {hasImage ? (
                    <img
                      src={cat.mobile_image || cat.image || ""}
                      alt={cat.name}
                      loading="lazy"
                      decoding="async"
                      className="size-full object-cover transition-transform duration-700 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                    />
                  ) : (
                    <div className="size-full grid place-items-center">
                      <span className="grid size-14 sm:size-16 place-items-center rounded-full bg-accent/12 text-accent ring-1 ring-accent/25 shadow-[0_0_28px_-6px_oklch(0.74_0.19_49/0.6)] transition-colors group-hover:bg-accent/20">
                        <Icon className="size-6 sm:size-7" />
                      </span>
                    </div>
                  )}
                </div>
                <div className="w-full pb-0.5">
                  <h3 className="text-[12px] sm:text-sm font-semibold tracking-tight text-foreground truncate px-1">
                    {cat.name}
                  </h3>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {cat.product_count ?? 0} products
                  </p>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
