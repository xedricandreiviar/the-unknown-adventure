import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: `Log in / Sign up — ${SITE.name}` },
    { name: "description", content: "Sign in or create a resident account for Barangay Wawa United." },
    { property: "og:title", content: `Log in / Sign up — ${SITE.name}` },
    { property: "og:description", content: "Resident access for barangay requests, court bookings, and account services." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [fields, setFields] = useState({ email: "", password: "", first_name: "", middle_name: "", last_name: "", street: "", purok: "", contact_number: "", senior_id_number: "", pwd_id_number: "", pwd_disability_type: "" });
  const [flags, setFlags] = useState({ is_senior: false, is_pwd: false });
  const [document, setDocument] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const update = (key: keyof typeof fields, value: string) => setFields((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(fields.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setNotice("If an account exists for that email, we sent a link to reset your password. Check your inbox and spam folder.");
      } else if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: fields.email, password: fields.password });
        if (signInError) throw signInError;
        await navigate({ to: "/account", replace: true });
      } else {
        if (flags.is_senior && !fields.senior_id_number.trim()) throw new Error("Enter your Senior ID number.");
        if (flags.is_pwd && !fields.pwd_id_number.trim()) throw new Error("Enter your PWD ID number.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: fields.email,
          password: fields.password,
          options: { data: { ...fields, ...flags, barangay: "Wawa", sex: "" } },
        });
        if (signUpError) throw signUpError;
        if (document && data.session && data.user) {
          const path = `${data.user.id}/${crypto.randomUUID()}-${document.name}`;
          const { error: uploadError } = await supabase.storage.from("uploads").upload(path, document);
          if (uploadError) throw uploadError;
          const { error: profileError } = await supabase.from("profiles").update({ document_path: path }).eq("id", data.user.id);
          if (profileError) throw profileError;
        }
        setNotice(data.session
          ? "Account created. Your application is pending barangay approval."
          : "Account created. Check your email to confirm, then sign in and upload your supporting ID in My Account. Your application is pending approval.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  const socialSignIn = async (provider: "google" | "lovable") => {
    setError(null); setBusy(true);
    const { error: oauthError } = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (oauthError) setError(oauthError.message);
    setBusy(false);
  };

  return <div>
    <PageHero kicker="Resident account" title={mode === "signin" ? "Log in" : mode === "forgot" ? "Forgot password" : "Create a resident account"} body="Access service requests, court reservations, and your resident account." />
    <Reveal as="section" className="mx-auto max-w-2xl px-4 py-12">
      <div className="space-y-5 rounded-lg border border-border bg-card p-5 sm:p-7">
        <div className="grid gap-3 sm:grid-cols-2">
          <Button variant="outline" onClick={() => void socialSignIn("google")} disabled={busy}>Continue with Google</Button>
          <Button variant="outline" onClick={() => void socialSignIn("lovable")} disabled={busy}>Sign in with Lovable</Button>
        </div>
        <p className="text-center text-sm text-muted-foreground">or continue with email</p>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={fields.email} onChange={(e) => update("email", e.target.value)} required autoComplete="email" /></div>
            {mode !== "forgot" && <div className="space-y-1.5"><div className="flex items-center justify-between"><Label htmlFor="password">Password</Label>{mode === "signin" && <button type="button" className="text-xs font-medium text-gold-deep underline-offset-2 hover:underline" onClick={() => { setMode("forgot"); setError(null); setNotice(null); }}>Forgot password?</button>}</div><Input id="password" type="password" value={fields.password} onChange={(e) => update("password", e.target.value)} minLength={8} required autoComplete={mode === "signup" ? "new-password" : "current-password"} /></div>}
          </div>
          {mode === "signup" && <>
            <div className="grid gap-4 sm:grid-cols-3">
              {(["first_name", "middle_name", "last_name"] as const).map((key) => <div className="space-y-1.5" key={key}><Label htmlFor={key}>{key.replace("_", " ").replace(/^./, (letter) => letter.toUpperCase())}{key !== "middle_name" && " *"}</Label><Input id={key} value={fields[key]} onChange={(e) => update(key, e.target.value)} required={key !== "middle_name"} maxLength={60} /></div>)}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="street">Street</Label><Input id="street" value={fields.street} onChange={(e) => update("street", e.target.value)} required maxLength={120} /></div>
              <div className="space-y-1.5"><Label htmlFor="purok">Purok / Zone</Label><Input id="purok" value={fields.purok} onChange={(e) => update("purok", e.target.value)} required maxLength={60} /></div>
              <div className="space-y-1.5"><Label htmlFor="contact_number">Contact number</Label><Input id="contact_number" type="tel" value={fields.contact_number} onChange={(e) => update("contact_number", e.target.value)} required maxLength={20} /></div>
            </div>
            <fieldset className="space-y-3 rounded-md border border-border p-4">
              <legend className="px-1 font-medium">Senior and PWD enrollment (optional)</legend>
              <div className="flex flex-wrap gap-5 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={flags.is_senior} onChange={(e) => setFlags((f) => ({ ...f, is_senior: e.target.checked }))} />Senior citizen</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={flags.is_pwd} onChange={(e) => setFlags((f) => ({ ...f, is_pwd: e.target.checked }))} />Person with disability</label>
              </div>
              {flags.is_senior && <div className="space-y-1.5"><Label htmlFor="senior_id_number">Senior ID number</Label><Input id="senior_id_number" value={fields.senior_id_number} onChange={(e) => update("senior_id_number", e.target.value)} required /></div>}
              {flags.is_pwd && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="pwd_id_number">PWD ID number</Label><Input id="pwd_id_number" value={fields.pwd_id_number} onChange={(e) => update("pwd_id_number", e.target.value)} required /></div><div className="space-y-1.5"><Label htmlFor="pwd_disability_type">Disability type</Label><Input id="pwd_disability_type" value={fields.pwd_disability_type} onChange={(e) => update("pwd_disability_type", e.target.value)} /></div></div>}
              {(flags.is_senior || flags.is_pwd) && <div className="space-y-1.5"><Label htmlFor="supporting-document">Supporting ID document</Label><Input id="supporting-document" type="file" accept="image/*,.pdf" onChange={(e) => setDocument(e.target.files?.[0] ?? null)} /><p className="text-xs text-muted-foreground">If email confirmation is required, upload after signing in.</p></div>}
            </fieldset>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" required className="mt-1" /><span>I confirm these details are accurate and consent to their use for barangay account review.</span></label>
          </>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="text-sm text-forest">{notice}</p>}
          <Button type="submit" variant="gold" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Log in" : mode === "forgot" ? "Send reset link" : "Submit registration"}</Button>
          <p className="text-center text-sm">{mode === "signin" ? "New resident? " : mode === "forgot" ? "Remembered it? " : "Already have an account? "}<button type="button" className="font-medium text-gold-deep underline-offset-2 hover:underline" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); setNotice(null); }}>{mode === "signin" ? "Create an account" : "Log in"}</button></p>
        </form>
      </div>
    </Reveal>
  </div>;
}