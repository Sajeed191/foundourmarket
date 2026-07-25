import { forwardRef, useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * ImageWithSkeleton — PDP v5.4 (Focused Patch A)
 *
 * Renders an <img> that fades in on load, with a subtle shimmer skeleton
 * sitting underneath while the image is decoding. The parent controls the box
 * dimensions (aspect-ratio / fixed size) so there is zero layout shift.
 *
 * Behavior:
 *   • Skeleton fades out and image fades in over ~180ms.
 *   • Skeleton resets whenever `src` changes (via keyed state).
 *   • Preserves the caller's onLoad / onError handlers.
 *   • Skeleton stays hidden when the image errors, so the caller's onError
 *     fallback shows immediately.
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
    // Keyed by src so navigating to a new image restarts the skeleton.
    const [loaded, setLoaded] = useState(false);
    const [errored, setErrored] = useState(false);
    const key = String(src ?? "");

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
          ref={ref}
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
