import { createFileRoute } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { OFFICIALS } from "@/lib/content";
import { SITE } from "@/lib/site";
import officialsHall from "@/assets/officials-hall.jpg";

export const Route = createFileRoute("/officials")({
  head: () => ({
    meta: [
      { title: `Barangay Officials — ${SITE.name}` },
      { name: "description", content: "The elected and appointed officials serving Barangay Wawa, Taguig City, and their committee assignments." },
      { property: "og:title", content: `Barangay Officials — ${SITE.name}` },
      { property: "og:description", content: "The people serving Wawa and their committee assignments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OfficialsPage,
});

// Derived slices — matches the screenshot groupings exactly
const punongBarangay = OFFICIALS.filter((o) => o.role === "Punong Barangay");
const kagawads       = OFFICIALS.filter((o) => o.role === "Barangay Kagawad");
const others         = OFFICIALS.filter((o) =>
  o.role === "SK Chairperson" ||
  o.role === "Barangay Secretary" ||
  o.role === "Barangay Treasurer"
);

function OfficialCard({ role, name, committee, delay = 0 }: {
  role: string;
  name: string | null;
  committee?: string | undefined;
  delay?: number;
}) {
  return (
    <Reveal direction="up" delay={delay}>
      <div
        className="group card-lift flex items-start gap-4 rounded-2xl border border-border bg-card p-6"
        style={{ boxShadow: "0 2px 12px oklch(0.235 0.055 155 / 0.06)" }}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest-deep/8 text-forest-deep">
          <UserRound className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-forest-deep">{role}</p>
          {committee && (
            <p className="mt-0.5 text-sm font-medium text-gold-deep line-clamp-1 transition-all duration-300 group-hover:line-clamp-none">
              Committee on {committee}
            </p>
          )}
          <p className="mt-1 text-base text-muted-foreground">
            {name ?? "Name coming soon"}
          </p>
        </div>
      </div>
    </Reveal>
  );
}

function OfficialsPage() {
  return (
    <div>
      {/* ── Hero — meeting room with parallax, matches home page style ── */}
      <PageHero
        kicker="Barangay Wawa, Taguig City"
        title="Barangay Officials"
        body="The officials and their committee assignments. Names will be posted as the roster is finalized."
        imageSrc={officialsHall}
        large
      />

      {/* ── Elected Officials ────────────────────────────────────── */}
      <Reveal as="section" className="mx-auto max-w-6xl px-6 py-20" direction="up">

        <div className="mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
            Leadership
          </p>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-forest-deep sm:text-5xl">
            Elected Officials
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Barangay Wawa is governed by officials elected by its residents to serve a three-year term.
          </p>
        </div>

        {/* Punong Barangay — full-width featured card */}
        {punongBarangay.map((o, i) => (
          <Reveal key={`pb-${i}`} direction="up" delay={0}>
            <div
              className="mb-8 card-lift flex items-center gap-6 rounded-2xl border border-border bg-card p-8"
              style={{ boxShadow: "0 4px 24px oklch(0.235 0.055 155 / 0.08)" }}
            >
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-forest-deep/8 text-forest-deep">
                <UserRound className="size-8" aria-hidden />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
                  {o.role}
                </p>
                <p className="mt-1 font-display text-2xl font-semibold text-forest-deep">
                  {o.name ?? "Name coming soon"}
                </p>
              </div>
            </div>
          </Reveal>
        ))}

        {/* 7 Kagawads — 3-col grid matching screenshot */}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kagawads.map((o, i) => (
            <li key={`kag-${i}`}>
              <OfficialCard
                role={o.role}
                name={o.name}
                committee={o.committee}
                delay={i * 55}
              />
            </li>
          ))}
        </ul>
      </Reveal>

      <div className="gold-divider mx-auto max-w-5xl" aria-hidden />

      {/* ── Appointed & Youth ────────────────────────────────────── */}
      <Reveal as="section" className="paper-texture-cream section-shadow-top" direction="up">
        <div className="mx-auto max-w-6xl px-6 py-20">

          <div className="mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
              Appointed &amp; Youth
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-forest-deep sm:text-5xl">
              Other Officials
            </h2>
          </div>

          {/* SK Chairperson, Barangay Secretary, Barangay Treasurer */}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((o, i) => (
              <li key={`other-${i}`}>
                <OfficialCard
                  role={o.role}
                  name={o.name}
                  committee={o.committee}
                  delay={i * 60}
                />
              </li>
            ))}
          </ul>

          <p className="mt-10 text-sm text-muted-foreground">
            Official roster as maintained by {SITE.name}. To report a correction, contact the
            barangay hall.
          </p>
        </div>
      </Reveal>
    </div>
  );
}
