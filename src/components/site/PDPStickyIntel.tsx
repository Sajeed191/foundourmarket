import { useEffect, useMemo, useState } from "react";

/**
 * PDP Sticky Purchase Bar — dynamic intelligence line.
 *
 * Renders ONE short status message above the sticky CTAs. Contextual product
 * signals (missing variant, coming soon, out of stock, low stock, delivery
 * ETA, rating) take priority. When none of those apply, a small trust rotator
 * cycles through Secure Checkout / Genuine Product / Fast Shipping / Easy
 * Returns / In Stock every few seconds with a subtle fade.
 *
 * Pure presentation. Does not read cart, inventory, or pricing state — the
 * parent passes already-resolved props so this stays cheap and lint-safe.
 */
export type PDPStickyIntelProps = {
  missingVariant: boolean;
  isOOS: boolean;
  isComingSoon: boolean;
  isPreorder: boolean;
  effectiveStock: number;
  lowStockThreshold: number;
  deliveryWindow: string;
  rating: number;
  reviews: number;
};

type IntelMessage = { key: string; text: string; tone: "accent" | "warn" | "muted" };

const TRUST_ROTATION: IntelMessage[] = [
  { key: "secure", text: "🔒 Secure Checkout", tone: "muted" },
  { key: "genuine", text: "✓ Genuine Product", tone: "muted" },
  { key: "fast", text: "⚡ Fast Dispatch", tone: "muted" },
  { key: "returns", text: "🛡 7-Day Returns", tone: "muted" },
];

export function PDPStickyIntel({
  missingVariant,
  isOOS,
  isComingSoon,
  isPreorder,
  effectiveStock,
  lowStockThreshold,
  deliveryWindow,
  rating,
  reviews,
}: PDPStickyIntelProps) {
  const priorityMessage = useMemo<IntelMessage | null>(() => {
    if (missingVariant) return { key: "opts", text: "Select options to continue", tone: "warn" };
    if (isComingSoon) return { key: "soon", text: "⏳ Coming Soon", tone: "muted" };
    if (isOOS) return { key: "oos", text: "Currently unavailable", tone: "muted" };
    if (isPreorder) return { key: "pre", text: "📦 Pre-order — ships when released", tone: "accent" };
    const lowThreshold = Math.max(1, Math.min(5, lowStockThreshold || 5));
    if (effectiveStock > 0 && effectiveStock <= lowThreshold) {
      return { key: "low", text: `🔥 Only ${effectiveStock} left`, tone: "warn" };
    }
    if (deliveryWindow) return { key: "eta", text: `🚚 Arrives ${deliveryWindow}`, tone: "accent" };
    return null;
  }, [missingVariant, isOOS, isComingSoon, isPreorder, effectiveStock, lowStockThreshold, deliveryWindow]);

  const ratingMessage = useMemo<IntelMessage | null>(() => {
    if (!(rating > 0 && reviews > 0)) return null;
    return {
      key: "rating",
      text: `⭐ ${rating.toFixed(1)} (${reviews.toLocaleString()} review${reviews === 1 ? "" : "s"})`,
      tone: "muted",
    };
  }, [rating, reviews]);

  const rotation = useMemo<IntelMessage[]>(() => {
    if (priorityMessage) return [priorityMessage];
    const stockOk: IntelMessage = { key: "stock", text: "✅ In Stock", tone: "muted" };
    const list = [stockOk, ...TRUST_ROTATION];
    if (ratingMessage) list.splice(1, 0, ratingMessage);
    return list;
  }, [priorityMessage, ratingMessage]);

  const [index, setIndex] = useState(0);
  useEffect(() => {
    setIndex(0);
    if (rotation.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % rotation.length);
    }, 3800);
    return () => window.clearInterval(id);
  }, [rotation]);

  const current = rotation[index] ?? rotation[0];
  if (!current) return null;

  const toneClass =
    current.tone === "warn"
      ? "text-accent"
      : current.tone === "accent"
        ? "text-emerald-300/90"
        : "text-foreground/70";

  return (
    <div
      aria-live="polite"
      className="pointer-events-none flex h-[14px] items-center justify-center overflow-hidden"
    >
      <span
        key={current.key}
        className={`text-[11px] font-medium tracking-wide leading-none whitespace-nowrap ${toneClass} motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500`}
      >
        {current.text}
      </span>
    </div>
  );
}
