/**
 * PDP Details Tabs — presentation-only.
 *
 * Amazon/Flipkart-style horizontal tab strip over the *existing* product data
 * (description, features, specifications, warranty). No new data sources, no
 * business logic: this component only reorganises what the PDP already had
 * (Product Overview section + Specifications accordion) into scannable tabs.
 *
 * Performance: only the active tab's panel is mounted.
 */
import { useMemo, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductDescription } from "@/components/site/ProductDescription";

type SpecEntry = [string, string];
type SpecGroup = { group: string; entries: SpecEntry[] };

const SPEC_GROUP_ORDER = [
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

const SPEC_GROUP_PATTERNS: Array<{ group: (typeof SPEC_GROUP_ORDER)[number]; test: RegExp }> = [
  { group: "Display", test: /display|screen|resolution|refresh|panel|nits|hdr|ppi/i },
  { group: "Performance", test: /processor|chipset|cpu|gpu|ram|memory|storage|os|android|ios|benchmark/i },
  { group: "Camera", test: /camera|lens|megapixel|aperture|video|zoom|selfie/i },
  { group: "Battery", test: /battery|charging|charger|mah|watt|wattage|power/i },
  { group: "Connectivity", test: /wi[- ]?fi|bluetooth|nfc|5g|4g|lte|sim|port|usb|hdmi|jack|network|gps|band/i },
  { group: "Audio", test: /audio|speaker|microphone|mic|dolby|codec|driver|sound/i },
  { group: "Build & Design", test: /material|build|design|finish|colou?r|frame|glass|rating|ip[0-9]+|water|dust/i },
  { group: "Dimensions & Weight", test: /dimension|height|width|depth|thickness|weight|size/i },
  { group: "Sensors", test: /sensor|gyro|accelerometer|compass|proximity|fingerprint/i },
];

const BOX_RE = /package|in the box|box contents|contents|includes|accessor/i;
const WARRANTY_RE = /warranty|guarantee|service|claim/i;

const OVERVIEW_PICKS: Array<{ label: string; test: RegExp }> = [
  { label: "Display", test: /display size|display|screen size|screen/i },
  { label: "Processor", test: /processor|chipset|cpu/i },
  { label: "Battery", test: /battery/i },
  { label: "Camera", test: /rear camera|main camera|camera/i },
  { label: "Storage", test: /storage|rom|internal memory/i },
  { label: "RAM", test: /\bram\b|memory/i },
  { label: "Warranty", test: /warranty/i },
];

function splitList(value: string): string[] {
  return value
    .split(/\r?\n|·|•|,|;|\||\//g)
    .map((s) => s.replace(/^[-*\s]+/, "").trim())
    .filter((s) => s.length > 0);
}

function SpecRows({ entries }: { entries: SpecEntry[] }) {
  return (
    <dl className="divide-y divide-white/[0.055]">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="grid grid-cols-[42%_58%] sm:grid-cols-[34%_66%] gap-4 py-3.5 text-[13.5px] leading-relaxed"
        >
          <dt className="text-muted-foreground/85">{k}</dt>
          <dd className="text-foreground/95 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/[0.07] bg-white/[0.018] px-4 sm:px-6 py-5 sm:py-6">
      {title && (
        <h3 className="mb-1.5 text-[15px] font-semibold tracking-tight text-foreground/95">{title}</h3>
      )}
      {children}
    </section>
  );
}

export function PDPDetailsTabs({
  description,
  features,
  specifications,
  warranty,
}: {
  description?: string | null;
  features?: string[] | null;
  specifications?: Record<string, unknown> | null;
  warranty?: string | null;
}) {
  const { groups, boxItems, warrantyEntries, overview } = useMemo(() => {
    const bucket = new Map<string, SpecEntry[]>();
    const box: string[] = [];
    const warrantySpecs: SpecEntry[] = [];
    const all: SpecEntry[] = [];

    for (const [k, raw] of Object.entries(specifications ?? {})) {
      if (raw == null) continue;
      const v = String(raw).trim();
      if (!v) continue;
      all.push([k, v]);
      if (BOX_RE.test(k)) {
        box.push(...splitList(v));
        continue;
      }
      if (WARRANTY_RE.test(k)) {
        warrantySpecs.push([k, v]);
        continue;
      }
      const g = SPEC_GROUP_PATTERNS.find((p) => p.test.test(k))?.group ?? "General";
      if (!bucket.has(g)) bucket.set(g, []);
      bucket.get(g)!.push([k, v]);
    }

    const grouped: SpecGroup[] = SPEC_GROUP_ORDER.filter((g) => bucket.has(g)).map((g) => ({
      group: g,
      entries: bucket.get(g)!,
    }));

    const highlights: SpecEntry[] = [];
    const used = new Set<string>();
    for (const pick of OVERVIEW_PICKS) {
      const hit = all.find(([k]) => !used.has(k) && pick.test.test(k));
      if (hit) {
        used.add(hit[0]);
        highlights.push([pick.label, hit[1]]);
      }
    }

    return { groups: grouped, boxItems: box, warrantyEntries: warrantySpecs, overview: highlights };
  }, [specifications]);

  const featureList = (features ?? []).filter((f) => typeof f === "string" && f.trim());
  const hasWarranty = Boolean(warranty && warranty.trim()) || warrantyEntries.length > 0;

  const tabs = useMemo(() => {
    const t: Array<{ id: string; label: string }> = [];
    if (overview.length > 0) t.push({ id: "overview", label: "Overview" });
    if (groups.length > 0) t.push({ id: "specs", label: "Specifications" });
    if (description && description.trim()) t.push({ id: "description", label: "Description" });
    if (featureList.length > 0) t.push({ id: "features", label: "Features" });
    if (boxItems.length > 0) t.push({ id: "box", label: "What's in Box" });
    if (hasWarranty) t.push({ id: "warranty", label: "Warranty" });
    return t;
  }, [overview.length, groups.length, description, featureList.length, boxItems.length, hasWarranty]);

  const [active, setActive] = useState<string>(() => "");
  const current = tabs.some((t) => t.id === active) ? active : (tabs[0]?.id ?? "");

  if (tabs.length === 0) return null;

  return (
    <div>
      {/* Tab strip — horizontal snap scroll, sticky on mobile, no wrapping. */}
      <div className="sticky top-[var(--app-header-height,0px)] z-20 -mx-4 sm:mx-0 bg-background/85 backdrop-blur-xl">
        <div
          role="tablist"
          aria-label="Product details"
          className="no-scrollbar flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 sm:px-0 py-2.5"
        >
          {tabs.map((t) => {
            const isActive = t.id === current;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={`pdp-tab-panel-${t.id}`}
                onClick={() => setActive(t.id)}
                className={cn(
                  "snap-start shrink-0 whitespace-nowrap rounded-full px-4 min-h-[44px] text-[13px] font-medium",
                  "transition-[background-color,color,border-color,box-shadow] duration-[250ms] ease-out",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
                  isActive
                    ? "border border-accent/60 bg-accent text-accent-foreground shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--accent)_60%,transparent)]"
                    : "border border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:text-foreground/90",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Only the active panel is mounted. */}
      <div
        key={current}
        id={`pdp-tab-panel-${current}`}
        role="tabpanel"
        className="mt-4 space-y-3.5 motion-safe:animate-fade-in"
      >
        {current === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {overview.map(([label, value]) => (
              <div
                key={label}
                className="rounded-[22px] border border-white/[0.07] bg-white/[0.018] px-4 py-3.5"
              >
                <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">{label}</p>
                <p className="mt-1 text-[14px] font-medium text-foreground/95 break-words">{value}</p>
              </div>
            ))}
          </div>
        )}

        {current === "specs" &&
          groups.map(({ group, entries }) => (
            <DetailCard key={group} title={group}>
              <SpecRows entries={entries} />
            </DetailCard>
          ))}

        {current === "description" && (
          <DetailCard>
            <ProductDescription description={description} />
          </DetailCard>
        )}

        {current === "features" && (
          <DetailCard>
            <ul className="space-y-3">
              {featureList.map((f, i) => (
                <li key={i} className="flex items-start gap-3 text-[14px] leading-relaxed text-muted-foreground">
                  <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0 break-words">{f}</span>
                </li>
              ))}
            </ul>
          </DetailCard>
        )}

        {current === "box" && (
          <DetailCard>
            <ul className="space-y-3">
              {boxItems.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-[14px] leading-relaxed text-foreground/90">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-accent">
                    <Check className="size-3" strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0 break-words">{item}</span>
                </li>
              ))}
            </ul>
          </DetailCard>
        )}

        {current === "warranty" && (
          <>
            {warranty && warranty.trim() && (
              <DetailCard title="Warranty summary">
                <p className="flex items-start gap-3 text-[14px] leading-relaxed text-muted-foreground">
                  <span className="mt-0.5 text-accent">
                    <ShieldCheck className="size-4" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 break-words">{warranty}</span>
                </p>
              </DetailCard>
            )}
            {warrantyEntries.length > 0 && (
              <DetailCard title="Warranty details">
                <SpecRows entries={warrantyEntries} />
              </DetailCard>
            )}
          </>
        )}
      </div>
    </div>
  );
}
