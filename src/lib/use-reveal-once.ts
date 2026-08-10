import { useEffect, useRef, useState } from "react";

/**
 * Pure, testable core of the reveal primitive.
 *
 * Guarantees `reveal()` is called exactly once and never after `cancel()`:
 *   - immediately when motion is reduced, or when there is no element /
 *     no IntersectionObserver support
 *   - when the element intersects the viewport
 *   - otherwise via a short safety timer, so a starved or mis-firing
 *     observer can never leave content permanently invisible
 */
export function scheduleReveal(opts: {
  el: Element | null;
  reduced: boolean;
  reveal: () => void;
  threshold?: number;
  rootMargin?: string;
  fallbackMs?: number;
  IO?: typeof IntersectionObserver;
  setTimer?: (fn: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
}): () => void {
  const {
    el,
    reduced,
    reveal,
    threshold = 0.05,
    rootMargin = "0px 0px -8% 0px",
    fallbackMs = 1200,
    IO = typeof IntersectionObserver === "undefined" ? undefined : IntersectionObserver,
    setTimer = (fn, ms) => setTimeout(fn, ms) as unknown as number,
    clearTimer = (id) => clearTimeout(id),
  } = opts;

  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    reveal();
  };

  if (reduced || !el || !IO) {
    fire();
    return () => {
      done = true;
    };
  }

  const timer = setTimer(fire, fallbackMs);
  const io = new IO(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        clearTimer(timer);
        fire();
      }
    },
    { threshold, rootMargin },
  );
  io.observe(el);

  return () => {
    done = true; // prevents stale updates after unmount
    clearTimer(timer);
    io.disconnect();
  };
}

/**
 * Site-wide reveal primitive.
 *
 * EVERY animated block using this hook has a guaranteed visible end state.
 * Reveal happens on intersection, but a short safety timer (default 1200ms)
 * flips it visible even if:
 *   - IntersectionObserver never fires (Android WebView / Samsung Internet)
 *   - an ancestor transform/clip makes the observer mis-report
 *   - the main thread is starved under heavy CPU load
 *
 * Also respects prefers-reduced-motion (immediately visible, no animation),
 * disconnects observers, clears timers, and never updates state after unmount.
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
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    return scheduleReveal({
      el: ref.current,
      reduced,
      reveal: () => setShown(true),
      threshold,
      rootMargin,
      fallbackMs,
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (id) => window.clearTimeout(id),
    });
  }, [shown, threshold, rootMargin, fallbackMs]);

  return { ref, shown } as const;
}
