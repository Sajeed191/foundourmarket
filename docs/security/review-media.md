# Review Media Storage — Accepted Risk & Migration Path

Status: **accepted risk, intentional** (re-affirmed Security Hardening v1.1)

Scanner finding: `review_media_bucket_public_accepted` (warn).

## Current state (Phase 1)

The `review-media` storage bucket is **public**.

- **Writes** are gated by the `auth.uid()/...` folder convention plus storage
  policies — a user can only write into their own folder.
- **Reads** are open: anyone holding an object URL can fetch it.

## Why this is accepted

Review photos are *intended* to be publicly visible — they render on public
product detail pages to anonymous shoppers. A public bucket is the correct
performance profile: images are CDN-cacheable, work in `<img>` tags, and need
no per-request signing round-trip.

The folder convention is a **write** boundary, not a read boundary, and is not
relied on for confidentiality.

### Residual risk

A review that is rejected by moderation or deleted keeps a reachable image URL
until the underlying object is removed. Exposure is limited to a photo the user
themselves published to a public product page.

**Do not flip this bucket to private as a scanner fix.** Doing so breaks every
review image across the storefront immediately.

## Migration path

| Phase | State | Work required |
| --- | --- | --- |
| **1 — current** | Public bucket, folder-scoped writes | none |
| **2 — optional signed URLs** | Bucket stays public. A server function issues time-limited signed URLs; the review renderer reads from a single accessor so the source can be swapped per-surface. | introduce a `getReviewMediaUrl()` accessor and route all render paths through it |
| **3 — private bucket** | Bucket flipped private; all reads signed. Requires SSR/edge URL signing with a cache layer to preserve LCP on PDP. | only after Phase 2 has run in production with no regressions |

Phase 2 and 3 are **not implemented**. This document is the plan of record.

## Orphan media cleanup

Permanent review deletion already removes media through the Storage API
**before** the database RPC runs (`src/lib/review-delete.ts`), so hard-deleted
reviews do not leave orphaned objects behind. That ordering is deliberate: if
storage removal fails, the row survives and the delete can be retried, rather
than the row vanishing and the image lingering forever.

No new storage architecture is required for this finding.
