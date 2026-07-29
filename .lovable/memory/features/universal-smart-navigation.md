---
name: Universal Smart Navigation v1.0
description: Admin-wide deep-linking contract — every warning/recommendation resolves to exact page, tab, section, field, with return trip and multi-issue nav
type: feature
---

Navigation/UX layer only. Never touches DB, schema, AI engines, intelligence, validation, save logic or business rules.

Modules (`src/lib/smart-navigation.ts`, `src/components/admin/SmartFixLink.tsx`,
`src/lib/use-smart-focus.ts`, `src/lib/use-issue-nav.ts`, `src/lib/editor-deeplink.ts`,
`src/lib/use-editor-deeplink.ts`, `src/lib/editor-focus.ts`).

Rules:
- Any admin surface that shows a warning/recommendation/insight renders `<SmartFixLink issue={{ entity, entityId, module, action, text }} origin="<screen-id>" />`. New modules get deep-linking for free by emitting that shape — no per-module routing code.
- `resolveSmartTarget` maps: product → product editor tab/section (via resolveEditorTarget); vendor/order/customer/campaign/flash_deal/duplicate/inventory/category/seo/image/email → their admin pages. Never a generic page.
- Link search params: `focus` (target key), `dl` (label), `from` (origin id), `eid` (entity id).
- Destination pages mark targets with `data-editor-field` (product editor) or `data-smart-target` (all other admin pages) and call `useSmartFocus()`; arrival auto-expands ancestors/`<details>`/`[data-smart-expand]`, smooth-scrolls, orange glow, focuses first empty input.
- Return trip: `rememberOrigin()` stores path + scroll + search + UI state; after save the destination returns and restores it with a success toast.
- Multi-issue: pass `siblings` + `index` to SmartFixLink → destination shows "N of M recommendations" with Previous/Next (`useIssueNav`).
