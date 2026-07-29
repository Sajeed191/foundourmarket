/**
 * useSmartFocus — Universal Smart Navigation arrival behaviour (v1.0).
 *
 * NAVIGATION / UX ONLY. Drop this into any admin page that can be a deep-link
 * destination (vendors, orders, campaigns, flash deals, duplicates, …). It
 * reads the `?focus=` hint, auto-expands, scrolls, glows and focuses the first
 * empty input inside `[data-smart-target="<focus>"]`.
 */
import { useEffect, useMemo, useRef } from "react";
import { focusEditorField } from "@/lib/editor-focus";

const GLOW = "editor-deeplink-target";

export type SmartFocus = {
  /** True when the admin arrived from a recommendation elsewhere. */
  active: boolean;
  focus: string | null;
  label: string | null;
  /** Entity id carried by the link (vendor/order/campaign id, …). */
  entityId: string | null;
  origin: string | null;
};

export function readSmartParams(): SmartFocus {
  if (typeof window === "undefined") return { active: false, focus: null, label: null, entityId: null, origin: null };
  const p = new URLSearchParams(window.location.search);
  const focus = p.get("focus");
  const origin = p.get("from");
  return { active: Boolean(focus && origin), focus, label: p.get("dl"), entityId: p.get("eid"), origin };
}

export function useSmartFocus(ready = true): SmartFocus {
  const params = useMemo(readSmartParams, []);
  const done = useRef(false);

  useEffect(() => {
    if (!params.active || !ready || done.current || !params.focus) return;
    done.current = true;
    const key = params.focus;
    focusEditorField(key, { select: true });

    const t = window.setTimeout(() => {
      const host = document.querySelector<HTMLElement>(`[data-smart-target="${CSS.escape(key)}"]`);
      if (!host) return;
      host.classList.add(GLOW);
      const inputs = Array.from(host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"));
      const empty = inputs.filter((el) => el.type !== "checkbox" && !el.value.trim());
      for (const el of empty) el.classList.add(GLOW);
      empty[0]?.focus({ preventScroll: true });

      const clear = () => {
        host.classList.remove(GLOW);
        for (const el of inputs) el.classList.remove(GLOW);
        host.removeEventListener("input", clear);
      };
      host.addEventListener("input", clear);
    }, 260);

    return () => window.clearTimeout(t);
  }, [params.active, params.focus, ready]);

  return params;
}
