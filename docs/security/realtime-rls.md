# Realtime & RLS Security Posture — FoundOurMarket™

Audit date: 2026-07-31. Verified directly against the live database
(`pg_policies`). No policies were added, removed, or weakened in this pass.

## 1. `realtime.messages` policies

| Policy | Cmd | Role | Effect |
| --- | --- | --- | --- |
| `fom_realtime_select_anon` | SELECT | `anon` | 9 public storefront topic families |
| `fom_realtime_select` | SELECT | `authenticated` | owner-scoped + public + staff families, `ELSE false` |
| `fom_realtime_insert` | INSERT | `authenticated` | staff only, `live-%` / `activity-feed` only |

`anon` has **no** INSERT policy → anonymous clients can subscribe but never
broadcast. Every SELECT branch terminates in `ELSE false`, so any new topic is
denied by default until a branch is added deliberately.

### Anonymous allow-list (finding `realtime_anon_read_only_catalog_topics`)

`rt-products%`, `rt-banners-%`, `rt-cms-%`, `reviews:%`, `categories-live`,
`rt-testimonials`, `rt-announcements`, `rt-homepage-sections`,
`rt-storefront-blocks`.

All of these carry data already rendered on public pages. Not reachable by
`anon`: orders, payments, customers, vendors, inventory, costs, internal
analytics, financial data, admin events. Draft/unpublished rows are filtered by
the underlying tables' own RLS, so a broadcast cannot resurrect them.
`rt-flash-deals`, `store-settings-live` and `rt-badge-settings` are public in
nature but currently signed-in only — intentionally left as-is (tightening the
anon surface is never a regression, and widening it was not requested).

**Result: no change required.**

### Staff wildcards (finding `realtime_admin_wildcard_topics_broad`)

Staff families (`financial-%`, `fin-%`, `fraud-%`, `exec-%`, `cust-intel%`,
`traffic-%`, `orders-live`, `admin-%`, …) are gated by
`has_any_role(auth.uid(), ['admin','super_admin','manager'])`. Access is by
role, not by topic: a `manager` also receives finance and fraud streams. That
matches the platform's single staff trust tier, and no non-staff session can
reach any of it.

Replacing wildcards with per-topic authorization today would change production
behavior (dashboards would go dark for roles that legitimately use them), so it
is **intentionally left unchanged**. The backward-compatible upgrade path is
pre-declared in `src/lib/realtime/topic-scopes.ts`:

1. Persist grants in a `staff_topic_grants(user_id, scope)` table.
2. Add a `SECURITY DEFINER` `has_topic_scope(uid, scope)` helper.
3. Change staff branches to
   `has_topic_scope(auth.uid(), '<scope>') OR has_any_role(auth.uid(), ARRAY[...])`
   — the role check stays as fallback, so existing deployments behave
   identically until grants are populated.

Zero performance impact today: the scope map is inert TypeScript, imported by
nothing but its test.

## 2. `public.user_roles` (finding `user_roles_missing_select_scope`)

| Cmd | Policy | Expression |
| --- | --- | --- |
| SELECT | `read own roles` | `auth.uid() = user_id` |
| INSERT | `super_admin insert roles` | CHECK `has_role(auth.uid(),'super_admin')` |
| UPDATE | `super_admin update roles` | USING + CHECK `has_role(...,'super_admin')` |
| DELETE | `super_admin delete roles` | `has_role(...,'super_admin')` |

- Roles live in a dedicated table, never on `profiles`.
- `has_role` / `has_any_role` are `SECURITY DEFINER`, `STABLE`,
  `SET search_path = public` → no RLS recursion, no search-path hijack.
- No policy lets a user write a row for themselves → **no self-escalation path**.
- `anon` sees zero rows (`auth.uid()` is NULL).
- Role changes are audited via `manage_user_role` / `role_change_logs`.

**Result: informational only, no change required.**

## 3. Regression guards

`src/lib/realtime/topic-scopes.test.ts` — run with
`bun run src/lib/realtime/topic-scopes.test.ts`. Asserts the anon surface never
grows into a sensitive family, owner topics stay uid-bound, staff topics stay
staff-classified, unknown topics stay unclassified (mirroring `ELSE false`), and
records the `user_roles` policy contract.
