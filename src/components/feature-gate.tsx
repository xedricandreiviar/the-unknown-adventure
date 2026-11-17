import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/page-hero";
import { getSiteData } from "@/lib/settings.functions";

/**
 * Shows the page only while its feature switch (set in Admin → Settings) is on.
 * While the switch is loading, or if it cannot be read, the page stays available.
 */
export function FeatureGate({
  feature,
  title,
  children,
}: {
  feature: string;
  title: string;
  children: ReactNode;
}) {
  const siteFn = useServerFn(getSiteData);
  const [on, setOn] = useState(true);

  useEffect(() => {
    let active = true;
    siteFn()
      .then((site) => {
        if (!active) return;
        const flag = site.flags.find((item) => item.key === feature);
        setOn(flag ? flag.enabled : true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [siteFn, feature]);

  if (on) return <>{children}</>;
  return (
    <div>
      <PageHero
        kicker="Temporarily unavailable"
        title={title}
        body="The barangay has switched this feature off for now."
      />
      <section className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Please check back later, or visit the barangay hall.
        </p>
        <Button asChild variant="gold" className="mt-4">
          <Link to="/">Back to home</Link>
        </Button>
      </section>
    </div>
  );
}
