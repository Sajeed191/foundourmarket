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
  '[data-state="open"][data-radix-menu-content]',
  '[data-vaul-drawer][data-state="open"]',
].join(",");

function overlayOpen(): boolean {
  return !!document.querySelector(OPEN_OVERLAY_SELECTOR);
}

/**
 * Radix renders its dim overlay as a sibling of the content inside a portal.
 * When the dialog unmounts mid exit-animation (route change, Suspense swap,
 * conditional `{cond && <Modal/>}` flipping), the overlay node can survive with
 * `data-state="open"` — an invisible full-screen shield that swallows every
 * click, including the Live Chat orb. Remove those orphans.
 */
function sweepOrphanOverlays(): void {
  if (overlayOpen()) return;
  document
    .querySelectorAll<HTMLElement>('[data-state="open"].fixed.inset-0[aria-hidden="true"]')
    .forEach((el) => {
      // Only remove shields that contain no interactive content of their own.
      if (el.querySelector("button, a, input, [role]")) return;
      el.remove();
    });
  // Focus guards left behind by an unmounted dialog trap keyboard focus.
  if (!document.querySelector('[role="dialog"],[role="alertdialog"]')) {
    document.querySelectorAll("[data-radix-focus-guard]").forEach((el) => el.remove());
  }
}

function release() {
  sweepOrphanOverlays();
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
    mo.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "data-scroll-locked"],
      childList: true,
    });

    // Safety net: a dead pointer surface should never survive a user gesture.
    const onPointerDown = () => release();
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
