import { useEffect, useRef, useState } from "react";
import { Globe2, ShieldCheck, Truck, Headphones } from "lucide-react";
import { PremiumSectionHeading } from "@/components/site/PremiumSectionHeading";

const BENEFITS = [
  {
    icon: Globe2,
    title: "Global Sourcing",
    desc: "Curated products from trusted suppliers across the world, delivered to your door.",
  },
  {
    icon: ShieldCheck,
    title: "Buyer Protection",
    desc: "Every order is backed by our secure checkout and hassle-free return policy.",
  },
  {
    icon: Truck,
    title: "Fast Fulfillment",
    desc: "Optimized logistics mean shorter waits and real-time tracking on every shipment.",
  },
  {
    icon: Headphones,
    title: "Premium Support",
    desc: "Our team is available around the clock to help with orders, returns, and questions.",
  },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export function WhyFoundOurMarket() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <section ref={ref} className="px-4 sm:px-6 pt-9 pb-10 sm:pt-12 sm:pb-12 max-w-7xl mx-auto">
      <PremiumSectionHeading
        title="Why FoundOurMarket"
        eyebrow="The Difference"
        subtitle="A marketplace built for people who value quality, clarity, and care."
      />
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {BENEFITS.map(({ icon: Icon, title, desc }, i) => (
          <div
            key={title}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-card p-5 transition-all duration-300 hover:border-accent/30 hover:-translate-y-0.5"
            style={{
              opacity: shown ? 1 : 0,
              transform: shown ? "translate3d(0,0,0)" : "translate3d(0,12px,0)",
              transition: `opacity 500ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms, transform 500ms cubic-bezier(0.22,1,0.36,1) ${i * 60}ms`,
            }}
          >
            <div aria-hidden className="absolute -right-6 -top-6 size-24 rounded-full bg-accent/10 blur-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="relative">
              <span className="mb-4 grid size-10 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/25">
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
