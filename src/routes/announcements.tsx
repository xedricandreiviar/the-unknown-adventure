import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CalendarDays, Megaphone } from "lucide-react";
import { FeatureGate } from "@/components/feature-gate";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { getAnnouncements } from "@/lib/settings.functions";
import { SITE } from "@/lib/site";
import announcementsHero from "@/assets/announcements-hero.jpg";

export const Route = createFileRoute("/announcements")({
  head: () => ({
    meta: [
      { title: `Announcements — ${SITE.name}` },
      {
        name: "description",
        content:
          "Official announcements, advisories, and event notices from Barangay Wawa, Taguig City.",
      },
      { property: "og:title", content: `Announcements — ${SITE.name}` },
      {
        property: "og:description",
        content: "Advisories and event notices from Barangay Wawa, Taguig City.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnnouncementsGate,
});

type Post = {
  id: string;
  title: string;
  body: string;
  category: string;
  published_at: string | null;
  created_at: string;
};

const TAG_COLORS: Record<string, string> = {
  Notices: "bg-forest-deep/8 text-forest-deep",
  Health: "bg-gold-soft/40 text-gold-deep",
  Advisories: "bg-secondary text-forest",
  Events: "bg-forest-deep/8 text-forest-deep",
  Programs: "bg-gold-soft/40 text-gold-deep",
};
const DEFAULT_TAG = "bg-secondary text-forest";

function postedOn(post: Post) {
  return new Date(post.published_at ?? post.created_at).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function AnnouncementsPage() {
  const listFn = useServerFn(getAnnouncements);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    listFn()
      .then((rows) => {
        if (active) setPosts(rows as Post[]);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listFn]);

  const featured = posts[0];
  const others = posts.slice(1);

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

      {loading && (
        <p className="mx-auto max-w-6xl px-6 py-20 text-sm text-muted-foreground">
          Loading announcements…
        </p>
      )}
      {failed && (
        <p role="alert" className="mx-auto max-w-6xl px-6 py-20 text-sm text-destructive">
          Announcements are temporarily unavailable. Please try again later.
        </p>
      )}
      {!loading && !failed && posts.length === 0 && (
        <p className="mx-auto max-w-6xl px-6 py-20 text-sm text-muted-foreground">
          No announcements yet. Check back soon.
        </p>
      )}

      {/* ── Featured announcement: the newest one ── */}
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
              className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${TAG_COLORS[featured.category] ?? DEFAULT_TAG}`}
            >
              {featured.category}
            </span>
            <h3 className="mt-4 font-display text-2xl font-semibold text-forest-deep">
              {featured.title}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden />
              {postedOn(featured)}
            </p>
            <p className="mt-4 whitespace-pre-line text-lg leading-relaxed text-muted-foreground">
              {featured.body}
            </p>
          </div>
        </Reveal>
      )}

      {/* ── Earlier announcements ── */}
      {others.length > 0 && (
        <Reveal as="section" className="mx-auto max-w-6xl px-6 pb-20" direction="up">
          <h2 className="font-display text-2xl font-semibold text-forest-deep">
            Earlier announcements
          </h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {others.map((post) => (
              <article
                key={post.id}
                className="card-lift rounded-2xl border border-border bg-card p-7"
              >
                <span
                  className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${TAG_COLORS[post.category] ?? DEFAULT_TAG}`}
                >
                  {post.category}
                </span>
                <h3 className="mt-3 font-display text-xl font-semibold text-forest-deep">
                  {post.title}
                </h3>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarDays className="size-3.5" aria-hidden />
                  {postedOn(post)}
                </p>
                <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">
                  {post.body}
                </p>
              </article>
            ))}
          </div>
        </Reveal>
      )}
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
