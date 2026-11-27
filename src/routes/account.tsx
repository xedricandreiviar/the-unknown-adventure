import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CalendarDays, LogOut, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/confirm-dialog";
import { PageHero } from "@/components/page-hero";
import { Reveal } from "@/components/reveal";
import { StatusBadge } from "@/components/status-badge";
import { getMyProfile, updateMyProfile } from "@/lib/profiles.functions";
import { getMyRequests, cancelMyRequest } from "@/lib/queue.functions";
import { MyRequestsTable } from "@/components/my-requests-table";
import { MyReportsTable } from "@/components/my-reports-table";
import { getMyReservations, cancelMyReservation } from "@/lib/court.functions";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";
import {
  NotificationDialog,
  type NotificationItem,
} from "@/components/notifications-ui";
import { getMyProblemReports, getMyBenefitReleases } from "@/lib/problems.functions";
import { BOOKING_SLOTS, SITE } from "@/lib/site";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: `My Account — ${SITE.name}` },
      {
        name: "description",
        content:
          "Manage your resident profile, service requests, reservations, benefits, and notices.",
      },
      { property: "og:title", content: `My Account — ${SITE.name}` },
      {
        property: "og:description",
        content: "Resident profile, requests, bookings, benefits, and notifications.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountPage,
});

type Profile = {
  id: string;
  email: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  street: string;
  purok: string;
  barangay: string;
  contact_number: string;
  status: string;
  rejection_reason: string | null;
  is_senior: boolean;
  is_pwd: boolean;
  senior_id_number: string | null;
  pwd_id_number: string | null;
  pwd_disability_type: string | null;
  document_path: string | null;
};

function AccountPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const profileFn = useServerFn(getMyProfile);
  const updateProfileFn = useServerFn(updateMyProfile);
  const requestsFn = useServerFn(getMyRequests);
  const cancelRequestFn = useServerFn(cancelMyRequest);
  const reservationsFn = useServerFn(getMyReservations);
  const cancelReservationFn = useServerFn(cancelMyReservation);
  const notificationsFn = useServerFn(getMyNotifications);
  const markAllReadFn = useServerFn(markAllNotificationsRead);
  const markReadFn = useServerFn(markNotificationRead);
  const reportsFn = useServerFn(getMyProblemReports);
  const releasesFn = useServerFn(getMyBenefitReleases);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [fields, setFields] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    street: "",
    purok: "",
    barangay: "Wawa",
    contact_number: "",
    senior_id_number: "",
    pwd_id_number: "",
    pwd_disability_type: "",
    is_senior: false,
    is_pwd: false,
  });
  const [requests, setRequests] = useState<
    Array<{
      id: string;
      code: string;
      status: string;
      created_at: string;
      rejection_reason: string | null;
      service: { name: string } | null;
    }>
  >([]);
  const [reservations, setReservations] = useState<
    Array<{ id: string; res_date: string; slot: string; purpose: string; status: string }>
  >([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [openNotification, setOpenNotification] = useState<NotificationItem | null>(null);
  const [reports, setReports] = useState<
    Array<{
      id: string;
      category: string;
      description: string;
      status: string;
      created_at: string;
      admin_reply: string | null;
    }>
  >([]);
  const [releases, setReleases] = useState<
    Array<{
      id: string;
      kind: string;
      description: string;
      status: string;
      date_released: string | null;
    }>
  >([]);
  const [requestPage, setRequestPage] = useState(1);
  const [reservationPage, setReservationPage] = useState(1);
  const PAGE_SIZE = 5;
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false); // locks the form after a successful save
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      profileFn(),
      requestsFn(),
      reservationsFn(),
      notificationsFn(),
      reportsFn(),
      releasesFn(),
    ])
      .then(([result, requestRows, reservationRows, notificationRows, reportRows, releaseRows]) => {
        if (!active) return;
        if (!result.profile) throw new Error("Your account profile could not be found.");
        const person = result.profile as Profile;
        setProfile(person);
        setIsAdmin(result.isAdmin);
        setFields({
          first_name: person.first_name,
          middle_name: person.middle_name,
          last_name: person.last_name,
          street: person.street,
          purok: person.purok,
          barangay: person.barangay,
          contact_number: person.contact_number,
          senior_id_number: person.senior_id_number ?? "",
          pwd_id_number: person.pwd_id_number ?? "",
          pwd_disability_type: person.pwd_disability_type ?? "",
          is_senior: person.is_senior,
          is_pwd: person.is_pwd,
        });
        setRequests(requestRows);
        setReservations(reservationRows);
        setNotifications(notificationRows);
        setReports(reportRows);
        setReleases(releaseRows);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Could not load your account.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [profileFn, requestsFn, reservationsFn, notificationsFn, reportsFn, releasesFn]);

  // Realtime: refresh notifications, requests and reports the moment the DB changes
  useEffect(() => {
    const channel = supabase
      .channel("account-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" },
        () => { void notificationsFn().then(setNotifications).catch(() => undefined); })
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" },
        () => { void requestsFn().then(setRequests).catch(() => undefined); })
      .on("postgres_changes", { event: "*", schema: "public", table: "problem_reports" },
        () => { void reportsFn().then(setReports).catch(() => undefined); })
      .on("postgres_changes", { event: "*", schema: "public", table: "court_reservations" },
        () => { void reservationsFn().then(setReservations).catch(() => undefined); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [notificationsFn, requestsFn, reportsFn, reservationsFn]);  const signOut = async () => {
    if (!(await confirm({ title: "Do you want to sign out?", confirmLabel: "Yes, sign out" })))
      return;
    await supabase.auth.signOut();
    await navigate({ to: "/auth", replace: true });
  };
  const updateField = (key: keyof typeof fields, value: string | boolean) =>
    setFields((current) => ({ ...current, [key]: value }));
  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (
      !(await confirm({
        title: "Do you want to save these changes to your profile?",
        confirmLabel: "Yes, save",
      }))
    )
      return;
    setBusy(true);
    try {
      await updateProfileFn({ data: { ...fields, birthdate: null, sex: "" } });
      setMessage("Profile updated.");
      setSaved(true); // lock the form
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your profile.");
    } finally {
      setBusy(false);
    }
  };
  const uploadDocument = async (file: File | undefined) => {
    if (!file || !profile) return;
    if (
      !(await confirm({
        title: "Do you want to upload this file?",
        description: `${file.name} will be attached to your account.`,
        confirmLabel: "Yes, upload it",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      const path = `${profile.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("uploads").upload(path, file);
      if (uploadError) throw uploadError;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ document_path: path })
        .eq("id", profile.id);
      if (updateError) throw updateError;
      setProfile({ ...profile, document_path: path });
      setMessage("Supporting document uploaded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload the document.");
    } finally {
      setBusy(false);
    }
  };
  const openOne = (item: NotificationItem) => {
    setOpenNotification({ ...item, read: true });
    if (item.read) return;
    setNotifications((rows) =>
      rows.map((row) => (row.id === item.id ? { ...row, read: true } : row)),
    );
    void markReadFn({ data: { id: item.id } }).catch(() => {
      setNotifications((rows) =>
        rows.map((row) => (row.id === item.id ? { ...row, read: false } : row)),
      );
    });
  };
  const markRead = async () => {
    setBusy(true);
    setError("");
    try {
      await markAllReadFn();
      setNotifications((rows) => rows.map((item) => ({ ...item, read: true })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update notifications.");
    } finally {
      setBusy(false);
    }
  };
  const cancelRequest = async (id: string) => {
    if (
      !(await confirm({
        title: "Do you want to cancel this request?",
        description: "You will need to file a new one if you change your mind.",
        confirmLabel: "Yes, cancel it",
        cancelLabel: "No, keep it",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await cancelRequestFn({ data: { id } });
      setRequests(await requestsFn());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel request.");
    } finally {
      setBusy(false);
    }
  };
  const cancelReservation = async (id: string) => {
    if (
      !(await confirm({
        title: "Do you want to cancel this reservation?",
        description: "The slot will open up for other residents.",
        confirmLabel: "Yes, cancel it",
        cancelLabel: "No, keep it",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await cancelReservationFn({ data: { id } });
      setReservations(await reservationsFn());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not cancel reservation.");
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div>
        <PageHero kicker="Resident account" title="My Account" />
        <div className="mx-auto max-w-5xl px-4 py-12 text-sm text-muted-foreground">
          Loading your account…
        </div>
      </div>
    );
  if (!profile)
    return (
      <div>
        <PageHero kicker="Resident account" title="My Account" />
        <div className="mx-auto max-w-3xl px-4 py-12">
          <p role="alert" className="text-sm text-destructive">
            {error || "Sign in to view your account."}
          </p>
          <Button asChild variant="gold" className="mt-4">
            <Link to="/auth">Log in / Sign up</Link>
          </Button>
        </div>
      </div>
    );

  return (
    <div>
      {/* Slim account header — compact bar instead of full PageHero */}
      <div className="border-b border-border bg-forest-deep px-4 py-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              Resident account
            </p>
            <h1 className="mt-0.5 font-display text-xl font-semibold text-primary-foreground">
              {profile.first_name} {profile.last_name}
              <span className="ml-2 text-sm font-normal text-primary-foreground/60">
                {profile.email}
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={profile.status} />
            {isAdmin && (
              <Button asChild variant="gold" size="sm">
                <Link to="/admin">Admin panel</Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void signOut()}
              className="border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20">
              <LogOut className="mr-1.5 size-3.5" aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="mx-auto max-w-6xl px-4 pt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mx-auto max-w-6xl px-4 pt-4 text-sm text-forest">
          {message}
        </p>
      )}
      {profile.status !== "approved" && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <div className="flex gap-3 border-l-4 border-gold-deep bg-gold-soft/30 p-4 text-sm">
            <TriangleAlert className="size-5 shrink-0 text-gold-deep" aria-hidden />
            <div>
              <p className="font-semibold">
                {profile.status === "pending"
                  ? "Your account is awaiting barangay approval."
                  : profile.status === "rejected"
                    ? "Your account application was not approved."
                    : "Your account is currently deactivated."}
              </p>
              {profile.rejection_reason && <p className="mt-1">{profile.rejection_reason}</p>}
            </div>
          </div>
        </div>
      )}

      <Reveal
        as="section"
        className="mx-auto grid max-w-6xl gap-10 px-4 py-6 lg:grid-cols-[.9fr_1.1fr]"
      >
        {/* LEFT — Resident profile */}
        <div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold text-forest-deep">
              Resident profile
            </h2>
            {/* Edit button — re-enables the form after it's been saved/locked */}
            {saved && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setSaved(false); setMessage(""); }}
              >
                Edit
              </Button>
            )}
          </div>

          {/* fieldset opacity drops to 60% when saved/locked */}
          <form
            onSubmit={(event) => void saveProfile(event)}
            className="mt-4 space-y-4"
          >
            <fieldset
              disabled={saved || busy}
              className="space-y-4 transition-opacity duration-300"
              style={{ opacity: saved ? 0.6 : 1 }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    "first_name",
                    "middle_name",
                    "last_name",
                    "street",
                    "purok",
                    "contact_number",
                  ] as const
                ).map((key) => (
                  <div className="space-y-1" key={key}>
                    <Label htmlFor={`profile-${key}`}>
                      {key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase())}
                    </Label>
                    <Input
                      id={`profile-${key}`}
                      value={fields[key]}
                      onChange={(event) => updateField(key, event.target.value)}
                      required={key !== "middle_name"}
                    />
                  </div>
                ))}
              </div>
              <fieldset className="space-y-3 border border-border p-4">
                <legend className="px-1 font-medium">Senior and PWD details</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fields.is_senior}
                    onChange={(event) => updateField("is_senior", event.target.checked)}
                  />
                  Senior citizen
                </label>
                {fields.is_senior && (
                  <Input
                    aria-label="Senior ID number"
                    placeholder="Senior ID number"
                    value={fields.senior_id_number}
                    onChange={(event) => updateField("senior_id_number", event.target.value)}
                  />
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={fields.is_pwd}
                    onChange={(event) => updateField("is_pwd", event.target.checked)}
                  />
                  Person with disability
                </label>
                {fields.is_pwd && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      aria-label="PWD ID number"
                      placeholder="PWD ID number"
                      value={fields.pwd_id_number}
                      onChange={(event) => updateField("pwd_id_number", event.target.value)}
                    />
                    <Input
                      aria-label="Disability type"
                      placeholder="Disability type"
                      value={fields.pwd_disability_type}
                      onChange={(event) => updateField("pwd_disability_type", event.target.value)}
                    />
                  </div>
                )}
              </fieldset>

              {/* Supporting document — moved inside form, above Save button */}
              <div className="space-y-2 border-t border-border pt-4">
                <Label htmlFor="account-document">Supporting ID document</Label>
                <Input
                  id="account-document"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(event) => void uploadDocument(event.target.files?.[0])}
                  disabled={busy}
                />
                <p className="text-xs text-muted-foreground">
                  {profile.document_path
                    ? "A supporting document is on file. Upload a new one to replace it."
                    : "Upload a photo or PDF for account review."}
                </p>
              </div>
            </fieldset>

            {/* Save button — hidden when already saved/locked */}
            {!saved && (
              <Button variant="gold" disabled={busy}>
                {busy ? "Saving…" : "Save profile"}
              </Button>
            )}
          </form>
        </div>

        {/* RIGHT — activity sections */}
        <div className="space-y-8">
          {/* Notification dialog lives here but the panel UI is removed — bell in header handles it */}
          <NotificationDialog item={openNotification} onClose={() => setOpenNotification(null)} />

          <MyRequestsTable
            requests={requests.slice((requestPage - 1) * PAGE_SIZE, requestPage * PAGE_SIZE)}
            busy={busy}
            onCancel={(id) => void cancelRequest(id)}
          />
          {requests.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {(requestPage - 1) * PAGE_SIZE + 1}–{Math.min(requestPage * PAGE_SIZE, requests.length)} of {requests.length} requests
              </p>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={requestPage === 1} onClick={() => setRequestPage((p) => p - 1)}>
                  ← Prev
                </Button>
                <Button size="sm" variant="outline" disabled={requestPage * PAGE_SIZE >= requests.length} onClick={() => setRequestPage((p) => p + 1)}>
                  Next →
                </Button>
              </div>
            </div>
          )}

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-forest-deep">
                <CalendarDays className="size-5 text-gold-deep" aria-hidden />
                Court reservations
              </h2>
              <Button asChild size="sm" variant="gold">
                <Link to="/court-booking">Book the court</Link>
              </Button>
            </div>
            {reservations.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No reservations yet. Click "Book the court" to check available slots.
              </p>
            ) : (
              <>
                <ul className="mt-4 divide-y divide-border">
                  {reservations
                    .slice((reservationPage - 1) * PAGE_SIZE, reservationPage * PAGE_SIZE)
                    .map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div>
                          <p className="font-medium">
                            {item.res_date} ·{" "}
                            {BOOKING_SLOTS.find((slot) => slot.start === item.slot)?.label ?? item.slot}
                          </p>
                          <p className="text-sm text-muted-foreground">{item.purpose}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={item.status} />
                          {item.status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() => void cancelReservation(item.id)}
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                </ul>
                {reservations.length > PAGE_SIZE && (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {(reservationPage - 1) * PAGE_SIZE + 1}–{Math.min(reservationPage * PAGE_SIZE, reservations.length)} of {reservations.length}
                    </p>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={reservationPage === 1} onClick={() => setReservationPage((p) => p - 1)}>
                        ← Prev
                      </Button>
                      <Button size="sm" variant="outline" disabled={reservationPage * PAGE_SIZE >= reservations.length} onClick={() => setReservationPage((p) => p + 1)}>
                        Next →
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <MyReportsTable reports={reports} />

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-forest-deep">
                PWD / Senior registry
              </h2>
              <Button asChild size="sm" variant="gold">
                <Link to="/registry">Open registry</Link>
              </Button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Apply, follow your application, and see your pension and benefit releases.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold text-forest-deep">
              Benefit releases
            </h2>
            {releases.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No benefit releases listed.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {releases.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium">
                        {item.kind.toUpperCase()} · {item.description}
                      </p>
                      {item.date_released && (
                        <p className="text-sm text-muted-foreground">
                          Release date: {item.date_released}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={item.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Reveal>
    </div>
  );
}
