/**
 * Auto Field Focus — Product Editor 5.0.
 *
 * Presentation-only helper: after data is applied (smart paste, AI suggestion,
 * validation fix) we smooth-scroll to the destination field and pulse an
 * accent glow for 800ms so the admin never has to hunt for what changed.
 *
 * Mark any destination with `data-editor-field="<key>"`.
 */

const GLOW_CLASS = "editor-field-flash";
const GLOW_MS = 800;

export function focusEditorField(key: string, opts: { select?: boolean } = {}) {
  if (typeof document === "undefined") return;
  // Let collapsed sections expand themselves before we measure/scroll.
  window.dispatchEvent(new CustomEvent("editor-focus-field", { detail: key }));
  // Wait a frame so freshly-applied state has rendered.
  requestAnimationFrame(() => {

    const sel = CSS.escape(key);
    const host =
      document.querySelector<HTMLElement>(`[data-editor-field="${sel}"]`) ??
      document.querySelector<HTMLElement>(`[data-smart-target="${sel}"]`);
    if (!host) return;

    // Auto-expand: never make the admin click "Expand" to reach the target.
    let node: HTMLElement | null = host;
    while (node) {
      if (node instanceof HTMLDetailsElement) node.open = true;
      const trigger = node.querySelector<HTMLElement>('[aria-expanded="false"][data-smart-expand]');
      trigger?.click();
      node = node.parentElement;
    }

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    host.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });


    host.classList.remove(GLOW_CLASS);
    // force reflow so the animation restarts on repeat applies
    void host.offsetWidth;
    host.classList.add(GLOW_CLASS);
    window.setTimeout(() => host.classList.remove(GLOW_CLASS), GLOW_MS);

    if (opts.select) {
      const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
      input?.focus({ preventScroll: true });
    }
  });
}

/** Focus the first destination that actually received data. */
export function focusFirstApplied(keys: string[]) {
  const first = keys.find(Boolean);
  if (first) focusEditorField(first);
}
