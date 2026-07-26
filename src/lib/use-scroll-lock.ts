import { useEffect } from "react";

/**
 * Premium modal scroll lock (shared by the PDP Review and Ask-a-Question modals).
 *
 * Why this exists: the document has `scroll-behavior: smooth`, so restoring the
 * scroll position with `window.scrollTo(0, y)` produced a visible *animated*
 * scroll from the top of the page down to the reviews/questions section every
 * time a modal closed. This hook:
 *
 *  1. Freezes the body at the current scroll offset (iOS-safe `position: fixed`).
 *  2. Restores the exact previous offset INSTANTLY (scroll-behavior forced to
 *     `auto` for the duration of the restore), so there is never a jump or a
 *     smooth-scroll animation.
 *  3. Pins the position for a few frames afterwards so a late `scrollIntoView`,
 *     focus restoration, or browser scroll-anchoring cannot move the page.
 *  4. Restores focus to the element that opened the modal with
 *     `preventScroll: true`.
 *
 * Presentation-only: no data, validation or business logic is involved.
 */
export function useModalScrollLock(active: boolean, bodyAttribute?: string) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY;
    const trigger = document.activeElement as HTMLElement | null;

    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };

    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    if (bodyAttribute) body.setAttribute(bodyAttribute, "");

    return () => {
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      if (bodyAttribute) body.removeAttribute(bodyAttribute);

      // Instant restore — never animate, never jump.
      const prevBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      window.scrollTo(0, scrollY);

      let frames = 0;
      const pin = () => {
        if (Math.abs(window.scrollY - scrollY) > 1) window.scrollTo(0, scrollY);
        frames += 1;
        if (frames < 8) requestAnimationFrame(pin);
        else html.style.scrollBehavior = prevBehavior;
      };
      requestAnimationFrame(pin);

      // Focus restoration must never scroll the page.
      if (trigger && document.contains(trigger)) {
        try {
          trigger.focus({ preventScroll: true });
        } catch {
          /* ignore */
        }
      }
    };
  }, [active, bodyAttribute]);
}
