/**
 * Safe reveal props for framer-motion.
 *
 * WHY THIS EXISTS
 * ---------------
 * The codebase used `initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}`
 * in many places. That pattern makes content INVISIBLE until an
 * IntersectionObserver callback fires. On several Android WebViews / Chromium
 * builds (the same devices that already forced the LazyMount safety timeout)
 * the observer can fail to fire, leaving whole sections permanently at
 * `opacity: 0` — the page looks like it is "still loading" forever even though
 * every request already resolved.
 *
 * `safeReveal()` removes that failure mode entirely:
 *   - reduced motion (or the app-wide MotionConfig) → no `initial` at all,
 *     content paints immediately;
 *   - otherwise → animate on MOUNT (`animate`), not on intersection, so the
 *     element can never get stuck hidden.
 *
 * Visual result is unchanged (same fade + rise), reliability is absolute.
 */

export type SafeRevealOpts = {
  y?: number;
  delay?: number;
  duration?: number;
};

export function safeReveal(reduce: boolean | null | undefined, opts: SafeRevealOpts = {}) {
  const { y = 12, delay = 0, duration = 0.45 } = opts;
  // CRITICAL: `animate` is ALWAYS a visible target, even under reduced motion.
  // `useReducedMotion()` returns false during SSR/first paint and flips to true
  // after hydration; if `animate` were conditional, the element would keep the
  // hidden `initial` style with no target to animate to and stay invisible
  // forever. Only `initial` is dropped when motion is reduced.
  if (reduce) {
    return {
      initial: false as const,
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0 },
    };
  }
  return {
    initial: { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { duration, delay, ease: [0.16, 1, 0.3, 1] as const },
  };
}
