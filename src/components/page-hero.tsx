import { type ReactNode } from "react";

/**
 * Shared page banner.
 *
 * Parallax technique: the background image is a fixed-position div that
 * stays put in the viewport while the section content scrolls over it.
 * This is pure CSS — no scroll listeners needed, no iOS jank workaround
 * because the section itself clips the fixed layer via overflow:hidden on
 * a wrapper that establishes its own stacking context.
 *
 * Pass large={true} on the homepage for a taller, more dramatic hero.
 */
export function PageHero({
  kicker,
  title,
  body,
  imageSrc,
  children,
  large = false,
}: {
  kicker?: string;
  title: string;
  body?: string;
  imageSrc?: string;
  children?: ReactNode;
  large?: boolean;
}) {
  return (
    <section
      className="relative overflow-hidden border-b border-border"
      style={{ minHeight: large ? "560px" : "320px" }}
    >
      {/* Fixed background layer — stays put as page scrolls */}
      {imageSrc && (
        <div
          aria-hidden
          className="absolute inset-0 -z-0"
          style={{
            backgroundImage: `url(${imageSrc})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundAttachment: "fixed",
            // Slightly desaturated so colors are softer behind text
            filter: "saturate(0.85) brightness(0.72)",
          }}
        />
      )}

      {/* Base colour fill so there's always a dark backdrop even without an image */}
      <div
        aria-hidden
        className="absolute inset-0 -z-0 bg-forest-deep"
        style={{ opacity: imageSrc ? 0 : 1 }}
      />

      {/*
        Multi-layer scrim — gentler than before:
        · Bottom-to-top dark gradient (anchors text at bottom, fades cleanly)
        · Left-to-right vignette (keeps left edge readable on all images)
        · A very subtle warm cream tint at top so it blends into the page
      */}
      <div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background: [
            "linear-gradient(to top,    oklch(0.235 0.055 155 / 0.70) 0%,  transparent 55%)",
            "linear-gradient(to right,  oklch(0.235 0.055 155 / 0.72) 0%,  oklch(0.235 0.055 155 / 0.30) 60%, transparent 100%)",
            "linear-gradient(to bottom, oklch(0.235 0.055 155 / 0.28) 0%,  transparent 30%)",
          ].join(", "),
        }}
      />

      {/* Content */}
      <div
        className={`relative z-10 mx-auto max-w-6xl px-6 ${
          large ? "py-28 sm:py-36" : "py-16 sm:py-20"
        }`}
      >
        {kicker && (
          <p
            className="hero-text-shadow animate-hero-in text-xs font-semibold uppercase tracking-[0.2em] text-gold"
            style={{ animationDelay: "0ms" }}
          >
            {kicker}
          </p>
        )}
        <h1
          className={`hero-text-shadow animate-hero-in mt-3 max-w-3xl font-display font-semibold text-primary-foreground ${
            large
              ? "text-4xl leading-[1.12] sm:text-5xl lg:text-6xl"
              : "text-3xl leading-tight sm:text-4xl"
          }`}
          style={{ animationDelay: "80ms" }}
        >
          {title}
        </h1>
        {body && (
          <p
            className={`hero-text-shadow animate-hero-in mt-4 max-w-2xl text-primary-foreground/85 ${
              large ? "text-lg leading-relaxed" : "text-base leading-relaxed"
            }`}
            style={{ animationDelay: "160ms" }}
          >
            {body}
          </p>
        )}
        {children && (
          <div
            className="animate-hero-in mt-8"
            style={{ animationDelay: "260ms" }}
          >
            {children}
          </div>
        )}
      </div>

      {/* Soft bottom fade — blends hero edge into page background */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-24"
        style={{
          background:
            "linear-gradient(to bottom, transparent, var(--color-background))",
          opacity: 0.55,
        }}
      />
    </section>
  );
}
