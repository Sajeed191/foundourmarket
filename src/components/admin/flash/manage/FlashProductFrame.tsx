/**
 * Uniform product image frame for the Flash Deals workspace.
 *
 * Always `object-contain` inside a padded, rounded surface so product shots are
 * never cropped or stretched, with a shimmer skeleton while loading and a
 * graceful fallback when there is no image.
 */
import { useState } from "react";
import { ImageOff } from "lucide-react";

export function FlashProductFrame({
  src, alt, className = "", overlay, rounded = "rounded-xl",
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  overlay?: React.ReactNode;
  rounded?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const show = src && !failed;

  return (
    <div
      className={`relative overflow-hidden bg-black/40 ring-1 ring-white/10 ${rounded} ${className}`}
    >
      {show ? (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-white/[0.06]" aria-hidden />}
          <img
            loading="lazy"
            decoding="async"
            src={src}
            alt={alt ?? ""}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`size-full object-contain p-2 transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        </>
      ) : (
        <span className="grid size-full place-items-center text-muted-foreground/70">
          <ImageOff className="size-5" />
        </span>
      )}
      {overlay}
    </div>
  );
}
