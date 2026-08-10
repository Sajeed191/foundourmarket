import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRevealOnce } from "@/lib/use-reveal-once";

const PLACEHOLDERS = [
  "Search 2,400+ curated products...",
  "Try 'wireless headphones'...",
  "Discover 'linen shirt'...",
  "Find 'ceramic mug'...",
  "Explore 'smart watch'...",
];

function useRotatingPlaceholder(active: boolean) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % PLACEHOLDERS.length), 2800);
    return () => clearInterval(id);
  }, [active]);
  return PLACEHOLDERS[idx];
}

export function HeroV2({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const rotating = useRotatingPlaceholder(!focused && !query);
  const { ref, shown } = useRevealOnce<HTMLElement>({ threshold: 0.1 });

  const greeting = useMemo(() => {
    if (!user) return null;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0];
    if (!name) return null;
    return `Welcome back, ${name}`;
  }, [user]);

  const reveal = (delay: number) => ({
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : "translate3d(0,12px,0)",
    transition: `opacity 600ms cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 600ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
    willChange: shown ? undefined : "opacity, transform",
  });

  return (
    <section
      ref={ref}
      className="relative z-30 px-3 sm:px-6 lg:px-10 pb-5 sm:pb-6"
      style={{
        background: "var(--gradient-hero)",
        marginTop: "calc(-1 * var(--app-header-h, 4.75rem))",
        paddingTop: "calc(var(--app-header-h, 4.75rem) + 1rem)",
      }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <div
          className="absolute left-1/2 -top-[6%] -translate-x-1/2 h-[420px] w-[140%] opacity-70"
          style={{ background: "radial-gradient(ellipse at 50% 0%, oklch(0.74 0.19 49 / 0.16), transparent 60%)" }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-3xl px-1 pt-1 sm:pt-4 pb-2 text-center">
        {greeting && (
          <p
            style={reveal(0)}
            className="mb-3 text-[10px] font-mono uppercase tracking-[0.25em] text-accent"
          >
            {greeting}
          </p>
        )}

        <h1 style={reveal(greeting ? 60 : 0)} className="font-display font-semibold tracking-[-0.02em] leading-[1.02] text-[clamp(2.6rem,11vw,4.5rem)]">
          <span className="block text-foreground">Whatever you need.</span>
          <span className="block bg-gradient-to-r from-foreground via-accent to-accent bg-clip-text text-transparent">
            All in one place.
          </span>
        </h1>

        <p style={reveal(greeting ? 120 : 60)} className="mx-auto mt-5 max-w-xl text-[15px] sm:text-lg leading-relaxed text-muted-foreground">
          A premium independent marketplace, sourcing top-quality products from across the world — delivered with cinematic precision.
        </p>

        <div style={reveal(greeting ? 180 : 120)} className="relative z-10 mx-auto mt-8 max-w-2xl">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Open search"
            className="group relative w-full rounded-full border border-white/10 shadow-[0_16px_40px_-20px_oklch(0_0_0/0.7)] transition-[border-color,box-shadow,transform] duration-300 hover:border-accent/40 active:scale-[0.995]"
            style={{ background: "oklch(0.19 0.008 60)" }}
          >
            <span className="absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 grid size-10 sm:size-11 place-items-center rounded-full bg-white/[0.05] text-muted-foreground transition-colors duration-300 group-hover:bg-accent/15 group-hover:text-accent">
              <Search className="size-[19px] sm:size-[21px]" />
            </span>
            <span className="flex h-14 sm:h-16 w-full items-center pl-14 sm:pl-16 pr-[120px] sm:pr-[140px] text-left text-base sm:text-[17px] font-medium tracking-[-0.01em] text-muted-foreground/65">
              {query.trim() || rotating}
            </span>
            <span className="pointer-events-none absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 inline-flex h-11 sm:h-12 items-center gap-1.5 rounded-full bg-accent px-5 sm:px-6 text-sm font-semibold uppercase tracking-[0.06em] text-accent-foreground shadow-[0_8px_24px_-8px_oklch(0.74_0.19_49/0.7)]">
              Search
            </span>
          </button>
        </div>

        <div style={reveal(greeting ? 240 : 180)} className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/search"
            search={{ q: "" }}
            className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-8 text-sm font-semibold uppercase tracking-[0.08em] text-accent-foreground shadow-[0_10px_30px_-10px_oklch(0.74_0.19_49/0.7)] transition-transform duration-200 hover:scale-[1.03] active:scale-95"
          >
            Shop Now
          </Link>
          <a
            href="#categories"
            className="inline-flex h-12 items-center justify-center rounded-full glass-strong px-8 text-sm font-semibold uppercase tracking-[0.08em] text-foreground ring-1 ring-white/12 transition-colors duration-200 hover:ring-accent/40"
          >
            Browse Categories
          </a>
        </div>
      </div>
    </section>
  );
}
