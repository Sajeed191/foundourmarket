import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight } from "lucide-react";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useWishlist } from "@/lib/wishlist";
import { useAuth } from "@/lib/auth";
import type { Product } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";
import { PremiumSectionHeading } from "@/components/site/PremiumSectionHeading";
import { LazyMount } from "@/components/site/LazyMount";

export function PickedForYouRail({ products }: { products: Product[] }) {
  const { user } = useAuth();
  const { slugs: recentSlugs } = useRecentlyViewed();
  const { slugs: wishlistSlugs } = useWishlist();

  const picks = useMemo(() => {
    const recent = new Set(recentSlugs);
    const wishlist = new Set([...wishlistSlugs]);

    // Build affinity: recent views first, then wishlist, then category overlap.
    const recentProducts = recentSlugs
      .map((slug) => products.find((p) => p.slug === slug))
      .filter((p): p is Product => !!p && p.inStock !== false);

    const wishlistProducts = [...wishlistSlugs]
      .map((slug) => products.find((p) => p.slug === slug))
      .filter((p): p is Product => !!p && p.inStock !== false && !recent.has(p.slug));

    const affinityCategories = new Set([
      ...recentProducts.map((p) => p.category),
      ...wishlistProducts.map((p) => p.category),
    ]);

    const similar = products.filter(
      (p) =>
        p.inStock !== false &&
        affinityCategories.has(p.category) &&
        !recent.has(p.slug) &&
        !wishlist.has(p.slug),
    );

    const combined = [...recentProducts, ...wishlistProducts, ...similar].slice(0, 8);
    return combined;
  }, [products, recentSlugs, wishlistSlugs]);

  const isAnonymous = !user;
  const title = isAnonymous ? "Trending Now" : "Picked For You";
  const eyebrow = isAnonymous ? "Popular This Week" : "Curated For You";
  const subtitle = isAnonymous
    ? "The pieces our community is loving right now."
    : "Based on your recent views and saved items.";

  if (picks.length === 0) return null;

  return (
    <section className="px-4 sm:px-6 py-9 sm:py-10 max-w-7xl mx-auto scroll-mt-24">
      <PremiumSectionHeading title={title} eyebrow={eyebrow} subtitle={subtitle} />
      <LazyMount minHeight={260}>
        <div data-product-grid className="grid auto-rows-fr grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {picks.slice(0, 4).map((p) => (
            <ProductCard key={p.id ?? p.slug} product={p} compact />
          ))}
        </div>
      </LazyMount>
      {picks.length > 4 && (
        <div className="relative mt-6 sm:mt-8 flex justify-center">
          <Link
            to="/recommended"
            className="group inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/[0.04] px-7 py-3.5 text-[12px] font-mono font-semibold uppercase tracking-[0.18em] text-accent transition-[background-color,border-color,box-shadow] duration-200 hover:bg-accent/10 hover:border-accent/60 hover:shadow-[0_10px_30px_-12px_rgba(255,138,0,0.5)]"
          >
            View All
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>
      )}
    </section>
  );
}
