import { useEffect, useRef, type ReactNode } from "react";

type RevealDirection = "up" | "down" | "left" | "right" | "none";

/**
 * Scroll-triggered entrance animation.
 * - direction: which axis to slide from (default "up")
 * - distance: how far to travel in px (default 28)
 * - delay: animation delay in ms (default 0) — use for stagger
 * - duration: transition duration in ms (default 650)
 */
export function Reveal({
  children,
  className = "",
  as: Tag = "div",
  direction = "up",
  distance = 28,
  delay = 0,
  duration = 650,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li" | "ul";
  direction?: RevealDirection;
  distance?: number;
  delay?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const translateMap: Record<RevealDirection, string> = {
      up: `translateY(${distance}px)`,
      down: `translateY(-${distance}px)`,
      left: `translateX(${distance}px)`,
      right: `translateX(-${distance}px)`,
      none: "none",
    };

    // Set initial hidden state
    el.style.opacity = "0";
    el.style.transform = translateMap[direction];
    el.style.transition = reduced
      ? "none"
      : `opacity ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`;

    if (reduced) {
      el.style.opacity = "1";
      el.style.transform = "none";
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.style.opacity = "1";
            el.style.transform = "none";
            obs.unobserve(e.target);
          }
        }
      },
      { threshold: 0.1 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [direction, distance, delay, duration]);

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={className}>
      {children}
    </Tag>
  );
}
