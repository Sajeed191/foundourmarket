import { forwardRef, useCallback, useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * ImageWithSkeleton — PDP v7.x (Initial Render Fix)
 *
 * Renders an <img> that fades in on load, with a subtle shimmer skeleton
 * underneath while decoding. The parent controls dimensions so there is zero
 * layout shift.
 *
 * Robustness rules:
 *   • Cached / already-decoded images: if `img.complete && naturalWidth > 0`
 *     at mount (or after a src swap), we mark loaded synchronously — otherwise
 *     React's onLoad may never fire for images the browser already has,
 *     leaving a blank area after refresh / back-forward / deep-link.
 *   • Errored images: skeleton hides so caller's onError fallback shows.
 *   • Skeleton state resets whenever `src` changes.
 */
type Props = ImgHTMLAttributes<HTMLImageElement> & {
  imgClassName?: string;
  skeletonClassName?: string;
};

export const ImageWithSkeleton = forwardRef<HTMLImageElement, Props>(
  function ImageWithSkeleton(
    { src, className, imgClassName, skeletonClassName, onLoad, onError, style, ...rest },
    ref,
  ) {
    const key = String(src ?? "");
    const localRef = useRef<HTMLImageElement | null>(null);

    // Synchronously seed loaded=true when the browser already has the bitmap
    // (SSR-served, cached, back-forward nav). Prevents a permanent opacity:0
    // state when onLoad never fires post-hydration.
    const computeInitialLoaded = () => {
      if (typeof window === "undefined") return false;
      const img = localRef.current;
      return !!(img && img.complete && img.naturalWidth > 0);
    };

    const [loaded, setLoaded] = useState(false);
    const [errored, setErrored] = useState(false);

    // Reset visual state on src change.
    useEffect(() => {
      setLoaded(false);
      setErrored(false);
    }, [key]);

    // Cached-image guard — runs after mount and after every src change.
    useEffect(() => {
      const img = localRef.current;
      if (!img) return;
      if (img.complete) {
        if (img.naturalWidth > 0) setLoaded(true);
        else if (key) setErrored(true);
      }
    }, [key]);

    const setRefs = useCallback(
      (node: HTMLImageElement | null) => {
        localRef.current = node;
        // Same-tick check for images already decoded before React attached
        // its onLoad handler (common on refresh & deep-link).
        if (node && node.complete && node.naturalWidth > 0) {
          setLoaded(true);
        }
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLImageElement | null>).current = node;
      },
      [ref],
    );

    // Reference computeInitialLoaded so TS treats it as intentionally-declared
    // documentation for the pattern; the ref-callback covers the actual timing.
    void computeInitialLoaded;

    return (
      <span className={cn("absolute inset-0 block", className)} style={style}>
        {!loaded && !errored && (
          <span
            aria-hidden
            className={cn(
              "absolute inset-0 bg-white/[0.03] overflow-hidden",
              skeletonClassName,
            )}
          >
            <span
              className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite]"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)",
              }}
            />
          </span>
        )}
        <img
          {...rest}
          key={key}
          ref={setRefs}
          src={src}
          onLoad={(e) => {
            setLoaded(true);
            onLoad?.(e);
          }}
          onError={(e) => {
            setErrored(true);
            onError?.(e);
          }}
          className={cn(
            "transition-opacity duration-200 ease-out",
            loaded || errored ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
      </span>
    );
  },
);
