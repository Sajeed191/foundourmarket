# Premium UI System v4.0 — Unification Plan

The website already spans ~40 customer-facing routes and hundreds of components. Rewriting each page will break behavior and take many turns. Instead, v4.0 consolidates the design language at the **token + shared-primitive layer**, so every existing page inherits the upgrade automatically.

Zero changes to functionality, business logic, DB, auth, checkout, payments, orders, SEO, or routing.

---

## Scope (what I will change)

### 1. Design tokens — `src/styles.css`

Lock the canonical palette (already applied in v3.0, will verify + tighten):

- `--background #050608`, `--secondary #0D1015`, `--card #12151C`, `--popover #181C24`
- `--foreground #FFFFFF`, `--muted-foreground #B9BEC8`
- `--primary`/`--accent` `#FF8A2A` (CTA + focus only)
- `--border rgba(255,255,255,.08)`, `--input rgba(255,255,255,.10)`
- Card radius standard: `--radius: 24px` (raise from current default), inputs `18px`
- Remove residual orange from ambient tokens (`--gradient-mesh`, `--gradient-border`, `--shadow-glow`) if any remain.

Add semantic **chip tokens** so chips share one system:

```
--chip-neutral-bg, --chip-neutral-fg
--chip-selected-bg (accent), --chip-selected-fg
--chip-success-bg (emerald), --chip-warning-bg (amber), --chip-error-bg (red), --chip-info-bg (blue)
```

### 2. Shared primitives (single source of truth)

Refit — not replace — the primitives every page already uses:

- `src/components/ui/button.tsx` — collapse variants to **primary / secondary / ghost / destructive**. Alias legacy variant names (`hero`, `ember`, `glass`, `outline`, `neon`, `luxury`, etc.) to one of the three so nothing breaks at the call site. Standard heights 46–48px, radius 16px, no icon requirement.
- `src/components/ui/card.tsx` — unified 24px radius, hairline border, `--shadow-soft`, consistent padding scale.
- `src/components/ui/input.tsx` + `textarea.tsx` + `select.tsx` — 18px radius, neutral border, orange focus border only (no glow, no scale).
- `src/components/ui/dialog.tsx` / `sheet.tsx` — shared modal shell: 24px desktop / 28px top-radius bottom-sheet on mobile, safe-area padding, ESC + body-scroll lock, 44px close target, 180–200ms fade+scale.
- `src/components/ui/badge.tsx` — collapse to the 5-chip system above.

### 3. Product card unification

`src/components/site/ProductCard.tsx` is already the shared foundation used by carousels, categories, wishlist, recently viewed, similar products, search. I'll verify all rails import it (not local copies) and align spacing/typography, but keep layout intact.

### 4. Consistency audit sweep

After the primitives ship, run one pass to:

- Replace stray inline button/card/chip styles with the primitives in high-traffic surfaces (nav header, footer, empty states, loading skeletons, error boundaries).
- Delete now-dead per-page overrides that fight the tokens.

### 5. Verification

- `bunx tsgo --noEmit` after each batch.
- Spot-check Home, Browse, PDP, Cart, Checkout, Wishlist, Account, Auth, Support in preview.

---

## Out of scope (this pass)

- Rewriting page layouts, hero compositions, or feature-specific components (PDP Similar Products, Reviews, Q&A, Compare are already frozen at v-latest per prior approvals).
- Removing decorative icons page-by-page (icons on buttons like Ask Question / Edit / Save are already removed in recent Q&A + Review passes; remaining ones will be swept opportunistically in step 4, not exhaustively).
- Motion library changes.

---

## Rollout

Single response, batched:

```text
1. styles.css        → verify tokens, add chip tokens, standardize radii
2. button.tsx        → variant collapse + legacy aliases
3. card.tsx          → 24px radius + hairline
4. input/textarea/select → 18px radius, quiet focus
5. dialog/sheet.tsx  → shared modal shell parity with QuestionModalShell
6. badge.tsx         → 5-chip system
7. Sweep header/footer/empty-state overrides
8. Typecheck
```

## Technical notes

- Legacy button variants stay callable via string aliasing so no component consuming `<Button variant="hero" />` breaks.
- Radix primitives (Dialog, Popover, Dropdown) keep ARIA + focus trap; only visual shell changes.
- Tailwind v4: all utilities via tokens (`bg-card`, `border-border`, `text-muted-foreground`) — no hardcoded hex in components.
- Product page scope (`[data-product-page]`) keeps its own token block; values align with global palette so PDP and rest of site read identically.

Reply "approved" and I'll ship the batch.

&nbsp;

**Approved**, with two recommendations before you ship.

### 1. Do **not** alias every legacy button variant forever

Instead of keeping aliases permanently, mark them as deprecated.

Recommended mapping:

- `hero` → `primary`
- `ember` → `primary`
- `luxury` → `primary`
- `outline` → `secondary`
- `glass` → `secondary`
- `neon` → `secondary`

Log a development warning (development builds only) so you can gradually migrate components. This avoids carrying unnecessary technical debt indefinitely.

### 2. Add design tokens for spacing and motion

Since you're already standardizing colors and primitives, also standardize spacing and animations.

Add tokens similar to:

- Border radius:
  - Card: 24px
  - Input: 18px
  - Button: 16px
  - Chip: 9999px
- Spacing:
  - xs
  - sm
  - md
  - lg
  - xl
- Animation:
  - Fast: 120ms
  - Normal: 180ms
  - Slow: 240ms

This prevents different components from inventing their own values over time.

---

## One additional audit I'd include

After step 8, perform a **UI consistency audit** that checks:

- Every primary button has identical height, radius, typography, and padding.
- Every card uses the same border radius and border color.
- Every input has identical focus behavior.
- Every badge uses one of the five semantic chip styles.
- Every modal uses the shared shell.
- Every empty state follows the same layout.
- No customer-facing page contains hardcoded colors that bypass the design tokens.
- No component introduces its own shadows, gradients, or spacing unless there's a documented exception.

---

## Recommendation

This is the right time to establish these shared primitives. Once they're in place, future work—such as new features, new pages, or redesigns—will inherit the premium design automatically instead of requiring page-by-page styling.

I would proceed with this implementation.