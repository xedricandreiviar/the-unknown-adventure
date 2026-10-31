import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Accessibility, CalendarDays, ChevronDown, Menu, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HotlinesModal } from "@/components/hotlines-modal";
import { useLang } from "@/lib/i18n";
import { SITE } from "@/lib/site";
import { SERVICES } from "@/lib/content";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/logo.png";

/** Top-level nav items that are plain links (no dropdown). */
const NAV_PLAIN = [
  { to: "/", key: "nav.home" },
  { to: "/announcements", key: "nav.announcements" },
  { to: "/officials", key: "nav.officials" },
  { to: "/contact", key: "nav.contact" },
] as const;

/** Service items shown inside the Services dropdown. */
const SERVICES_NAV = [
  {
    icon: CalendarDays,
    label: "nav.court",
    sublabel: "court.nav.sub",
    to: "/court-booking",
    highlight: true,
  },
  {
    icon: Accessibility,
    label: "nav.pwd",
    sublabel: "pwd.nav.sub",
    to: "/pwd",
    highlight: true,
  },
] as const;

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!now) return "";
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(now);
}

function useSignedIn() {
  const [state, setState] = useState<{ email: string | null } | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setState({ email: data.session?.user.email ?? null });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setState({ email: session?.user.email ?? null });
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return state;
}

/** Animated Services mega-menu (landscape 2-col layout on desktop). */
function ServicesMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  // Close on Escape or outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent | MouseEvent) => {
      if (e instanceof KeyboardEvent && e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (
        e instanceof MouseEvent &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.removeEventListener("mousedown", handler);
    };
  }, [open]);

  const close = () => { setOpen(false); onNavigate?.(); };

  return (
    <div
      ref={menuRef}
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      {/* Trigger */}
      <button
        ref={triggerRef}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onFocus={openMenu}
        onBlur={scheduleClose}
        className="flex items-center gap-1 rounded-md px-2.5 py-2 text-sm font-medium text-foreground/90 transition-colors hover:bg-secondary hover:text-forest-deep focus-visible:outline-2 focus-visible:outline-gold-deep"
      >
        {t("nav.services")}
        {/* Arrow rotates 180° when open */}
        <ChevronDown
          className="size-3.5 transition-transform duration-300"
          style={{ transform: open ? "rotate(-180deg)" : "rotate(0deg)" }}
          aria-hidden
        />
      </button>

      {/* ── Mega-menu panel: 2-column landscape layout ── */}
      <div
        role="menu"
        aria-label="Services menu"
        style={{
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.97)",
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease-out, transform 0.2s ease-out",
          transformOrigin: "top left",
        }}
        // Fixed wide panel anchored below the nav bar — won't clip off-screen
        className="absolute left-0 top-full z-50 mt-2 flex w-[580px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        {/* LEFT col — Quick access: Court Booking + PWD as tall cards */}
        <div className="flex w-48 shrink-0 flex-col gap-2 bg-forest-deep/[0.04] p-3">
          <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Quick access
          </p>
          {SERVICES_NAV.map(({ icon: Icon, label, to }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              onClick={close}
              onFocus={cancelClose}
              onBlur={scheduleClose}
              className="group flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition-all hover:border-forest-deep/30 hover:bg-secondary hover:shadow-md focus-visible:bg-secondary focus-visible:outline-none"
            >
              {/* Icon badge */}
              <span className="flex size-9 items-center justify-center rounded-lg bg-forest-deep/8 text-forest-deep transition-colors group-hover:bg-forest-deep group-hover:text-primary-foreground">
                <Icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-semibold text-forest-deep">{t(label)}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                  {label === "nav.court" ? "Reserve a 2-hour slot" : "ID, discounts & guides"}
                </span>
              </span>
            </Link>
          ))}
          {/* Link to full services page */}
          <Link
            to="/services"
            role="menuitem"
            onClick={close}
            onFocus={cancelClose}
            onBlur={scheduleClose}
            className="mt-auto flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold text-gold-deep transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
          >
            All services →
          </Link>
        </div>

        {/* RIGHT col — all barangay services in a 2-col grid */}
        <div className="flex-1 p-3">
          <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Barangay services
          </p>
          <ul className="grid grid-cols-2 gap-1">
            {SERVICES.map((s) => (
              <li key={s.name}>
                {/* Pass ?open=<name> so the services page auto-opens this accordion item */}
                <Link
                  to="/services"
                  search={{ open: s.name }}
                  role="menuitem"
                  onClick={close}
                  onFocus={cancelClose}
                  onBlur={scheduleClose}
                  className="flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gold-deep opacity-60" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium leading-snug text-foreground">{s.name}</span>
                    <span className="block text-xs leading-snug text-muted-foreground line-clamp-1">{s.desc}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const { t, lang, setLang } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);
  const session = useSignedIn();
  const navigate = useNavigate();
  const dateLabel = useClock();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  return (
    <header className="sticky top-0 z-40">
      {/* slim top bar */}
      <div className="bg-forest-deep text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1.5 text-xs">
          <p className="truncate">{dateLabel}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === "en" ? "fil" : "en")}
              className="rounded-sm border border-white/25 px-2 py-0.5 hover:bg-white/10"
              aria-label="Toggle language between English and Filipino"
            >
              {lang === "en" ? "Filipino" : "English"}
            </button>
            <span aria-hidden className="hidden sm:inline text-gold">|</span>
            <HotlinesModal />
          </div>
        </div>
      </div>

      {/* main bar */}
      <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3" aria-label={`${SITE.name} home`}>
            <img
              src={logoAsset}
              alt={`${SITE.name} seal`}
              className="size-11 rounded-full bg-card shadow-sm ring-1 ring-gold/60"
            />
            <span className="leading-tight">
              <span className="block font-display text-lg font-semibold text-forest-deep">
                Barangay Wawa <span className="text-gold-deep">United</span>
              </span>
              <span className="block text-[11px] tracking-wide text-muted-foreground">
                {SITE.city} · Serbisyong tapat, para sa lahat
              </span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {/* Home */}
            <Link
              to="/"
              className="rounded-md px-2.5 py-2 text-sm font-medium text-foreground/90 transition-colors hover:bg-secondary hover:text-forest-deep focus-visible:outline-2 focus-visible:outline-gold-deep"
              activeProps={{ className: "bg-secondary text-forest-deep" }}
            >
              {t("nav.home")}
            </Link>

            {/* Services dropdown */}
            <ServicesMenu />

            {/* Remaining plain links */}
            {NAV_PLAIN.filter((n) => n.to !== "/").map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-md px-2.5 py-2 text-sm font-medium text-foreground/90 transition-colors hover:bg-secondary hover:text-forest-deep focus-visible:outline-2 focus-visible:outline-gold-deep"
                activeProps={{ className: "bg-secondary text-forest-deep" }}
              >
                {t(n.key)}
              </Link>
            ))}
          </nav>

          {/* Right-side actions */}
          <div className="flex items-center gap-2">
            {session ? (
              <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                <Link to="/account" className="gap-1.5">
                  <UserRound className="size-4" aria-hidden />
                  {t("nav.myAccount")}
                </Link>
              </Button>
            ) : (
              <Button asChild variant="gold" size="sm" className="hidden sm:inline-flex">
                <Link to="/auth">{t("nav.signIn")}</Link>
              </Button>
            )}
            <button
              className="inline-flex size-10 items-center justify-center rounded-md border border-border lg:hidden"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <nav aria-label="Mobile" className="border-t border-border bg-background lg:hidden">
            <ul className="mx-auto max-w-6xl px-4 py-2">
              {/* Home */}
              <li>
                <Link
                  to="/"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-h-11 items-center rounded-md px-3 text-base font-medium hover:bg-secondary"
                  activeProps={{ className: "bg-secondary text-forest-deep" }}
                >
                  {t("nav.home")}
                </Link>
              </li>

              {/* Services accordion — expands into a 2-col tile grid on mobile */}
              <li>
                <button
                  onClick={() => setMobileServicesOpen((v) => !v)}
                  aria-expanded={mobileServicesOpen}
                  className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-base font-medium hover:bg-secondary"
                >
                  {t("nav.services")}
                  {/* Arrow rotates when expanded */}
                  <ChevronDown
                    className="size-4 transition-transform duration-300"
                    style={{ transform: mobileServicesOpen ? "rotate(-180deg)" : "rotate(0deg)" }}
                    aria-hidden
                  />
                </button>

                {/* Animated expand/collapse */}
                <div
                  style={{
                    maxHeight: mobileServicesOpen ? "900px" : "0px",
                    opacity: mobileServicesOpen ? 1 : 0,
                    overflow: "hidden",
                    transition: "max-height 0.38s cubic-bezier(0.22,1,0.36,1), opacity 0.25s ease",
                  }}
                >
                  <div className="px-2 pb-3 pt-1">
                    {/* Quick-access row: Court + PWD side by side */}
                    <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Quick access
                    </p>
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      {SERVICES_NAV.map(({ icon: Icon, label, to }) => (
                        <Link
                          key={to}
                          to={to}
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:bg-secondary active:bg-secondary"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-forest-deep/8 text-forest-deep">
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <span className="text-sm font-semibold text-forest-deep">{t(label)}</span>
                        </Link>
                      ))}
                    </div>

                    {/* All barangay services in a 2-col grid */}
                    <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Barangay services
                    </p>
                    <ul className="grid grid-cols-2 gap-1.5">
                      {SERVICES.map((s) => (
                        <li key={s.name}>
                          {/* Pass ?open=<name> so the services page auto-opens this accordion item */}
                          <Link
                            to="/services"
                            search={{ open: s.name }}
                            onClick={() => setMenuOpen(false)}
                            className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:bg-secondary active:bg-secondary"
                          >
                            <span className="size-1.5 shrink-0 rounded-full bg-gold-deep opacity-60" aria-hidden />
                            <span className="text-sm font-medium leading-snug text-foreground">{s.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>

                    {/* View all link */}
                    <Link
                      to="/services"
                      onClick={() => setMenuOpen(false)}
                      className="mt-2 flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-gold-deep transition-colors hover:bg-secondary"
                    >
                      View all services →
                    </Link>
                  </div>
                </div>
              </li>

              {/* Remaining nav items */}
              {NAV_PLAIN.filter((n) => n.to !== "/").map((n) => (
                <li key={n.to}>
                  <Link
                    to={n.to}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-11 items-center rounded-md px-3 text-base font-medium hover:bg-secondary"
                    activeProps={{ className: "bg-secondary text-forest-deep" }}
                  >
                    {t(n.key)}
                  </Link>
                </li>
              ))}

              {/* Sign in / account */}
              <li className="mt-1 border-t border-border pt-2">
                {session ? (
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="lg" className="flex-1">
                      <Link to="/account" onClick={() => setMenuOpen(false)}>
                        {t("nav.myAccount")}
                      </Link>
                    </Button>
                    <Button variant="ghost" size="lg" onClick={signOut}>
                      {t("nav.signOut")}
                    </Button>
                  </div>
                ) : (
                  <Button asChild variant="gold" size="lg" className="w-full">
                    <Link to="/auth" onClick={() => setMenuOpen(false)}>
                      {t("nav.signIn")}
                    </Link>
                  </Button>
                )}
              </li>
            </ul>
          </nav>
        )}
      </div>
    </header>
  );
}
