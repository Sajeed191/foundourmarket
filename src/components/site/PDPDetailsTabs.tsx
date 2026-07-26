/**
 * PDP Details Tabs v2 — Ultra Premium (presentation only).
 *
 * Amazon/Flipkart/Apple-inspired horizontal tab experience over the *existing*
 * product data (description, features, specifications, warranty). No new data
 * sources, no business logic: this component only reorganises what the PDP
 * already had into a compact, scannable, luxury layout.
 *
 * Performance: only the active tab's panel is mounted; entrance animations are
 * transform/opacity only and disabled under prefers-reduced-motion.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BatteryCharging,
  Boxes,
  Check,
  Cpu,
  Info,
  Monitor,
  Package,
  Ruler,
  ShieldCheck,
  Signal,
  Sparkles,
  Volume2,
  Camera as CameraIcon,
  Layers,
  Radar,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

type SpecGroupName = (typeof SPEC_GROUP_ORDER)[number];

const SPEC_GROUP_META: Record<SpecGroupName, { icon: LucideIcon; subtitle: string }> = {
  Display: { icon: Monitor, subtitle: "Screen, resolution and visual quality" },
  Performance: { icon: Cpu, subtitle: "Processor, memory and storage" },
  Camera: { icon: CameraIcon, subtitle: "Imaging and video capability" },
  Battery: { icon: BatteryCharging, subtitle: "Power and charging information" },
  Connectivity: { icon: Signal, subtitle: "Networks, wireless and ports" },
  Audio: { icon: Volume2, subtitle: "Sound output and microphones" },
  "Build & Design": { icon: Layers, subtitle: "Materials, finish and protection" },
  "Dimensions & Weight": { icon: Ruler, subtitle: "Physical size and weight" },
  Sensors: { icon: Radar, subtitle: "Onboard sensing hardware" },
  General: { icon: Info, subtitle: "Additional product information" },
};

const SPEC_GROUP_PATTERNS: Array<{ group: SpecGroupName; test: RegExp }> = [
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

const WARRANTY_ICONS: Array<{ test: RegExp; icon: LucideIcon }> = [
  { test: /period|duration|month|year/i, icon: ShieldCheck },
  { test: /service|support|centre|center/i, icon: Info },
  { test: /cover|include/i, icon: Check },
  { test: /claim|process|procedure/i, icon: Sparkles },
];

function splitList(value: string): string[] {
  return value
    .split(/\r?\n|·|•|,|;|\||\//g)
    .map((s) => s.replace(/^[-*\s]+/, "").trim())
    .filter((s) => s.length > 0);
}

/** Shared entrance: fade + 12px rise, 35ms stagger, motion-safe only, once. */
function Enter({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("motion-safe:animate-fade-in", className)}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms`, animationFillMode: "both" }}
    >
      {children}
    </div>
  );
}

/** Premium glass card used by every detail surface. */
function DetailCard({
  title,
  subtitle,
  icon: Icon,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[24px] border border-white/[0.07]",
        "bg-[linear-gradient(160deg,color-mix(in_oklab,var(--accent)_4%,transparent),transparent_42%)]",
        "px-5 py-5 backdrop-blur-xl",
        className,
      )}
      style={{ backgroundColor: "color-mix(in oklab, var(--foreground) 2.5%, transparent)" }}
    >
      {title && (
        <header className="mb-4 flex items-start gap-3">
          <span
            aria-hidden
            className="mt-[3px] h-9 w-[3px] shrink-0 rounded-full bg-gradient-to-b from-accent to-accent/10"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-semibold leading-tight tracking-tight text-foreground">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground/70">{subtitle}</p>
            )}
          </div>
          {Icon && (
            <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/[0.08] text-accent">
              <Icon className="size-4" strokeWidth={1.75} />
            </span>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

/** Label above value rows with soft gradient dividers. */
function SpecRows({ entries }: { entries: SpecEntry[] }) {
  return (
    <dl>
      {entries.map(([k, v], i) => (
        <div key={k}>
          {i > 0 && (
            <div
              aria-hidden
              className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.09] to-transparent"
            />
          )}
          <div className="py-3.5">
            <dt className="text-[11px] uppercase tracking-[0.13em] text-muted-foreground/65">{k}</dt>
            <dd className="mt-1 break-words text-[14.5px] font-medium leading-snug text-foreground">{v}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="grid place-items-center rounded-[24px] border border-dashed border-white/[0.08] px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-2xl border border-accent/20 bg-accent/[0.07] text-accent">
        <Sparkles className="size-5" strokeWidth={1.5} />
      </span>
      <p className="mt-4 text-[14px] font-medium text-foreground/90">Information coming soon</p>
      <p className="mt-1 max-w-[26ch] text-[12.5px] leading-relaxed text-muted-foreground/70">{message}</p>
    </div>
  );
}

export function PDPDetailsTabsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-hidden">
        {[72, 96, 84, 88].map((w, i) => (
          <div key={i} className="h-11 shrink-0 rounded-full bg-white/[0.04]" style={{ width: w }} />
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-[24px] border border-white/[0.06] bg-white/[0.018] p-5">
          <div className="mb-4 h-4 w-32 rounded-full bg-white/[0.06]" />
          <div className="space-y-4">
            {[0, 1, 2].map((r) => (
              <div key={r}>
                <div className="h-2.5 w-20 rounded-full bg-white/[0.045]" />
                <div className="mt-2 h-3.5 w-2/3 rounded-full bg-white/[0.055]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PDPDetailsTabs({
  description,
  features,
  specifications,
  warranty,
  loading = false,
}: {
  description?: string | null;
  features?: string[] | null;
  specifications?: Record<string, unknown> | null;
  warranty?: string | null;
  loading?: boolean;
}) {
  const { groups, boxItems, warrantyEntries } = useMemo(() => {
    const bucket = new Map<string, SpecEntry[]>();
    const box: string[] = [];
    const warrantySpecs: SpecEntry[] = [];

    for (const [k, raw] of Object.entries(specifications ?? {})) {
      if (raw == null) continue;
      const v = String(raw).trim();
      if (!v) continue;
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

    return { groups: grouped, boxItems: box, warrantyEntries: warrantySpecs };
  }, [specifications]);

  const featureList = (features ?? []).filter((f) => typeof f === "string" && f.trim());
  const hasWarranty = Boolean(warranty && warranty.trim()) || warrantyEntries.length > 0;
  const hasDescription = Boolean(description && description.trim());

  const tabs = useMemo(() => {
    const t: Array<{ id: string; label: string }> = [];
    if (groups.length > 0) t.push({ id: "specs", label: "Specifications" });
    if (hasDescription) t.push({ id: "description", label: "Description" });
    if (featureList.length > 0) t.push({ id: "features", label: "Features" });
    if (hasWarranty) t.push({ id: "warranty", label: "Warranty" });
    if (boxItems.length > 0) t.push({ id: "box", label: "In the Box" });
    return t;
  }, [groups.length, hasDescription, featureList.length, hasWarranty, boxItems.length]);

  const [active, setActive] = useState<string>("");
  const [expanded, setExpanded] = useState(false);
  const current = tabs.some((t) => t.id === active) ? active : (tabs[0]?.id ?? "");

  // Sliding orange indicator behind the active pill.
  const listRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-tab-id="${current}"]`);
    if (!el) return;
    setInd({ left: el.offsetLeft, width: el.offsetWidth });
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current, tabs.length]);

  if (loading) return <PDPDetailsTabsSkeleton />;
  if (tabs.length === 0) {
    return <EmptyState message="Detailed product information for this item is being prepared." />;
  }

  return (
    <div className="relative">
      {/* Oversized watermark word behind the section. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-6 -right-4 select-none overflow-hidden text-[19vw] font-black uppercase leading-none tracking-tighter text-foreground/[0.04] motion-safe:animate-fade-in sm:text-[9rem]"
      >
        Details
      </span>

      {/* Sticky glass tab bar with sliding indicator. */}
      <div className="sticky top-[var(--app-header-height,0px)] z-20 -mx-4 sm:mx-0">
        <div className="border-b border-white/[0.05] bg-background/70 backdrop-blur-2xl">
          <div
            ref={listRef}
            role="tablist"
            aria-label="Product details"
            className="no-scrollbar relative flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 py-2.5 sm:px-0"
          >
            {ind && (
              <span
                aria-hidden
                className="pointer-events-none absolute top-2.5 h-11 rounded-full bg-accent shadow-[0_8px_26px_-14px_color-mix(in_oklab,var(--accent)_80%,transparent)] transition-[transform,width] duration-[220ms] ease-out"
                style={{ width: ind.width, transform: `translateX(${ind.left}px)`, left: 0 }}
              />
            )}
            {tabs.map((t) => {
              const isActive = t.id === current;
              return (
                <button
                  key={t.id}
                  data-tab-id={t.id}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls={`pdp-tab-panel-${t.id}`}
                  onClick={() => setActive(t.id)}
                  className={cn(
                    "relative z-[1] snap-start shrink-0 whitespace-nowrap rounded-full px-4 min-h-[44px] text-[13px] font-medium",
                    "transition-colors duration-[220ms] ease-out",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
                    isActive
                      ? "text-accent-foreground"
                      : "border border-white/[0.07] bg-white/[0.02] text-muted-foreground hover:text-foreground/90",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Only the active panel is mounted. */}
      <div
        key={current}
        id={`pdp-tab-panel-${current}`}
        role="tabpanel"
        className="relative mt-4 space-y-4"
      >
        {current === "specs" &&
          groups.map(({ group, entries }, i) => {
            const meta = SPEC_GROUP_META[group as SpecGroupName];
            return (
              <Enter key={group} index={i}>
                <DetailCard title={group} subtitle={meta?.subtitle} icon={meta?.icon}>
                  <SpecRows entries={entries} />
                </DetailCard>
              </Enter>
            );
          })}

        {current === "description" && (
          <Enter>
            <DetailCard title="About this product" subtitle="Everything you need to know">
              <div
                className={cn(
                  "relative mx-auto max-w-[68ch]",
                  !expanded && "max-h-[420px] overflow-hidden",
                )}
              >
                <ProductDescription description={description} />
                {!expanded && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-3 min-h-[44px] text-[12.5px] font-medium uppercase tracking-[0.14em] text-accent transition-opacity duration-[220ms] hover:opacity-80"
              >
                {expanded ? "Read less" : "Read more"}
              </button>
            </DetailCard>
          </Enter>
        )}

        {current === "features" && (
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
            {featureList.map((f, i) => {
              const [head, ...rest] = f.split(/[:—–-]\s+/);
              const body = rest.join(" ").trim();
              return (
                <Enter key={i} index={i}>
                  <div className="flex h-full items-start gap-3 rounded-[24px] border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/[0.1] text-accent">
                      <Check className="size-3.5" strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0">
                      <p className="break-words text-[14.5px] font-medium leading-snug text-foreground">
                        {body ? head : f}
                      </p>
                      {body && (
                        <p className="mt-1 break-words text-[13px] leading-relaxed text-muted-foreground">
                          {body}
                        </p>
                      )}
                    </div>
                  </div>
                </Enter>
              );
            })}
          </div>
        )}

        {current === "warranty" && (
          <>
            {warranty && warranty.trim() && (
              <Enter>
                <DetailCard title="Warranty" subtitle="Coverage summary" icon={ShieldCheck}>
                  <p className="break-words text-[14px] leading-relaxed text-muted-foreground">{warranty}</p>
                </DetailCard>
              </Enter>
            )}
            {warrantyEntries.length > 0 && (
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                {warrantyEntries.map(([k, v], i) => {
                  const Icon = WARRANTY_ICONS.find((w) => w.test.test(k))?.icon ?? ShieldCheck;
                  return (
                    <Enter key={k} index={i}>
                      <div className="flex h-full items-start gap-3 rounded-[24px] border border-white/[0.07] bg-white/[0.02] p-5 backdrop-blur-xl">
                        <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/[0.08] text-accent">
                          <Icon className="size-4" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-[0.13em] text-muted-foreground/65">{k}</p>
                          <p className="mt-1 break-words text-[14.5px] font-medium leading-snug text-foreground">
                            {v}
                          </p>
                        </div>
                      </div>
                    </Enter>
                  );
                })}
              </div>
            )}
          </>
        )}

        {current === "box" && (
          <Enter>
            <DetailCard title="In the Box" subtitle="What you receive" icon={Package}>
              <ul>
                {boxItems.map((item, i) => (
                  <li key={i}>
                    {i > 0 && (
                      <div
                        aria-hidden
                        className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.09] to-transparent"
                      />
                    )}
                    <div className="flex items-center gap-3 py-3.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/[0.1] text-accent">
                        <Boxes className="size-3.5" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 break-words text-[14.5px] font-medium leading-snug text-foreground">
                        {item}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </DetailCard>
          </Enter>
        )}
      </div>
    </div>
  );
}
