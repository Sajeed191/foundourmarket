// ============================================================
// Product Import Intelligence — Product Editor 4.0
//
// Universal Smart Paste. Takes ANY blob an admin copies from a
// marketplace listing (Amazon / Flipkart / Alibaba / AliExpress /
// Temu), a spreadsheet (Excel / Google Sheets / CSV), a document
// (Word / PDF text), or markup (HTML / Markdown tables) and
// classifies it into the fields the editor already owns.
//
// Pure functions: no DB, no network, no schema changes. Grouping
// and normalization reuse spec-intelligence so pasted rows land in
// exactly the same customer-facing specification cards.
// ============================================================
import {
  normalizeLabel,
  normalizeValue,
  parseSpecPaste,
  type SpecRow,
} from "@/lib/spec-intelligence";

export type ParsedListing = {
  /** Best-guess source of the paste — shown in the parser dialog. */
  source: string;
  specs: SpecRow[];
  description: string;
  features: string[];
  warranty: string;
  packageContents: string[];
  brand: string;
  model: string;
  sku: string;
  dimensions: string;
  weight: string;
  colors: string[];
  materials: string;
  /** Suggested product name (first strong title-ish line). */
  name: string;
};

export type CategorySuggestion = {
  /** Human path, e.g. ["Electronics", "Audio", "Headphones"]. */
  path: string[];
  confidence: number;
  /** Keywords that drove the match — shown as evidence. */
  matched: string[];
};

/* ------------------------------ pre-processing ------------------------------ */

const HTML_TAG = /<\/?[a-z][^>]*>/i;

/** HTML table / list paste → tab-separated plain text rows. */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\/\s*(td|th)\s*>/gi, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** Markdown table rows → tab-separated rows; drops separator rows. */
function markdownTablesToText(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/^\s*\|?[\s:|-]{4,}\|?\s*$/.test(l) || !l.includes("|"))
    .map((l) => {
      if (!/^\s*\|.*\|\s*$/.test(l)) return l;
      const cells = l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
      return cells.map((c) => c.trim()).join("\t");
    })
    .join("\n");
}

/** CSV-ish rows → tab-separated (only when the line clearly has 2 columns). */
function csvToText(text: string): string {
  return text
    .split("\n")
    .map((l) => {
      if (l.includes("\t") || !l.includes(",")) return l;
      const m = l.match(/^\s*"?([^",]{2,48})"?\s*,\s*"?(.+?)"?\s*$/);
      return m ? `${m[1]}\t${m[2]}` : l;
    })
    .join("\n");
}

export function detectSource(raw: string): string {
  const t = raw.toLowerCase();
  if (HTML_TAG.test(raw)) return "HTML";
  if (/\|\s*-{3,}/.test(raw)) return "Markdown table";
  if (/about this item|technical details|product information/.test(t)) return "Amazon";
  if (/flipkart|f\-assured|highlights\b/.test(t)) return "Flipkart";
  if (/alibaba|min\.? ?order|supply ability|fob price/.test(t)) return "Alibaba";
  if (/aliexpress|choice ?day/.test(t)) return "AliExpress";
  if (/temu/.test(t)) return "Temu";
  if (raw.includes("\t")) return "Spreadsheet";
  if (/,/.test(raw) && raw.split("\n").length > 3) return "CSV";
  return "Text";
}

function preprocess(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");
  if (HTML_TAG.test(text)) text = htmlToText(text);
  text = markdownTablesToText(text);
  text = csvToText(text);
  return text
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n");
}

/* ------------------------------ section detection ------------------------------ */

type Section =
  | "specs"
  | "description"
  | "features"
  | "warranty"
  | "package"
  | "unknown";

const SECTION_HEADERS: Array<{ section: Section; test: RegExp }> = [
  { section: "specs", test: /^(specifications?|specs?|technical details|technical specifications?|product (details|information)|additional information|parameters?)\s*:?\s*$/i },
  { section: "features", test: /^(features?|key features?|highlights?|about this item|product highlights?|selling points?)\s*:?\s*$/i },
  { section: "description", test: /^(description|product description|overview|about (the )?product|details)\s*:?\s*$/i },
  { section: "warranty", test: /^(warranty|warranty (info|information|details)|guarantee)\s*:?\s*$/i },
  { section: "package", test: /^((what'?s )?in the box|package (contents?|includes?|list)|box contents?|includes?)\s*:?\s*$/i },
];

const BULLET = /^\s*[•·▪●○*\-–—]\s+/;

const isPair = (line: string) => parseSpecPaste(line).length === 1;

/* ------------------------------ main parser ------------------------------ */

export function parseListing(raw: string): ParsedListing {
  const source = detectSource(raw);
  const lines = preprocess(raw).split("\n");

  const specs: SpecRow[] = [];
  const features: string[] = [];
  const packageContents: string[] = [];
  const prose: string[] = [];
  let warranty = "";
  let name = "";
  let section: Section = "unknown";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const header = SECTION_HEADERS.find((h) => h.test.test(line));
    if (header) {
      section = header.section;
      continue;
    }

    const bulleted = BULLET.test(line);
    const clean = line.replace(BULLET, "").trim();
    if (!clean) continue;

    // Warranty is always harvested, wherever it appears.
    if (!warranty && /\bwarranty|guarantee\b/i.test(clean)) {
      const pair = parseSpecPaste(clean)[0];
      warranty = pair ? pair.v : normalizeValue(clean);
      if (pair) specs.push(pair);
      continue;
    }

    if (section === "package") {
      packageContents.push(normalizeValue(clean));
      continue;
    }

    if (section === "description") {
      prose.push(clean);
      continue;
    }

    if (section === "features") {
      // Feature blocks occasionally contain real "Label: Value" rows.
      if (!bulleted && isPair(clean) && clean.length < 90) {
        specs.push(...parseSpecPaste(clean));
      } else {
        features.push(normalizeValue(clean));
      }
      continue;
    }

    // Unknown / specs section — classify by shape.
    if (isPair(clean) && clean.length < 200) {
      specs.push(...parseSpecPaste(clean));
      continue;
    }
    if (bulleted) {
      features.push(normalizeValue(clean));
      continue;
    }
    if (clean.length > 90 || /[.!?]\s/.test(clean)) {
      prose.push(clean);
      continue;
    }
    if (!name && clean.length >= 8 && clean.length <= 120 && /[a-z]/i.test(clean)) {
      name = normalizeValue(clean);
      continue;
    }
    features.push(normalizeValue(clean));
  }

  const specValue = (re: RegExp) =>
    specs.find((s) => re.test(s.k))?.v?.trim() ?? "";

  const boxSpec = specValue(/^in the box$|package contents?/i);
  if (boxSpec && !packageContents.length) {
    packageContents.push(
      ...boxSpec
        .split(/[,;·|]+|\s\+\s/)
        .map((x) => normalizeValue(x))
        .filter(Boolean),
    );
  }

  const colorRaw = specValue(/^colou?r/i);

  return {
    source,
    specs: dedupe(specs),
    description: prose.join("\n\n").trim(),
    features: unique(features).filter((x) => x.length > 2),
    warranty,
    packageContents: unique(packageContents),
    brand: specValue(/^brand$|manufacturer/i),
    model: specValue(/^model/i),
    sku: specValue(/^(sku|item model number|asin|part number)/i),
    dimensions: specValue(/^dimensions|^product dimensions|^size$/i),
    weight: specValue(/^weight|^item weight/i),
    colors: colorRaw
      ? unique(colorRaw.split(/[,/|]+/).map((c) => normalizeLabel(c)).filter(Boolean))
      : [],
    materials: specValue(/^material/i),
    name,
  };
}

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

function dedupe(rows: SpecRow[]): SpecRow[] {
  const seen = new Map<string, SpecRow>();
  for (const r of rows) {
    if (!r.k.trim() || !r.v.trim()) continue;
    const key = r.k.toLowerCase().replace(/[^a-z0-9]/g, "");
    const prev = seen.get(key);
    if (!prev) seen.set(key, r);
    else if (r.v.length > prev.v.length) seen.set(key, r);
  }
  return [...seen.values()];
}

/** Total number of fields the parser found — drives the dialog summary. */
export function countDetected(p: ParsedListing): number {
  return (
    (p.specs.length ? 1 : 0) +
    (p.description ? 1 : 0) +
    (p.features.length ? 1 : 0) +
    (p.warranty ? 1 : 0) +
    (p.packageContents.length ? 1 : 0) +
    (p.brand ? 1 : 0) +
    (p.model ? 1 : 0) +
    (p.sku ? 1 : 0)
  );
}

/* ------------------------------ auto categorization ------------------------------ */

const CATEGORY_RULES: Array<{ path: string[]; keys: RegExp[] }> = [
  { path: ["Electronics", "Audio", "Headphones"], keys: [/headphone|earphone|earbud|tws|anc\b|neckband/i, /driver|codec|bluetooth/i] },
  { path: ["Electronics", "Audio", "Speakers"], keys: [/speaker|soundbar|subwoofer/i, /rms|watt|bluetooth/i] },
  { path: ["Electronics", "Mobiles"], keys: [/smartphone|mobile phone|\biphone\b|\bandroid\b/i, /chipset|ram|rear camera/i] },
  { path: ["Electronics", "Wearables", "Smart Watches"], keys: [/smart ?watch|fitness band|smart band/i, /strap|amoled|spo2|step/i] },
  { path: ["Electronics", "Computers", "Laptops"], keys: [/laptop|notebook|macbook|ultrabook/i, /processor|ssd|ram/i] },
  { path: ["Electronics", "Accessories", "Chargers"], keys: [/charger|adapter|power bank|cable/i, /watt|output|input|type[- ]?c/i] },
  { path: ["Home & Kitchen", "Appliances"], keys: [/mixer|grinder|blender|kettle|air fryer|vacuum|purifier|cooker/i, /watt|capacity|litre|liter/i] },
  { path: ["Home & Kitchen", "Furniture"], keys: [/chair|table|sofa|desk|bed|shelf|wardrobe/i, /wood|assembly|seating|load/i] },
  { path: ["Health & Personal Care", "Massagers"], keys: [/massage|massager|percussion|muscle relief/i, /speed level|amplitude|stall force|rpm/i] },
  { path: ["Health & Personal Care", "Grooming"], keys: [/trimmer|shaver|epilator|hair dryer|straightener/i, /blade|runtime|watt/i] },
  { path: ["Sports & Fitness"], keys: [/dumbbell|yoga|treadmill|resistance band|gym|cycling/i, /kg|weight|resistance/i] },
  { path: ["Fashion", "Clothing"], keys: [/t-?shirt|shirt|jeans|dress|jacket|hoodie|kurta/i, /fabric|fit|sleeve|size chart/i] },
  { path: ["Fashion", "Footwear"], keys: [/shoe|sneaker|sandal|slipper|boot/i, /sole|upper material|size/i] },
  { path: ["Beauty"], keys: [/serum|moisturi[sz]er|shampoo|lipstick|sunscreen|cream/i, /ml\b|spf|skin type|ingredients/i] },
  { path: ["Toys & Games"], keys: [/toy|puzzle|lego|board game|doll|rc car/i, /age|pieces|batteries/i] },
  { path: ["Automotive"], keys: [/car |bike |helmet|tyre|engine oil|dash ?cam/i, /vehicle|compatib|mount/i] },
];

/**
 * Guess where the product belongs from its name, brand, type and
 * specification labels. Confidence is deliberately conservative: a strong
 * primary keyword alone is 78%, corroborating specification evidence lifts
 * it toward 98%.
 */
export function suggestCategory(input: {
  name?: string;
  brand?: string;
  productType?: string;
  description?: string;
  specs?: SpecRow[];
}): CategorySuggestion | null {
  const title = [input.name, input.brand, input.productType].filter(Boolean).join(" ");
  const specText = (input.specs ?? []).map((s) => `${s.k} ${s.v}`).join(" ");
  const all = `${title} ${input.description ?? ""} ${specText}`;

  let best: { rule: (typeof CATEGORY_RULES)[number]; score: number; matched: string[] } | null = null;

  for (const rule of CATEGORY_RULES) {
    const matched: string[] = [];
    let score = 0;
    const [primary, ...support] = rule.keys;
    const titleHit = primary.test(title);
    const anyHit = primary.test(all);
    if (!titleHit && !anyHit) continue;
    score += titleHit ? 0.78 : 0.52;
    matched.push(String(primary.exec(titleHit ? title : all)?.[0] ?? "").trim());
    for (const s of support) {
      const m = s.exec(specText) ?? s.exec(all);
      if (m) {
        score += 0.1;
        matched.push(String(m[0]).trim());
      }
    }
    if (!best || score > best.score) best = { rule, score, matched };
  }

  if (!best) return null;
  return {
    path: best.rule.path,
    confidence: Math.min(98, Math.round(best.score * 100)),
    matched: unique(best.matched.filter(Boolean)).slice(0, 4),
  };
}

/**
 * Map a suggested path onto the category slugs that actually exist in the
 * catalog. Never invents categories — unmatched levels are dropped.
 */
export function matchCategorySlugs(
  path: string[],
  available: Array<{ name: string; slug: string }>,
): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const out: string[] = [];
  // Deepest level first so the primary category is the most specific match.
  for (const level of [...path].reverse()) {
    const hit = available.find((c) => norm(c.name) === norm(level) || norm(c.slug) === norm(level));
    if (hit && !out.includes(hit.slug)) out.push(hit.slug);
  }
  return out;
}
