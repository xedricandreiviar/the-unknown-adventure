import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { AdminContext } from "@/components/admin/admin-context";
import { AlertBell, CountBadge, useAdminAlerts } from "@/components/admin/admin-alerts";
import { getMyProfile } from "@/lib/profiles.functions";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: `Admin — ${SITE.name}` }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLayout,
});

const SECTIONS = [
  { to: "/admin/accounts", label: "Accounts" },
  { to: "/admin/requests", label: "Requests" },
  { to: "/admin/problems", label: "Problems" },
  { to: "/admin/registry", label: "PWD / Senior" },
  { to: "/admin/announcements", label: "Announcements" },
  { to: "/admin/settings", label: "Settings" },
  { to: "/admin/reports", label: "Reports" },
] as const;

type SectionKey = "accounts" | "requests" | "problems";

type Access =
  { state: "loading" } | { state: "denied"; message: string } | { state: "ok"; userId: string };

function AdminLayout() {
  const profileFn = useServerFn(getMyProfile);
  const [access, setAccess] = useState<Access>({ state: "loading" });

  useEffect(() => {
    let active = true;
    profileFn()
      .then(({ profile, isAdmin }) => {
        if (!active) return;
        if (profile && isAdmin) setAccess({ state: "ok", userId: profile.id });
        else
          setAccess({
            state: "denied",
            message: profile
              ? "This area is for barangay administrators only."
              : "Sign in to continue.",
          });
      })
      .catch(() => {
        if (active)
          setAccess({
            state: "denied",
            message: "Sign in with an administrator account to continue.",
          });
      });
    return () => {
      active = false;
    };
  }, [profileFn]);

  if (access.state === "loading") {
    return (
      <div>
        <PageHero kicker="Barangay admin" title="Admin panel" />
        <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">
          Checking your access…
        </div>
      </div>
    );
  }

  if (access.state === "denied") {
    return (
      <div>
        <PageHero kicker="Barangay admin" title="Admin panel" />
        <div className="mx-auto max-w-3xl px-4 py-12">
          <p role="alert" className="text-sm text-destructive">
            {access.message}
          </p>
          <Button asChild variant="gold" className="mt-4">
            <Link to="/auth">Log in / Sign up</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <AdminShell userId={access.userId} />;
}

function AdminShell({ userId }: { userId: string }) {
  const { counts, notifications, markRead, markAllRead } = useAdminAlerts();
  return (
    <AdminContext.Provider value={{ userId }}>

      {/* Slim dark header — same pattern as the resident account page */}
      <div className="border-b border-border bg-forest-deep px-4 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Barangay admin
            </p>
            <h1 className="mt-0.5 flex items-center gap-2 font-display text-xl font-semibold text-primary-foreground">
              <ShieldCheck className="size-5 text-gold" aria-hidden />
              Admin panel
            </h1>
          </div>
          <AlertBell notifications={notifications} onRead={markRead} onReadAll={() => void markAllRead()} />
        </div>
      </div>

      {/* Tab nav strip */}
      <div className="border-b border-border bg-background">
        <div className="mx-auto max-w-6xl px-4">
          <nav aria-label="Admin sections" className="flex gap-1 overflow-x-auto">
            {SECTIONS.map((section) => {
              const key = section.to.replace("/admin/", "");
              const count = key in counts ? counts[key as SectionKey] : 0;
              return (
                <Link
                  key={section.to}
                  to={section.to}
                  className="whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground hover:text-forest-deep"
                  activeProps={{ className: "border-gold-deep text-forest-deep" }}
                >
                  {section.label}
                  <CountBadge count={count} />
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </div>
    </AdminContext.Provider>
  );
}
