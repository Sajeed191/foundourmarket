# FoundOurMarket™ Homepage v2.0 — Premium First Impressions

## Goal
Redesign the homepage into a premium, personalized marketplace landing experience that converts better and feels flagship-quality on every device. All work composes existing frozen contracts (Badge System v3, Browse Presentation Adapter, Catalog Intelligence, Product Card) — no new backend scoring or intelligence modules.

## What we will build

### 1. Hero v2 — Cinematic, Search-First
- Full-bleed ambient hero with layered depth, subtle motion, and the existing warm orange glow.
- Larger, editorial typography with staggered reveal.
- Search trigger remains the primary CTA, but with richer placeholder rotation and instant visual feedback.
- Add a personalized greeting for signed-in users ("Welcome back, [name]") without blocking the anonymous experience.
- Preserve the "Shop Now" and "Browse Categories" actions, but refine their hierarchy and tap targets.

### 2. Trust & Value Proposition Strip
- Keep the compact trust strip, but redesign it as a single glass pill row with animated entrance.
- Emphasize: global delivery, buyer protection, curated quality, fast support.

### 3. Personalized "Picked For You" Rail
- Add a new homepage section that shows products based on the user's recent views, wishlist, and category affinity.
- Uses existing `useRecentlyViewed`, wishlist, and product data — no new recommendation engine.
- Anonymous users see "Trending Now" instead.
- Section is optional and non-blocking per the Customer Experience rule.

### 4. Category Discovery v2
- Redesign the category grid into a premium bento-style layout: hero category tiles with image-first cards, subtle hover lift, and consistent iconography.
- Mobile: 2-column with larger touch targets.
- Admin visibility toggles preserved.

### 5. Merchandising Sections v2
- Refactor Trending / New Arrivals / Best Sellers / Featured into a consistent, editorial section system using `PremiumSectionHeading`.
- Each section gets:
  - cleaner "View All" CTA,
  - consistent 2×2 mobile / 4-column desktop grid,
  - elegant empty states.
- Add a "Flash Deals" hero band with countdown-style urgency (visual only, no new timer backend).

### 6. Social Proof & Editorial Band
- Elevate testimonials into a premium editorial band with large quote typography and merchant/brand logos.
- Add a "Why FoundOurMarket" mini-story section with 3 premium benefit cards.

### 7. Mobile-First Performance & Accessibility
- Lazy-load all below-the-fold sections.
- Ensure 44×44 tap targets, focus order, screen-reader labels, and reduced-motion support.
- Keep initial bundle light; no new heavy dependencies.

## Out of scope
- New recommendation/intelligence backend contracts.
- New badge types or scoring rules.
- New product card architecture (uses existing `ProductCard`).
- New CMS/schema changes beyond existing homepage sections.

## Files we will touch
- `src/routes/index.tsx` — hero, sections, layout.
- `src/components/site/PremiumSectionHeading.tsx` — heading refinements if needed.
- `src/components/site/ProductCard.tsx` — only if visual consistency fixes are required.
- New components under `src/components/site/homepage/`:
  - `HeroV2.tsx`
  - `TrustStripV2.tsx`
  - `PickedForYouRail.tsx`
  - `CategoryBento.tsx`
  - `FlashDealsBand.tsx`
  - `WhyFoundOurMarket.tsx`

## Validation
- Screenshot homepage on mobile, tablet, and desktop.
- Confirm Lighthouse performance score does not regress.
- Confirm all existing admin toggles still work.
- Confirm anonymous and signed-in states both render correctly.

## Success criteria
- Homepage feels distinctly premium and uncluttered on first load.
- Personalized section adds relevance without being pushy.
- All existing functionality (search, categories, admin controls, section toggles) is preserved.
- Performance remains smooth with large product catalogs.
