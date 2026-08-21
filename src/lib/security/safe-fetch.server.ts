/**
 * SSRF guard for server-side URL fetching.
 *
 * Zero-Trust rule: any URL that originates from a request (even a staff-authored
 * one) is hostile input. Before the server fetches it we require:
 *  - http/https scheme only (blocks file:, gopher:, data:, ftp:, etc.)
 *  - no credentials in the URL
 *  - no literal private / loopback / link-local / metadata IP targets
 *  - hostname on the trusted media allow-list (project storage + known CDNs)
 *
 * Exported pure so it can be unit-tested without network access.
 */

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64/10
  /^198\.(1[89])\./,
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^203\.0\.113\./,
  /^22[4-9]\.|^2[3-5]\d\./, // multicast + reserved
];

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "metadata.google.internal") return true;
  // IPv6 loopback / unique-local / link-local
  if (h === "::1" || h === "::" || /^f[cd][0-9a-f]{2}:/i.test(h) || /^fe80:/i.test(h)) return true;
  // IPv4-mapped IPv6
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(h);
  const v4 = mapped ? mapped[1] : h;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) {
    if (PRIVATE_V4.some((re) => re.test(v4))) return true;
  }
  // Decimal / octal / hex encoded IPv4 (e.g. 2130706433, 0x7f000001)
  if (/^(0x[0-9a-f]+|\d{8,10})$/i.test(h)) return true;
  return false;
}

/** Hostnames the image pipeline is allowed to read bytes from. */
export function allowedImageHosts(): string[] {
  const hosts = new Set<string>([
    "images.unsplash.com",
    "cdn.shopify.com",
    "res.cloudinary.com",
    "foundourmarket.com",
    "www.foundourmarket.com",
    "foundourmarket.lovable.app",
  ]);
  const supa = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  if (supa) {
    try {
      hosts.add(new URL(supa).hostname);
    } catch {
      /* ignore malformed env */
    }
  }
  return [...hosts];
}

export type UrlGuardResult = { ok: true; url: URL } | { ok: false; reason: string };

export function assertSafeImageUrl(raw: string, extraHosts: string[] = []): UrlGuardResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "bad_scheme" };
  if (url.username || url.password) return { ok: false, reason: "credentials_in_url" };
  if (isPrivateHost(url.hostname)) return { ok: false, reason: "private_host" };

  const allow = [...allowedImageHosts(), ...extraHosts].map((h) => h.toLowerCase());
  const host = url.hostname.toLowerCase();
  const allowed = allow.some((h) => host === h || host.endsWith(`.${h}`));
  if (!allowed) return { ok: false, reason: "host_not_allowed" };

  return { ok: true, url };
}
