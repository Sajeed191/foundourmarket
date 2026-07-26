/**
 * Smart Description Builder — Product Editor 6.0.
 *
 * Deterministic, offline, section-structured description generation built from
 * data the admin already entered (title, brand, features, specifications).
 * Presentation-layer only: no network, no schema, no auto-writes. The editor
 * merges sections explicitly and never overwrites text the admin edited.
 */

export const DESCRIPTION_SECTIONS = [
  "Overview",
  "Key Benefits",
  "Features",
  "Technical Details",
  "Usage",
  "Care Instructions",
  "Safety Notes",
  "Compatibility",
  "Warranty",
  "Box Contents",
] as const;

export type DescriptionSectionName = (typeof DESCRIPTION_SECTIONS)[number];

export type DescriptionInput = {
  name: string;
  brand: string;
  productType: string;
  category: string;
  features: string[];
  specs: { k: string; v: string }[];
};

export type DescriptionSection = {
  name: DescriptionSectionName;
  /** Markdown body for this section (no heading — the heading is added on merge). */
  body: string;
};

const HEADING_RE = /^##\s+(.+?)\s*$/;

const specValue = (f: DescriptionInput, re: RegExp) =>
  f.specs.find((s) => re.test(s.k))?.v?.trim() ?? "";

function overview(f: DescriptionInput): string {
  const label = f.productType.trim() || f.category.trim() || "product";
  const brand = f.brand.trim();
  const lead = brand ? `The ${f.name.trim()} from ${brand}` : f.name.trim() || `This ${label}`;
  const top = f.features.slice(0, 2).map((x) => x.trim().replace(/\.$/, "")).filter(Boolean);
  const tail = top.length ? ` It is built around ${top.join(" and ").toLowerCase()}.` : "";
  return `${lead} is a ${label.toLowerCase()} designed for everyday reliability and a premium finish.${tail}`;
}

function benefits(f: DescriptionInput): string {
  const src = f.features.length
    ? f.features
    : f.specs.slice(0, 4).map((s) => `${s.k}: ${s.v}`);
  return src
    .slice(0, 5)
    .map((x) => `- ${x.trim().replace(/^[-•*]\s*/, "")}`)
    .join("\n");
}

function technical(f: DescriptionInput): string {
  return f.specs
    .filter((s) => s.k.trim() && s.v.trim())
    .slice(0, 12)
    .map((s) => `- **${s.k.trim()}** — ${s.v.trim()}`)
    .join("\n");
}

/** Build the sections that can actually be grounded in entered data. */
export function buildDescriptionSections(f: DescriptionInput): DescriptionSection[] {
  const out: DescriptionSection[] = [];
  const push = (name: DescriptionSectionName, body: string) => {
    if (body.trim()) out.push({ name, body: body.trim() });
  };

  push("Overview", overview(f));
  push("Key Benefits", benefits(f));
  if (f.features.length > 5) {
    push("Features", f.features.slice(5).map((x) => `- ${x.trim()}`).join("\n"));
  }
  push("Technical Details", technical(f));

  const usage = f.productType.trim() || f.category.trim();
  if (usage) {
    push(
      "Usage",
      `Unpack the ${usage.toLowerCase()}, check every included item against the box contents, and follow the quick-start steps in the manual before first use.`,
    );
  }

  const material = specValue(f, /material|build|fabric|finish/i);
  if (material) {
    push(
      "Care Instructions",
      `Made with ${material.toLowerCase()}. Wipe clean with a soft dry cloth, avoid harsh solvents, and store away from direct heat or prolonged sunlight.`,
    );
  }

  const power = specValue(f, /battery|voltage|power|watt/i);
  if (power) {
    push(
      "Safety Notes",
      `Operate only within the rated specification (${power}). Do not open, puncture or expose the unit to moisture unless it carries an explicit water-resistance rating.`,
    );
  }

  const compat = specValue(f, /compat|support|connectivity|interface|port|os\b/i);
  if (compat) push("Compatibility", `Works with ${compat}.`);

  const warranty = specValue(f, /warranty|guarantee/i);
  if (warranty) push("Warranty", `Covered by ${warranty} from the date of delivery.`);

  const box = specValue(f, /in the box|box contents|package contents|includes/i);
  if (box) push("Box Contents", box.split(/\s*[,;+]\s*/).filter(Boolean).map((x) => `- ${x}`).join("\n"));

  return out;
}

/** Section names already present as `## Heading` in the current description. */
export function existingSections(description: string): Set<string> {
  const found = new Set<string>();
  for (const line of description.split("\n")) {
    const m = line.match(HEADING_RE);
    if (m) found.add(m[1].trim().toLowerCase());
  }
  return found;
}

/**
 * Append only the sections the description does not already contain.
 * Manual text is never rewritten — existing headings are left untouched.
 */
export function mergeDescriptionSections(
  description: string,
  sections: DescriptionSection[],
): { text: string; addedSections: string[] } {
  const present = existingSections(description);
  const added: string[] = [];
  const blocks: string[] = [];
  for (const s of sections) {
    if (present.has(s.name.toLowerCase())) continue;
    blocks.push(`## ${s.name}\n\n${s.body}`);
    added.push(s.name);
  }
  if (!blocks.length) return { text: description, addedSections: [] };
  const base = description.trim();
  return {
    text: base ? `${base}\n\n${blocks.join("\n\n")}` : blocks.join("\n\n"),
    addedSections: added,
  };
}

/** Replace one section's body in place, leaving every other section intact. */
export function replaceDescriptionSection(
  description: string,
  name: string,
  body: string,
): string {
  const lines = description.split("\n");
  const start = lines.findIndex((l) => l.match(HEADING_RE)?.[1]?.trim().toLowerCase() === name.toLowerCase());
  if (start === -1) return description;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) { end = i; break; }
  }
  return [...lines.slice(0, start), `## ${name}`, "", body.trim(), "", ...lines.slice(end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------ feature generator ------------------------------ */

/** Bullet features / highlights derived from specs when the list is thin. */
export function generateFeatureChips(f: DescriptionInput): string[] {
  const have = new Set(f.features.map((x) => x.toLowerCase().trim()));
  const out: string[] = [];
  const add = (s: string) => {
    const v = s.trim();
    if (v && !have.has(v.toLowerCase())) { have.add(v.toLowerCase()); out.push(v); }
  };
  for (const s of f.specs) {
    if (!s.k.trim() || !s.v.trim()) continue;
    if (/warranty/i.test(s.k)) add(`${s.v} warranty included`);
    else if (/battery/i.test(s.k)) add(`${s.v} battery for long runtime`);
    else if (/display|screen/i.test(s.k)) add(`${s.v} display`);
    else if (/material|build/i.test(s.k)) add(`${s.v} build quality`);
    else if (/weight/i.test(s.k)) add(`Lightweight at ${s.v}`);
    else if (/water|ip[0-9]/i.test(s.k)) add(`${s.v} water & dust protection`);
    else add(`${s.k}: ${s.v}`);
    if (out.length >= 8) break;
  }
  return out;
}

/** Search keywords derived from title, brand, type and specs. */
export function generateKeywordChips(f: DescriptionInput): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (s: string) => {
    const v = s.toLowerCase().trim().replace(/\s+/g, " ");
    if (v.length < 3 || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  const brand = f.brand.trim();
  const type = f.productType.trim() || f.category.trim();
  if (brand && type) add(`${brand} ${type}`);
  if (type) { add(type); add(`buy ${type} online`); add(`best ${type}`); }
  if (brand) add(brand);
  for (const w of f.name.split(/\s+/)) if (w.length > 3) add(w);
  for (const s of f.specs.slice(0, 6)) if (s.v.trim().length < 24) add(`${type} ${s.v}`.trim());
  return out.slice(0, 12);
}
