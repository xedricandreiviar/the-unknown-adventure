import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { ConsentCheckbox } from "@/components/consent-checkbox";
import { SERVICES } from "@/lib/content";
import { SITE } from "@/lib/site";
import { useLang } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { z } from "zod";

const searchSchema = z.object({
  open: z.string().optional(),
});

export const Route = createFileRoute("/services")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: `Barangay Services — ${SITE.name}` },
      { name: "description", content: "Barangay clearance, indigency certificates, cedula, barangay ID, business clearance and more for Wawa residents." },
      { property: "og:title", content: `Barangay Services — ${SITE.name}` },
      { property: "og:description", content: "What each barangay service is for and the requirements you need to bring." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ServicesPage,
});

function ServicesPage() {
  const { t } = useLang();
  // useSearch re-runs on every URL change, including same-page param updates
  const { open: openParam } = Route.useSearch();
  const [consent, setConsent] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  // Derive the accordion key from the search param directly
  const paramKey = openParam
    ? (() => {
        const idx = SERVICES.findIndex((s) => s.name === openParam);
        return idx !== -1 ? `svc-${idx}` : undefined;
      })()
    : undefined;

  // accordionValue controls which item is open.
  // We sync it whenever openParam changes — this covers:
  //   1. First load from another page
  //   2. Already on /services and clicking a different item in the nav
  //   3. Already on /services and clicking the same item again (re-open)
  const [accordionValue, setAccordionValue] = useState<string | undefined>(paramKey);

  // Track previous param so we can detect "same param clicked again" and force re-open
  const prevParamRef = useRef<string | undefined>(openParam);

  useEffect(() => {
    if (!openParam) return;

    const idx = SERVICES.findIndex((s) => s.name === openParam);
    if (idx === -1) return;
    const key = `svc-${idx}`;

    if (prevParamRef.current === openParam && accordionValue === key) {
      // Same item clicked while already open — close then re-open to replay animation
      setAccordionValue(undefined);
      const reopen = setTimeout(() => setAccordionValue(key), 30);
      return () => clearTimeout(reopen);
    }

    // New item or item was closed — open it
    setAccordionValue(key);
    prevParamRef.current = openParam;

    // Scroll into view after the accordion open animation (~200ms)
    const scroll = setTimeout(() => {
      itemRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 220);
    return () => clearTimeout(scroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam]);

  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  return (
    <div>
      <PageHero
        kicker="Barangay Wawa, Taguig City"
        title={t("nav.services")}
        body="What each service is for and what to bring. Walk-in requests are processed at the barangay hall during office hours."
      />

      <Reveal as="section" className="mx-auto max-w-4xl px-4 py-12">
        <Accordion
          type="single"
          collapsible
          className="space-y-3"
          value={accordionValue}
          // User can still manually open/close any item
          onValueChange={setAccordionValue}
        >
          {SERVICES.map((s, i) => {
            const value = `svc-${i}`;
            return (
              <AccordionItem
                key={s.name}
                value={value}
                ref={(el) => { itemRefs.current[value] = el as HTMLDivElement | null; }}
                className="rounded-lg border border-border bg-card px-4 last:border-b transition-shadow data-[state=open]:shadow-md"
              >
                <AccordionTrigger className="font-display text-base font-semibold text-forest-deep">
                  {s.name}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pb-1">
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gold-deep">
                      Bring with you
                    </p>
                    <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                      {s.requirements.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </Reveal>

      <Reveal as="section" className="paper-texture-cream">
        <div className="mx-auto max-w-4xl px-4 py-12">
          <h2 className="font-display text-2xl font-semibold text-forest-deep">Requesting a service</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Prepare the requirements listed for the service above.</li>
            <li>Visit the barangay hall ({SITE.officeHours}).</li>
            <li>Fill out the request form at the front desk and sign the data privacy consent.</li>
            <li>Keep your claim stub — most requests are released same day or within 1–3 working days.</li>
          </ol>

          <div className="mt-6 rounded-lg border border-border bg-card p-4">
            <p className="flex items-center gap-2 font-display text-base font-semibold text-forest-deep">
              <ClipboardList className="size-4 text-gold-deep" aria-hidden />
              Data privacy notice
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Request forms collect personal data protected by the Data Privacy Act (RA 10173).
              Please review and acknowledge the consent below before filing a request at the hall.
            </p>
            <div className="mt-3">
              <ConsentCheckbox checked={consent} onCheckedChange={setConsent} />
            </div>
            <Button
              className="mt-3"
              disabled={!consent}
              onClick={() => setAcknowledged(true)}
            >
              I acknowledge the consent
            </Button>
            {acknowledged && (
              <p className="mt-2 text-sm font-medium text-forest" role="status">
                Thank you. Show this acknowledgment at the front desk, or{" "}
                <Link to="/track" className="underline hover:no-underline">
                  track a request
                </Link>{" "}
                once you have your reference code.
              </p>
            )}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
