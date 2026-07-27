import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import type { Product } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";
import { LazyMount } from "@/components/site/LazyMount";
import {
  relevanceBadge,
  relevanceSubtitle,
  scoreCandidates,
} from "@/lib/homepage/personal-relevance";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Picked For You — premium personalization rail (Homepage v2.1).
 *
 * Frontend-only composition: recently viewed + wishlist + cart + catalog
 * popularity feed a Personal Relevance Score. Never renders empty — falls back
 * to popular/trending candidates. Never duplicates products already shown in
 * another rail (`excludeSlugs`).
 */
export function PickedForYouRail({
  products,
  excludeSlugs = [],
}: {
  products: Product[];
  excludeSlugs?: string[];
}) {
  const { user } = useAuth();
  const { slugs: recentSlugs } = useRecentlyViewed();
  const { slugs: wishlistSlugs } = useWishlist();
  const { items: cartItems } = useCart();

  const cartSlugs = useMemo(() => cartItems.map((i) => i.slug), [cartItems]);
  const wishlistList = useMemo(() => [...wishlistSlugs], [wishlistSlugs]);

  const scored = useMemo(
    () =>
      scoreCandidates(products, {
        recentSlugs,
        wishlistSlugs: wishlistList,
        cartSlugs,
        excludeSlugs,
      }),
    [products, recentSlugs, wishlistList, cartSlugs, excludeSlugs],
  );

  const personalized = recentSlugs.length > 0 || wishlistList.length > 0;
  const picks = useMemo(() => scored.slice(0, 8), [scored]);
  const top = picks[0];

  const title = personalized ? "Picked For You" : "Trending Near You";
  const subtitle = relevanceSubtitle(top, personalized);
  const badge = relevanceBadge(top, personalized);

  if (picks.length === 0) return null;

  return (
    <section
      aria-labelledby="picked-for-you-heading"
      className="px-4 sm:px-6 py-10 sm:py-12 max-w-7xl mx-auto scroll-mt-24 motion-safe:animate-fade-in"
    >
      {/* Premium header — title left, See All right */}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-accent" strokeWidth={2} aria-hidden />
            <h2
              id="picked-for-you-heading"
              className="font-display text-[22px] sm:text-[28px] font-semibold tracking-tight text-foreground"
            >
              {title}
            </h2>
          </div>
          <p className="mt-1.5 line-clamp-1 text-[12.5px] sm:text-[13.5px] text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <Link
          to="/recommended"
          aria-label={`See all ${title.toLowerCase()} recommendations`}
          className="group inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-accent transition-colors hover:text-accent/80"
        >
          See All
          <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* One personalization pill */}
      <div className="mt-4">
        <span className="inline-flex items-center rounded-full border border-accent/25 bg-accent/[0.06] px-3 py-1 text-[10.5px] font-medium uppercase tracking-[0.14em] text-accent">
          {badge}
        </span>
      </div>

      <LazyMount minHeight={280}>
        <div
          data-product-grid
          className="mt-4 grid auto-rows-fr grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
        >
          {picks.slice(0, 4).map((entry, i) => (
            <div
              key={entry.product.id ?? entry.product.slug}
              className="motion-safe:animate-fade-in"
              style={{ animationDelay: `${80 + i * 40}ms`, animationFillMode: "both", animationTimingFunction: EASE }}
            >
              <ProductCard product={entry.product} compact />
            </div>
          ))}
        </div>
      </LazyMount>
    </section>
  );
}
