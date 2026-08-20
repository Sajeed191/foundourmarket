/**
 * PDP Details Tabs v2.0 — Ultra Premium (presentation only).
 *
 * A luxury "product brochure" reading experience over the *existing* product
 * data (description, features, specifications, warranty). No new data sources,
 * no business logic: this component only reorganises what the PDP already had.
 *
 * Performance: only the active tab's panel is mounted; reveals run through a
 * single IntersectionObserver; animations are transform/opacity only and are
 * disabled under prefers-reduced-motion.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BatteryCharging,
  Check,
  Cpu,
  Info,
  Monitor,
  
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

/** Collapsed height of the description block, in px. */
const COLLAPSED_DESC_PX = 224;


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

const SPEC_GROUP_META: Record<
  SpecGroupName,
  { icon: LucideIcon; subtitle: string; short: string; tint?: string; tintStrength?: number }
> = {
  Display: { icon: Monitor, subtitle: "Screen, resolution and visual quality", short: "Screen & Visuals", tint: "#7dd3fc", tintStrength: 0.03 },
  Performance: { icon: Cpu, subtitle: "Processor, memory and storage", short: "Processor & Memory", tint: "#a78bfa", tintStrength: 0.03 },
  Camera: { icon: CameraIcon, subtitle: "Imaging and video capability", short: "Imaging & Video", tint: "#f0abfc", tintStrength: 0.025 },
  Battery: { icon: BatteryCharging, subtitle: "Power and charging information", short: "Power & Charging", tint: "#fb923c", tintStrength: 0.035 },
  Connectivity: { icon: Signal, subtitle: "Networks, wireless and ports", short: "Network & Ports", tint: "#5eead4", tintStrength: 0.025 },
  Audio: { icon: Volume2, subtitle: "Sound output and microphones", short: "Sound & Audio", tint: "#93c5fd", tintStrength: 0.025 },
  "Build & Design": { icon: Layers, subtitle: "Materials, finish and protection", short: "Materials & Finish", tint: "#d6a06a", tintStrength: 0.035 },
  "Dimensions & Weight": { icon: Ruler, subtitle: "Physical size and weight", short: "Size & Weight", tint: "#cbd5e1", tintStrength: 0.02 },
  Sensors: { icon: Radar, subtitle: "Onboard sensing hardware", short: "Sensing Hardware", tint: "#86efac", tintStrength: 0.022 },
  General: { icon: Info, subtitle: "Additional product information", short: "General Information", tint: "#94a3b8", tintStrength: 0.02 },
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

/**
 * One-time progressive reveal driven by a shared IntersectionObserver.
 * Falls back to visible immediately when IO is unavailable (SSR / old engines).
 */
function useReveal() {
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    observerRef.current = io;
    return () => io.disconnect();
  }, []);

  return useCallback((node: HTMLElement | null) => {
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      node.classList.add("is-in");
      return;
    }
    // Observer may not exist yet on the very first paint; retry on next frame.
    const attach = () => {
      const io = observerRef.current;
      if (io) io.observe(node);
      else node.classList.add("is-in");
    };
    if (observerRef.current) attach();
    else requestAnimationFrame(attach);
  }, []);
}

/** Shared entrance wrapper: fade + rise, staggered, once. */
function Reveal({
  index = 0,
  step = 40,
  className,
  observe,
  children,
}: {
  index?: number;
  step?: number;
  className?: string;
  observe: (node: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={observe}
      className={cn("pdp-reveal", className)}
      style={{ ["--pdp-delay" as string]: `${Math.min(index, 14) * step}ms` }}
    >
      {children}
    </div>
  );
}

/** Title-cases raw spec keys so labels never shout in ALL CAPS. */
function toTitleCase(raw: string): string {
  return raw
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) =>
      w.length <= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");
}

/** Category / info card: glowing accent line, category eyebrow, larger title. */
function DetailCard({
  title,
  subtitle,
  eyebrow,
  alt = false,
  tint,
  tintStrength,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  alt?: boolean;
  tint?: string;
  tintStrength?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("pdp-card pdp-card-tap", alt && "pdp-card-alt", className)}
      style={
        tint
          ? ({
              ["--pdp-tint" as string]: tint,
              ["--pdp-tint-strength" as string]: String(tintStrength ?? 0.03),
            } as React.CSSProperties)
          : undefined
      }
    >
      {title && (
        <header className="mb-3 flex flex-col items-start">
          <span aria-hidden className="pdp-accent-line" />
          {eyebrow && (
            <p className="mt-3 text-[11px] font-semibold uppercase leading-none tracking-[0.22em] text-muted-foreground/[0.48]">
              {eyebrow}
            </p>
          )}
          <h3 className="mt-2.5 text-[20px] font-bold leading-[1.15] tracking-[-0.02em] text-foreground">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-[7px] text-[11px] leading-snug text-muted-foreground/55">{subtitle}</p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

/** Uppercase micro-label beside a bold value on one shared specification grid. */
function SpecRows({
  entries,
  observe,
}: {
  entries: SpecEntry[];
  observe: (node: HTMLElement | null) => void;
}) {
  return (
    <dl className="mt-0">
      {entries.map(([k, v], i) => (
        <div key={k}>
          {i > 0 && <div aria-hidden className="pdp-row-divider" />}
          <Reveal observe={observe} index={i} step={30}>
            <div className="pdp-spec-row">
              <dt className="pdp-spec-label">{toTitleCase(k)}</dt>
              <dd className="pdp-spec-value">{v}</dd>
            </div>
          </Reveal>
        </div>
      ))}
    </dl>
  );
}





function EmptyState({ message }: { message: string }) {
  return (
    <div className="pdp-card grid place-items-center px-6 py-16 text-center">
      <span
        aria-hidden
        className="grid size-14 place-items-center rounded-[20px] border border-accent/20 bg-accent/[0.07] text-accent"
      >
        <Sparkles className="size-6" strokeWidth={1.4} />
      </span>
      <p className="mt-5 text-[15px] font-semibold tracking-[-0.01em] text-foreground">
        Specifications will be available soon.
      </p>
      <p className="mt-1.5 max-w-[30ch] text-[12.5px] leading-relaxed text-muted-foreground/70">{message}</p>
    </div>
  );
}

export function PDPDetailsTabsSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="space-y-3">
        <div className="pdp-skel h-8 w-56 rounded-2xl" />
        <div className="pdp-skel h-3.5 w-72" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {[112, 104, 92, 96].map((w, i) => (
          <div key={i} className="pdp-skel h-11 shrink-0" style={{ width: w }} />
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="pdp-card">
          <div className="mb-5 flex items-start gap-3">
            <div className="pdp-skel h-10 w-[3px]" />
            <div className="flex-1 space-y-2">
              <div className="pdp-skel h-4 w-36" />
              <div className="pdp-skel h-2.5 w-24" />
            </div>
            <div className="pdp-skel size-9 rounded-2xl" />
          </div>
          <div className="space-y-5">
            {[0, 1, 2].map((r) => (
              <div key={r} className="space-y-2">
                <div className="pdp-skel h-2.5 w-24" />
                <div className="pdp-skel h-4 w-2/3" />
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
  const observe = useReveal();

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
    if (boxItems.length > 0) t.push({ id: "box", label: "What's Included" });
    return t;
  }, [groups.length, hasDescription, featureList.length, hasWarranty, boxItems.length]);

  const [active, setActive] = useState<string>("");
  // Single source of truth for the description expand/collapse control.
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);
  const current = tabs.some((t) => t.id === active) ? active : (tabs[0]?.id ?? "");

  // Reset whenever the product description changes (async loads, navigation).
  useEffect(() => {
    setExpanded(false);
  }, [description]);

  // Only offer the control when the text actually overflows the clamp.
  useEffect(() => {
    const el = descRef.current;
    if (!el) {
      setOverflows(false);
      return;
    }
    const measure = () => setOverflows(el.scrollHeight > COLLAPSED_DESC_PX + 24);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [description, current]);


  // Sliding orange indicator behind the active pill.
  const listRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const sync = () => {
      const el = list.querySelector<HTMLElement>(`[data-tab-id="${current}"]`);
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
    };
    sync();
    const el = list.querySelector<HTMLElement>(`[data-tab-id="${current}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [current, tabs.length]);

  const specCount = groups.reduce((n, g) => n + g.entries.length, 0);

  const hero = (
    <header className="relative mb-5">
      <h2 className="text-[28px] font-semibold uppercase leading-[1.05] tracking-[0.06em] text-foreground">
        Product Details
      </h2>
      <p className="mt-2 max-w-[44ch] text-[13px] leading-relaxed text-muted-foreground/70">
        Complete specifications, features and warranty information.
      </p>
      <div
        aria-hidden
        className="mt-4 h-px w-full bg-gradient-to-r from-transparent via-white/[0.14] to-transparent"
      />
    </header>
  );


  if (loading) {
    return (
      <div className="pdp-details-stage">
        <PDPDetailsTabsSkeleton />
      </div>
    );
  }

  if (tabs.length === 0) {
    return (
      <div className="pdp-details-stage">
        {hero}
        <EmptyState message="Detailed product information for this item is being prepared." />
      </div>
    );
  }

  return (
    <div className="pdp-details-stage relative">
      {hero}

      {/* Floating glass tab pills with a sliding gradient indicator. */}
      <div className="sticky top-[var(--app-header-height,0px)] z-20 -mx-4 sm:mx-0">
        <div className="border-b border-white/[0.05] bg-background/70 backdrop-blur-2xl">
          <div
            ref={listRef}
            role="tablist"
            aria-label="Product details"
            className="no-scrollbar relative flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 py-2 sm:px-0"
          >
            {ind && (
              <span
                aria-hidden
                className="pdp-tab-glow top-2 h-[42px]"
                style={{ width: ind.width, transform: `translate3d(${ind.left}px,-2px,0)`, left: 0 }}

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
                    "relative z-[1] h-[42px] shrink-0 snap-start whitespace-nowrap rounded-full px-5 text-[13px] font-medium",
                    "transition-colors duration-[180ms] ease-out",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50",
                    isActive
                      ? "text-accent-foreground"
                      : "border border-white/[0.09] bg-white/[0.028] text-muted-foreground/90 backdrop-blur-xl hover:text-foreground",

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
        className="relative mt-4 flex flex-col gap-[18px]"
      >
        {current === "specs" && (
          <>
            <p className="-mt-1 mb-[10px] text-[11.5px] leading-none text-muted-foreground/60">
              {specCount} {specCount === 1 ? "specification" : "specifications"}
              <span className="mx-1.5 text-muted-foreground/35">•</span>
              {groups.length} {groups.length === 1 ? "category" : "categories"}
              <span className="mx-1.5 text-muted-foreground/35">•</span>
              Verified catalog
            </p>
            {groups.map(({ group, entries }, i) => {
              const meta = SPEC_GROUP_META[group as SpecGroupName];
              return (
                <Reveal key={group} observe={observe} index={i} step={30}>
                  <DetailCard
                    eyebrow={group.toUpperCase()}
                    title={meta?.short ?? "Product Information"}
                    subtitle={`${entries.length} ${entries.length === 1 ? "specification" : "specifications"}`}
                    alt={i % 2 === 1}
                    tint={meta?.tint}
                    tintStrength={meta?.tintStrength}
                  >
                    <SpecRows entries={entries} observe={observe} />
                  </DetailCard>
                </Reveal>
              );
            })}
          </>
        )}



        {current === "description" && (
          <Reveal observe={observe}>
            <DetailCard title="About this product" subtitle="Everything you need to know">
              <div
                className="relative mx-auto max-w-[68ch] overflow-hidden text-[15px] leading-[1.75] transition-[max-height,opacity] duration-500 ease-out"
                style={{
                  maxHeight: !overflows || expanded ? `${(descRef.current?.scrollHeight ?? 4000) + 40}px` : `${COLLAPSED_DESC_PX}px`,
                }}
              >
                <div ref={descRef}>
                  {/* collapsible={false}: this card owns the only expand control. */}
                  <ProductDescription description={description} collapsible={false} />
                </div>
                {overflows && !expanded && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent"
                  />
                )}
              </div>
              {overflows && (
                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    className="group inline-flex min-h-[44px] items-center gap-2 rounded-full border border-accent/25 bg-accent/[0.07] px-5 text-[11px] font-medium uppercase tracking-[0.18em] text-accent transition-all duration-300 hover:border-accent/50 hover:bg-accent/[0.12]"
                  >
                    {expanded ? "Show less" : "Show more"}
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform duration-300",
                        expanded && "rotate-180",
                      )}
                    />
                  </button>
                </div>
              )}

            </DetailCard>
          </Reveal>
        )}

        {current === "features" && (
          <div className="flex flex-wrap gap-2.5">
            {featureList.map((f, i) => {
              const [head, ...rest] = f.split(/[:—–-]\s+/);
              const body = rest.join(" ").trim();
              const short = (body ? head : f).trim();
              const compact = short.length <= 42;
              return (
                <Reveal
                  key={i}
                  observe={observe}
                  index={i}
                  step={30}
                  className={compact ? "" : "w-full"}
                >
                  {compact ? (
                    <span
                      title={body || undefined}
                      className="pdp-card-tap inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-4 text-[13.5px] font-medium text-foreground backdrop-blur-xl transition-colors duration-[260ms] hover:border-accent/25"
                    >
                      <Check className="size-3.5 shrink-0 text-accent" strokeWidth={2.75} />
                      {short}
                    </span>
                  ) : (
                    <div className="pdp-card pdp-card-tap flex items-start gap-3">
                      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/[0.1] text-accent">
                        <Check className="size-3.5" strokeWidth={2.5} />
                      </span>
                      <div className="min-w-0">
                        <p className="break-words text-[15px] font-medium leading-snug text-foreground">
                          {short}
                        </p>
                        {body && (
                          <p className="mt-1 break-words text-[13px] leading-relaxed text-muted-foreground">
                            {body}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </Reveal>
              );
            })}
          </div>
        )}

        {current === "warranty" && (
          <>
            {warranty && warranty.trim() && (
              <Reveal observe={observe}>
                <DetailCard eyebrow="WARRANTY" title="Coverage summary">
                  <p className="break-words text-[14.5px] leading-relaxed text-muted-foreground">
                    {warranty}
                  </p>
                </DetailCard>
              </Reveal>
            )}
            {warrantyEntries.length > 0 && (
              <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
                {warrantyEntries.map(([k, v], i) => {
                  const Icon = WARRANTY_ICONS.find((w) => w.test.test(k))?.icon ?? ShieldCheck;
                  return (
                    <Reveal key={k} observe={observe} index={i} step={30}>
                      <div className="pdp-card pdp-card-tap flex h-full items-start gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-2xl border border-accent/20 bg-accent/[0.08] text-accent">
                          <Icon className="size-4" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground/60">
                            {k}
                          </p>
                          <p className="mt-1.5 break-words text-[17px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                            {v}
                          </p>
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            )}
          </>
        )}

        {current === "box" && (
          <Reveal observe={observe}>
            <DetailCard
              eyebrow="WHAT'S INCLUDED"
              title="In the box"
              subtitle={`${boxItems.length} ${boxItems.length === 1 ? "item" : "items"}`}
            >

              <ul>
                {boxItems.map((item, i) => (
                  <li key={i}>
                    {i > 0 && <div aria-hidden className="pdp-row-divider" />}
                    <Reveal observe={observe} index={i} step={30}>
                      <div className="flex items-center gap-3 py-3">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/[0.1] text-accent">
                          <Check className="size-3.5" strokeWidth={2.5} />
                        </span>
                        <span className="min-w-0 break-words text-[15px] font-medium leading-snug text-foreground">
                          {item}
                        </span>
                      </div>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </DetailCard>
          </Reveal>
        )}
      </div>
    </div>
  );
}
