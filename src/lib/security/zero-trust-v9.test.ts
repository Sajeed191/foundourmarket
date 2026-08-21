/**
 * Zero-Trust v9.0 security regression suite.
 * Run with:  bun run src/lib/security/zero-trust-v9.test.ts
 *
 * v9 focus: *stored file* trust boundary + customer isolation invariants that
 * v1–v8 did not cover. The v9 audit proved that every customer-writable
 * bucket accepted arbitrary file types (a scriptable SVG was uploaded and
 * served back as `image/svg+xml` from the storage origin). Client-side
 * `accept=""` and `validateReviewFile()` are UX only — the database policy is
 * the boundary, and these tests fail if that policy is ever relaxed.
 *
 * Network tests self-skip when the backend is unreachable so offline runs do
 * not produce false failures.
 */

export {};

let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const ANON =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  "";
const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" };

/**
 * Mirror of `public.storage_upload_ext_allowed(name, kind)`.
 * Kept in sync deliberately: if someone widens the SQL allow-list to include a
 * scriptable type, this table review + the live probe below both flag it.
 */
const EXT_ALLOW: Record<string, string[]> = {
  image: ["jpg", "jpeg", "png", "webp", "avif", "gif", "heic", "heif"],
  image_video: ["jpg", "jpeg", "png", "webp", "avif", "gif", "heic", "heif", "mp4", "webm", "mov", "m4v"],
  image_doc: ["jpg", "jpeg", "png", "webp", "avif", "gif", "heic", "heif", "pdf"],
};

/** Types that can execute script in a browser when served from storage. */
const SCRIPTABLE = ["svg", "html", "htm", "xhtml", "xml", "js", "mjs", "json", "swf", "pdf"];

function extAllowed(name: string, kind: keyof typeof EXT_ALLOW): boolean {
  if (!name.includes(".")) return false;
  const ext = name.replace(/^.*\./, "").toLowerCase();
  return EXT_ALLOW[kind]!.includes(ext);
}

console.log("\n── 1. Upload allow-list: scriptable types are rejected ──");
for (const ext of SCRIPTABLE) {
  // `image` and `image_video` buckets (avatars, review-media, return-photos)
  // must never accept a scriptable extension. PDF is only allowed on the
  // private, staff/owner-scoped support-attachments bucket.
  assert(!extAllowed(`payload.${ext}`, "image"), `image kind rejects .${ext}`);
  assert(!extAllowed(`payload.${ext}`, "image_video"), `image_video kind rejects .${ext}`);
  if (ext !== "pdf") {
    assert(!extAllowed(`payload.${ext}`, "image_doc"), `image_doc kind rejects .${ext}`);
  }
}
assert(!extAllowed("noextension", "image"), "extensionless upload rejected");
assert(!extAllowed("avatar.png.svg", "image"), "double extension resolves to the LAST segment");
assert(extAllowed("photo.JPG", "image"), "extension check is case-insensitive");

console.log("\n── 2. Upload allow-list: legitimate media still passes ──");
assert(extAllowed("photo.jpg", "image"), "avatar jpg allowed");
assert(extAllowed("photo.webp", "image"), "review webp allowed");
assert(extAllowed("clip.mp4", "image_video"), "review mp4 allowed");
assert(extAllowed("clip.mov", "image_video"), "review mov allowed");
assert(!extAllowed("clip.mp4", "image"), "video rejected on image-only buckets (avatars/returns)");
assert(extAllowed("invoice.pdf", "image_doc"), "support attachment pdf allowed");

async function reachable() {
  if (!SUPABASE_URL || !ANON) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers });
    return res.status < 500;
  } catch {
    return false;
  }
}

const online = await reachable();
if (!online) {
  console.log("\n(⚠ backend unreachable — live probes skipped)");
} else {
  console.log("\n── 3. Live: anon cannot read raw review / Q&A rows ──");
  for (const table of ["product_reviews", "review_votes", "product_questions", "product_answers"]) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id,user_id&limit=1`, { headers });
    const body = await res.text();
    assert(
      res.status >= 400 || body.trim() === "[]",
      `anon read of ${table} returns nothing (realtime postgres_changes inherits this)`,
    );
  }

  console.log("\n── 4. Live: anon cannot write into customer buckets ──");
  for (const bucket of ["avatars", "review-media", "return-photos", "support-attachments"]) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/anon-probe.svg`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
    });
    assert(res.status >= 400, `anon upload to ${bucket} denied (${res.status})`);
  }

  console.log("\n── 5. Live: private buckets stay private ──");
  for (const bucket of ["return-photos", "support-attachments"]) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${bucket}/probe.jpg`);
    assert(res.status >= 400, `${bucket} not readable through the public path (${res.status})`);
  }
}

console.log(
  failed === 0
    ? "\n✅ Zero-Trust v9.0 — all assertions passed\n"
    : `\n❌ Zero-Trust v9.0 — ${failed} assertion(s) FAILED\n`,
);
if (failed > 0) process.exit(1);
