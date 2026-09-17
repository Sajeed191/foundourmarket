# Prevent aborted requests from blanking the storefront

## What will change
- Treat a closed browser connection (`ECONNRESET` / `Error: aborted`) as a cancelled request instead of an application crash.
- Keep the existing branded recovery page for genuine server failures.
- Leave the already-correct mobile display helper unchanged; its reported TS2686 message is stale.

## Verification
- Confirm the storefront loads and renders content in a fresh browser session.
- Confirm no browser-side runtime errors occur.
- Run the focused TypeScript check and formatting/diff validation.

## Technical details
The request middleware currently converts every unrecognized thrown error into an HTTP 500 page. It will identify request-abort errors by their name, message, cause, and `ECONNRESET` code, then return a non-error cancellation response when possible. This prevents an interrupted preview refresh from becoming a blank-screen failure while preserving normal error handling.
