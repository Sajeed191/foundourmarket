# Flash Deals Management System v4.0 — Enterprise Control Center

Extends the existing system only. No changes to `flash_deals`, `product_badges`, `useFlashDeals()`, the rotation engine, Site Rules, RLS, or any storefront contract.

## Where it lives

A new dedicated admin page under Merchandising, replacing the current `admin-flash-deals` CRUD screen (the old route keeps working and redirects into the new command center).

## Phase 1 — Foundation & Dashboard (Freeze 1)

- New route `admin-merchandising-flash-deals` with an AdminShell page shell and tabbed sections: Overview, Timeline, Deals, Rotation, Preview.
- Realtime dashboard cards: Active, Scheduled, Expired, Eligible Products, Avg Discount, Est. Revenue, Views, CTR, Purchases, Conversion.
- Reads from existing tables only (`flash_deals`, `flash_deal_events`, `product_badges`, `products`). Memoized aggregation, one subscription per table.
- Legacy route redirect.

## Phase 2 — Deal Creation & Discount Builder (Freeze 2)

- Smart Product Picker: instant client-side search over name / SKU / brand / category / vendor with thumbnail, price, stock, existing badges; blocks products that already hold a promotional badge (Single Promotional Badge policy).
- 4-step creation flow: Product → Discount → Time → Preview → Publish.
- Visual Discount Builder: slider + direct input showing regular price, flash price, savings, percentage, margin impact, with over-threshold warning.
- Campaign selector (Weekend Sale, Mega Sale, Festival Offer, Midnight Drop, etc.) driving the storefront campaign label already rendered by `FlashDealsBand`.

## Phase 3 — Live Preview & Hero Ordering (Freeze 3)

- Split-screen live preview rendering the real `FlashDealsBand` component at desktop, tablet and mobile widths — no duplicate renderer, no screenshots.
- Drag-and-drop hero ordering that writes to the existing `priority` column; pin / lock hero; randomize; unpinned items keep rotating fairly through the existing seeded engine.

## Phase 4 — Rotation Visualization & Controls (Freeze 4)

- Explain panel: current rotation, next rotation, previous rotation, rotation seed, window boundaries, manual nonce, plus a plain-language reason per product ("ranked 3rd after seeded rotation").
- Controls: Reshuffle Now, Preview Next Rotation, Reset Rotation, Lock/Unlock Hero, Restore Automatic Rotation — all bumping the existing nonce and writing to the existing audit log.

## Phase 5 — Timeline, Health, Insights & Warnings (Freeze 5)

- Calendar timeline grouped Today / Tomorrow / This Week / Upcoming / Expired, with drag to move and resize a deal window, conflict highlighting and priority badges.
- Deal Health Score per deal (stock, discount, time remaining, views, clicks, conversion, badge status, priority) with exactly one plain-language recommendation, following the project AI UX rule (traffic-light status, one-click action).
- Per-deal performance insights with trend chart from `flash_deal_events`.
- Visual warnings: expired, inactive, out of stock, badge missing, price conflict, priority conflict, hidden by rules.
- Recommendation shortlist built only from existing signals (selling fast, high stock, high margin, never featured, recently viewed, recently updated).

## Phase 6 — Bulk, Filters, Notifications, Audit, A11y (Freeze 6)

- Bulk actions: assign/remove badge, schedule/unschedule, discount, activate/deactivate, duplicate campaign, delete, export/import CSV.
- Smart filters: category, brand, vendor, campaign, discount %, stock, priority, status, badge, published/scheduled/expired.
- Admin notifications on expiry, low stock, empty homepage, conflicts, oversized discount — via the existing notification surface.
- Audit timeline (who/when/before/after/reason) with restore, using existing `flash_deal_audit_log` + admin activity logging.
- Keyboard shortcuts (search, undo, redo, publish, reshuffle), focus states, reduced-motion, screen-reader labels, 44px mobile targets, bottom sheets on mobile, virtualized deal list.

## Technical notes

- Automatic expiry behaviour (keep or drop badge on expiry) becomes an admin-configurable setting stored in existing settings/site-rules storage; no new business logic in the rotation engine.
- All writes go through existing tables and RLS; any new column (e.g. campaign label, hero lock, expiry policy) is added additively via migration and defaulted so current storefront behaviour is unchanged.
- Realtime subscriptions are scoped per tab and torn down on unmount.

Approve and I'll start with Phase 1.
