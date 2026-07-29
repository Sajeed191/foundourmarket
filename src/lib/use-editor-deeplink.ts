/**
 * useEditorDeepLink — Smart Work Queue → Product Editor arrival behaviour.
 *
 * NAVIGATION / UX ONLY. Reads the `?focus=` deep-link hint placed on the
 * editor URL by the Smart Work Queue, scrolls to the target section, keeps a
 * soft accent glow until the admin edits it, and (after a save) returns to
 * the queue with its previous state restored.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { focusEditorField } from "@/lib/editor-focus";
import { armQueueRestore, clearQueueReturn, readQueueReturn } from "@/lib/editor-deeplink";

const GLOW = "editor-deeplink-target";

export type EditorDeepLink = {
  /** True when the admin arrived here from a work-queue recommendation. */
  active: boolean;
  /** `data-editor-field` key that was targeted. */
  focus: string | null;
  /** Friendly label of the target section. */
  label: string | null;
  /** Call once the section has saved — returns to the queue. */
  returnToQueue: (resolvedMessage?: string) => void;
};

function readParams() {
  if (typeof window === "undefined") return { focus: null as string | null, label: null as string | null, from: null as string | null };
  const p = new URLSearchParams(window.location.search);
  return { focus: p.get("focus"), label: p.get("dl"), from: p.get("from") };
}

export function useEditorDeepLink(ready: boolean): EditorDeepLink {
  const navigate = useNavigate();
  const [params] = useState(readParams);
  const done = useRef(false);

  // Universal Smart Navigation: any origin screen can deep-link here.
  const active = Boolean(params.focus && params.from);


  // Arrive: scroll, glow, focus the first empty input in the section.
  useEffect(() => {
    if (!active || !ready || done.current || !params.focus) return;
    done.current = true;
    const key = params.focus;
    focusEditorField(key, { select: true });

    const t = window.setTimeout(() => {
      const host = document.querySelector<HTMLElement>(`[data-editor-field="${CSS.escape(key)}"]`);
      if (!host) return;
      host.classList.add(GLOW);
      const inputs = Array.from(
        host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"),
      );
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
  }, [active, ready, params.focus]);

  const returnToQueue = useCallback(
    (resolvedMessage?: string) => {
      if (!active) return;
      const back = readQueueReturn();
      clearQueueReturn();
      clearIssueQueue();
      armQueueRestore(resolvedMessage ?? `${params.label ?? "Recommendation"} resolved`);
      toast.success(`✅ ${resolvedMessage ?? `${params.label ?? "Recommendation"} resolved`}`, { duration: 2200 });
      navigate({
        to: (back?.path ?? "/admin-work-queue") as "/admin-work-queue",
        search: back?.queue ? ({ queue: back.queue } as never) : undefined,
      });
    },
    [active, navigate, params.label],
  );

  return { active, focus: params.focus, label: params.label, origin: params.from, returnToQueue };

}
