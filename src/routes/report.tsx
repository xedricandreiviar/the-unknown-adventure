import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { supabase } from "@/integrations/supabase/client";
import { getSiteData } from "@/lib/settings.functions";
import { submitProblemReport } from "@/lib/problems.functions";
import { PROBLEM_CATEGORIES, problemSchema } from "@/lib/validation";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/report")({
  head: () => ({
    meta: [
      { title: `Report a Problem — ${SITE.name}` },
      {
        name: "description",
        content: "Report a problem in your community to the barangay and follow its progress.",
      },
      { property: "og:title", content: `Report a Problem — ${SITE.name}` },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ReportPage,
});

type ResidentProfile = {
  id: string;
  status: string;
  street: string;
  purok: string;
  barangay: string;
};

type Fields = {
  category: string;
  description: string;
  street: string;
  purok: string;
  barangay: string;
};

const MAX_DESCRIPTION = 2000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function ReportPage() {
  const siteFn = useServerFn(getSiteData);
  const profileFn = useServerFn(getMyProfile);
  const submitFn = useServerFn(submitProblemReport);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(true);
  const [profile, setProfile] = useState<ResidentProfile | null>(null);

  const [fields, setFields] = useState<Fields>({
    category: "",
    description: "",
    street: "",
    purok: "",
    barangay: "Wawa",
  });
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [photoInput, setPhotoInput] = useState(0);

  useEffect(() => {
    let active = true;
    // The profile call fails when nobody is signed in, which we show as a sign-in prompt.
    Promise.all([siteFn(), profileFn().catch(() => null)])
      .then(([site, result]) => {
        if (!active) return;
        setOpen(site.flags.find((flag) => flag.key === "problems")?.enabled ?? true);
        const person = result?.profile ? (result.profile as ResidentProfile) : null;
        setProfile(person);
        // The problem is usually near home, so start from the resident's address.
        if (person) {
          setFields((current) => ({
            ...current,
            street: person.street,
            purok: person.purok,
            barangay: person.barangay || "Wawa",
          }));
        }
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

  const set = (key: keyof Fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  // The same rules the server applies, so the resident sees problems before sending.
  const parsed = problemSchema.safeParse(fields);
  const errors: Partial<Record<keyof Fields, string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof Fields;
      if (!errors[key]) errors[key] = issue.message;
    }
  }
  const shown = (key: keyof Fields) => (attempted ? errors[key] : undefined);

  const choosePhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setPhotoError("");
    if (!file) {
      setPhoto(null);
      return;
    }
    if (!PHOTO_TYPES[file.type]) {
      setPhoto(null);
      setPhotoError("Choose a JPG, PNG, or WebP photo.");
      setPhotoInput((count) => count + 1);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhoto(null);
      setPhotoError("The photo must be 5 MB or smaller.");
      setPhotoInput((count) => count + 1);
      return;
    }
    setPhoto(file);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    setSubmitError("");
    if (!parsed.success || !profile) return;
    setBusy(true);
    let photoPath: string | undefined;
    try {
      if (photo) {
        const path = `${profile.id}/problems/${crypto.randomUUID()}.${PHOTO_TYPES[photo.type]}`;
        const { error: uploadError } = await supabase.storage.from("uploads").upload(path, photo);
        if (uploadError) {
          throw new Error("Could not upload the photo. Check your connection and try again.");
        }
        photoPath = path;
      }
      await submitFn({ data: { ...parsed.data, photo_path: photoPath } });
      setDone(true);
    } catch (cause) {
      // Don't leave a photo behind when the report itself was not saved.
      if (photoPath) void supabase.storage.from("uploads").remove([photoPath]);
      setSubmitError(cause instanceof Error ? cause.message : "Could not send the report.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFields((current) => ({ ...current, category: "", description: "" }));
    setAttempted(false);
    setSubmitError("");
    setDone(false);
    setPhoto(null);
    setPhotoError("");
    setPhotoInput((count) => count + 1);
  };

  const hero = (
    <PageHero
      kicker="Community"
      title="Report a Problem"
      body="Tell the barangay about a problem in your area and follow what happens to it."
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
    return notice("Sign in to report a problem.", { to: "/auth", label: "Log in / Sign up" });
  if (!open)
    return notice("Problem reports are turned off right now. Please visit the barangay hall.");
  if (profile.status !== "approved") {
    const message =
      profile.status === "pending"
        ? "Your account is still waiting for barangay approval. You can report problems once it is approved."
        : profile.status === "rejected"
          ? "Your account application was not approved, so you cannot send reports. Check My Account for the reason."
          : "Your account is deactivated, so you cannot send reports.";
    return notice(message, { to: "/account", label: "Go to My Account" });
  }

  if (done) {
    return (
      <div>
        {hero}
        <Reveal as="section" className="mx-auto max-w-3xl px-4 py-12">
          <div className="border border-border bg-card p-6" role="status">
            <p className="flex items-center gap-2 font-display text-xl font-semibold text-forest-deep">
              <CheckCircle2 className="size-6 text-forest" aria-hidden />
              Report sent
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              The barangay received your report. You will get a notification each time its status
              changes, and you can follow it under My Account.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="gold">
                <Link to="/account">View my reports</Link>
              </Button>
              <Button variant="outline" onClick={reset}>
                Report another problem
              </Button>
            </div>
          </div>
        </Reveal>
      </div>
    );
  }

  return (
    <div>
      {hero}
      <Reveal as="section" className="mx-auto max-w-3xl px-4 py-12">
        <form onSubmit={(event) => void submit(event)} noValidate className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="report-category">Category</Label>
            <Select value={fields.category} onValueChange={(value) => set("category", value)}>
              <SelectTrigger id="report-category" aria-invalid={!!shown("category")}>
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {PROBLEM_CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {shown("category") && (
              <p role="alert" className="text-sm text-destructive">
                Choose a category.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-description">What is the problem?</Label>
            <Textarea
              id="report-description"
              value={fields.description}
              onChange={(event) => set("description", event.target.value)}
              maxLength={MAX_DESCRIPTION}
              rows={6}
              aria-invalid={!!shown("description")}
              placeholder="What is wrong, since when, and who is affected?"
            />
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>At least 10 characters.</span>
              <span>
                {fields.description.length}/{MAX_DESCRIPTION}
              </span>
            </div>
            {shown("description") && (
              <p role="alert" className="text-sm text-destructive">
                {shown("description")}
              </p>
            )}
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Where is the problem?</legend>
            <p className="text-xs text-muted-foreground">
              We filled in your home address. Change it if the problem is somewhere else.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="report-street">Street</Label>
                <Input
                  id="report-street"
                  value={fields.street}
                  onChange={(event) => set("street", event.target.value)}
                  maxLength={120}
                  aria-invalid={!!shown("street")}
                />
                {shown("street") && (
                  <p role="alert" className="text-sm text-destructive">
                    {shown("street")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-purok">Purok / Zone</Label>
                <Input
                  id="report-purok"
                  value={fields.purok}
                  onChange={(event) => set("purok", event.target.value)}
                  maxLength={60}
                  aria-invalid={!!shown("purok")}
                />
                {shown("purok") && (
                  <p role="alert" className="text-sm text-destructive">
                    {shown("purok")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-barangay">Barangay</Label>
                <Input
                  id="report-barangay"
                  value={fields.barangay}
                  onChange={(event) => set("barangay", event.target.value)}
                  maxLength={60}
                  aria-invalid={!!shown("barangay")}
                />
                {shown("barangay") && (
                  <p role="alert" className="text-sm text-destructive">
                    {shown("barangay")}
                  </p>
                )}
              </div>
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="report-photo">Photo (optional)</Label>
            <Input
              key={photoInput}
              id="report-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={choosePhoto}
              aria-invalid={!!photoError}
            />
            <p className="text-xs text-muted-foreground">
              A clear photo helps the barangay find the problem. JPG, PNG or WebP, up to 5 MB.
            </p>
            {photoError && (
              <p role="alert" className="text-sm text-destructive">
                {photoError}
              </p>
            )}
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          )}
          <Button variant="gold" disabled={busy}>
            {busy ? "Sending report…" : "Send report"}
          </Button>
        </form>
      </Reveal>
    </div>
  );
}
