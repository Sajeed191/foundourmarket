import { useEffect, useRef, useState } from "react";
import { Truck, ShieldCheck, RotateCcw, Headphones, Lock, Globe2, BadgeCheck } from "lucide-react";

const ITEMS = [
  { icon: Lock, label: "Secure Payments" },
  { icon: ShieldCheck, label: "Buyer Protection" },
  { icon: Globe2, label: "Global Shipping" },
  { icon: RotateCcw, label: "Easy Returns" },
  { icon: BadgeCheck, label: "Verified Suppliers" },
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

export function TrustStripV2() {
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
    <section ref={ref} className="px-4 sm:px-6 lg:px-10 pt-5 lg:pt-6 pb-8 lg:pb-10 max-w-7xl lg:max-w-[1480px] mx-auto">
      <div
        className="flex items-center justify-between rounded-2xl glass-strong ring-1 ring-white/10 px-3 sm:px-8 py-4 sm:py-5 shadow-[var(--shadow-float)]"
        style={{
          opacity: shown ? 1 : 0,
          transform: shown ? "translate3d(0,0,0)" : "translate3d(0,10px,0)",
          transition: "opacity 500ms cubic-bezier(0.22,1,0.36,1), transform 500ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {ITEMS.map(({ icon: Icon, label }, i) => (
          <div key={label} className="flex items-center">
            <div className="group flex flex-col sm:flex-row items-center gap-1.5 sm:gap-3">
              <span className="grid size-8 sm:size-9 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 text-foreground/80 transition-all duration-300 group-hover:text-accent group-hover:ring-accent/30">
                <Icon className="size-[15px] sm:size-[18px]" strokeWidth={1.75} />
              </span>
              <span className="text-[9px] sm:text-[13px] font-medium tracking-tight text-foreground/90 text-center sm:text-left">{label}</span>
            </div>
            {i < ITEMS.length - 1 && (
              <span aria-hidden className="hidden sm:block ml-4 sm:ml-8 h-6 sm:h-8 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
