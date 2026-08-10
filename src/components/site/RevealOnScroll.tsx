import { useRevealOnce } from "@/lib/use-reveal-once";

/**
 * Phase 4 polish primitive.
 * Fades + gently slides children upward the first time they cross the
 * viewport. Uses only opacity + transform (GPU-friendly), respects
 * `prefers-reduced-motion`, and is backed by the shared `useRevealOnce`
 * primitive so the content is GUARANTEED to become visible even when the
 * IntersectionObserver never fires.
 */
export function RevealOnScroll({
  children,
  as: Tag = "div",
  delay = 0,
  className = "",
  distance = 10,
  duration = 500,
}: {
  children: React.ReactNode;
  as?: React.ElementType;
  delay?: number;
  className?: string;
  distance?: number;
  duration?: number;
}) {
  const { ref, shown } = useRevealOnce<HTMLElement>();

  const style: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "translate3d(0,0,0)" : `translate3d(0,${distance}px,0)`,
    transition: `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
    willChange: shown ? undefined : "opacity, transform",
  };

  return (
    <Tag ref={ref as never} style={style} className={className}>
      {children}
    </Tag>
  );
}
