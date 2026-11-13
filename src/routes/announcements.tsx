import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Megaphone } from "lucide-react";
import { FeatureGate } from "@/components/feature-gate";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { SITE } from "@/lib/site";
import announcementsHero from "@/assets/announcements-hero.jpg";

export const Route = createFileRoute("/announcements")({
  head: () => ({
    meta: [
      { title: `Announcements — ${SITE.name}` },
      { name: "description", content: "Official announcements, advisories, and event notices from Barangay Wawa, Taguig City." },
      { property: "og:title", content: `Announcements — ${SITE.name}` },
      { property: "og:description", content: "Advisories and event notices from Barangay Wawa, Taguig City." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnnouncementsGate,
});

/** Temporary placeholder announcements — replace with real data when available */
const ANNOUNCEMENTS = [
  {
    id: 1,
    tag: "General",
    title: "Welcome to the new Barangay Wawa site",
    date: "Posted by the Barangay Wawa team",
    body: "This site brings our services online: request barangay documents, find PWD guides, and reserve the multi-purpose court. More announcements will be posted here as events come up — check back soon.",
    featured: true,
  },
  {
    id: 2,
    tag: "Health",
    title: "Free medical check-up schedule",
    date: "Barangay Health Center",
    body: "The barangay health station will be conducting free medical check-ups for senior citizens and PWDs. Please bring your barangay ID and any existing medical records.",
    featured: false,
  },
  {
    id: 3,
    tag: "Advisory",
    title: "Court booking now available online",
    date: "Barangay Wawa team",
    body: "Residents may now reserve the multi-purpose court online in two-hour slots. Walk-in bookings remain available at the barangay hall during office hours.",
    featured: false,
  },
  {
    id: 4,
    tag: "Events",
    title: "Community clean-up drive",
    date: "Environment Committee",
    body: "Join us for a barangay-wide clean-up drive. All residents are encouraged to participate. Garbage bags and gloves will be provided at the barangay hall.",
    featured: false,
  },
];

const TAG_COLORS: Record<string, string> = {
  General:  "bg-forest-deep/8 text-forest-deep",
  Health:   "bg-gold-soft/40 text-gold-deep",
  Advisory: "bg-secondary text-forest",
  Events:   "bg-forest-deep/8 text-forest-deep",
};

function AnnouncementsPage() {
  const featured = ANNOUNCEMENTS.find((a) => a.featured);

  return (
    <div>
      {/* ── Hero — parallax, matches home/officials style ── */}
      <PageHero
        kicker="Barangay advisories and events"
        title="Announcements"
        body="Official posts from the barangay — advisories, schedules, and community events."
        imageSrc={announcementsHero}
        large
      />

      {/* ── Featured announcement ── */}
      {featured && (
        <Reveal as="section" className="mx-auto max-w-6xl px-6 py-20" direction="up">
          <div className="mb-10">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-deep">
              <Megaphone className="size-3.5" aria-hidden />
              Featured
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-tight text-forest-deep sm:text-5xl">
              Latest from the barangay
            </h2>
          </div>

          <div
            className="card-lift rounded-2xl border border-border bg-card p-9"
            style={{ boxShadow: "0 4px 24px oklch(0.235 0.055 155 / 0.07)" }}
          >
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${TAG_COLORS[featured.tag] ?? TAG_COLORS["General"]}`}
            >
              {featured.tag}
            </span>
            <h3 className="mt-4 font-display text-2xl font-semibold text-forest-deep">
              {featured.title}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden />
              {featured.date}
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              {featured.body}
            </p>
          </div>
        </Reveal>
      )}

      {/* more announcements will be added here */}
    </div>
  );
}

function AnnouncementsGate() {
  return (
    <FeatureGate feature="news" title="News & announcements">
      <AnnouncementsPage />
    </FeatureGate>
  );
}
