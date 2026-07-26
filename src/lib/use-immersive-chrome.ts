import { useEffect } from "react";

/**
 * Immersive Chrome (Reviews / Q&A v7.3)
 *
 * While any Review or Q&A composer, editor or confirmation surface is open the
 * app must read as its own premium screen. This hook flips a single, global,
 * reference-counted body attribute (`data-immersive-ui`) that the stylesheet
 * uses to hide the site header, bottom navigation, sticky purchase docks and
 * every floating widget, and mirrors the same state into the floating-stack
 * registry so the Live Chat orb / admin widgets recede too.
 *
 * Reference counting means nested surfaces (e.g. delete confirmation opened
 * from inside an editor) never restore chrome early, and the restore happens
 * in one frame — no flicker, no layout jump, no scroll reset (scroll handling
 * stays in `useModalScrollLock`).
 *
 * Presentation-only: no data, validation or business logic involved.
 */

const ATTR = "data-immersive-ui";
let refCount = 0;

function acquire() {
  refCount += 1;
  if (refCount === 1 && typeof document !== "undefined") {
    document.body.setAttribute(ATTR, "");
  }
}

function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && typeof document !== "undefined") {
    document.body.removeAttribute(ATTR);
  }
}

export function useImmersiveChrome(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === "undefined") return;

    acquire();

    let restoreContext = () => {};
    let cancelled = false;
    import("@/lib/floating-stack")
      .then((m) => {
        if (cancelled) return;
        m.setContextHidden(true);
        restoreContext = () => m.setContextHidden(false);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      release();
      restoreContext();
    };
  }, [active]);
}
