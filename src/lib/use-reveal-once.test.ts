/**
 * Reveal reliability regression tests.
 * Run with:  bun run src/lib/use-reveal-once.test.ts
 *
 * Guards the rule: EVERY animated/revealed content block must have a
 * guaranteed visible end state — no matter what the observer, the motion
 * preference, hydration timing or unmount order do.
 */
import { scheduleReveal } from "./use-reveal-once";
import { safeReveal } from "./safe-reveal";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed++;
    console.error(`✗ ${msg}`);
  } else {
    console.log(`✓ ${msg}`);
  }
}

type Cb = (entries: { isIntersecting: boolean }[]) => void;

function harness() {
  const timers = new Map<number, () => void>();
  let next = 1;
  const cap: { cb?: Cb; observed: number; disconnected: number } = { observed: 0, disconnected: 0 };
  let revealed = 0;

  const FakeIO = class {
    constructor(cb: Cb) {
      cap.cb = cb;
    }
    observe() {
      cap.observed++;
    }
    unobserve() {}
    disconnect() {
      cap.disconnected++;
    }
  } as unknown as typeof IntersectionObserver;

  return {
    cap,
    revealed: () => revealed,
    runTimers: () => {
      for (const fn of [...timers.values()]) fn();
    },
    pendingTimers: () => timers.size,
    run: (el: Element | null, reduced = false) =>
      scheduleReveal({
        el,
        reduced,
        reveal: () => revealed++,
        IO: FakeIO,
        setTimer: (fn) => {
          const id = next++;
          timers.set(id, fn);
          return id;
        },
        clearTimer: (id) => {
          timers.delete(id);
        },
      }),
  };
}

const el = {} as Element;

/* ── Reduced motion: immediate, no animation, never hidden ──────────────── */
{
  const h = harness();
  h.run(el, true);
  assert(h.revealed() === 1, "reduced motion paints the final visible state immediately");
  assert(h.cap.observed === 0, "reduced motion does not create an observer");
}

/* ── No element (SSR / detached) ────────────────────────────────────────── */
{
  const h = harness();
  h.run(null);
  assert(h.revealed() === 1, "missing element reveals immediately instead of staying hidden");
}

/* ── Normal path ────────────────────────────────────────────────────────── */
{
  const h = harness();
  h.run(el);
  assert(h.revealed() === 0, "content starts hidden only while the reveal is pending");
  h.cap.cb!([{ isIntersecting: true }]);
  assert(h.revealed() === 1, "observer intersection reveals the content");
  assert(h.cap.disconnected === 1, "observer is disconnected after firing");
  assert(h.pendingTimers() === 0, "safety timer is cleared after the observer fires (no leak)");
}

/* ── Observer failure: the critical case ────────────────────────────────── */
{
  const h = harness();
  h.run(el);
  h.runTimers();
  assert(h.revealed() === 1, "content becomes visible even if IntersectionObserver NEVER fires");
}

/* ── Delayed observer callback after the fallback ───────────────────────── */
{
  const h = harness();
  h.run(el);
  h.runTimers();
  h.cap.cb!([{ isIntersecting: true }]);
  assert(h.revealed() === 1, "a late observer callback does not double-reveal");
}

/* ── Non-intersecting entries ───────────────────────────────────────────── */
{
  const h = harness();
  h.run(el);
  h.cap.cb!([{ isIntersecting: false }]);
  assert(h.revealed() === 0, "non-intersecting entries do not reveal early");
}

/* ── Unmount before the fallback timer ──────────────────────────────────── */
{
  const h = harness();
  const cancel = h.run(el);
  cancel();
  assert(h.cap.disconnected === 1, "unmount disconnects the observer");
  assert(h.pendingTimers() === 0, "unmount clears the safety timer");
  h.cap.cb!([{ isIntersecting: true }]);
  assert(h.revealed() === 0, "no stale state update after unmount / rapid navigation");
}

/* ── No IntersectionObserver support at all ─────────────────────────────── */
{
  let revealed = 0;
  scheduleReveal({ el, reduced: false, reveal: () => revealed++, IO: undefined });
  assert(revealed === 1, "engines without IntersectionObserver render content immediately");
}

/* ── safeReveal: hydration flip of useReducedMotion cannot hide content ─── */
for (const reduce of [true, false, null, undefined]) {
  const props = safeReveal(reduce as boolean | null | undefined);
  assert(
    JSON.stringify(props.animate) === JSON.stringify({ opacity: 1, y: 0 }),
    `safeReveal(${String(reduce)}) always supplies a visible animate target`,
  );
}
assert(safeReveal(true).initial === false, "reduced motion drops the hidden initial state");
assert(
  JSON.stringify(safeReveal(false).initial) === JSON.stringify({ opacity: 0, y: 12 }),
  "full motion keeps the entrance animation",
);

console.log(failed === 0 ? "\nAll assertions passed." : `\n${failed} assertion(s) failed.`);
if (failed > 0) process.exit(1);
