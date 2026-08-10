import { useEffect, useRef, useState } from "react";

/**
 * Site-wide reveal primitive.
 *
 * Guarantees a visible end state. Reveal happens when the element intersects
 * the viewport, but a short safety timer (default 1200ms) flips the element
 * visible even if:
 *   - IntersectionObserver never fires (some Android WebViews / Samsung Internet)
 *   - the element is inside a transformed/clipped ancestor the observer mis-reads
 *   - the browser is under heavy CPU load and callbacks are starved
 *
 * Also:
 *   - respects prefers-reduced-motion (immediately visible, no animation)
 *   - disconnects the observer and clears the timer on unmount (no stale state
 *     updates, no timer leaks)
 *   - never schedules work again once shown
 */
export function useRevealOnce<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number;
  rootMargin?: string;
  /** Safety fallback in ms. Keep short — this is a guard, not a delay. */
  fallbackMs?: number;
}) {
  const { threshold = 0.05, rootMargin = "0px 0px -8% 0px", fallbackMs = 1200 } = options ?? {};
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    if (typeof window === "undefined") return;

    // Reduced motion: paint final state immediately.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }

    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    let alive = true;
    const reveal = () => {
      if (!alive) return;
      alive = false;
      setShown(true);
    };

    const timer = window.setTimeout(reveal, fallbackMs);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          window.clearTimeout(timer);
          reveal();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      io.disconnect();
    };
  }, [shown, threshold, rootMargin, fallbackMs]);

  return { ref, shown } as const;
}
