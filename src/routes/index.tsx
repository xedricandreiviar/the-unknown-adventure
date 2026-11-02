import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, MapPin, Megaphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/reveal";
import { PageHero } from "@/components/page-hero";
import { useLang } from "@/lib/i18n";
import { SITE, BOOKING_SLOTS } from "@/lib/site";
import { FAQS, OFFICIALS, SERVICES } from "@/lib/content";
import heroAsset from "@/assets/hero-barangay.jpg";
import courtAsset from "@/assets/multipurp.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${SITE.name} — Serbisyong tapat, para sa lahat` },
      { name: "description", content: "Barangay services, the PWD portal, and multi-purpose court booking for residents of Wawa, Taguig City." },
      { property: "og:title", content: "Barangay Wawa United — Taguig City" },
      { property: "og:description", content: "One platform for barangay services, the PWD portal, and the barangay court." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { t } = useLang();

  return (
    <div>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <PageHero
        kicker={t("hero.kicker")}
        title={t("hero.title")}
        body={t("hero.body")}
        imageSrc={heroAsset}
        large
      >
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="gold" size="lg" className="h-auto px-7 py-3.5 text-base">
            <Link to="/court-booking" className="gap-2">
              <CalendarDays className="size-5" aria-hidden />
              {t("hero.book")}
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-auto px-7 py-3.5 text-base border-white/35 bg-white/8 text-primary-foreground backdrop-blur-sm hover:bg-white/16"
          >
            <Link to="/pwd">{t("hero.pwd")}</Link>
          </Button>
        </div>
      </PageHero>

      {/* ── Court — image left, schedule right ──────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid items-center gap-14 md:grid-cols-2">

          <Reveal direction="left">
            <div
              className="overflow-hidden rounded-2xl"
              style={{
                boxShadow: "0 24px 56px oklch(0.235 0.055 155 / 0.18), 0 4px 14px oklch(0.235 0.055 155 / 0.10)",
              }}
            >
              <img
                src={courtAsset}
                alt="The Barangay Wawa multi-purpose court"
                className="h-72 w-full object-cover md:h-[420px]"
              />
            </div>
          </Reveal>

          <Reveal direction="right" delay={100}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
              {t("common.todayAtCourt")}
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-forest-deep sm:text-5xl">
              Multi-Purpose Court
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
              Barangay Wawa · Two-hour slots · Walk-ins welcome when free.
            </p>

            <ul className="mt-8 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {BOOKING_SLOTS.map((s) => (
                <li key={s.start} className="flex items-center justify-between px-5 py-4">
                  <span className="text-base font-medium text-foreground">{s.label}</span>
                  <Badge variant="secondary" className="text-xs">Open</Badge>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Button asChild variant="gold" size="lg" className="h-auto px-7 py-3.5 text-base">
                <Link to="/court-booking" className="gap-2">
                  <CalendarDays className="size-5" aria-hidden />
                  Book a slot
                </Link>
              </Button>
            </div>
          </Reveal>

        </div>
      </section>

      {/* ── Services ─────────────────────────────────────────────── */}
      <Reveal as="section" className="mx-auto max-w-6xl px-6 py-24" direction="up">
        <div className="mb-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
            {t("home.servicesTitle")}
          </p>
          <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-forest-deep sm:text-5xl">
            What do you need today?
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t("home.servicesBody")}
          </p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s, i) => (
            <Reveal as="li" key={s.name} direction="up" delay={i * 55}>
              <Link
                to="/services"
                search={{ open: s.name }}
                className="card-lift group flex h-full flex-col rounded-2xl border border-border bg-card p-7 shadow-sm"
              >
                <p className="font-display text-xl font-semibold leading-snug text-forest-deep group-hover:text-forest">
                  {s.name}
                </p>
                <p className="mt-3 flex-1 text-base leading-relaxed text-muted-foreground line-clamp-2">
                  {s.desc}
                </p>
                <span className="mt-5 flex items-center gap-1 text-sm font-semibold text-gold-deep opacity-0 transition-opacity group-hover:opacity-100">
                  See requirements <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </Link>
            </Reveal>
          ))}
        </ul>

        <div className="mt-10">
          <Button asChild variant="ghost" className="gap-1.5 text-base text-gold-deep">
            <Link to="/services">
              {t("common.viewAll")} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </Reveal>

      <div className="gold-divider mx-auto max-w-5xl" aria-hidden />

      {/* ── Announcements ─────────────────────────────────────────── */}
      <Reveal as="section" className="paper-texture-cream section-shadow-top" direction="up">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
                <Megaphone className="size-3.5" aria-hidden />
                {t("home.featuredTitle")}
              </p>
              <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-forest-deep sm:text-5xl">
                Latest from the barangay
              </h2>
            </div>
            <Button asChild variant="ghost" className="gap-1.5 text-base text-gold-deep">
              <Link to="/announcements">
                {t("common.viewAll")} <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>

          <div
            className="mt-10 rounded-2xl border border-border bg-card p-9"
            style={{ boxShadow: "0 4px 24px oklch(0.235 0.055 155 / 0.06)" }}
          >
            <p className="text-sm font-medium text-muted-foreground">
              Posted by the Barangay Wawa team
            </p>
            <h3 className="mt-3 font-display text-2xl font-semibold text-forest-deep">
              Welcome to the new Barangay Wawa site
            </h3>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              This site brings our services online: request barangay documents, find PWD guides, and
              reserve the multi-purpose court. Announcements from the barangay will appear here.
            </p>
          </div>
        </div>
      </Reveal>

      {/* ── Officials ─────────────────────────────────────────────── */}
      <Reveal as="section" className="mx-auto max-w-6xl px-6 py-24" direction="up">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
              <Users className="size-3.5" aria-hidden />
              {t("home.officialsTitle")}
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-forest-deep sm:text-5xl">
              Serving Barangay Wawa
            </h2>
          </div>
          <Button asChild variant="ghost" className="gap-1.5 text-base text-gold-deep">
            <Link to="/officials">
              {t("common.viewAll")} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OFFICIALS.slice(0, 4).map((o, i) => (
            <Reveal as="li" key={`${o.role}-${i}`} direction="up" delay={i * 70}>
              <div
                className="flex items-center rounded-2xl border border-border bg-card px-6 py-5"
                style={{ boxShadow: "0 2px 10px oklch(0.235 0.055 155 / 0.05)" }}
              >
                <span className="mr-3 size-2 shrink-0 rounded-full bg-gold" aria-hidden />
                <p className="font-display text-lg font-semibold text-forest-deep">{o.role}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </Reveal>

      <div className="gold-divider mx-auto max-w-5xl" aria-hidden />

      {/* ── Map ───────────────────────────────────────────────────── */}
      <Reveal as="section" className="paper-texture-cream section-shadow-top" direction="up">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <h2 className="font-display text-4xl font-semibold leading-tight text-forest-deep sm:text-5xl">
            {t("home.mapTitle")}
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-[1fr_1.7fr]">
            <Reveal direction="left" delay={80}>
              <div className="space-y-5 rounded-2xl border border-border bg-card p-7">
                <p className="font-display text-xl font-semibold text-forest-deep">Barangay Hall</p>
                <p className="flex items-start gap-3 text-base leading-relaxed text-muted-foreground">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-gold-deep" aria-hidden />
                  {SITE.address}
                </p>
                <p className="text-base text-muted-foreground">{SITE.officeHours}</p>
              </div>
            </Reveal>
            <Reveal direction="right" delay={160}>
              <iframe
                title={`Map showing ${SITE.address}`}
                src="https://www.google.com/maps?q=Wawa,+Taguig,+Metro+Manila&output=embed"
                className="h-72 w-full rounded-2xl border border-border md:h-[340px]"
                loading="lazy"
                style={{ boxShadow: "0 8px 32px oklch(0.235 0.055 155 / 0.10)" }}
              />
            </Reveal>
          </div>
        </div>
      </Reveal>

      {/* ── FAQ ───────────────────────────────────────────────────── */}
      <Reveal as="section" className="mx-auto max-w-3xl px-6 py-24" direction="up">
        <h2 className="font-display text-4xl font-semibold leading-tight text-forest-deep sm:text-5xl">
          {t("home.faqTitle")}
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Quick answers to common questions about barangay services.
        </p>
        <Accordion type="single" collapsible className="mt-10 space-y-3">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} direction="up" delay={i * 50}>
              <AccordionItem
                value={`faq-${i}`}
                className="rounded-2xl border border-border bg-card px-6 last:border-b"
              >
                <AccordionTrigger className="text-left text-lg font-medium">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-muted-foreground">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            </Reveal>
          ))}
        </Accordion>
      </Reveal>

    </div>
  );
}
