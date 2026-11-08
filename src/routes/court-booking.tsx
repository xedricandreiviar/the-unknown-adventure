import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { StatusBadge } from "@/components/status-badge";
import { getMyReservations, createReservation, cancelMyReservation, getPublicDayAvailability } from "@/lib/court.functions";
import { BOOKING_SLOTS, SITE } from "@/lib/site";

export const Route = createFileRoute("/court-booking")({
  head: () => ({ meta: [
    { title: `Court Booking — ${SITE.name}` },
    { name: "description", content: "Reserve the Barangay Wawa multi-purpose court and check the daily slot schedule." },
    { property: "og:title", content: `Court Booking — ${SITE.name}` },
    { property: "og:description", content: "Check daily court availability and manage your reservation." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: CourtBookingPage,
});

function CourtBookingPage() {
  const publicAvailability = useServerFn(getPublicDayAvailability);
  const myReservationsFn = useServerFn(getMyReservations);
  const createReservationFn = useServerFn(createReservation);
  const cancelReservationFn = useServerFn(cancelMyReservation);
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [purpose, setPurpose] = useState("");
  const [phone, setPhone] = useState("");
  const [availability, setAvailability] = useState<Array<{ start: string; end: string; label: string; status: string }>>([]);
  const [reservations, setReservations] = useState<Array<{ id: string; res_date: string; slot: string; purpose: string; status: string; rejection_reason: string | null }>>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const maxDate = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") setSignedIn(Boolean(session));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!date) return;
    let active = true;
    publicAvailability({ data: { date } }).then((rows) => { if (active) setAvailability(rows); }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load court availability.");
    });
    return () => { active = false; };
  }, [date, publicAvailability]);

  useEffect(() => {
    if (!signedIn) return;
    myReservationsFn().then((rows) => setReservations(rows)).catch(() => setReservations([]));
  }, [signedIn, myReservationsFn]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await createReservationFn({ data: { res_date: date, slot, purpose, contact_number: phone } });
      setMessage("Reservation request sent. It will appear below while the barangay reviews it.");
      setPurpose(""); setPhone(""); setSlot("");
      const [rows, updated] = await Promise.all([myReservationsFn(), publicAvailability({ data: { date } })]);
      setReservations(rows); setAvailability(updated);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit your reservation."); }
    finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    setBusy(true); setError("");
    try {
      await cancelReservationFn({ data: { id } });
      setReservations(await myReservationsFn());
      if (date) setAvailability(await publicAvailability({ data: { date } }));
      setMessage("Reservation cancelled.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not cancel this reservation."); }
    finally { setBusy(false); }
  };

  return <div>
    <PageHero kicker="Multi-purpose court, Barangay Wawa" title="Court Booking" body="Check the schedule and request a two-hour slot for your group." />
    <Reveal as="section" className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1.05fr_.95fr]">
      <div>
        <h2 className="font-display text-2xl font-semibold text-forest-deep">Daily availability</h2>
        <div className="mt-4 max-w-xs space-y-1.5"><Label htmlFor="booking-date">Choose a date</Label><Input id="booking-date" type="date" min={today} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <ul className="mt-5 divide-y divide-border border-y border-border bg-card">
          {BOOKING_SLOTS.map((item) => {
            const state = availability.find((row) => row.start === item.start)?.status ?? (date ? "open" : "choose a date");
            return <li key={item.start} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm sm:px-4">
              <span className="flex items-center gap-2 font-medium"><Clock3 className="size-4 text-gold-deep" aria-hidden />{item.label}</span>
              {state === "open" ? <span className="text-forest">Available</span> : state === "taken" ? <span className="text-muted-foreground">Reserved</span> : state === "blocked" ? <span className="text-destructive">Closed</span> : <span className="text-muted-foreground">Choose a date</span>}
            </li>;
          })}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">Requests are confirmed after barangay approval. Slots are two hours; bookings open up to 60 days ahead.</p>
      </div>
      <div className="border-t border-border pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
        <h2 className="font-display text-2xl font-semibold text-forest-deep">Request a reservation</h2>
        {!signedIn ? <p className="mt-3 text-sm text-muted-foreground"><Link to="/auth" className="font-medium text-gold-deep underline">Sign in</Link> to request a slot. Your account must be approved by the barangay.</p> : <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="space-y-1.5"><Label htmlFor="reservation-slot">Available time</Label><select id="reservation-slot" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={slot} onChange={(e) => setSlot(e.target.value)} required><option value="">Select a time</option>{availability.filter((item) => item.status === "open").map((item) => <option key={item.start} value={item.start}>{item.label}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="purpose">Purpose</Label><Input id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={200} required placeholder="Basketball practice, community event…" /></div>
          <div className="space-y-1.5"><Label htmlFor="phone">Contact number</Label><Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="09XX XXX XXXX" /></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm text-forest">{message}</p>}
          <Button type="submit" variant="gold" disabled={busy || !date || !availability.some((item) => item.status === "open")}><CalendarDays className="mr-2 size-4" aria-hidden />{busy ? "Please wait…" : "Request this booking"}</Button>
        </form>}
      </div>
    </Reveal>
    {signedIn && <Reveal as="section" className="paper-texture-cream">
      <div className="mx-auto max-w-6xl px-4 py-10"><h2 className="font-display text-2xl font-semibold text-forest-deep">My reservations</h2>
        {reservations.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No reservations yet.</p> : <ul className="mt-4 divide-y divide-border border-y border-border">{reservations.map((row) => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{row.res_date} · {BOOKING_SLOTS.find((s) => s.start === row.slot)?.label ?? row.slot}</p><p className="text-sm text-muted-foreground">{row.purpose}</p>{row.rejection_reason && <p className="text-sm text-destructive">{row.rejection_reason}</p>}</div><div className="flex items-center gap-3"><StatusBadge status={row.status} />{row.status === "pending" && <Button variant="outline" size="sm" disabled={busy} onClick={() => void cancel(row.id)}>Cancel</Button>}</div></li>)}</ul>}
      </div>
    </Reveal>}
  </div>;
}