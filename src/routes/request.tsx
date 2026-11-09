import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { getMyProfile } from "@/lib/profiles.functions";
import { getSiteData } from "@/lib/settings.functions";
import { submitRequest } from "@/lib/queue.functions";
import {
  DETAILS_MIN_LENGTH,
  DETAILS_REQUIRED_SERVICE_CODES,
  REQUEST_PROFILE_FIELDS,
} from "@/lib/validation";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/request")({
  head: () => ({
    meta: [
      { title: `File a Request — ${SITE.name}` },
      {
        name: "description",
        content:
          "File a barangay service request online and get a reference code to follow its progress.",
      },
      { property: "og:title", content: `File a Request — ${SITE.name}` },
      { property: "og:type", content: "website" },
    ],
  }),
  component: RequestPage,
});

type Service = {
  id: string;
  code: string;
  name: string;
  description: string;
  requirements: unknown;
  fee: number | string;
  enabled: boolean;
};

type ResidentProfile = {
  status: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  street: string;
  purok: string;
  barangay: string;
  contact_number: string;
};

const MAX_DETAILS = 1000;

function formatFee(fee: number | string) {
  const amount = Number(fee);
  return amount > 0 ? `₱${amount.toFixed(2)}` : "Free";
}

function requirementList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function RequestPage() {
  const siteFn = useServerFn(getSiteData);
  const profileFn = useServerFn(getMyProfile);
  const submitFn = useServerFn(submitRequest);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [queueOpen, setQueueOpen] = useState(true);
  const [profile, setProfile] = useState<ResidentProfile | null>(null);

  const [serviceId, setServiceId] = useState("");
  const [details, setDetails] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submittedCode, setSubmittedCode] = useState("");

  useEffect(() => {
    let active = true;
    // The profile call fails when nobody is signed in, which we show as a sign-in prompt.
    Promise.all([siteFn(), profileFn().catch(() => null)])
      .then(([site, result]) => {
        if (!active) return;
        setServices((site.services as Service[]).filter((item) => item.enabled));
        setQueueOpen(site.flags.find((flag) => flag.key === "queueing")?.enabled ?? true);
        setProfile(result?.profile ? (result.profile as ResidentProfile) : null);
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(cause instanceof Error ? cause.message : "Could not load the form.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [siteFn, profileFn]);

  const service = useMemo(
    () => services.find((item) => item.id === serviceId) ?? null,
    [services, serviceId],
  );
  const needsDetails = !!service && DETAILS_REQUIRED_SERVICE_CODES.includes(service.code);

  const serviceError = attempted && !service ? "Choose a service." : "";
  const detailsError =
    attempted && needsDetails && details.trim().length < DETAILS_MIN_LENGTH
      ? `Describe the matter in at least ${DETAILS_MIN_LENGTH} characters.`
      : "";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    setSubmitError("");
    if (!service) return;
    if (needsDetails && details.trim().length < DETAILS_MIN_LENGTH) return;
    setBusy(true);
    try {
      const result = await submitFn({ data: { service_id: service.id, details: details.trim() } });
      setSubmittedCode(result.code);
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Could not file the request.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setServiceId("");
    setDetails("");
    setAttempted(false);
    setSubmitError("");
    setSubmittedCode("");
  };

  const hero = (
    <PageHero
      kicker="Barangay services"
      title="File a Request"
      body="Pick a service, check the requirements, and get a reference code to follow your request."
    />
  );

  const notice = (message: string, action?: { to: "/auth" | "/account"; label: string }) => (
    <div>
      {hero}
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex gap-3 border-l-4 border-gold-deep bg-gold-soft/30 p-4 text-sm">
          <TriangleAlert className="size-5 shrink-0 text-gold-deep" aria-hidden />
          <p role="alert">{message}</p>
        </div>
        {action && (
          <Button asChild variant="gold" className="mt-4">
            <Link to={action.to}>{action.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div>
        {hero}
        <div className="mx-auto max-w-3xl px-4 py-12 text-sm text-muted-foreground">
          Loading the form…
        </div>
      </div>
    );
  }
  if (loadError) return notice(loadError);
  if (!profile)
    return notice("Sign in to file a request.", { to: "/auth", label: "Log in / Sign up" });
  if (!queueOpen) {
    return notice(
      "Online service requests are turned off right now. Please visit the barangay hall.",
    );
  }
  if (profile.status !== "approved") {
    const message =
      profile.status === "pending"
        ? "Your account is still waiting for barangay approval. You can file requests once it is approved."
        : profile.status === "rejected"
          ? "Your account application was not approved, so you cannot file requests. Check My Account for the reason."
          : "Your account is deactivated, so you cannot file requests.";
    return notice(message, { to: "/account", label: "Go to My Account" });
  }
  if (REQUEST_PROFILE_FIELDS.some((field) => !profile[field].trim())) {
    return notice(
      "Complete your name, address, and contact number in My Account first. We use those details on every request.",
      { to: "/account", label: "Complete my profile" },
    );
  }

  if (submittedCode) {
    return (
      <div>
        {hero}
        <Reveal as="section" className="mx-auto max-w-3xl px-4 py-12">
          <div className="border border-border bg-card p-6" role="status">
            <p className="flex items-center gap-2 font-display text-xl font-semibold text-forest-deep">
              <CheckCircle2 className="size-6 text-forest" aria-hidden />
              Request filed
            </p>
            <p className="mt-3 text-sm text-muted-foreground">Your reference code</p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-wide text-forest-deep">
              {submittedCode}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Keep this code. You will get a notification each time the barangay updates your
              request, and you can follow it under My Account. Bring the listed requirements when
              you claim it.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="gold">
                <Link to="/account">View my requests</Link>
              </Button>
              <Button variant="outline" onClick={reset}>
                File another request
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    );
  }

  const fullName = [profile.first_name, profile.middle_name, profile.last_name]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  const address = [profile.street, profile.purok, profile.barangay]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  return (
    <div>
      {hero}
      <Reveal
        as="section"
        className="mx-auto grid max-w-5xl gap-10 px-4 py-12 lg:grid-cols-[1.1fr_.9fr]"
      >
        <form onSubmit={(event) => void submit(event)} noValidate className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="request-service">Service</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger id="request-service" aria-invalid={!!serviceError}>
                <SelectValue placeholder="Choose a service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · {formatFee(item.fee)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {serviceError && (
              <p role="alert" className="text-sm text-destructive">
                {serviceError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="request-details">
              {needsDetails ? "Describe the matter" : "Notes for the barangay (optional)"}
            </Label>
            <Textarea
              id="request-details"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={MAX_DETAILS}
              rows={5}
              aria-invalid={!!detailsError}
              placeholder={
                needsDetails
                  ? "What happened, where, and when?"
                  : "For example: needed for a job application."
              }
            />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {needsDetails
                  ? `At least ${DETAILS_MIN_LENGTH} characters.`
                  : "Leave blank if none."}
              </span>
              <span>
                {details.length}/{MAX_DETAILS}
              </span>
            </div>
            {detailsError && (
              <p role="alert" className="text-sm text-destructive">
                {detailsError}
              </p>
            )}
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}
          <Button variant="gold" disabled={busy}>
            {busy ? "Filing request…" : "File request"}
          </Button>
        </form>

        <aside className="space-y-6">
          <section className="border border-border p-4">
            <h2 className="font-display text-lg font-semibold text-forest-deep">Filed under</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Resident</dt>
                <dd>{fullName}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Address</dt>
                <dd>{address}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-muted-foreground">Contact</dt>
                <dd>{profile.contact_number}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              These come from your account.{" "}
              <Link to="/account" className="text-gold-deep underline">
                Update them in My Account
              </Link>
              .
            </p>
          </section>

          {service && (
            <section className="border border-border p-4">
              <h2 className="font-display text-lg font-semibold text-forest-deep">
                {service.name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>
              <p className="mt-3 text-sm">
                <span className="font-semibold">Fee:</span> {formatFee(service.fee)}
              </p>
              {requirementList(service.requirements).length > 0 && (
                <>
                  <p className="mt-3 text-sm font-semibold">Bring when you claim it</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {requirementList(service.requirements).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </aside>
      </Reveal>
    </div>
  );
}
