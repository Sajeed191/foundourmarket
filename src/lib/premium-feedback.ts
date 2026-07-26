/**
 * FoundOurMarket™ premium feedback primitives (Reviews & Q&A polish pass).
 * Presentation-only: light haptics + one consistent success/error toast style.
 * No business logic, no network calls.
 */
import { toast } from "sonner";

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Light impact haptic where supported. Silently no-ops elsewhere. */
export function haptic(kind: "light" | "selection" | "success" = "light") {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (prefersReducedMotion()) return;
    navigator.vibrate(kind === "success" ? [8, 26, 8] : kind === "selection" ? 6 : 10);
  } catch {
    /* haptics are best-effort */
  }
}

const TOAST_DURATION = 2500;

/** Glass success toast — ✓ + short label, auto-dismiss at 2.5s. */
export function successToast(message: string, description?: string) {
  haptic("success");
  toast.success(message, { description, duration: TOAST_DURATION });
}

/** Friendly, non-alarming failure toast. */
export function errorToast(message: string, description?: string) {
  toast.error(message, { description, duration: 4000 });
}

/**
 * Restores DOM focus to whatever element opened an overlay.
 * Call `capture()` right before opening, `restore()` after it closes.
 */
export function createFocusReturn() {
  let origin: HTMLElement | null = null;
  return {
    capture() {
      const el = typeof document !== "undefined" ? document.activeElement : null;
      origin = el instanceof HTMLElement ? el : null;
    },
    restore() {
      const el = origin;
      origin = null;
      if (!el || !el.isConnected) return;
      requestAnimationFrame(() => {
        try { el.focus({ preventScroll: true }); } catch { /* noop */ }
      });
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Focus return                                                               */
/* -------------------------------------------------------------------------- */
import { useEffect, useRef } from "react";

let lastInteractive: HTMLElement | null = null;
if (typeof document !== "undefined") {
  const track = (e: Event) => {
    const t = e.target as HTMLElement | null;
    const el = t?.closest?.("button, [role='button'], a, summary") as HTMLElement | null;
    if (el) lastInteractive = el;
  };
  document.addEventListener("pointerdown", track, true);
  document.addEventListener("keyup", track, true);
}

/**
 * Returns DOM focus to the control that opened an overlay once it closes.
 * Presentation-only; safe on every overlay.
 */
export function useFocusReturn(open: boolean) {
  const origin = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      origin.current = lastInteractive;
      return;
    }
    const el = origin.current;
    origin.current = null;
    if (!el || !el.isConnected) return;
    const id = requestAnimationFrame(() => {
      try { el.focus({ preventScroll: true }); } catch { /* noop */ }
    });
    return () => cancelAnimationFrame(id);
  }, [open]);
}
