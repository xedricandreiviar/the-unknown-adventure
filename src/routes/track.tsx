import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import {
  BENEFITS_BY_CATEGORY,
  CATEGORY_LABEL,
  RELEASE_LABEL,
  RELEASE_STYLE,
  SENIOR_TIERS,
  STATUS_LABEL,
  STATUS_STYLE,
  formatDate,
  formatPeso,
  type RegistryCategory,
  type RegistryStatus,
  type ReleaseStatus,
} from "@/lib/registry";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Track your Incentives — Barangay Wawa United" },
      { name: "description", content: "Check your yearly PWD or senior citizen cash gifts in Barangay Wawa United using your reference code." },
      { property: "og:title", content: "Track your Incentives — Barangay Wawa United" },
      { property: "og:description", content: "See if your birthday cash gift and PWD special needs assistance are scheduled, released, or unclaimed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrackPage,
});

type Incentive = {
  type: string;
  status: ReleaseStatus;
  amount: number | null;
  date: string | null;
};

type TrackResult = {
  reference_code: string;
  category: RegistryCategory;
  status: RegistryStatus;
  benefit_year: number;
  senior_gift_amount: number | null;
  incentives: Incentive[];
  updated_at: string;
};

function parseIncentives(value: unknown): Incentive[] {
  if (!Array.isArray(value)) return [];
  const out: Incentive[] = [];
  for (const v of value) {
    if (v && typeof v === "object" && "type" in v && "status" in v) {
      const o = v as Record<string, unknown>;
      out.push({
        type: String(o["type"]),
        status: o["status"] as ReleaseStatus,
        amount: typeof o["amount"] === "number" ? o["amount"] : null,
        date: typeof o["date"] === "string" ? o["date"] : null,
      });
    }
  }
  return out;
}

function statusNote(s: ReleaseStatus | undefined, date: string | null, category: RegistryCategory): string {
  switch (s) {
    case "scheduled":
      return category === "senior"
        ? `Scheduled for delivery${date ? ` on ${formatDate(date)}` : ""}. Barangay staff deliver it house to house. Keep your reference code and a valid ID ready.`
        : `Scheduled for release${date ? ` on ${formatDate(date)}` : ""}. Bring a valid ID and your reference code.`;
    case "released":
      return `Released${date ? ` on ${formatDate(date)}` : ""}.`;
    case "unclaimed":
      return "Marked unclaimed. Please visit the barangay hall with a valid ID.";
    default:
      return "Not yet scheduled. Watch the announcements for the schedule.";
  }
}

function TrackPage() {
  const [code, setCode] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    setSubmitted(trimmed);
    setResult(null);
    setLookupError(null);
    setBusy(true);
    const { data, error } = await supabase.rpc("track_registration", { _code: trimmed });
    setBusy(false);
    if (error) {
      setLookupError("We could not check that code right now. Please try again later.");
      return;
    }
    const row = data?.[0];
    setResult(row ? { ...row, incentives: parseIncentives(row.incentives) } : null);
  };

  const rows =
    result && result.status === "approved"
      ? BENEFITS_BY_CATEGORY[result.category].map((def) => {
          const found = result.incentives.find((i) => i.type === def.type);
          const amount =
            found?.amount ?? (result.category === "senior" ? result.senior_gift_amount : def.amount);
          return { def, found, amount };
        })
      : [];

  return (
    <div>
      <PageHero
        kicker="PWD & Senior Citizens"
        title="Track your incentives"
        body="Enter the reference code you received when you registered to see this year's cash gifts: scheduled, released, or still waiting."
      />
      <Reveal as="section" className="mx-auto max-w-3xl px-4 py-12">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={lookup}>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. WAWA-SC-2026-0001"
            aria-label="Reference code"
            required
          />
          <Button type="submit" variant="gold" className="gap-2" disabled={busy}>
            <Search className="size-4" aria-hidden />
            {busy ? "Checking…" : "Track"}
          </Button>
        </form>

        {submitted && !busy && (
          <div role="status" className="mt-6 rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-medium text-forest-deep">Reference {submitted}</p>
            {lookupError ? (
              <p className="mt-1 text-destructive">{lookupError}</p>
            ) : result ? (
              <div className="mt-3 space-y-4">
                <p className="flex flex-wrap items-center gap-2">
                  <span>{CATEGORY_LABEL[result.category]} registration</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[result.status]}`}>
                    {STATUS_LABEL[result.status]}
                  </span>
                </p>

                {result.status === "pending" && (
                  <p className="text-muted-foreground">
                    Your registration is still being reviewed. Incentives can only be listed after it is approved.
                  </p>
                )}
                {result.status === "rejected" && (
                  <p className="text-muted-foreground">
                    Your registration was not approved, so no incentives are listed. Log in to see the reason or visit the barangay hall.
                  </p>
                )}

                {result.status === "approved" && (
                  <div>
                    <p className="font-display text-base font-semibold text-forest-deep">
                      Incentives for {result.benefit_year}
                    </p>
                    <ul className="mt-2 divide-y divide-border">
                      {rows.map(({ def, found, amount }) => (
                        <li key={def.type} className="py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{def.label}</p>
                              <p className="text-xs text-muted-foreground">{def.when}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">{formatPeso(amount)}</span>
                              {found ? (
                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${RELEASE_STYLE[found.status]}`}>
                                  {RELEASE_LABEL[found.status]}
                                </span>
                              ) : (
                                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                                  Not yet scheduled
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {statusNote(found?.status, found?.date ?? null, result.category)}
                          </p>
                        </li>
                      ))}
                    </ul>
                    {result.category === "senior" && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        The senior birthday cash gift grows with age:{" "}
                        {SENIOR_TIERS.map(
                          (t) =>
                            `${t.to === null ? `${t.from}+` : `${t.from}–${t.to}`} yrs ${formatPeso(t.amount)}`,
                        ).join(", ")}
                        . It is given once a year, in full.
                      </p>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">Last updated {formatDate(result.updated_at)}</p>
              </div>
            ) : (
              <p className="mt-1 text-muted-foreground">
                We could not find that code. Check for typos, or{" "}
                <Link to="/registry" className="font-medium text-gold-deep hover:underline">
                  register as a PWD or senior citizen
                </Link>{" "}
                if you have not yet.
              </p>
            )}
          </div>
        )}
      </Reveal>
    </div>
  );
}
