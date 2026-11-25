import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { useConfirm } from "@/components/confirm-dialog";
import { ReviewPanel } from "@/components/review-panel";
import { SITE } from "@/lib/site";
import { DISABILITY_TYPES } from "@/lib/registry";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Log in / Sign up — ${SITE.name}` },
      {
        name: "description",
        content: "Sign in or create a resident account for Barangay Wawa United.",
      },
      { property: "og:title", content: `Log in / Sign up — ${SITE.name}` },
      {
        property: "og:description",
        content: "Resident access for barangay requests, court bookings, and account services.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [reviewing, setReviewing] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [fields, setFields] = useState({
    email: "",
    password: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    street: "",
    purok: "",
    contact_number: "",
    senior_id_number: "",
    pwd_id_number: "",
    pwd_disability_type: "",
  });
  const [flags, setFlags] = useState({ is_senior: false, is_pwd: false });
  const [document, setDocument] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof fields, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  const submit = async (event?: React.FormEvent<HTMLFormElement>, confirmed = false) => {
    event?.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === "signup" && !confirmed) {
      if (flags.is_senior && !fields.senior_id_number.trim()) {
        setError("Enter your Senior ID number.");
        return;
      }
      if (flags.is_pwd && !fields.pwd_id_number.trim()) {
        setError("Enter your PWD ID number.");
        return;
      }
      setReviewing(true);
      window.scrollTo({ top: 0 });
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(fields.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setNotice(
          "If an account exists for that email, we sent a link to reset your password. Check your inbox and spam folder.",
        );
      } else if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: fields.email,
          password: fields.password,
        });
        if (signInError) throw signInError;
        await navigate({ to: "/account", replace: true });
      } else {
        if (flags.is_senior && !fields.senior_id_number.trim())
          throw new Error("Enter your Senior ID number.");
        if (flags.is_pwd && !fields.pwd_id_number.trim())
          throw new Error("Enter your PWD ID number.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: fields.email,
          password: fields.password,
          options: { data: { ...fields, ...flags, barangay: "Wawa", sex: "" } },
        });
        if (signUpError) throw signUpError;
        if (document && data.session && data.user) {
          const path = `${data.user.id}/${crypto.randomUUID()}-${document.name}`;
          const { error: uploadError } = await supabase.storage
            .from("uploads")
            .upload(path, document);
          if (uploadError) throw uploadError;
          const { error: profileError } = await supabase
            .from("profiles")
            .update({ document_path: path })
            .eq("id", data.user.id);
          if (profileError) throw profileError;
        }
        setReviewing(false);
        // If Supabase returned a session the user is already signed in — go straight to account.
        // If email confirmation is required, data.session is null — show the notice instead.
        if (data.session) {
          await navigate({ to: "/account", replace: true });
        } else {
          setNotice(
            "Account created. Check your email to confirm, then sign in and upload your supporting ID in My Account. Your application is pending approval.",
          );
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirmSignup = async () => {
    const ok = await confirm({
      title: "Do you want to submit your registration?",
      description: "The barangay will review it before your account is approved.",
      confirmLabel: "Yes, submit",
    });
    if (ok) await submit(undefined, true);
  };

  const chooseDocument = async (file: File | null) => {
    if (!file) {
      setDocument(null);
      return;
    }
    const ok = await confirm({
      title: "Do you want to upload this file?",
      description: `${file.name} will be sent with your registration.`,
      confirmLabel: "Yes, use this file",
    });
    setDocument(ok ? file : null);
  };

  const socialSignIn = async (provider: "google") => {
    setError(null);
    setBusy(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    if (oauthError) setError(oauthError.message);
    setBusy(false);
  };

  if (reviewing && mode === "signup") {
    const fullName = [fields.first_name, fields.middle_name, fields.last_name]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");
    return (
      <div>
        <PageHero
          kicker="Resident account"
          title="Review your registration"
          body="Check your details before sending them to the barangay."
        />
        <Reveal as="section" className="mx-auto max-w-2xl px-4 py-12">
          <ReviewPanel
            intro="Check your details. Nothing is sent until you press Submit registration."
            rows={[
              { label: "Name", value: fullName },
              { label: "Email", value: fields.email },
              {
                label: "Address",
                value: [fields.street, fields.purok, "Wawa"]
                  .map((part) => part.trim())
                  .filter(Boolean)
                  .join(", "),
              },
              { label: "Contact number", value: fields.contact_number },
              {
                label: "Senior citizen",
                value: flags.is_senior ? `Yes, ID ${fields.senior_id_number}` : "No",
              },
              {
                label: "Person with disability",
                value: flags.is_pwd
                  ? `Yes, ID ${fields.pwd_id_number}${fields.pwd_disability_type ? `, ${fields.pwd_disability_type}` : ""}`
                  : "No",
              },
              { label: "Supporting document", value: document ? document.name : "" },
            ]}
            busy={busy}
            error={error ?? undefined}
            submitLabel="Submit registration"
            busyLabel="Please wait…"
            onBack={() => {
              setError(null);
              setReviewing(false);
            }}
            onSubmit={() => void confirmSignup()}
          />
        </Reveal>
      </div>
    );
  }

  return (
    <div>
      <PageHero
        kicker="Resident account"
        title={
          mode === "signin"
            ? "Log in"
            : mode === "forgot"
              ? "Forgot password"
              : "Create a resident account"
        }
        body="Access service requests, court reservations, and your resident account."
      />
      <Reveal as="section" className="mx-auto max-w-2xl px-4 py-12">
        <div className="space-y-5 rounded-lg border border-border bg-card p-5 sm:p-7">
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={fields.email}
                  onChange={(e) => update("email", e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === "signin" && (
                      <button
                        type="button"
                        className="text-xs font-medium text-gold-deep underline-offset-2 hover:underline"
                        onClick={() => {
                          setMode("forgot");
                          setError(null);
                          setNotice(null);
                        }}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={fields.password}
                    onChange={(e) => update("password", e.target.value)}
                    minLength={8}
                    required
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  />
                </div>
              )}
            </div>
            {mode === "signup" && (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  {(["first_name", "middle_name", "last_name"] as const).map((key) => (
                    <div className="space-y-1.5" key={key}>
                      <Label htmlFor={key}>
                        {key.replace("_", " ").replace(/^./, (letter) => letter.toUpperCase())}
                        {key !== "middle_name" && " *"}
                      </Label>
                      <Input
                        id={key}
                        value={fields[key]}
                        onChange={(e) => update(key, e.target.value)}
                        required={key !== "middle_name"}
                        maxLength={60}
                      />
                    </div>
                  ))}
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="street">Street</Label>
                    <Input
                      id="street"
                      value={fields.street}
                      onChange={(e) => update("street", e.target.value)}
                      required
                      maxLength={120}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="purok">Purok / Zone</Label>
                    <Input
                      id="purok"
                      value={fields.purok}
                      onChange={(e) => update("purok", e.target.value)}
                      required
                      maxLength={60}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact_number">Contact number</Label>
                    <Input
                      id="contact_number"
                      type="tel"
                      value={fields.contact_number}
                      onChange={(e) => update("contact_number", e.target.value)}
                      required
                      maxLength={20}
                    />
                  </div>
                </div>
                <fieldset className="space-y-3 rounded-md border border-border p-4">
                  <legend className="px-1 font-medium">Senior and PWD enrollment (optional)</legend>
                  <div className="flex flex-wrap gap-5 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={flags.is_senior}
                        onChange={(e) => setFlags((f) => ({ ...f, is_senior: e.target.checked }))}
                      />
                      Senior citizen
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={flags.is_pwd}
                        onChange={(e) => setFlags((f) => ({ ...f, is_pwd: e.target.checked }))}
                      />
                      Person with disability
                    </label>
                  </div>
                  {flags.is_senior && (
                    <div className="space-y-1.5">
                      <Label htmlFor="senior_id_number">Senior ID number</Label>
                      <Input
                        id="senior_id_number"
                        value={fields.senior_id_number}
                        onChange={(e) => update("senior_id_number", e.target.value)}
                        required
                      />
                    </div>
                  )}
                  {flags.is_pwd && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="pwd_id_number">PWD ID number</Label>
                        <Input
                          id="pwd_id_number"
                          value={fields.pwd_id_number}
                          onChange={(e) => update("pwd_id_number", e.target.value)}
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          Format: RR-PPMM-BBB-NNNNNNN (region, province + city/municipality,
                          barangay, 7-digit number). Example: 13-5416-000-0000001
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pwd_disability_type">Type of disability</Label>
                        {/* Radix Select renders in a portal — always drops down correctly */}
                        <Select
                          value={fields.pwd_disability_type}
                          onValueChange={(val) => update("pwd_disability_type", val)}
                        >
                          <SelectTrigger id="pwd_disability_type" className="w-full">
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent position="popper" side="bottom" sideOffset={4} avoidCollisions={false}>
                            {DISABILITY_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  {(flags.is_senior || flags.is_pwd) && (
                    <div className="space-y-1.5">
                      <Label htmlFor="supporting-document">Supporting ID document</Label>
                      <Input
                        id="supporting-document"
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => void chooseDocument(e.target.files?.[0] ?? null)}
                      />
                      <p className="text-xs text-muted-foreground">
                        If email confirmation is required, upload after signing in.
                      </p>
                    </div>
                  )}
                </fieldset>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" required className="mt-1" />
                  <span>
                    I confirm these details are accurate and consent to their use for barangay
                    account review.
                  </span>
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-forest">
                {notice}
              </p>
            )}
            <Button type="submit" variant="gold" className="w-full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "signin"
                  ? "Log in"
                  : mode === "forgot"
                    ? "Send reset link"
                    : "Submit registration"}
            </Button>
            {mode === "signin" && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void socialSignIn("google")}
                >
                  <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </Button>
              </>
            )}
            <p className="text-center text-sm">
              {mode === "signin"
                ? "New resident? "
                : mode === "forgot"
                  ? "Remembered it? "
                  : "Already have an account? "}
              <button
                type="button"
                className="font-medium text-gold-deep underline-offset-2 hover:underline"
                onClick={() => {
                  setMode(mode === "signin" ? "signup" : "signin");
                  setError(null);
                  setNotice(null);
                }}
              >
                {mode === "signin" ? "Create an account" : "Log in"}
              </button>
            </p>
          </form>
        </div>
      </Reveal>
    </div>
  );
}
