import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { RegistrationForm } from "@/components/registration-form";
import { DocumentsPanel } from "@/components/documents-panel";
import { SITE } from "@/lib/site";
import {
  CATEGORY_LABEL,
  RELEASE_LABEL,
  RELEASE_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
  benefitLabel,
  formatDate,
  formatPeso,
  type BenefitRelease,
  type Registrant,
} from "@/lib/registry";

export const Route = createFileRoute("/registry")({
  head: () => ({
    meta: [
      { title: `PWD & Senior Citizen Registration — ${SITE.name}` },
      { name: "description", content: "Register as a PWD or senior citizen in Barangay Wawa and track your application and benefits." },
      { property: "og:title", content: `PWD & Senior Citizen Registration — ${SITE.name}` },
      { property: "og:description", content: "Apply online, follow your application, and see your benefit releases." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RegistryPage,
});

function RegistryPage() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [mine, setMine] = useState<Registrant[]>([]);
  const [releases, setReleases] = useState<BenefitRelease[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSignedIn(false);
      setReady(true);
      return;
    }
    setSignedIn(true);
    const { data, error } = await supabase
      .from("registrants")
      .select("*")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false });
    if (error) {
      setLoadError(error.message);
      setReady(true);
      return;
    }
    setLoadError(null);
    setMine(data ?? []);
    const ids = (data ?? []).map((r) => r.id);
    if (ids.length) {
      const { data: rel } = await supabase
        .from("registry_releases")
        .select("*")
        .in("registrant_id", ids)
        .order("created_at", { ascending: false });
      setReleases(rel ?? []);
    } else {
      setReleases([]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") load();
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  return (
    <div>
      <PageHero
        kicker="PWD & Senior Citizens"
        title="Register and track"
        body="Apply for the barangay PWD and senior citizen registry, upload your documents for checking, follow your application, and see your incentives and benefit releases."
      />
      <Reveal as="section" className="mx-auto max-w-3xl space-y-8 px-4 py-12">
        {!ready ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !signedIn ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Please log in or create a resident account first. It lets you follow your application later.
            </p>
            <Button asChild variant="gold" className="mt-4">
              <Link to="/auth">Log in / Sign up</Link>
            </Button>
          </div>
        ) : (
          <>
            {loadError && (
              <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                Could not load your applications: {loadError}
              </p>
            )}

            {mine.length > 0 && (
              <section aria-labelledby="mine-heading" className="space-y-3">
                <h2 id="mine-heading" className="font-display text-xl font-semibold text-forest-deep">
                  My applications
                </h2>
                <ul className="space-y-3">
                  {mine.map((r) => {
                    const rel = releases.filter((x) => x.registrant_id === r.id);
                    return (
                      <li key={r.id} className="rounded-xl border border-border bg-card p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-forest-deep">
                            {CATEGORY_LABEL[r.category]} ·{" "}
                            <span className="font-mono text-sm">{r.reference_code}</span>
                          </p>
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {r.full_name} · submitted {formatDate(r.created_at)}
                        </p>
                        {r.status === "rejected" && r.rejection_reason && (
                          <p className="mt-2 text-sm text-destructive">Reason: {r.rejection_reason}</p>
                        )}
                        {r.status === "pending" && (
                          <div className="mt-3 space-y-2 border-t border-border pt-3">
                            <p className="text-sm font-medium">Your documents</p>
                            <p className="text-xs text-muted-foreground">
                              Staff check these against your details. Upload anything marked needed, or a new copy if a file was rejected.
                            </p>
                            <DocumentsPanel registrant={r} />
                          </div>
                        )}
                        {r.status === "approved" && (
                          <div className="mt-3">
                            <p className="text-sm font-medium">Benefits</p>
                            {rel.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No releases recorded yet. Watch the announcements for payout schedules.
                              </p>
                            ) : (
                              <ul className="mt-1 divide-y divide-border text-sm">
                                {rel.map((b) => (
                                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                    <span>
                                      {benefitLabel(b.benefit_type)} — {b.benefit_year}
                                      <span className="block text-xs text-muted-foreground">
                                        {formatPeso(b.amount)} · {formatDate(b.release_date)}
                                      </span>
                                    </span>
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${RELEASE_STYLE[b.status]}`}>
                                      {RELEASE_LABEL[b.status]}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section aria-labelledby="apply-heading" className="space-y-3">
              <h2 id="apply-heading" className="font-display text-xl font-semibold text-forest-deep">
                New application
              </h2>
              <RegistrationForm mode="online" onRegistered={() => load()} />
            </section>
          </>
        )}
      </Reveal>
    </div>
  );
}
