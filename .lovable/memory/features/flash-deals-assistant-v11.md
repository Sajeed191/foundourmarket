---
name: Flash Deals Assistant v11
description: Flash Deals admin v11 autonomous operations layer — daily brief, AI task inbox, health audit, next best action, workspace modes, focus mode, decision history, team notes
type: feature
---

Flash Deals Admin v11.0 is an assistant layer over the frozen Flash Deals engine.
Presentation and workflow only — it never changes database, RLS, rotation,
countdown, pricing, analytics or existing mutations.

- `src/lib/flash/flash-assistant.ts` — pure derivations: `dailyBrief`,
  `taskCategory` / `taskDiff` (Current → Suggested → Expected), `healthAudit`,
  `nextBestAction`, `suggestedReminders`, `parseSearchIntent` / `applyIntent`,
  `sectionVisible` (workspace modes + focus).
- `src/lib/flash/use-flash-workspace.ts` — localStorage only: mode, focus,
  brief dismissal per day, task snooze/ignore, reminder state, decision
  history, team notes.
- One task inbox is the single home for recommendations. The v10 Auto Pilot
  panel was replaced by it; do not reintroduce a second recommendation list.
- Rules that must hold: no new KPI cards, no new analytics pages, no UI
  redesign. Every approval routes through the existing deal mutations, and
  admins approve — the system never applies changes on its own.
- Workspace modes: Operations, Marketing, Analytics, Executive. Focus mode
  shows only brief, next best action, inbox, audit, alerts, active deals and
  the homepage preview.
