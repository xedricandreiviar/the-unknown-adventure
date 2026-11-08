import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: `Reset password — ${SITE.name}` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The emailed link signs the user in temporarily so they can set a new password.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setState((s) => (s === "done" ? s : "ready"));
      }
    });
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      setState((s) => (s === "checking" ? (data.session ? "ready" : "invalid") : s));
    }, 1500);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setState("done");
    window.setTimeout(() => navigate({ to: "/account", replace: true }), 1500);
  };

  return (
    <div>
      <PageHero
        kicker="Resident account"
        title="Set a new password"
        body="Choose a new password for your account."
      />
      <Reveal as="section" className="mx-auto max-w-md px-4 py-12">
        {state === "checking" && <p className="text-sm text-muted-foreground">Checking your link…</p>}

        {state === "invalid" && (
          <div role="alert" className="space-y-4 rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">
              This reset link is invalid or has expired. Please request a new one.
            </p>
            <Button asChild variant="gold">
              <Link to="/auth">Back to log in</Link>
            </Button>
          </div>
        )}

        {state === "done" && (
          <p role="status" className="rounded-xl border border-border bg-card p-6 text-center text-sm text-forest">
            Your password was updated. Taking you to your account…
          </p>
        )}

        {state === "ready" && (
          <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-card p-6">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" variant="gold" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </Button>
          </form>
        )}
      </Reveal>
    </div>
  );
}
