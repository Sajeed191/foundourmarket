---
name: Real Data Only policy
description: Platform-wide rule — never fabricate metrics (support ETAs, agent counts, queue length, analytics); show honest unavailable states instead
type: constraint
---
Every user-facing or admin-facing metric must come from real backend data.

Forbidden anywhere in the product:
- Random or time-derived fake ETAs, wait times, reply times
- Fabricated online-agent counts, queue lengths, support load
- Estimated visitor counts, simulated sessions, seeded demo analytics
- Placeholder numbers presented as real (including `0` as a stand-in for "unknown")

**How to apply:** when a value has no evidence, return `null` from the data
layer and render an explicit empty state — "Currently unavailable",
"No data available", or a specific sentence such as "Average response time will
appear once sufficient support history is available."

Reference implementations: Payments Center, Traffic Intelligence v10/v11,
`support_service_facts()` + `src/lib/support-facts.ts` (Seller Assistance v2.0).

Simulators (what-if revenue / flash deal sandboxes) are exempt but must be
labelled as simulations and must never write data.
