import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PremiumCTALink, PremiumCTARow } from "@/components/site/PremiumCTA";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import {
  Search, ArrowRight, Sparkles, Award, Package, Flame,
  Pencil, LayoutGrid,
  Sofa, UtensilsCrossed, Gamepad2, Cpu, ToyBrick, PawPrint, Car, Shirt, Dumbbell,
  Watch, Headphones, Gem, Baby, Wrench, BookOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCategories, useAdminCategories, toggleCategoryVisible } from "@/lib/use-categories";
import { useVisibleProducts } from "@/lib/product-availability";
import { useRegion } from "@/lib/region";
import { useProductAdminEditing } from "@/lib/admin-overlay";
import { useRotationNonce } from "@/lib/use-rotation-nonce";
import { fairPagedSlice } from "@/lib/fair-rotation";
import { useHomepageCollectionRules } from "@/lib/site-rules";
const CategoryAdminSheet = lazy(() =>
  import("@/components/admin/CategoryAdminSheet").then((m) => ({ default: m.CategoryAdminSheet })),
);
import { useHomepageSections, saveHomepageSection, toggleHomepageSection } from "@/lib/use-homepage-sections";
import { productInHomepageCollection, useBadgeCatalog } from "@/lib/use-product-badges";
import { evaluatePromoEligibility } from "@/lib/promo-eligibility";
import { InlineActiveToggle } from "@/components/admin/InlineActiveToggle";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { ProductCard } from "@/components/site/ProductCard";
// TEMPORARY EXPERIMENT (Trending section only): reuse Browse's grid so cards
// mount incrementally in batches of 16 via IncrementalGrid instead of all at
// once. Remove this import when reverting the experiment.
import { VirtualizedProductGrid } from "@/components/site/VirtualizedProductGrid";
import { useFlag } from "@/lib/use-debug-flag";
import { SearchOverlay } from "@/components/site/SearchOverlay";
import { LazyMount } from "@/components/site/LazyMount";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";



import { SectionTracker } from "@/components/site/SectionTracker";
import { useRenderDiagnostics } from "@/lib/startup-diagnostics";

import { HeroV2 } from "@/components/site/homepage/HeroV2";
import { TrustStripV2 } from "@/components/site/homepage/TrustStripV2";
import { CategoryBento } from "@/components/site/homepage/CategoryBento";

import { FlashDealsBand } from "@/components/site/homepage/FlashDealsBand";
import { WhyFoundOurMarket } from "@/components/site/homepage/WhyFoundOurMarket";

const PLACEHOLDERS = [
  "Search 2,400+ curated products...",
  "Try 'wireless headphones'...",
  "Discover 'linen shirt'...",
  "Find 'ceramic mug'...",
  "Explore 'smart watch'...",
];



function useRotatingPlaceholder(active: boolean) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % PLACEHOLDERS.length), 2800);
    return () => clearInterval(id);
  }, [active]);
  return PLACEHOLDERS[idx];
}

function useScrolledOnce(active: boolean) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!active || scrolled) return;
    // Perf v3 — shared scroll bus (one window listener for the whole app).
    if (typeof window !== "undefined" && window.scrollY > 240) {
      setScrolled(true);
      return;
    }
    let off: (() => void) | undefined;
    import("@/lib/scroll-bus").then(({ onScroll }) => {
      off = onScroll((y) => {
        if (y > 240) {
          setScrolled(true);
          off?.();
        }
      });
    });
    return () => off?.();
  }, [active, scrolled]);
  return !active || scrolled;
}

import { Reveal } from "@/components/site/Reveal";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FoundOurMarket™ | Global Marketplace - Whatever You Need, All In One Place" },
      {
        name: "description",
        content:
          "FoundOurMarket™ is a global online marketplace offering electronics, home essentials, fitness products, pet supplies, automotive accessories, and more with worldwide delivery.",
      },
      { property: "og:title", content: "FoundOurMarket™ | Global Marketplace" },
      {
        property: "og:description",
        content:
          "FoundOurMarket™ is a global online marketplace offering electronics, home essentials, fitness products, pet supplies, automotive accessories, and more with worldwide delivery.",
      },
      { property: "og:site_name", content: "FoundOurMarket" },
      { property: "og:url", content: "https://foundourmarket.com/" },
      { name: "twitter:title", content: "FoundOurMarket™ | Global Marketplace" },
      {
        name: "twitter:description",
        content:
          "FoundOurMarket™ is a global online marketplace offering electronics, home essentials, fitness products, pet supplies, automotive accessories, and more with worldwide delivery.",
      },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/" }],
  }),
  component: Home,
});

import { PremiumSectionHeading, PremiumSectionDivider } from "@/components/site/PremiumSectionHeading";

/* Cinematic ambient divider — thin transparent→orange→transparent gradient */
function CinematicDivider() {
  return <PremiumSectionDivider />;
}

/* Section identity — editorial label, subtitle, ghost word, badge, alignment. */
const SECTION_EYEBROW: Record<string, string> = {
  categories: "Featured Collection",
  flash_deals: "Limited Offers",
  trending: "Popular This Week",
  new_arrivals: "Just Released",
  best_sellers: "Customer Favorites",
};

const SECTION_SUBTITLE: Record<string, string> = {
  categories: "Explore curated collections chosen for every lifestyle.",
  flash_deals: "Today's best prices from trusted sellers.",
  trending: "The pieces our community is loving right now.",
  new_arrivals: "Fresh finds, added to the collection this week.",
  best_sellers: "The most-loved pieces across the marketplace.",
};


/* Premium category icon mapping — keyed by keyword in slug/name. */
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

/* Elegant empty-state messaging per home section — sections stay visible even
   when no products currently carry the required badge. */
const SECTION_EMPTY_COPY: Record<string, { title: string; message: string }> = {
  trending: {
    title: "Coming Soon",
    message: "Products for this collection will appear here soon.",
  },
  new_arrivals: {
    title: "Coming Soon",
    message: "Products for this collection will appear here soon.",
  },
  best_sellers: {
    title: "Coming Soon",
    message: "Products for this collection will appear here soon.",
  },
  featured: {
    title: "Coming Soon",
    message: "Products for this collection will appear here soon.",
  },
};

/* Premium "Coming Soon" placeholder — matches the marketplace aesthetic:
   soft neutral surface, subtle icon, large heading, minimal message. */
function SectionComingSoon({
  icon: Icon,
  title,
  message,
}: {
  icon?: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl px-6 py-12 sm:py-14 text-center motion-safe:animate-fade-in"
      style={{
        background: "linear-gradient(160deg, oklch(0.16 0.006 60) 0%, oklch(0.18 0.008 60) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-2/3 rounded-full blur-3xl opacity-20"
        style={{ background: "var(--gradient-ember)" }}
      />
      <div className="relative flex flex-col items-center gap-4">
        {Icon && (
          <div className="grid size-12 place-items-center rounded-2xl bg-white/[0.04] text-accent/90 ring-1 ring-white/10">
            <Icon className="size-5" strokeWidth={1.75} />
          </div>
        )}
        <h3 className="text-2xl sm:text-[26px] font-display font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>
    </div>
  );
}

/* Single product section (lazy-mounted). Shows exactly 4 products in a 2×2
   mobile grid (no carousel) with a full-width premium "View All" button.
   When no products carry the section's badge, an elegant "Coming Soon"
   placeholder renders instead of hiding the section. */
function ProductSection({
  sectionKey, eyebrow, title, icon, products, isAdmin, active, viewAllTo, prominent = false, minHeight = 260, limit = 4, eligibleCount,
}: {
  sectionKey: string;
  eyebrow: string;
  title: string;
  icon?: LucideIcon;
  products: import("@/lib/products").Product[];
  isAdmin: boolean;
  active: boolean;
  viewAllTo: string;
  prominent?: boolean;
  minHeight?: number;
  limit?: number;
  /** Total number of eligible products (before rotation/preview slicing). Drives View All visibility. */
  eligibleCount?: number;
}) {
  // Only the admin-controlled active toggle hides the section. An empty product
  // list now shows an elegant "Coming Soon" message rather than disappearing.
  if (!active && !isAdmin) return null;
  const preview = products.slice(0, limit);
  const isEmpty = preview.length === 0;
  // View All visibility is driven by the ELIGIBLE pool, not the visible preview.
  // If there are more eligible products than the homepage preview slot count,
  // the CTA must appear so shoppers can reach the full collection.
  const totalEligible = typeof eligibleCount === "number" ? eligibleCount : preview.length;
  const showViewAll = !isEmpty && totalEligible > limit;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug(
      `[Homepage Collection] collection=${sectionKey} eligible=${totalEligible} homepagePreview=${preview.length} showViewAll=${showViewAll}`,
    );
  }
  // Section-specific badge: inside a dedicated section, each card shows only
  // that section's badge.
  const sectionBadge =
    sectionKey === "trending"
      ? "trending"
      : sectionKey === "best_sellers"
        ? "bestseller"
        : sectionKey === "new_arrivals"
          ? "new"
          : null;
  const emptyCopy = SECTION_EMPTY_COPY[sectionKey] ?? {
    title: "Coming Soon",
    message: "More products are on the way.",
  };
  return (
    <SectionTracker
      sectionKey={sectionKey}
      className={`px-4 sm:px-6 py-9 sm:py-10 max-w-7xl mx-auto scroll-mt-24 block`}
    >
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        icon={icon}
        href={showViewAll ? viewAllTo : undefined}
        sectionKey={sectionKey}
        editable={isAdmin}
        active={active}
        prominent={prominent}
      />
      {isEmpty ? (
        <SectionComingSoon icon={icon} title={emptyCopy.title} message={emptyCopy.message} />
      ) : (
        <LazyMount minHeight={minHeight}>
          {sectionKey === "trending" ? (
            <VirtualizedProductGrid
              items={preview}
              virtualizeThreshold={0}
              cols={{ base: 2, lg: 4 }}
              className="grid auto-rows-fr grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
              getKey={(p) => p.id ?? p.slug}
              getImageSrc={(p) => p.image}
              renderItem={(p) => (
                <ProductCard product={p} compact forceBadge={sectionBadge} />
              )}
            />
          ) : (
            <div data-product-grid className="grid auto-rows-fr grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {preview.map((p, i) => (
                <Reveal key={p.id ?? p.slug} delay={i} className="h-full" productCardFrame><ProductCard product={p} compact forceBadge={sectionBadge} /></Reveal>
              ))}
            </div>
          )}
        </LazyMount>
      )}
      {showViewAll && (
        <PremiumCTARow>
          <PremiumCTALink to={viewAllTo} variant="secondary">
            View All
          </PremiumCTALink>
        </PremiumCTARow>
      )}
    </SectionTracker>
  );
}


function SectionHeader({ eyebrow, title, icon: Icon, href, hrefLabel = "View All", sectionKey, editable, active = true, prominent = false }: { eyebrow: string; title: string; icon?: React.ComponentType<{ className?: string }>; href?: string; hrefLabel?: string; sectionKey?: string; editable?: boolean; active?: boolean; prominent?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draftEyebrow, setDraftEyebrow] = useState(eyebrow);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftActive, setDraftActive] = useState(active);
  const [saving, setSaving] = useState(false);

  function open() {
    setDraftEyebrow(eyebrow);
    setDraftTitle(title);
    setDraftActive(active);
    setEditing(true);
  }

  async function save() {
    if (!sectionKey) return;
    setSaving(true);
    try {
      await saveHomepageSection(sectionKey, {
        eyebrow: draftEyebrow.trim() || eyebrow,
        title: draftTitle.trim() || title,
        active: draftActive,
      });
      toast.success("Section updated");
      setEditing(false);
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setSaving(false);
    }
  }

  const subtitle = sectionKey ? SECTION_SUBTITLE[sectionKey] : undefined;
  const eyebrowLabel = sectionKey ? SECTION_EYEBROW[sectionKey] : eyebrow;
  void eyebrow;

  return (
    <>
      <PremiumSectionHeading
        title={title}
        subtitle={subtitle}
        eyebrow={eyebrowLabel}
        href={href}
        hrefLabel={hrefLabel}
        right={
          editable && sectionKey ? (
            <div className="flex items-center gap-1.5">
              <InlineActiveToggle
                active={active}
                label="Section"
                size="sm"
                onToggle={(next) => toggleHomepageSection(sectionKey, next)}
              />
              <button
                onClick={open}
                aria-label="Edit section"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition-colors hover:border-accent/40 hover:text-accent"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          ) : undefined
        }
      />
      {/* Silence unused-var warnings; prominent kept for API back-compat. */}
      {prominent || Icon ? null : null}

      {editing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={() => !saving && setEditing(false)}>
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-sm rounded-3xl border border-accent/25 bg-background/95 p-5 backdrop-blur-2xl shadow-[0_30px_80px_-20px_oklch(0.74_0.19_49/0.5)]"
          >
            <p className="mb-4 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.25em] text-accent">
              <Pencil className="size-3" /> Edit section
            </p>
            <label className="mb-3 block">
              <span className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Eyebrow</span>
              <input
                value={draftEyebrow}
                onChange={(e) => setDraftEyebrow(e.target.value)}
                className="w-full rounded-xl border border-border bg-card/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/55"
              />
            </label>
            <label className="mb-4 block">
              <span className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Title</span>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="w-full rounded-xl border border-border bg-card/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/55"
              />
            </label>
            <button
              type="button"
              onClick={() => setDraftActive((v) => !v)}
              className={`mb-5 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 transition-all ${draftActive ? "border-accent/50 bg-accent/15" : "border-border bg-card hover:border-accent/30"}`}
            >
              <span className="text-left">
                <span className="block text-xs font-medium text-foreground">Active on homepage</span>
                <span className="block text-[10px] text-muted-foreground">{draftActive ? "Visible to shoppers" : "Hidden from shoppers"}</span>
              </span>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${draftActive ? "bg-accent" : "bg-white/15"}`} aria-hidden>
                <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${draftActive ? "translate-x-[1.125rem]" : "translate-x-0.5"}`} />
              </span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-xl border border-border px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110 disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Responsive category count — renders only the cards each breakpoint needs
 * (mobile 5, tablet 7, desktop 7+1 shop-all = 4 + 4) instead of hiding cards with CSS.
 * SSR-safe: reads the real width on mount and updates on resize.
 */
function useCategoryLimit() {
  const get = () => {
    if (typeof window === "undefined") return 7;
    const w = window.innerWidth;
    if (w >= 1024) return 7;   // desktop: 4 + 3 categories, shop-all card fills 8th slot
    if (w >= 768) return 7;    // tablet: 4 + 3 categories
    return 5;                  // mobile: 2 rows of 2 + 1 shop-all
  };
  const [limit, setLimit] = useState(get);
  useEffect(() => {
    setLimit(get());
    let off: (() => void) | undefined;
    import("@/lib/scroll-bus").then(({ onResize }) => {
      off = onResize(() => setLimit(get()));
    });
    return () => off?.();
  }, []);
  return limit;
}

function Home() {
  useRenderDiagnostics("Home");
  // Debug harness flags — isolate which homepage subsystem corrupts rendering.
  const ffCategoryGrid = useFlag("categoryGrid");
  const ffFlashDeals = useFlag("flashDeals");
  const ffProductGrid = useFlag("productGrid");
  const ffCarousels = useFlag("carousels");
  // Single responsive homepage for every device — no capability detection,
  // no homepage swapping. These constants keep the (now always-on) premium
  // path live; the dead branches that referenced GPU safe mode tree-shake away.
  const { products, loading: productsLoading } = useVisibleProducts();
  const { map: badgeAssignments, loading: badgesLoading } = useBadgeCatalog();
  const { categories: publicCategories } = useCategories();
  const { sections } = useHomepageSections();

  const { canEdit: isProductAdmin } = useProductAdminEditing();
  const { categories: adminCategories } = useAdminCategories(isProductAdmin);
  // Admins see every category (incl. hidden) so they can toggle visibility inline.
  const categories = isProductAdmin ? adminCategories : publicCategories;
  const [editCats, setEditCats] = useState(false);

  const nav = useNavigate();
  const { formatProduct } = useRegion();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const rotatingPlaceholder = useRotatingPlaceholder(!searchFocused && !query);

  // Debounced query drives the live product results (150–250ms per spec).
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const goSearch = (q: string) => {
    setSearching(true);
    nav({ to: "/search", search: { q } });
  };

  const goProduct = (slug: string) => {
    setSearching(true);
    nav({ to: "/products/$slug", params: { slug } });
  };


  // Real, backend-driven product matches only — ranked by relevance.
  const productMatches = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    if (!q) return [] as typeof products;
    const terms = q.split(/\s+/).filter(Boolean);
    const scored = products
      .filter((p) => !p.hideFromSearch && p.inStock !== false)
      .map((p) => {
        const name = p.name.toLowerCase();
        const hay = `${name} ${p.brand ?? ""} ${p.category} ${p.tagline ?? ""}`.toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (!hay.includes(t)) return { p, score: -1 };
          if (name.startsWith(t)) score += 4;
          else if (name.includes(t)) score += 3;
          else score += 1;
        }
        return { p, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.p);
    return scored;
  }, [debouncedQuery, products]);

  // Loading = user typed but the debounced query hasn't caught up yet.
  const searchPending = query.trim() !== "" && query.trim() !== debouncedQuery;



  const categoryCounts = useMemo(
    () => products.reduce<Record<string, number>>((acc, p) => {
      acc[p.category] = (acc[p.category] ?? 0) + 1;
      return acc;
    }, {}),
    [products]
  );

  const rotationNonce = useRotationNonce();
  const rules = useHomepageCollectionRules();
  // Rotation window ticks every N minutes so the homepage picks up the next
  // page of eligible products without a hard reload.
  const [rotationNow, setRotationNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setRotationNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const curatedProductsLoading = productsLoading || badgesLoading;

  // Homepage rail preview shows the first `HOMEPAGE_PREVIEW` items from the
  // fair-rotation window; the full window (up to the admin's limit) is served
  // by the "View All" collection page.
  const HOMEPAGE_PREVIEW = 8;

  const trending = useMemo(() => {
    const eligible = evaluatePromoEligibility(products, badgeAssignments, "trending", rotationNow).eligible;
    const preview = fairPagedSlice(
      eligible,
      rules.limits.trending,
      rotationNow,
      rules.rotationHours,
      rotationNonce,
      "trending",
    ).slice(0, HOMEPAGE_PREVIEW);
    return { preview, eligibleCount: eligible.length };
  }, [products, badgeAssignments, rules.limits.trending, rules.rotationHours, rotationNonce, rotationNow]);

  const newArrivals = useMemo(() => {
    const eligible = evaluatePromoEligibility(products, badgeAssignments, "new_arrivals", rotationNow)
      .eligible.slice()
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    const preview = fairPagedSlice(
      eligible,
      rules.limits.new_arrivals,
      rotationNow,
      rules.rotationHours,
      rotationNonce,
      "new_arrivals",
    ).slice(0, HOMEPAGE_PREVIEW);
    return { preview, eligibleCount: eligible.length };
  }, [products, badgeAssignments, rules.limits.new_arrivals, rules.rotationHours, rotationNonce, rotationNow]);

  const bestSellers = useMemo(() => {
    const eligible = evaluatePromoEligibility(products, badgeAssignments, "best_sellers", rotationNow).eligible;
    const preview = fairPagedSlice(
      eligible,
      rules.limits.best_sellers,
      rotationNow,
      rules.rotationHours,
      rotationNonce,
      "best_sellers",
    ).slice(0, HOMEPAGE_PREVIEW);
    return { preview, eligibleCount: eligible.length };
  }, [products, badgeAssignments, rules.limits.best_sellers, rules.rotationHours, rotationNonce, rotationNow]);

  const featured = useMemo(() => {
    const eligible = evaluatePromoEligibility(products, badgeAssignments, "featured", rotationNow).eligible;
    const preview = fairPagedSlice(
      eligible,
      rules.limits.featured,
      rotationNow,
      rules.rotationHours,
      rotationNonce,
      "featured",
    ).slice(0, HOMEPAGE_PREVIEW);
    return { preview, eligibleCount: eligible.length };
  }, [products, badgeAssignments, rules.limits.featured, rules.rotationHours, rotationNonce, rotationNow]);




  const categoryLimit = useCategoryLimit();
  const homeCategories = isProductAdmin
    ? categories.filter((c) => !c.parent_id)
    : categories.slice(0, categoryLimit);

  // Desktop hero uses a curated featured product image (see assets/hero-product).
  




  return (
    <>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} query={query} onQueryChange={setQuery} />

      {/* Hero v2 — cinematic, search-first, personalized greeting */}
      <HeroV2 onOpenSearch={() => setSearchOpen(true)} />

      {/* Trust strip v2 — single glass credibility row */}
      <TrustStripV2 />

      {/* Categories v2 — bento-style editorial discovery */}
      <CategoryBento
        categories={homeCategories}
        isAdmin={isProductAdmin}
        onEdit={() => setEditCats(true)}
      />
      {isProductAdmin && editCats && (
        <Suspense fallback={null}>
          <CategoryAdminSheet onClose={() => setEditCats(false)} onChanged={() => {}} productCounts={categoryCounts} />
        </Suspense>
      )}

      <CinematicDivider />


      {/* Flash Deals band */}
      {ffFlashDeals && (
        <LazyMount minHeight={360}>
          <FlashDealsBand />
        </LazyMount>
      )}




      {/* 4-6 · Trending / New Arrivals / Best Sellers — separate lazy rails */}
      {ffProductGrid && (curatedProductsLoading ? (
        <section className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
          <ProductSkeletonGrid count={4} />
        </section>
      ) : (
        <>
          <ProductSection
            sectionKey="trending"
            eyebrow={sections.trending.eyebrow}
            title={sections.trending.title}
            icon={Flame}
            products={trending.preview}
            eligibleCount={trending.eligibleCount}
            isAdmin={isProductAdmin}
            active={sections.trending.active}
            viewAllTo="/products/trending"
            prominent
            minHeight={320}
            limit={4}
          />
              <ProductSection
                sectionKey="new_arrivals"
                eyebrow={sections.new_arrivals.eyebrow}
                title={sections.new_arrivals.title}
                icon={Sparkles}
                products={newArrivals.preview}
                eligibleCount={newArrivals.eligibleCount}
                isAdmin={isProductAdmin}
                active={sections.new_arrivals.active}
                viewAllTo="/products/new-arrivals"
              />
              <ProductSection
                sectionKey="best_sellers"
                eyebrow={sections.best_sellers.eyebrow}
                title={sections.best_sellers.title}
                icon={Award}
                products={bestSellers.preview}
                eligibleCount={bestSellers.eligibleCount}
                isAdmin={isProductAdmin}
                active={sections.best_sellers.active}
                viewAllTo="/products/best-sellers"
              />
        </>
      ))}

      <CinematicDivider />

      {/* Why FoundOurMarket — premium benefit cards */}
      <WhyFoundOurMarket />


    </>
  );
}
