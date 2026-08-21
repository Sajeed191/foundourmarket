/**
 * Zero-Trust v8.0 security regression suite.
 * Run with:  bun run src/lib/security/zero-trust-v8.test.ts
 *
 * Adversarial tests: they call the live Data API exactly as an anonymous
 * attacker would (no session, raw REST) and assert that private data never
 * reaches the response. Network tests self-skip when the backend is
 * unreachable so offline runs do not produce false failures.
 *
 * Covers:
 *   • SSRF guard on server-side image fetching
 *   • anon cannot read customer PII / internal tables
 *   • public catalog + search response allow-lists (no cost/admin fields)
 *   • Product Q&A never leaks account identifiers
 *   • identity enumeration blocked
 *   • privileged RPCs reject anon
 *   • private storage buckets reject anon
 */
import { assertSafeImageUrl } from "./safe-fetch.server";

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

async function anonSelect(table: string, query = "select=*&limit=1") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers });
  return { status: res.status, body: await res.text() };
}
async function anonRpc(fn: string, args: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.text() };
}

/* ── 1. SSRF guard (pure, always runs) ─────────────────────────────────── */
console.log("\nSSRF guard");
for (const url of [
  "http://169.254.169.254/latest/meta-data/",
  "http://127.0.0.1:8080/admin",
  "http://localhost/",
  "http://10.0.0.5/img.png",
  "http://192.168.1.1/img.png",
  "http://172.16.0.9/img.png",
  "http://[::1]/img.png",
  "http://2130706433/img.png",
  "file:///etc/passwd",
  "gopher://evil.test/",
  "https://user:pass@images.unsplash.com/x.jpg",
  "https://evil.example.com/x.jpg",
  "not a url",
]) {
  assert(!assertSafeImageUrl(url).ok, `blocks ${url}`);
}
assert(assertSafeImageUrl("https://images.unsplash.com/photo-1.jpg").ok, "allows trusted media host");

const online = await (async () => {
  if (!SUPABASE_URL || !ANON) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers });
    return r.status < 500;
  } catch {
    return false;
  }
})();

if (!online) {
  console.log("\nBackend unreachable — live attack tests skipped.");
  console.log(failed === 0 ? "\nAll assertions passed." : `\n${failed} assertion(s) failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

/* ── 2. anon cannot read customer PII / internal tables ────────────────── */
console.log("\nAnonymous reads on private tables");
for (const t of [
  "profiles",
  "orders",
  "order_items",
  "payments",
  "addresses",
  "support_tickets",
  "support_messages",
  "refund_bank_details",
  "user_roles",
  "payment_methods",
  "notifications",
  "email_logs",
  "fraud_alerts",
  "admin_activity_logs",
]) {
  const { status, body } = await anonSelect(t);
  assert(status >= 400 || body.trim() === "[]", `${t} returns no rows to anon`);
}

/* ── 3. public catalog response allow-list ─────────────────────────────── */
console.log("\nPublic catalog allow-list");
const FORBIDDEN = [
  "cost",
  "cost_price",
  "cost_price_inr",
  "cost_price_usd",
  "admin_notes",
  "internal_notes",
  "supplier",
  "vendor_cost",
  "warehouse_location",
  "margin",
];
{
  const { body } = await anonSelect("products_public", "select=*&limit=5");
  const rows = JSON.parse(body) as Array<Record<string, unknown>>;
  const leaked = FORBIDDEN.filter((f) => rows.some((r) => f in r));
  assert(leaked.length === 0, `products_public omits internal fields (${leaked.join(",") || "none"})`);
}
{
  const { body } = await anonRpc("search_products", { q: "a", page_limit: 5, page_offset: 0 });
  assert(!FORBIDDEN.some((f) => body.includes(`"${f}"`)), "search_products omits internal fields");
  assert(
    !body.includes('"status":"draft"') && !body.includes('"status":"hidden"'),
    "search_products excludes hidden/draft products",
  );
}
{
  const { body } = await anonRpc("trending_products", { page_limit: 5 });
  assert(!FORBIDDEN.some((f) => body.includes(`"${f}"`)), "trending_products omits internal fields");
}

/* ── 4. Product Q&A allow-list ─────────────────────────────────────────── */
console.log("\nProduct Q&A");
{
  const { body } = await anonRpc("get_product_qa", { _slug: "any-slug" });
  assert(!body.includes('"user_id"'), "get_product_qa never returns account identifiers");
}

/* ── 5. Identity enumeration ───────────────────────────────────────────── */
console.log("\nIdentity enumeration");
{
  const { status, body } = await anonRpc("get_public_profiles", {
    _ids: ["00000000-0000-0000-0000-000000000000"],
  });
  assert(status >= 400 || body.trim() === "[]", "get_public_profiles reveals nothing to anon");
}

/* ── 6. Privileged RPCs reject anon ────────────────────────────────────── */
console.log("\nPrivileged RPCs");
for (const [fn, args] of [
  ["manage_user_role", { _user_id: "00000000-0000-0000-0000-000000000000", _role: "admin", _action: "grant" }],
  ["svc_admin_order_detail", { _order_id: "00000000-0000-0000-0000-000000000000" }],
] as Array<[string, unknown]>) {
  const { status } = await anonRpc(fn, args);
  assert(status >= 400, `${fn} rejects anon`);
}

/* ── 7. Private storage buckets ────────────────────────────────────────── */
console.log("\nPrivate storage");
for (const bucket of ["return-photos", "support-attachments"]) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${bucket}/probe.jpg`, { headers });
  assert(res.status >= 400, `${bucket} denies anonymous object reads`);
}

console.log(failed === 0 ? "\nAll assertions passed." : `\n${failed} assertion(s) failed.`);
if (failed > 0) process.exit(1);
