import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CalendarDays, FileText, LogOut, Bell, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { StatusBadge } from "@/components/status-badge";
import { getMyProfile, updateMyProfile } from "@/lib/profiles.functions";
import { getMyRequests, cancelMyRequest } from "@/lib/queue.functions";
import { getMyReservations, cancelMyReservation } from "@/lib/court.functions";
import { getMyNotifications, markAllNotificationsRead } from "@/lib/notifications.functions";
import { getMyProblemReports, getMyBenefitReleases } from "@/lib/problems.functions";
import { BOOKING_SLOTS, SITE } from "@/lib/site";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [
    { title: `My Account — ${SITE.name}` },
    { name: "description", content: "Manage your resident profile, service requests, reservations, benefits, and notices." },
    { property: "og:title", content: `My Account — ${SITE.name}` },
    { property: "og:description", content: "Resident profile, requests, bookings, benefits, and notifications." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AccountPage,
});

type Profile = { id: string; email: string; first_name: string; middle_name: string; last_name: string; street: string; purok: string; barangay: string; contact_number: string; status: string; rejection_reason: string | null; is_senior: boolean; is_pwd: boolean; senior_id_number: string | null; pwd_id_number: string | null; pwd_disability_type: string | null; document_path: string | null };

function AccountPage() {
  const navigate = useNavigate();
  const profileFn = useServerFn(getMyProfile);
  const updateProfileFn = useServerFn(updateMyProfile);
  const requestsFn = useServerFn(getMyRequests);
  const cancelRequestFn = useServerFn(cancelMyRequest);
  const reservationsFn = useServerFn(getMyReservations);
  const cancelReservationFn = useServerFn(cancelMyReservation);
  const notificationsFn = useServerFn(getMyNotifications);
  const markAllReadFn = useServerFn(markAllNotificationsRead);
  const reportsFn = useServerFn(getMyProblemReports);
  const releasesFn = useServerFn(getMyBenefitReleases);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [fields, setFields] = useState({ first_name: "", middle_name: "", last_name: "", street: "", purok: "", barangay: "Wawa", contact_number: "", senior_id_number: "", pwd_id_number: "", pwd_disability_type: "", is_senior: false, is_pwd: false });
  const [requests, setRequests] = useState<Array<{ id: string; code: string; status: string; created_at: string; rejection_reason: string | null; service: { name: string } | null }>>([]);
  const [reservations, setReservations] = useState<Array<{ id: string; res_date: string; slot: string; purpose: string; status: string }>>([]);
  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; body: string; created_at: string; read: boolean }>>([]);
  const [reports, setReports] = useState<Array<{ id: string; category: string; description: string; status: string; created_at: string; admin_reply: string | null }>>([]);
  const [releases, setReleases] = useState<Array<{ id: string; kind: string; description: string; status: string; date_released: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([profileFn(), requestsFn(), reservationsFn(), notificationsFn(), reportsFn(), releasesFn()])
      .then(([result, requestRows, reservationRows, notificationRows, reportRows, releaseRows]) => {
        if (!active) return;
        if (!result.profile) throw new Error("Your account profile could not be found.");
        const person = result.profile as Profile;
        setProfile(person);
        setIsAdmin(result.isAdmin);
        setFields({ first_name: person.first_name, middle_name: person.middle_name, last_name: person.last_name, street: person.street, purok: person.purok, barangay: person.barangay, contact_number: person.contact_number, senior_id_number: person.senior_id_number ?? "", pwd_id_number: person.pwd_id_number ?? "", pwd_disability_type: person.pwd_disability_type ?? "", is_senior: person.is_senior, is_pwd: person.is_pwd });
        setRequests(requestRows); setReservations(reservationRows); setNotifications(notificationRows); setReports(reportRows); setReleases(releaseRows);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load your account."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profileFn, requestsFn, reservationsFn, notificationsFn, reportsFn, releasesFn]);

  const signOut = async () => {
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  };
  const updateField = (key: keyof typeof fields, value: string | boolean) => setFields((current) => ({ ...current, [key]: value }));
  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { await updateProfileFn({ data: { ...fields, birthdate: null, sex: "" } }); setMessage("Profile updated."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update your profile."); }
    finally { setBusy(false); }
  };
  const uploadDocument = async (file: File | undefined) => {
    if (!file || !profile) return;
    setBusy(true); setError("");
    try {
      const path = `${profile.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("uploads").upload(path, file);
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase.from("profiles").update({ document_path: path }).eq("id", profile.id);
      if (updateError) throw updateError;
      setProfile({ ...profile, document_path: path }); setMessage("Supporting document uploaded.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload the document."); }
    finally { setBusy(false); }
  };
  const markRead = async () => {
    setBusy(true); setError("");
    try { await markAllReadFn(); setNotifications((rows) => rows.map((item) => ({ ...item, read: true }))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update notifications."); }
    finally { setBusy(false); }
  };
  const cancelRequest = async (id: string) => {
    setBusy(true); setError("");
    try { await cancelRequestFn({ data: { id } }); setRequests(await requestsFn()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not cancel request."); }
    finally { setBusy(false); }
  };
  const cancelReservation = async (id: string) => {
    setBusy(true); setError("");
    try { await cancelReservationFn({ data: { id } }); setReservations(await reservationsFn()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not cancel reservation."); }
    finally { setBusy(false); }
  };

  if (loading) return <div><PageHero kicker="Resident account" title="My Account" /><div className="mx-auto max-w-5xl px-4 py-12 text-sm text-muted-foreground">Loading your account…</div></div>;
  if (!profile) return <div><PageHero kicker="Resident account" title="My Account" /><div className="mx-auto max-w-3xl px-4 py-12"><p role="alert" className="text-sm text-destructive">{error || "Sign in to view your account."}</p><Button asChild variant="gold" className="mt-4"><Link to="/auth">Log in / Sign up</Link></Button></div></div>;

  return <div>
    <PageHero kicker="Resident account" title={`${profile.first_name} ${profile.last_name}`} body={profile.email}>
      <div className="flex flex-wrap items-center gap-3"><StatusBadge status={profile.status} />{isAdmin && <Button asChild variant="gold"><Link to="/admin">Admin panel</Link></Button>}<Button variant="outline" onClick={() => void signOut()}><LogOut className="mr-2 size-4" aria-hidden />Sign out</Button></div>
    </PageHero>
    {error && <p role="alert" className="mx-auto max-w-6xl px-4 pt-5 text-sm text-destructive">{error}</p>}{message && <p role="status" className="mx-auto max-w-6xl px-4 pt-5 text-sm text-forest">{message}</p>}
    {profile.status !== "approved" && <div className="mx-auto max-w-6xl px-4 pt-6"><div className="flex gap-3 border-l-4 border-gold-deep bg-gold-soft/30 p-4 text-sm"><TriangleAlert className="size-5 shrink-0 text-gold-deep" aria-hidden /><div><p className="font-semibold">{profile.status === "pending" ? "Your account is awaiting barangay approval." : profile.status === "rejected" ? "Your account application was not approved." : "Your account is currently deactivated."}</p>{profile.rejection_reason && <p className="mt-1">{profile.rejection_reason}</p>}</div></div></div>}

    <Reveal as="section" className="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[.9fr_1.1fr]">
      <div><h2 className="font-display text-2xl font-semibold text-forest-deep">Resident profile</h2><form onSubmit={(event) => void saveProfile(event)} className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">{(["first_name", "middle_name", "last_name", "street", "purok", "contact_number"] as const).map((key) => <div className="space-y-1" key={key}><Label htmlFor={`profile-${key}`}>{key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())}</Label><Input id={`profile-${key}`} value={fields[key]} onChange={(event) => updateField(key, event.target.value)} required={key !== "middle_name"} /></div>)}</div>
        <fieldset className="space-y-3 border border-border p-4"><legend className="px-1 font-medium">Senior and PWD details</legend><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fields.is_senior} onChange={(event) => updateField("is_senior", event.target.checked)} />Senior citizen</label>{fields.is_senior && <Input aria-label="Senior ID number" placeholder="Senior ID number" value={fields.senior_id_number} onChange={(event) => updateField("senior_id_number", event.target.value)} />}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fields.is_pwd} onChange={(event) => updateField("is_pwd", event.target.checked)} />Person with disability</label>{fields.is_pwd && <div className="grid gap-3 sm:grid-cols-2"><Input aria-label="PWD ID number" placeholder="PWD ID number" value={fields.pwd_id_number} onChange={(event) => updateField("pwd_id_number", event.target.value)} /><Input aria-label="Disability type" placeholder="Disability type" value={fields.pwd_disability_type} onChange={(event) => updateField("pwd_disability_type", event.target.value)} /></div>}</fieldset>
        <Button variant="gold" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
      </form>
      <div className="mt-5 space-y-2 border-t border-border pt-4"><Label htmlFor="account-document">Supporting ID document</Label><Input id="account-document" type="file" accept="image/*,.pdf" onChange={(event) => void uploadDocument(event.target.files?.[0])} disabled={busy} /><p className="text-xs text-muted-foreground">{profile.document_path ? "A supporting document is on file. Upload a new one to replace it." : "Upload a photo or PDF for account review."}</p></div></div>

      <div className="space-y-8">
        <section><div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-display text-xl font-semibold text-forest-deep"><Bell className="size-5 text-gold-deep" aria-hidden />Notifications</h2>{notifications.some((item) => !item.read) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void markRead()}>Mark all read</Button>}</div>{notifications.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No notifications.</p> : <ul className="mt-3 divide-y divide-border">{notifications.slice(0, 6).map((item) => <li key={item.id} className={`py-3 ${item.read ? "opacity-70" : ""}`}><p className="font-medium">{item.title}{!item.read && <span className="ml-2 inline-block size-2 rounded-full bg-gold-deep" />}</p><p className="text-sm text-muted-foreground">{item.body}</p><time className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleDateString()}</time></li>)}</ul>}</section>
        <section><h2 className="flex items-center gap-2 font-display text-xl font-semibold text-forest-deep"><FileText className="size-5 text-gold-deep" aria-hidden />My service requests</h2>{requests.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No requests filed yet. <Link to="/services" className="text-gold-deep underline">Browse services</Link></p> : <ul className="mt-3 divide-y divide-border">{requests.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><Link to="/track" search={{ code: item.code }} className="font-medium text-gold-deep underline">{item.code}</Link><p className="text-sm text-muted-foreground">{item.service?.name} · {new Date(item.created_at).toLocaleDateString()}</p>{item.rejection_reason && <p className="text-sm text-destructive">{item.rejection_reason}</p>}</div><div className="flex items-center gap-3"><StatusBadge status={item.status} />{item.status === "pending" && <Button variant="outline" size="sm" disabled={busy} onClick={() => void cancelRequest(item.id)}>Cancel</Button>}</div></li>)}</ul>}</section>
        <section><h2 className="flex items-center gap-2 font-display text-xl font-semibold text-forest-deep"><CalendarDays className="size-5 text-gold-deep" aria-hidden />Court reservations</h2>{reservations.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No reservations yet. <Link to="/court-booking" className="text-gold-deep underline">Check availability</Link></p> : <ul className="mt-3 divide-y divide-border">{reservations.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-medium">{item.res_date} · {BOOKING_SLOTS.find((slot) => slot.start === item.slot)?.label ?? item.slot}</p><p className="text-sm text-muted-foreground">{item.purpose}</p></div><div className="flex items-center gap-3"><StatusBadge status={item.status} />{item.status === "pending" && <Button variant="outline" size="sm" disabled={busy} onClick={() => void cancelReservation(item.id)}>Cancel</Button>}</div></li>)}</ul>}</section>
        <section><h2 className="font-display text-xl font-semibold text-forest-deep">Problem reports</h2>{reports.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No reports submitted.</p> : <ul className="mt-3 divide-y divide-border">{reports.map((item) => <li key={item.id} className="py-3"><div className="flex items-center justify-between gap-2"><p className="font-medium">{item.category}</p><StatusBadge status={item.status} /></div><p className="text-sm text-muted-foreground">{item.description}</p>{item.admin_reply && <p className="mt-1 text-sm">Barangay reply: {item.admin_reply}</p>}</li>)}</ul>}</section>
        <section><h2 className="font-display text-xl font-semibold text-forest-deep">Senior and PWD benefit releases</h2>{releases.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No benefit releases listed.</p> : <ul className="mt-3 divide-y divide-border">{releases.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{item.kind.toUpperCase()} · {item.description}</p>{item.date_released && <p className="text-sm text-muted-foreground">Release date: {item.date_released}</p>}</div><StatusBadge status={item.status} /></li>)}</ul>}</section>
      </div>
    </Reveal>
  </div>;
}