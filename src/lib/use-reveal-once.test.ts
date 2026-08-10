import { describe, expect, it } from "vitest";
import { scheduleReveal } from "./use-reveal-once";
import { safeReveal } from "./safe-reveal";

type Cb = (entries: { isIntersecting: boolean }[]) => void;

function makeIO(capture: { cb?: Cb; observed: number; disconnected: number }) {
  return class FakeIO {
    constructor(cb: Cb) {
      capture.cb = cb;
    }
    observe() {
      capture.observed++;
    }
    unobserve() {}
    disconnect() {
      capture.disconnected++;
    }
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  } as unknown as typeof IntersectionObserver;
}

function harness() {
  const timers = new Map<number, () => void>();
  let next = 1;
  const cap = { observed: 0, disconnected: 0 } as { cb?: Cb; observed: number; disconnected: number };
  let revealed = 0;
  return {
    cap,
    get revealed() {
      return revealed;
    },
    runTimers() {
      for (const fn of [...timers.values()]) fn();
    },
    pendingTimers: () => timers.size,
    run(el: Element | null, reduced = false) {
      return scheduleReveal({
        el,
        reduced,
        reveal: () => revealed++,
        IO: makeIO(cap),
        setTimer: (fn, _ms) => {
          const id = next++;
          timers.set(id, fn);
          return id;
        },
        clearTimer: (id) => timers.delete(id),
      });
    },
  };
}

const el = {} as Element;

describe("scheduleReveal — guaranteed visible end state", () => {
  it("reveals immediately when reduced motion is on", () => {
    const h = harness();
    h.run(el, true);
    expect(h.revealed).toBe(1);
    expect(h.cap.observed).toBe(0);
  });

  it("reveals immediately when there is no element", () => {
    const h = harness();
    h.run(null);
    expect(h.revealed).toBe(1);
  });

  it("reveals when the observer fires", () => {
    const h = harness();
    h.run(el);
    expect(h.revealed).toBe(0);
    h.cap.cb!([{ isIntersecting: true }]);
    expect(h.revealed).toBe(1);
    expect(h.cap.disconnected).toBe(1);
    expect(h.pendingTimers()).toBe(0);
  });

  it("reveals via the safety fallback when the observer NEVER fires", () => {
    const h = harness();
    h.run(el);
    expect(h.revealed).toBe(0);
    h.runTimers();
    expect(h.revealed).toBe(1);
  });

  it("never double-reveals when a delayed observer callback arrives after the fallback", () => {
    const h = harness();
    h.run(el);
    h.runTimers();
    h.cap.cb!([{ isIntersecting: true }]);
    expect(h.revealed).toBe(1);
  });

  it("ignores non-intersecting entries", () => {
    const h = harness();
    h.run(el);
    h.cap.cb!([{ isIntersecting: false }]);
    expect(h.revealed).toBe(0);
  });

  it("does not reveal (no stale state update) after unmount", () => {
    const h = harness();
    const cancel = h.run(el);
    cancel();
    expect(h.cap.disconnected).toBe(1);
    expect(h.pendingTimers()).toBe(0);
    h.cap.cb!([{ isIntersecting: true }]);
    expect(h.revealed).toBe(0);
  });

  it("falls back to visible when IntersectionObserver is unavailable", () => {
    let revealed = 0;
    scheduleReveal({ el, reduced: false, reveal: () => revealed++, IO: undefined });
    expect(revealed).toBe(1);
  });
});

describe("safeReveal — reduced-motion hydration flip cannot hide content", () => {
  it("always supplies a visible animate target", () => {
    for (const reduce of [true, false, null, undefined]) {
      const props = safeReveal(reduce);
      expect(props.animate).toEqual({ opacity: 1, y: 0 });
      expect(props.animate).not.toBeUndefined();
    }
  });

  it("drops the hidden initial state under reduced motion", () => {
    expect(safeReveal(true).initial).toBe(false);
    expect(safeReveal(false).initial).toEqual({ opacity: 0, y: 12 });
  });
});
