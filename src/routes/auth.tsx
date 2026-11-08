import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `Log in / Sign up — ${SITE.name}` },
      { name: "description", content: "Sign in to track your barangay requests, court bookings, and account." },
      { property: "og:title", content: `Log in / Sign up — ${SITE.name}` },
      { property: "og:description", content: "Sign in or create a resident account for Barangay Wawa United." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/account", replace: true });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setError(error.message);
      } else {
        setNotice(
          "If an account exists for that email, we sent a link to reset your password. Check your inbox and spam folder.",
        );
      }
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        setNotice("Account created! Check your email for a confirmation link before signing in.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        navigate({ to: "/account", replace: true });
      }
    }
    setBusy(false);
  };

  return (
    <div>
      <PageHero
        kicker="Resident account"
        title={mode === "signin" ? "Log in" : mode === "signup" ? "Create an account" : "Forgot password"}
        body={
          mode === "forgot"
            ? "Enter your account email and we will send you a link to set a new password."
            : "Track your requests, manage your court bookings, and update your details."
        }
      />
      <Reveal as="section" className="mx-auto max-w-md px-4 py-12">
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-6">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
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
                      setPassword("");
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
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="text-sm text-forest">{notice}</p>}
          <Button type="submit" variant="gold" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Log in" : mode === "signup" ? "Sign up" : "Send reset link"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {mode === "forgot"
              ? "Remembered it? "
              : mode === "signin"
                ? "No account yet? "
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
              {mode === "signin" ? "Sign up" : "Log in"}
            </button>
          </p>
        </form>
      </Reveal>
    </div>
  );
}
