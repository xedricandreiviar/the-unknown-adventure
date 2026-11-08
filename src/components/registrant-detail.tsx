import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocumentsPanel } from "@/components/documents-panel";
import {
  BENEFITS_BY_CATEGORY,
  CATEGORY_LABEL,
  RELEASE_LABEL,
  RELEASE_STYLE,
  ageFromBirthDate,
  benefitLabel,
  expectedAmount,
  formatDate,
  formatDateTime,
  formatPeso,
  registryErrorMessage,
  type AuditEntry,
  type BenefitRelease,
  type Registrant,
  type ReleaseStatus,
} from "@/lib/registry";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-gold-deep";

type Flag = { level: "ok" | "warn" | "bad"; text: string };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Automatic cross-checks against the rest of the registry. Staff still make the final call. */
function automatedFlags(r: Registrant, all: Registrant[]): Flag[] {
  const flags: Flag[] = [];
  const others = all.filter((o) => o.id !== r.id && o.status !== "rejected");
  const age = ageFromBirthDate(r.birth_date);

  if (r.category === "senior") {
    flags.push(
      age >= 60
        ? { level: "ok", text: `Age ${age}: meets the 60-and-above requirement.` }
        : { level: "bad", text: `Age ${age}: below 60, not eligible as a senior citizen.` },
    );
  }

  flags.push(
    /wawa/i.test(r.address)
      ? { level: "ok", text: "The address mentions Wawa." }
      : { level: "warn", text: "The address does not mention Wawa. Check the proof of residence carefully." },
  );

  const samePersonOther = others.filter(
    (o) => o.category !== r.category && norm(o.full_name) === norm(r.full_name) && o.birth_date === r.birth_date,
  );
  for (const o of samePersonOther) {
    flags.push({
      level: "warn",
      text: `Same name and birth date is also registered as ${CATEGORY_LABEL[o.category]} (${o.reference_code}). One person cannot claim both sectors' primary cash grants. Decide which one to pay.`,
    });
  }

  const samePersonSame = others.filter(
    (o) => o.category === r.category && norm(o.full_name) === norm(r.full_name) && o.birth_date === r.birth_date,
  );
  for (const o of samePersonSame) {
    flags.push({ level: "bad", text: `Possible duplicate of ${o.reference_code} (same name and birth date).` });
  }

  if (r.id_number) {
    const dupId = others.filter((o) => o.id_number && norm(o.id_number) === norm(r.id_number));
    flags.push(
      dupId.length > 0
        ? { level: "bad", text: `ID number ${r.id_number} is also used by ${dupId.map((o) => o.reference_code).join(", ")}.` }
        : { level: "ok", text: "The ID number is not used by any other registrant." },
    );
  }

  if (r.category === "pwd" && r.id_expiry) {
    const days = Math.round((new Date(`${r.id_expiry}T00:00:00`).getTime() - Date.now()) / 86_400_000);
    if (days < 0) flags.push({ level: "bad", text: `The PWD ID expired on ${formatDate(r.id_expiry)}.` });
    else if (days <= 90) flags.push({ level: "warn", text: `The PWD ID expires soon (${formatDate(r.id_expiry)}).` });
    else flags.push({ level: "ok", text: `The PWD ID is valid until ${formatDate(r.id_expiry)}.` });
  }

  if (r.contact_number) {
    const sharedPhone = others.filter(
      (o) => o.contact_number === r.contact_number && norm(o.full_name) !== norm(r.full_name),
    );
    if (sharedPhone.length > 0) {
      flags.push({
        level: "warn",
        text: `The same contact number is used by ${sharedPhone.length} other registrant(s): ${sharedPhone.map((o) => o.reference_code).join(", ")}.`,
      });
    }
  }

  if (r.applicant_type === "representative") {
    if (norm(r.rep_full_name) === norm(r.full_name)) {
      flags.push({ level: "warn", text: "The representative has the same name as the beneficiary." });
    }
    const sameRep = others.filter(
      (o) => o.applicant_type === "representative" && r.rep_contact_number && o.rep_contact_number === r.rep_contact_number,
    );
    if (sameRep.length > 0) {
      flags.push({
        level: "warn",
        text: `This representative's number was used for ${sameRep.length} other registration(s). Confirm each relationship.`,
      });
    }
  }

  if (r.user_id) {
    const sameAccount = others.filter((o) => o.user_id === r.user_id);
    if (sameAccount.length >= 3) {
      flags.push({ level: "warn", text: `This account submitted ${sameAccount.length} other applications.` });
    }
  }

  return flags;
}

type CheckKey = "chk_name_dob" | "chk_residency" | "chk_photo_match" | "chk_disability" | "chk_representative";

const CHECKS: { key: CheckKey; label: string; show: (r: Registrant) => boolean }[] = [
  { key: "chk_name_dob", label: "Name and birth date on the documents match this record", show: () => true },
  { key: "chk_residency", label: "The address on the proof of residence matches this record and is in Wawa", show: () => true },
  { key: "chk_photo_match", label: "The face in the ID photo matches the IDs", show: () => true },
  {
    key: "chk_disability",
    label: "The disability certificate is from the right licensed specialist and matches the disability type",
    show: (r) => r.category === "pwd",
  },
  {
    key: "chk_representative",
    label: "The authorization letter is signed and the representative's ID matches the representative",
    show: (r) => r.applicant_type === "representative",
  },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-display text-base font-semibold text-forest-deep">{title}</h3>
      {children}
    </section>
  );
}

export function RegistrantDetail({
  registrant: r,
  allRows,
  adminId,
  onChanged,
}: {
  registrant: Registrant;
  allRows: Registrant[];
  adminId: string;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [releases, setReleases] = useState<BenefitRelease[]>([]);

  const options = BENEFITS_BY_CATEGORY[r.category];
  const thisYear = new Date().getFullYear();
  const amountFor = (type: string, year: number) => {
    const a = expectedAmount(r.category, type, r.birth_date, year);
    return a === null ? "" : String(a);
  };
  const firstType = options[0]?.type ?? "";
  const [rel, setRel] = useState({
    type: firstType,
    year: String(thisYear),
    amount: amountFor(firstType, thisYear),
    date: "",
    status: "scheduled" as ReleaseStatus,
  });
  const changeRel = (patch: Partial<typeof rel>) =>
    setRel((prev) => {
      const next = { ...prev, ...patch };
      if (patch.type !== undefined || patch.year !== undefined) {
        next.amount = amountFor(next.type, Number(next.year));
      }
      return next;
    });

  const [claimId, setClaimId] = useState<string | null>(null);
  const [claim, setClaim] = useState({
    by: "self" as "self" | "representative",
    name: "",
    relationship: "",
    idChecked: false,
  });

  const loadBlockers = useCallback(async () => {
    const { data } = await supabase.rpc("registrant_blockers", { _registrant_id: r.id });
    setBlockers(data ?? []);
  }, [r.id]);

  const loadAudit = useCallback(async () => {
    const { data } = await supabase
      .from("registry_audit")
      .select("*")
      .eq("registrant_id", r.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setAudit(data ?? []);
  }, [r.id]);

  const loadReleases = useCallback(async () => {
    const { data } = await supabase
      .from("benefit_releases")
      .select("*")
      .eq("registrant_id", r.id)
      .order("created_at", { ascending: false });
    setReleases(data ?? []);
  }, [r.id]);

  useEffect(() => {
    loadAudit();
    if (r.status === "approved") loadReleases();
    else loadBlockers();
  }, [r.status, loadAudit, loadReleases, loadBlockers]);

  const refreshVerification = () => {
    loadBlockers();
    loadAudit();
    onChanged();
  };

  const toggleCheck = async (key: CheckKey, value: boolean) => {
    setMsg(null);
    const patch: Partial<Record<CheckKey, boolean>> = { [key]: value };
    const { error } = await supabase.from("registrants").update(patch).eq("id", r.id);
    if (error) setMsg(registryErrorMessage(error));
    else refreshVerification();
  };

  const review = async (next: "approved" | "rejected") => {
    if (next === "rejected" && reason.trim().length < 3) {
      setMsg("Please type the reason for rejecting.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from("registrants")
      .update({
        status: next,
        rejection_reason: next === "rejected" ? reason.trim() : null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    setBusy(false);
    if (error) setMsg(registryErrorMessage(error));
    else onChanged();
  };

  const validYear = () => {
    const year = Number(rel.year);
    return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
  };

  const addRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const amount = rel.amount.trim() === "" ? null : Number(rel.amount);
    if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
      setMsg("Amount must be a positive number.");
      return;
    }
    const year = validYear();
    if (year === null) {
      setMsg("Please enter a valid year.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("benefit_releases").insert({
      registrant_id: r.id,
      benefit_type: rel.type,
      benefit_year: year,
      amount,
      status: "scheduled",
      release_date: rel.date || null,
      created_by: adminId,
    });
    setBusy(false);
    if (error) setMsg(registryErrorMessage(error));
    else {
      setRel((prev) => ({ ...prev, date: "" }));
      loadReleases();
      loadAudit();
    }
  };

  const scheduleAll = async () => {
    const year = validYear();
    if (year === null) {
      setMsg("Please enter a valid year.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const rows = options.map((b) => ({
      registrant_id: r.id,
      benefit_type: b.type,
      benefit_year: year,
      amount: expectedAmount(r.category, b.type, r.birth_date, year),
      status: "scheduled" as const,
      created_by: adminId,
    }));
    const { error } = await supabase.from("benefit_releases").upsert(rows, {
      onConflict: "registrant_id,benefit_type,benefit_year",
      ignoreDuplicates: true,
    });
    setBusy(false);
    if (error) setMsg(registryErrorMessage(error));
    else {
      loadReleases();
      loadAudit();
    }
  };

  const openClaim = (id: string) => {
    setClaimId(claimId === id ? null : id);
    setClaim({
      by: "self",
      name: r.rep_full_name ?? "",
      relationship: r.rep_relationship ?? "",
      idChecked: false,
    });
  };

  const markReleased = async (id: string) => {
    setBusy(true);
    setMsg(null);
    const isRep = claim.by === "representative";
    const { error } = await supabase
      .from("benefit_releases")
      .update({
        status: "released",
        release_date: new Date().toISOString().slice(0, 10),
        claimed_by_type: claim.by,
        claimant_name: isRep ? claim.name.trim() : null,
        claimant_relationship: isRep ? claim.relationship.trim() : null,
        id_presented: claim.idChecked,
      })
      .eq("id", id);
    setBusy(false);
    if (error) setMsg(registryErrorMessage(error));
    else {
      setClaimId(null);
      loadReleases();
      loadAudit();
    }
  };

  const setReleaseStatus = async (id: string, next: ReleaseStatus) => {
    const { error } = await supabase
      .from("benefit_releases")
      .update({ status: next, release_date: null })
      .eq("id", id);
    if (error) setMsg(registryErrorMessage(error));
    else {
      loadReleases();
      loadAudit();
    }
  };

  const detail: [string, string][] = [
    ["Birth date", `${formatDate(r.birth_date)} (age ${ageFromBirthDate(r.birth_date)})`],
    ["Sex", r.sex],
    ["Civil status", r.civil_status ?? "—"],
    ["Address", r.address],
    ["Contact", r.contact_number ?? "—"],
    ...(r.category === "pwd" ? ([["Disability", r.disability_type ?? "—"]] as [string, string][]) : []),
    ["Existing ID no.", r.id_number ?? "—"],
    ...(r.category === "pwd" ? ([["PWD ID expiry", formatDate(r.id_expiry)]] as [string, string][]) : []),
    ...(r.category === "senior"
      ? ([
          ["Wants social pension", r.pension_applicant ? "Yes" : "No"],
          ["Receives other pension", r.receives_other_pension ? "Yes" : "No"],
        ] as [string, string][])
      : []),
    [
      "Filed by",
      r.applicant_type === "representative"
        ? `Representative: ${r.rep_full_name ?? "—"} (${r.rep_relationship ?? "—"}), ${r.rep_contact_number ?? "—"}`
        : "The beneficiary",
    ],
    ["Submitted", `${formatDate(r.created_at)} (${r.source === "walk_in" ? "walk-in" : "online"})`],
    ["Reviewed", formatDate(r.reviewed_at)],
  ];

  const flags = automatedFlags(r, allRows);
  const locked = r.status === "approved";

  return (
    <div className="space-y-6 border-t border-border p-4">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {detail.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {r.status === "rejected" && r.rejection_reason && (
        <p className="text-sm text-destructive">Rejected: {r.rejection_reason}</p>
      )}

      <Section title="Automatic cross-checks">
        <ul className="space-y-1.5 text-sm">
          {flags.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              {f.level === "ok" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="OK" />
              ) : f.level === "warn" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Check" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-label="Problem" />
              )}
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Documents">
        <DocumentsPanel registrant={r} adminId={adminId} onChanged={refreshVerification} />
      </Section>

      <Section title="Staff cross-check">
        <p className="text-xs text-muted-foreground">
          Open each document and compare it with the record, then tick what you confirmed.
        </p>
        <ul className="space-y-2">
          {CHECKS.filter((c) => c.show(r)).map((c) => (
            <li key={c.key} className="flex items-start gap-3">
              <Checkbox
                id={`${c.key}-${r.id}`}
                checked={r[c.key]}
                disabled={locked}
                onCheckedChange={(v) => toggleCheck(c.key, v === true)}
                className="mt-0.5"
              />
              <Label htmlFor={`${c.key}-${r.id}`} className="cursor-pointer text-sm font-normal leading-snug">
                {c.label}
              </Label>
            </li>
          ))}
        </ul>
      </Section>

      {r.status !== "approved" && (
        <Section title="Decision">
          {blockers === null ? (
            <p className="text-sm text-muted-foreground">Checking requirements…</p>
          ) : blockers.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-medium">Cannot approve yet. Still needed:</p>
              <ul className="mt-1 list-disc pl-5">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-emerald-800">All documents and cross-checks are complete. Ready to approve.</p>
          )}
          <div className="flex flex-col gap-3 rounded-lg bg-secondary/50 p-3 sm:flex-row sm:items-end">
            <Button
              variant="gold"
              disabled={busy || blockers === null || blockers.length > 0}
              onClick={() => review("approved")}
            >
              Approve
            </Button>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={`reason-${r.id}`}>Reason (required to reject)</Label>
              <Input id={`reason-${r.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button variant="outline" disabled={busy || r.status === "rejected"} onClick={() => review("rejected")}>
              Reject
            </Button>
          </div>
        </Section>
      )}

      {r.status === "approved" && (
        <Section title="Incentives and claims">
          {releases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incentives scheduled yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {releases.map((b) => (
                <li key={b.id} className="space-y-2 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {benefitLabel(b.benefit_type)} — {b.benefit_year}
                      <span className="block text-xs text-muted-foreground">
                        {formatPeso(b.amount)} · {formatDate(b.release_date)}
                        {b.status === "released" &&
                          (b.claimed_by_type === "representative"
                            ? ` · claimed by representative ${b.claimant_name ?? ""} (${b.claimant_relationship ?? ""})`
                            : " · claimed by the beneficiary")}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${RELEASE_STYLE[b.status]}`}>
                        {RELEASE_LABEL[b.status]}
                      </span>
                      {b.status !== "released" && (
                        <Button size="sm" variant="outline" onClick={() => openClaim(b.id)}>
                          Release…
                        </Button>
                      )}
                      {b.status === "scheduled" && (
                        <Button size="sm" variant="ghost" onClick={() => setReleaseStatus(b.id, "unclaimed")}>
                          Unclaimed
                        </Button>
                      )}
                    </span>
                  </div>

                  {claimId === b.id && (
                    <div className="space-y-3 rounded-lg bg-secondary/50 p-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label htmlFor={`claimby-${b.id}`}>Claimed by</Label>
                          <select
                            id={`claimby-${b.id}`}
                            className={SELECT_CLASS}
                            value={claim.by}
                            onChange={(e) => setClaim({ ...claim, by: e.target.value as "self" | "representative" })}
                          >
                            <option value="self">The beneficiary</option>
                            <option value="representative">A representative</option>
                          </select>
                        </div>
                        {claim.by === "representative" && (
                          <>
                            <div className="space-y-1.5">
                              <Label htmlFor={`claimname-${b.id}`}>Representative's name</Label>
                              <Input
                                id={`claimname-${b.id}`}
                                value={claim.name}
                                onChange={(e) => setClaim({ ...claim, name: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label htmlFor={`claimrel-${b.id}`}>Relationship</Label>
                              <Input
                                id={`claimrel-${b.id}`}
                                value={claim.relationship}
                                onChange={(e) => setClaim({ ...claim, relationship: e.target.value })}
                              />
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`claimid-${b.id}`}
                          checked={claim.idChecked}
                          onCheckedChange={(v) => setClaim({ ...claim, idChecked: v === true })}
                          className="mt-0.5"
                        />
                        <Label htmlFor={`claimid-${b.id}`} className="cursor-pointer text-sm font-normal leading-snug">
                          {claim.by === "representative"
                            ? "I checked the beneficiary's original PWD/OSCA ID, the signed authorization letter, and the representative's valid ID."
                            : "I checked the beneficiary's original Taguig PWD / senior citizen ID."}
                        </Label>
                      </div>
                      {claim.by === "representative" && (
                        <p className="text-xs text-muted-foreground">
                          A verified authorization letter and representative ID must be on file in Documents above.
                        </p>
                      )}
                      <Button variant="gold" size="sm" disabled={busy} onClick={() => markReleased(b.id)}>
                        Confirm release
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={addRelease}
            className="grid gap-3 rounded-lg bg-secondary/50 p-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`type-${r.id}`}>Benefit</Label>
              <select
                id={`type-${r.id}`}
                className={SELECT_CLASS}
                value={rel.type}
                onChange={(e) => changeRel({ type: e.target.value })}
              >
                {options.map((b) => (
                  <option key={b.type} value={b.type}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`year-${r.id}`}>Year</Label>
              <Input
                id={`year-${r.id}`}
                type="number"
                inputMode="numeric"
                min={2000}
                max={2100}
                value={rel.year}
                onChange={(e) => changeRel({ year: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`amount-${r.id}`}>Amount (₱)</Label>
              <Input
                id={`amount-${r.id}`}
                inputMode="decimal"
                value={rel.amount}
                onChange={(e) => setRel({ ...rel, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`date-${r.id}`}>Planned date</Label>
              <Input
                id={`date-${r.id}`}
                type="date"
                value={rel.date}
                onChange={(e) => setRel({ ...rel, date: e.target.value })}
              />
            </div>
            <Button type="submit" variant="gold" disabled={busy}>
              Add
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="outline" disabled={busy} onClick={scheduleAll}>
              Schedule all {rel.year} {r.category === "pwd" ? "gifts (birthday, July, December)" : "birthday gift"}
            </Button>
            <p className="text-xs text-muted-foreground">
              {r.category === "pwd"
                ? "Adds the 3 yearly ₱1,000 payments as Scheduled. Ones already added are skipped."
                : `Amount follows the age tier (${formatPeso(expectedAmount(r.category, "", r.birth_date, Number(rel.year)))} this year).`}
            </p>
          </div>
        </Section>
      )}

      <Section title="Activity">
        {audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {audit.map((a) => (
              <li key={a.id}>
                <span className="font-mono">{formatDateTime(a.created_at)}</span> ·{" "}
                <span className="font-medium text-foreground">{a.action}</span>
                {a.details ? ` — ${a.details}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {msg && (
        <p role="alert" className="text-sm text-destructive">
          {msg}
        </p>
      )}
    </div>
  );
}
