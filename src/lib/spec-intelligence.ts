// ============================================================
// Spec Intelligence — Product Editor 3.0
// Parses pasted specification text (Excel / Sheets / Alibaba /
// Amazon / Flipkart / PDF / CSV / plain "Label : Value" blocks),
// normalizes labels + values, de-duplicates against existing
// rows, and groups exactly the way the customer-facing Product
// Details page groups specification cards.
//
// Pure functions — no DB, no network, no schema changes.
// ============================================================

export type SpecRow = { k: string; v: string };

/* --------------------------- grouping (mirrors PDP) --------------------------- */

export const SPEC_GROUP_ORDER = [
  "Display",
  "Performance",
  "Camera",
  "Battery",
  "Connectivity",
  "Audio",
  "Build & Design",
  "Dimensions & Weight",
  "Sensors",
  "General",
] as const;

export type SpecGroupName = (typeof SPEC_GROUP_ORDER)[number];

const SPEC_GROUP_PATTERNS: Array<{ group: SpecGroupName; test: RegExp }> = [
  { group: "Display", test: /display|screen|resolution|refresh|panel|nits|hdr|ppi/i },
  { group: "Performance", test: /processor|chipset|cpu|gpu|ram|memory|storage|os|android|ios|benchmark|speed level|motor|rpm/i },
  { group: "Camera", test: /camera|lens|megapixel|aperture|video|zoom|selfie/i },
  { group: "Battery", test: /battery|charging|charger|mah|watt|wattage|power/i },
  { group: "Connectivity", test: /wi[- ]?fi|bluetooth|nfc|5g|4g|lte|sim|port|usb|hdmi|jack|network|gps|band/i },
  { group: "Audio", test: /audio|speaker|microphone|mic|dolby|codec|driver|sound/i },
  { group: "Build & Design", test: /material|build|design|finish|colou?r|frame|glass|rating|ip[0-9]+|water|dust/i },
  { group: "Dimensions & Weight", test: /dimension|height|width|depth|thickness|weight|size|capacity|volume/i },
  { group: "Sensors", test: /sensor|gyro|accelerometer|compass|proximity|fingerprint/i },
];

/** The specification card this label will land in on the customer page. */
export function groupForSpec(label: string): SpecGroupName {
  return SPEC_GROUP_PATTERNS.find((p) => p.test.test(label))?.group ?? "General";
}

/** Group rows into the same ordered cards the Product Details page renders. */
export function groupSpecs(rows: SpecRow[]): Array<{ group: SpecGroupName; rows: SpecRow[] }> {
  const bucket = new Map<SpecGroupName, SpecRow[]>();
  for (const r of rows) {
    if (!r.k.trim()) continue;
    const g = groupForSpec(r.k);
    const list = bucket.get(g) ?? [];
    list.push(r);
    bucket.set(g, list);
  }
  return SPEC_GROUP_ORDER.filter((g) => bucket.has(g)).map((g) => ({
    group: g,
    rows: bucket.get(g) ?? [],
  }));
}

/* --------------------------- normalization --------------------------- */

const SMALL_WORDS = new Set(["of", "and", "in", "on", "for", "to", "with", "per", "by"]);

/** Words that must keep their canonical casing. */
const ACRONYMS: Record<string, string> = {
  usb: "USB", ip: "IP", led: "LED", lcd: "LCD", oled: "OLED", amoled: "AMOLED",
  hd: "HD", uhd: "UHD", fhd: "FHD", qhd: "QHD", hdr: "HDR", hdmi: "HDMI",
  ram: "RAM", rom: "ROM", cpu: "CPU", gpu: "GPU", os: "OS", nfc: "NFC",
  gps: "GPS", sim: "SIM", ai: "AI", abs: "ABS", pvc: "PVC", bpa: "BPA",
  mah: "mAh", ml: "ml", kg: "kg", cm: "cm", mm: "mm", "w": "W",
  bt: "BT", tft: "TFT", ips: "IPS", pd: "PD", qc: "QC", rgb: "RGB",
  ce: "CE", iso: "ISO", sae: "SAE", dc: "DC", ac: "AC",
};

const LABEL_ALIASES: Record<string, string> = {
  "batt capacity": "Battery Capacity",
  "battery cap": "Battery Capacity",
  "power src": "Power Source",
  "power supply": "Power Source",
  "net weight": "Weight",
  "item weight": "Weight",
  "product weight": "Weight",
  "gross weight": "Shipping Weight",
  "product dimensions": "Dimensions",
  "item dimensions": "Dimensions",
  "package dimensions": "Package Dimensions",
  "colour": "Color",
  "waterproof": "Water Resistance",
  "water proof": "Water Resistance",
  "water-proof": "Water Resistance",
  "manufacturer": "Brand",
  "model no": "Model",
  "model number": "Model",
  "warranty period": "Warranty",
  "country of origin": "Origin",
  "in the box": "In The Box",
  "whats in the box": "In The Box",
  "what's in the box": "In The Box",
};

function titleCaseWord(word: string, index: number): string {
  const bare = word.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (ACRONYMS[bare]) return word.replace(/[a-z0-9]+/i, ACRONYMS[bare]);
  if (index > 0 && SMALL_WORDS.has(bare)) return bare;
  // Preserve intentional mixed case like "iPhone" or "mAh".
  if (/[a-z]/.test(word) && /[A-Z]/.test(word.slice(1))) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** "BATTERY CAPACITY" / "battery_capacity" -> "Battery Capacity". */
export function normalizeLabel(raw: string): string {
  let s = raw
    .replace(/[\u00a0\t]+/g, " ")
    .replace(/[_]+/g, " ")
    .replace(/[:•·\-–—]+\s*$/g, "")
    .replace(/^\s*[•·*\-–—]+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const alias = LABEL_ALIASES[s.toLowerCase()];
  if (alias) return alias;
  s = s.split(" ").map(titleCaseWord).join(" ");
  return LABEL_ALIASES[s.toLowerCase()] ?? s;
}

/** Clean a pasted value: kill PDF artefacts, collapse space, tidy units. */
export function normalizeValue(raw: string): string {
  return raw
    .replace(/[\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([,;])\s*/g, "$1 ")
    .replace(/^[:\-–—]\s*/, "")
    .replace(/\b(\d+(?:\.\d+)?)\s*(mah|mm|cm|kg|g|ml|l|w|v|hrs?|hours?|inch|in)\b/gi,
      (_m, n: string, u: string) => `${n}${/^(hrs?|hours?|inch|in)$/i.test(u) ? " " : ""}${
        ACRONYMS[u.toLowerCase()] ?? (u.length <= 2 ? u.toLowerCase() : u.toLowerCase())
      }`)
    .trim();
}

/* --------------------------- parsing --------------------------- */

const SEPARATORS = [/\t+/, /\s*[:：]\s+/, /\s*[:：]/, /\s{2,}/, /\s*[|]\s*/, /\s*[=]\s*/];

const NOISE = /^(specifications?|specs?|technical details|product details|description|additional information)$/i;

function splitPair(line: string): SpecRow | null {
  const trimmed = line.replace(/\u00a0/g, " ").trim();
  if (!trimmed || NOISE.test(trimmed)) return null;
  for (const sep of SEPARATORS) {
    const m = trimmed.split(sep);
    if (m.length >= 2 && m[0].trim() && m.slice(1).join(" ").trim()) {
      const k = m[0].trim();
      // A "label" longer than ~48 chars is prose, not a spec label.
      if (k.length > 48) return null;
      return { k, v: m.slice(1).join(" ").trim() };
    }
  }
  return null;
}

/**
 * Parse a pasted blob into spec rows. Handles tab-separated table paste,
 * "Label : Value" lists, CSV, and messy PDF copy (broken lines, stray
 * bullets, repeated whitespace). Unparsed continuation lines are appended
 * to the previous value instead of being dropped.
 */
export function parseSpecPaste(text: string): SpecRow[] {
  if (!text?.trim()) return [];
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^\s*[•·*]\s*/, ""));

  const out: SpecRow[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const pair = splitPair(line);
    if (pair) {
      out.push({ k: normalizeLabel(pair.k), v: normalizeValue(pair.v) });
    } else if (out.length && line.trim().length < 80 && !NOISE.test(line.trim())) {
      // PDF line-wrap continuation of the previous value.
      const last = out[out.length - 1];
      last.v = normalizeValue(`${last.v} ${line.trim()}`);
    }
  }
  return out.filter((r) => r.k && r.v);
}

/* --------------------------- merging --------------------------- */

export type MergeResult = {
  rows: SpecRow[];
  added: number;
  updated: number;
  skipped: number;
};

const keyOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Merge incoming rows into existing rows. Duplicate labels update the
 * existing row in place (never a second "Weight"); identical values are
 * skipped so the paste is idempotent.
 */
export function mergeSpecRows(existing: SpecRow[], incoming: SpecRow[]): MergeResult {
  const rows = existing.map((r) => ({ ...r }));
  const index = new Map<string, number>();
  rows.forEach((r, i) => {
    if (r.k.trim()) index.set(keyOf(r.k), i);
  });

  let added = 0, updated = 0, skipped = 0;
  for (const inc of incoming) {
    if (!inc.k.trim() || !inc.v.trim()) { skipped++; continue; }
    const at = index.get(keyOf(inc.k));
    if (at === undefined) {
      // Reuse a trailing blank row before appending.
      const blank = rows.findIndex((r) => !r.k.trim() && !r.v.trim());
      if (blank >= 0) rows[blank] = inc; else rows.push(inc);
      index.set(keyOf(inc.k), blank >= 0 ? blank : rows.length - 1);
      added++;
    } else if (rows[at].v.trim() === inc.v.trim()) {
      skipped++;
    } else {
      rows[at] = { k: rows[at].k || inc.k, v: inc.v };
      updated++;
    }
  }
  return { rows, added, updated, skipped };
}

/** Normalize + de-duplicate an existing list (the "Clean up" action). */
export function cleanSpecRows(rows: SpecRow[]): MergeResult {
  const cleaned = rows
    .filter((r) => r.k.trim() || r.v.trim())
    .map((r) => ({ k: normalizeLabel(r.k), v: normalizeValue(r.v) }));
  return mergeSpecRows([], cleaned);
}

/** Move a row within the list (drag & drop reordering). */
export function reorderRows<T>(rows: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = rows.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
