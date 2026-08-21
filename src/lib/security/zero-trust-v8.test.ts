/**
 * Zero-Trust v8.0 security regression suite.
 *
 * These tests are deliberately adversarial: they call the live Data API as an
 * anonymous attacker would (no session, raw REST) and assert that private data
 * never reaches the response. If a future change re-opens a leak, these fail.
 *
 * Network-dependent tests are skipped automatically when the backend is
 * unreachable so local/offline runs do not produce false failures.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { assertSafeImageUrl } from "./safe-fetch.server";

const SUPABASE_URL =
  process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"] ?? "";
const ANON =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["VITE_SUPABASE_ANON_KEY"] ??
  "";

const headers = {
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
  "Content-Type": "application/json",
};

let online = false;
beforeAll(async () => {
  if (!SUPABASE_URL || !ANON) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers });
    online = res.status < 500;
  } catch {
    online = false;
  }
});

async function anonSelect(table: string, query = "select=*&limit=1") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers });
  const body = await res.text();
  return { status: res.status, body };
}

async function anonRpc(fn: string, args: unknown) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.text() };
}

// ── 1. SSRF guard (pure, always runs) ────────────────────────────────────────
describe("SSRF guard: assertSafeImageUrl", () => {
  const blocked = [
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
  ];
  for (const url of blocked) {
    it(`rejects ${url}`, () => {
      expect(assertSafeImageUrl(url).ok).toBe(false);
    });
  }

  it("allows trusted media hosts", () => {
    expect(assertSafeImageUrl("https://images.unsplash.com/photo-1.jpg").ok).toBe(true);
  });
});

// ── 2. Anonymous users cannot read customer PII ──────────────────────────────
describe("anon cannot read customer or internal tables", () => {
  const tables = [
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
  ];
  for (const t of tables) {
    it(`${t} returns no rows to anon`, async () => {
      if (!online) return;
      const { status, body } = await anonSelect(t);
      // Either denied outright, or RLS filters every row.
      if (status === 200) expect(body.trim()).toBe("[]");
      else expect(status).toBeGreaterThanOrEqual(400);
    });
  }
});

// ── 3. Public catalog must not expose internal commercial fields ─────────────
describe("public catalog response allow-list", () => {
  const forbidden = [
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

  it("products_public omits internal fields", async () => {
    if (!online) return;
    const { status, body } = await anonSelect("products_public", "select=*&limit=5");
    expect(status).toBe(200);
    const rows = JSON.parse(body) as Array<Record<string, unknown>>;
    for (const row of rows) {
      for (const f of forbidden) expect(Object.keys(row)).not.toContain(f);
    }
  });

  it("search_products omits internal fields and hidden products", async () => {
    if (!online) return;
    const { body } = await anonRpc("search_products", {
      q: "a",
      page_limit: 5,
      page_offset: 0,
    });
    for (const f of forbidden) expect(body).not.toContain(`"${f}"`);
    expect(body).not.toContain('"status":"draft"');
    expect(body).not.toContain('"status":"hidden"');
  });

  it("trending_products omits internal fields", async () => {
    if (!online) return;
    const { body } = await anonRpc("trending_products", { page_limit: 5 });
    for (const f of forbidden) expect(body).not.toContain(`"${f}"`);
  });
});

// ── 4. Product Q&A must not leak account identifiers ─────────────────────────
describe("product Q&A response allow-list", () => {
  it("get_product_qa never returns user_id", async () => {
    if (!online) return;
    const { body } = await anonRpc("get_product_qa", { _slug: "any-slug" });
    expect(body).not.toContain('"user_id"');
  });
});

// ── 5. Identity enumeration is blocked ───────────────────────────────────────
describe("identity enumeration", () => {
  it("get_public_profiles does not return profiles to anon", async () => {
    if (!online) return;
    const { status, body } = await anonRpc("get_public_profiles", {
      _ids: ["00000000-0000-0000-0000-000000000000"],
    });
    if (status === 200) expect(body.trim()).toBe("[]");
    else expect(status).toBeGreaterThanOrEqual(400);
  });
});

// ── 6. Admin / privileged RPCs reject anonymous callers ──────────────────────
describe("privileged RPCs reject anon", () => {
  const rpcs: Array<[string, unknown]> = [
    ["manage_user_role", { _user_id: "00000000-0000-0000-0000-000000000000", _role: "admin", _action: "grant" }],
    ["svc_admin_order_detail", { _order_id: "00000000-0000-0000-0000-000000000000" }],
  ];
  for (const [fn, args] of rpcs) {
    it(`${fn} is not callable by anon`, async () => {
      if (!online) return;
      const { status } = await anonRpc(fn, args);
      expect(status).toBeGreaterThanOrEqual(400);
    });
  }
});

// ── 7. Private storage buckets reject anonymous reads ────────────────────────
describe("private storage buckets", () => {
  for (const bucket of ["return-photos", "support-attachments"]) {
    it(`${bucket} denies anonymous object reads`, async () => {
      if (!online) return;
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${bucket}/probe.jpg`, {
        headers,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  }
});
