import { useEffect } from "react";

/**
 * Scroll-Lock Guard — recovers from stuck Radix / react-remove-scroll locks.
 *
 * Radix overlays (Dialog, Sheet, DropdownMenu, Popover…) set
 * `body[data-scroll-locked]` + inline `pointer-events: none` while open and
 * clear it on unmount. If an overlay unmounts during a route transition,
 * Suspense swap, or an error boundary reset, the cleanup can be skipped — the
 * body stays with `pointer-events: none` and every click on the page (the
 * floating Live Chat orb included) silently does nothing.
 *
 * This observer watches the body attributes and clears the lock whenever no
 * overlay is actually open. Purely defensive: it never touches the body while
 * a real overlay is mounted, so normal modal behaviour is unchanged.
 */
const OPEN_OVERLAY_SELECTOR = [
  '[data-radix-popper-content-wrapper]',
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[data-radix-focus-guard]',
  '[data-state="open"][data-radix-menu-content]',
  '[data-vaul-drawer][data-state="open"]',
].join(",");

function overlayOpen(): boolean {
  return !!document.querySelector(OPEN_OVERLAY_SELECTOR);
}

function release() {
  const body = document.body;
  const locked =
    body.hasAttribute("data-scroll-locked") ||
    body.style.pointerEvents === "none";
  if (!locked) return;
  if (overlayOpen()) return;
  body.removeAttribute("data-scroll-locked");
  if (body.style.pointerEvents === "none") body.style.removeProperty("pointer-events");
  // react-remove-scroll also parks these while locked.
  if (body.style.overflow === "hidden" && !body.classList.contains("hide-bottom-nav")) {
    body.style.removeProperty("overflow");
  }
  body.style.removeProperty("margin-right");
}

export function ScrollLockGuard() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        release();
      });
    };

    // Initial sweep after hydration settles.
    const t = window.setTimeout(schedule, 300);

    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { attributes: true, attributeFilter: ["style", "data-scroll-locked"] });

    // Safety net: a dead pointer surface should never survive a user gesture.
    const onPointerDown = () => {
      if (document.body.style.pointerEvents === "none") release();
    };
    window.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      window.clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);

  return null;
}

export default ScrollLockGuard;
