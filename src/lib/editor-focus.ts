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
  // Wait a frame so freshly-applied state has rendered.
  requestAnimationFrame(() => {
    const host = document.querySelector<HTMLElement>(`[data-editor-field="${CSS.escape(key)}"]`);
    if (!host) return;

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
