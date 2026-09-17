# Production Security Audit and Hardening

## Scope and safety
- Preserve the current storefront, themes, branding, catalog, checkout, Google sign-in, admin workflows, and SEO.
- Make only evidence-backed security changes; use non-destructive tests and never print secret values or customer data.
- Keep intentionally public catalog/configuration data public while narrowing write paths and private-data access.

## Verified hardening work
1. **Database boundaries**
   - Convert public-facing views to caller-permission execution so their source-table access rules remain effective.
   - Remove anonymous base-table access to customer profiles; retain the existing sanitized public-profile surface.
   - Pin the remaining email queue functions to an explicit safe schema path.
   - Replace unrestricted anonymous badge-event inserts with a narrowly validated event-recording function and minimal grants.
   - Re-audit all privileged functions and revoke callable access only where the function is not a trigger and has no legitimate client caller.

2. **Payments, webhooks, and public endpoints**
   - Preserve the trusted server-side pricing, stock, ownership, payment-signature, refund, and idempotency controls already working.
   - Add bounded request-size and abuse controls before unauthenticated webhook processing, without rejecting legitimate provider retries.
   - Stop storing or accepting raw recipient email addresses in tracking URLs; use opaque campaign/message identifiers.
   - Minimize saved-payment-method responses to display-safe fields only.
   - Keep all provider errors and internal failure details out of public responses and sensitive production logs.

3. **Authentication, URLs, and browser protections**
   - Preserve the production OAuth callback and PKCE flow; keep all post-login redirects constrained to internal paths.
   - Strengthen global headers with a tested, allowlisted Content Security Policy, HTTPS enforcement, frame controls, referrer policy, permissions policy, and no-sniff behavior.
   - Harden admin preview and external scheduling frames without breaking their required capabilities.
   - Remove unsafe popup/document-writing patterns where practical, or fully escape generated content and isolate the popup.

4. **Uploads and storage**
   - Add explicit size and MIME limits to buckets that currently inherit unrestricted settings.
   - Preserve public delivery for genuine storefront media while keeping support and return files private and owner/staff scoped.
   - Tighten inbound attachment filename/extension checks and reject malformed base64 or mismatched file signatures before storage.

5. **Dependencies and verification**
   - Apply compatible dependency updates/overrides for confirmed advisories; do not force risky major upgrades.
   - Run type checks, focused tests, dependency rescans, database lint/scans, and safe anonymous/customer authorization probes.
   - Verify production-facing pages, Google callback routing, cart/checkout initialization, and admin authorization still behave correctly.

## Final report
Provide the requested A–H report: fixed findings by severity, controls already working, manual provider/platform actions, test results, changed files/policies/configuration, and remaining limitations. The report will not claim complete security.
