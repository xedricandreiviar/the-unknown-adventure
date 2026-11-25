import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConsentCheckbox } from "@/components/consent-checkbox";
import { DocumentsPanel } from "@/components/documents-panel";
import { useConfirm } from "@/components/confirm-dialog";
import { ReviewPanel, type ReviewRow } from "@/components/review-panel";
import {
  CATEGORY_LABEL,
  CIVIL_STATUSES,
  DISABILITY_TYPES,
  DOC_BUCKET,
  DOC_TYPES,
  MAX_UPLOAD_BYTES,
  ageFromBirthDate,
  formatDate,
  registryErrorMessage,
  requiredDocGroups,
  sniffFileType,
  type DocType,
  type Registrant,
  type RegistryCategory,
} from "@/lib/registry";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-gold-deep";

// Mobile numbers: exactly 11 digits, like 09171234567 (digits only).
const PH_MOBILE = /^09\d{9}$/;
const digitsOnly = (v: string) => v.replace(/\D/g, "").slice(0, 11);

// Names: letters, spaces and . - ' only. Numbers and other symbols are removed as you type.
const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
const NAME_ERROR = "Names can only have letters, spaces and . - ' (no numbers).";
const cleanName = (v: string) => v.replace(/[^\p{L}\p{M} .'’-]/gu, "");

const FILE_ACCEPT = "image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf";

// Stops the browser from suggesting saved names, addresses and phone numbers on this form (privacy,
// especially on shared barangay computers). Chrome ignores "off" on address fields, so an
// unrecognized value is used on the inputs; the form itself also has autoComplete="off".
const NO_AUTOFILL = "nope";

// Chrome also remembers what was typed into a field (by the field's name) and offers it again, and
// the unrecognized autoComplete value above does not stop that. A name that changes on every page
// load never matches the old entries, so no old suggestions appear.
function useFieldSalt(): string {
  const [salt, setSalt] = useState("");
  useEffect(() => {
    setSalt(Math.random().toString(36).slice(2, 10));
  }, []);
  return salt;
}

type FormState = {
  category: RegistryCategory;
  applicantType: "self" | "representative";
  repName: string;
  repRelationship: string;
  repContact: string;
  firstName: string;
  middleName: string;
  lastName: string;
  birthDate: string;
  sex: "" | "Male" | "Female";
  civilStatus: string;
  street: string;
  purok: string;
  contactNumber: string;
  disabilityType: string;
  idNumber: string;
  idExpiry: string;
  pensionApplicant: boolean;
  receivesOtherPension: boolean;
  consent: boolean;
};

const EMPTY: FormState = {
  category: "senior",
  applicantType: "self",
  repName: "",
  repRelationship: "",
  repContact: "",
  firstName: "",
  middleName: "",
  lastName: "",
  birthDate: "",
  sex: "",
  civilStatus: "",
  street: "",
  purok: "",
  contactNumber: "",
  disabilityType: "",
  idNumber: "",
  idExpiry: "",
  pensionApplicant: false,
  receivesOtherPension: false,
  consent: false,
};

// The database keeps one full name and one address, so the separate boxes are joined for saving.
const composeName = (f: FormState) =>
  [f.firstName, f.middleName, f.lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
const composeAddress = (f: FormState) => `${f.street.trim()}, ${f.purok.trim()}, Wawa, Taguig City`;

type PickedDoc = { type: DocType; file: File | null; file2?: File | null };
type Check = { state: "ok" | "warn" | "todo"; text: string };

function validate(f: FormState): string | null {
  if (f.applicantType === "representative") {
    if (f.repName.trim().length < 2) return "Please enter the representative's full name.";
    if (!NAME_RE.test(f.repName.trim())) return NAME_ERROR;
    if (!f.repRelationship.trim())
      return "Please enter the representative's relationship to the beneficiary.";
    if (!PH_MOBILE.test(f.repContact.replace(/[\s-]/g, ""))) {
      return "The representative's mobile number must be exactly 11 digits, like 09171234567.";
    }
  }
  if (!f.firstName.trim()) return "Please enter the beneficiary's first name.";
  if (!f.lastName.trim()) return "Please enter the beneficiary's last name.";
  for (const part of [f.firstName, f.middleName, f.lastName]) {
    if (part.trim() && !NAME_RE.test(part.trim())) return NAME_ERROR;
  }
  if (!f.birthDate) return "Please enter the date of birth.";
  const today = new Date().toISOString().slice(0, 10);
  if (f.birthDate >= today) return "Date of birth must be in the past.";
  if (f.category === "senior" && ageFromBirthDate(f.birthDate) < 60) {
    return "Senior citizens must be at least 60 years old.";
  }
  if (!f.sex) return "Please select the sex.";
  if (f.street.trim().length < 3) return "Please enter the street.";
  if (!f.purok.trim()) return "Please enter the purok.";
  if (f.contactNumber.trim() && !PH_MOBILE.test(f.contactNumber.replace(/[\s-]/g, ""))) {
    return "Contact number must be exactly 11 digits, like 09171234567.";
  }
  if (f.category === "pwd" && !f.disabilityType) return "Please select the type of disability.";
  if (f.category === "pwd" && f.idNumber.trim() && !f.idExpiry) {
    return "Please enter the PWD ID expiry date (a PWD ID is valid for 3 years).";
  }
  if (f.category === "pwd" && f.idExpiry && f.idExpiry < today) {
    return "That PWD ID is already expired. Renew it first, or leave the ID number and expiry blank.";
  }
  if (!f.consent) return "Please confirm consent to the data privacy notice.";
  return null;
}

/**
 * Registration form for PWD / Senior Citizen.
 * - online: a signed-in resident (or their representative) applies; starts "pending".
 * - walk_in: staff encode a resident who came to the hall; also starts "pending" so the
 *   documents and cross-checks are verified before approval.
 * Supporting documents are attached right in the form and uploaded when the form is saved.
 * Staff then verify each file and cross-check it against the details (see RegistrantDetail).
 */
export function RegistrationForm({
  mode,
  onRegistered,
  blockedCategories = [],
}: {
  mode: "online" | "walk_in";
  onRegistered?: (r: Registrant) => void;
  /** Categories this resident already has a pending or approved application for. */
  blockedCategories?: RegistryCategory[];
}) {
  const confirm = useConfirm();
  const salt = useFieldSalt();
  const nm = (field: string) => `${field}-${salt}`;
  const [reviewing, setReviewing] = useState(false);
  const [f, setF] = useState<FormState>(EMPTY);
  const [docs, setDocs] = useState<Record<string, PickedDoc>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Registrant | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploadFailures, setUploadFailures] = useState<string[]>([]);

  // If the chosen category is already taken, move to the other one.
  useEffect(() => {
    if (!blockedCategories.includes(f.category)) return;
    const free = (["senior", "pwd"] as const).find((c) => !blockedCategories.includes(c));
    if (free) setF((prev) => ({ ...prev, category: free }));
  }, [blockedCategories, f.category]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  const isRep = f.applicantType === "representative";
  const groups = requiredDocGroups(f.category, isRep);
  const pickedFor = (label: string, anyOf: DocType[]): PickedDoc =>
    docs[label] ?? { type: anyOf[0] ?? "valid_id", file: null };
  const setDoc = (label: string, value: PickedDoc) =>
    setDocs((prev) => ({ ...prev, [label]: value }));

  // Live checks shown to the applicant before submitting (staff repeat and expand these).
  const today = new Date().toISOString().slice(0, 10);
  const age = f.birthDate ? ageFromBirthDate(f.birthDate) : null;
  const attached = groups.filter((g) => docs[g.label]?.file).length;
  const checks: Check[] = [];
  if (f.category === "senior") {
    checks.push(
      age === null
        ? { state: "todo", text: "Enter the date of birth (a senior citizen must be 60 or older)." }
        : age >= 60
          ? { state: "ok", text: `Age ${age}: meets the 60-and-above requirement.` }
          : { state: "warn", text: `Age ${age}: below 60, not eligible as a senior citizen.` },
    );
  }
  checks.push(
    f.street.trim() === "" || f.purok.trim() === ""
      ? { state: "todo", text: "Enter the street and purok (the address is in Barangay Wawa)." }
      : {
          state: "ok",
          text: "The address is in Barangay Wawa. Staff compare it with the proof of residence.",
        },
  );
  if (f.category === "pwd" && f.idExpiry) {
    checks.push(
      f.idExpiry < today
        ? { state: "warn", text: "The PWD ID is expired. It must be renewed first." }
        : { state: "ok", text: `The PWD ID is valid until ${formatDate(f.idExpiry)}.` },
    );
  }
  checks.push(
    attached === groups.length
      ? { state: "ok", text: `All ${groups.length} required documents are attached.` }
      : { state: "todo", text: `${attached} of ${groups.length} required documents attached.` },
  );

  // Step 1: check the form, then show the review page.
  const goToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = validate(f);
    if (problem) {
      setError(problem);
      return;
    }
    if (mode === "online") {
      const missing = groups.find((g) => !docs[g.label]?.file);
      if (missing) {
        setError(`Please attach: ${missing.label}.`);
        return;
      }
    }
    setReviewing(true);
    window.scrollTo({ top: 0 });
  };

  // Step 2: ask once more, then save and upload.
  const submit = async () => {
    const ok = await confirm({
      title:
        mode === "online"
          ? "Do you want to submit this application?"
          : "Do you want to save this registrant?",
      description:
        mode === "online"
          ? "Barangay staff will check your details and documents."
          : "The record and its documents will be saved for verification.",
      confirmLabel: "Yes, submit",
    });
    if (!ok) return;
    setError(null);
    const problem = validate(f);
    if (problem) {
      setError(problem);
      return;
    }

    // Check the attached files before anything is saved.
    const prepared: {
      type: DocType;
      file: File;
      mime: "image/jpeg" | "image/png" | "application/pdf";
    }[] = [];
    for (const g of groups) {
      const p = docs[g.label];
      if (!p?.file) {
        if (mode === "online") {
          setError(`Please attach: ${g.label}.`);
          return;
        }
        continue;
      }
      // One file is required; a second (for example the back of an ID) is optional. Two at most.
      for (const picked of [p.file, p.file2 ?? null]) {
        if (!picked) continue;
        if (picked.size > MAX_UPLOAD_BYTES) {
          setError(
            `${g.label}: ${picked.name} is larger than 5 MB. Please use a smaller photo or scan.`,
          );
          return;
        }
        const mime = await sniffFileType(picked);
        if (!mime) {
          setError(`${g.label}: only JPG, PNG or PDF files are accepted.`);
          return;
        }
        prepared.push({ type: p.type, file: picked, mime });
      }
    }

    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setError("Your session expired. Please log in again.");
      setBusy(false);
      return;
    }

    const isPwd = f.category === "pwd";
    const isSenior = f.category === "senior";
    const base = {
      category: f.category,
      full_name: composeName(f),
      birth_date: f.birthDate,
      sex: f.sex as "Male" | "Female",
      civil_status: f.civilStatus || null,
      address: composeAddress(f),
      contact_number: f.contactNumber.trim() || null,
      disability_type: isPwd ? f.disabilityType : null,
      id_number: f.idNumber.trim() || null,
      id_expiry: isPwd && f.idExpiry ? f.idExpiry : null,
      pension_applicant: isSenior && f.pensionApplicant,
      receives_other_pension: isSenior && f.receivesOtherPension,
      applicant_type: f.applicantType,
      rep_full_name: isRep ? f.repName.trim() : null,
      rep_relationship: isRep ? f.repRelationship.trim() : null,
      rep_contact_number: isRep ? f.repContact.trim() : null,
      status: "pending" as const,
    };

    const payload: TablesInsert<"registrants"> =
      mode === "online"
        ? { ...base, user_id: uid, source: "online" as const }
        : { ...base, user_id: null, source: "walk_in" as const, encoded_by: uid };

    const { data, error: dbError } = await supabase
      .from("registrants")
      .insert(payload)
      .select()
      .single();

    if (dbError) {
      setBusy(false);
      setError(registryErrorMessage(dbError));
      return;
    }

    // Upload the attached documents to the new record.
    const failures: string[] = [];
    let uploaded = 0;
    for (const d of prepared) {
      const ext = d.mime === "application/pdf" ? "pdf" : d.mime === "image/png" ? "png" : "jpg";
      const path = `${data.id}/${d.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error: upError } = await supabase.storage
        .from(DOC_BUCKET)
        .upload(path, d.file, { contentType: d.mime, upsert: false });
      if (upError) {
        failures.push(`${DOC_TYPES[d.type].label}: ${upError.message}`);
        continue;
      }
      const { error: insError } = await supabase.from("registrant_documents").insert({
        registrant_id: data.id,
        doc_type: d.type,
        storage_path: path,
        file_name: d.file.name.slice(0, 200),
        mime_type: d.mime,
        size_bytes: d.file.size,
        uploaded_by: uid,
      });
      if (insError) {
        await supabase.storage.from(DOC_BUCKET).remove([path]);
        failures.push(`${DOC_TYPES[d.type].label}: ${registryErrorMessage(insError)}`);
        continue;
      }
      uploaded += 1;
    }

    setBusy(false);
    setUploadedCount(uploaded);
    setUploadFailures(failures);
    setDone(data);
    onRegistered?.(data);
  };

  if (done) {
    return (
      <div role="status" className="space-y-4 rounded-xl border border-border bg-card p-6">
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-semibold text-forest-deep">
            <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
            {mode === "online" ? "Application received" : "Registrant recorded"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Reference code:{" "}
            <span className="font-mono text-base font-semibold text-foreground">
              {done.reference_code}
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {uploadedCount > 0
              ? `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} uploaded. `
              : ""}
            {mode === "online"
              ? "Barangay staff will check your documents against your details before approving. Keep this code. You can come back to upload anything missing from the registry page."
              : "Staff can now verify the documents and complete the cross-checks before approving."}
          </p>
          {uploadFailures.length > 0 && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
            >
              <p className="font-medium">
                The application was saved, but these files did not upload:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {uploadFailures.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p className="mt-1">Upload them again below.</p>
            </div>
          )}
        </div>
        <DocumentsPanel registrant={done} />
        {mode === "walk_in" && (
          <Button
            variant="outline"
            onClick={() => {
              setDone(null);
              setF(EMPTY);
              setDocs({});
              setUploadFailures([]);
              setUploadedCount(0);
            }}
          >
            Register another person
          </Button>
        )}
      </div>
    );
  }

  if (mode === "online" && blockedCategories.length >= 2) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You already have a pending or approved application for both the senior citizen and the PWD
        registry, so there is nothing more to apply for. If one is rejected, you can apply again.
      </div>
    );
  }

  if (reviewing) {
    const fileNames = (g: { label: string }) => {
      const p = docs[g.label];
      return [p?.file?.name, p?.file2?.name].filter(Boolean).join(", ");
    };
    const rows: ReviewRow[] = [
      { label: "Registry", value: CATEGORY_LABEL[f.category] },
      { label: "Applying", value: isRep ? "On behalf of the beneficiary" : "For myself" },
      ...(isRep
        ? [
            { label: "Representative", value: f.repName.trim() },
            { label: "Relationship", value: f.repRelationship.trim() },
            { label: "Rep. contact", value: f.repContact.trim() },
          ]
        : []),
      { label: "Full name", value: composeName(f) },
      { label: "Date of birth", value: formatDate(f.birthDate) },
      { label: "Sex", value: f.sex },
      { label: "Civil status", value: f.civilStatus },
      { label: "Address", value: composeAddress(f) },
      { label: "Contact number", value: f.contactNumber.trim() },
      ...(f.category === "pwd"
        ? [
            { label: "Disability type", value: f.disabilityType },
            { label: "PWD ID number", value: f.idNumber.trim() },
            { label: "PWD ID expires", value: f.idExpiry ? formatDate(f.idExpiry) : "" },
          ]
        : [
            { label: "Applying for pension", value: f.pensionApplicant ? "Yes" : "No" },
            { label: "Receives another pension", value: f.receivesOtherPension ? "Yes" : "No" },
          ]),
      ...groups.map((g) => ({ label: g.label, value: fileNames(g) })),
      { label: "Data privacy consent", value: f.consent ? "Agreed" : "" },
    ];
    return (
      <ReviewPanel
        intro={`Check your answers. Nothing is saved until you press ${mode === "online" ? "Submit application" : "Save registrant"}.`}
        rows={rows}
        busy={busy}
        error={error ?? undefined}
        submitLabel={mode === "online" ? "Submit application" : "Save registrant"}
        busyLabel="Saving and uploading…"
        onBack={() => {
          setError(null);
          setReviewing(false);
        }}
        onSubmit={() => void submit()}
      />
    );
  }

  return (
    <form
      onSubmit={goToReview}
      autoComplete="off"
      className="space-y-5 rounded-xl border border-border bg-card p-6"
      noValidate
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Registering as</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
          {(["senior", "pwd"] as const).map((c) => (
            <Button
              key={c}
              type="button"
              role="radio"
              aria-checked={f.category === c}
              variant={f.category === c ? "gold" : "outline"}
              disabled={blockedCategories.includes(c)}
              onClick={() => set("category", c)}
            >
              {CATEGORY_LABEL[c]}
            </Button>
          ))}
        </div>
        {blockedCategories.length > 0 && (
          <p className="text-xs text-muted-foreground">
            You already have a pending or approved application for{" "}
            {blockedCategories.map((c) => CATEGORY_LABEL[c]).join(" and ")}, so it cannot be chosen
            again.
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who is filling out this form?</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Applicant">
          <Button
            type="button"
            role="radio"
            aria-checked={!isRep}
            variant={!isRep ? "gold" : "outline"}
            onClick={() => set("applicantType", "self")}
          >
            {mode === "online" ? "Myself" : "The beneficiary"}
          </Button>
          <Button
            type="button"
            role="radio"
            aria-checked={isRep}
            variant={isRep ? "gold" : "outline"}
            onClick={() => set("applicantType", "representative")}
          >
            A representative
          </Button>
        </div>
        {isRep && (
          <p className="text-xs text-muted-foreground">
            Put the beneficiary's details in the fields below. You will need to attach a signed
            authorization letter and the representative's valid ID. Staff will verify both.
          </p>
        )}
      </fieldset>

      {isRep && (
        <div className="grid gap-4 rounded-lg bg-secondary/50 p-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="repName">Representative's full name</Label>
            <Input
              id="repName"
              name={nm("repName")}
              autoComplete={NO_AUTOFILL}
              value={f.repName}
              onChange={(e) => set("repName", cleanName(e.target.value))}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repRelationship">Relationship to the beneficiary</Label>
            <Input
              id="repRelationship"
              name={nm("repRelationship")}
              autoComplete={NO_AUTOFILL}
              placeholder="e.g. daughter, caregiver"
              value={f.repRelationship}
              onChange={(e) => set("repRelationship", e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repContact">Representative's mobile number</Label>
            <Input
              id="repContact"
              name={nm("repContact")}
              autoComplete={NO_AUTOFILL}
              inputMode="tel"
              placeholder="09171234567"
              value={f.repContact}
              onChange={(e) => set("repContact", digitsOnly(e.target.value))}
              required
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name={nm("firstName")}
            autoComplete={NO_AUTOFILL}
            maxLength={60}
            value={f.firstName}
            onChange={(e) => set("firstName", cleanName(e.target.value))}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="middleName">Middle name (optional)</Label>
          <Input
            id="middleName"
            name={nm("middleName")}
            autoComplete={NO_AUTOFILL}
            maxLength={60}
            value={f.middleName}
            onChange={(e) => set("middleName", cleanName(e.target.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name={nm("lastName")}
            autoComplete={NO_AUTOFILL}
            maxLength={60}
            value={f.lastName}
            onChange={(e) => set("lastName", cleanName(e.target.value))}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="birthDate">Date of birth</Label>
          <Input
            id="birthDate"
            name={nm("birthDate")}
            autoComplete={NO_AUTOFILL}
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={f.birthDate}
            onChange={(e) => set("birthDate", e.target.value)}
            required
          />
          {f.category === "senior" && f.birthDate && ageFromBirthDate(f.birthDate) < 60 && (
            <p className="text-xs text-destructive">
              Senior citizens must be at least 60 years old.
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sex">Sex</Label>
          <select
            id="sex"
            className={SELECT_CLASS}
            value={f.sex}
            onChange={(e) => set("sex", e.target.value as FormState["sex"])}
            required
          >
            <option value="">Select…</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="civilStatus">Civil status (optional)</Label>
          <select
            id="civilStatus"
            className={SELECT_CLASS}
            value={f.civilStatus}
            onChange={(e) => set("civilStatus", e.target.value)}
          >
            <option value="">Select…</option>
            {CIVIL_STATUSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="street">Street</Label>
          <Input
            id="street"
            name={nm("street")}
            autoComplete={NO_AUTOFILL}
            maxLength={120}
            placeholder="House/Lot no. and street"
            value={f.street}
            onChange={(e) => set("street", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="purok">Purok</Label>
          <Input
            id="purok"
            name={nm("purok")}
            autoComplete={NO_AUTOFILL}
            maxLength={60}
            placeholder="e.g. Purok 3"
            value={f.purok}
            onChange={(e) => set("purok", e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">Barangay Wawa, Taguig City</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contactNumber">Beneficiary's contact number (optional)</Label>
          <Input
            id="contactNumber"
            name={nm("contactNumber")}
            autoComplete={NO_AUTOFILL}
            inputMode="numeric"
            maxLength={11}
            placeholder="09171234567"
            value={f.contactNumber}
            onChange={(e) => set("contactNumber", digitsOnly(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">11 digits, numbers only.</p>
        </div>

        {f.category === "pwd" && (
          <div className="space-y-1.5">
            <Label htmlFor="disabilityType">Type of disability</Label>
            <select
              id="disabilityType"
              className={SELECT_CLASS}
              value={f.disabilityType}
              onChange={(e) => set("disabilityType", e.target.value)}
              required
            >
              <option value="">Select…</option>
              {DISABILITY_TYPES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="idNumber">
            Existing {f.category === "pwd" ? "PWD ID" : "Senior Citizen (OSCA) ID"} number
            (optional)
          </Label>
          <Input
            id="idNumber"
            name={nm("idNumber")}
            autoComplete={NO_AUTOFILL}
            value={f.idNumber}
            onChange={(e) => set("idNumber", e.target.value)}
          />
        </div>
        {f.category === "pwd" && (
          <div className="space-y-1.5">
            <Label htmlFor="idExpiry">PWD ID expiry date</Label>
            <Input
              id="idExpiry"
              name={nm("idExpiry")}
              autoComplete={NO_AUTOFILL}
              type="date"
              value={f.idExpiry}
              onChange={(e) => set("idExpiry", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">A PWD ID is valid for 3 years.</p>
          </div>
        )}
      </div>

      {f.category === "senior" && (
        <fieldset className="space-y-3 rounded-lg bg-secondary/50 p-4">
          <legend className="float-left mb-3 w-full text-sm font-medium [&+*]:clear-both">Social pension</legend>
          <div className="flex items-start gap-3">
            <Checkbox
              id="pensionApplicant"
              checked={f.pensionApplicant}
              onCheckedChange={(v) => set("pensionApplicant", v === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="pensionApplicant"
              className="cursor-pointer text-sm font-normal leading-snug"
            >
              Consider this senior for the social pension for indigent senior citizens.
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              id="receivesOtherPension"
              checked={f.receivesOtherPension}
              onCheckedChange={(v) => set("receivesOtherPension", v === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="receivesOtherPension"
              className="cursor-pointer text-sm font-normal leading-snug"
            >
              This senior already receives a pension from SSS, GSIS, or a similar program.
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Final eligibility is decided by the barangay and the City Social Welfare office.
          </p>
        </fieldset>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Supporting documents for cross-checking</legend>
        <p className="text-xs text-muted-foreground">
          {mode === "online"
            ? "Attach a clear photo or scan of each document. "
            : "Attach scans of what the resident brought. You can also add them later from the record. "}
          JPG, PNG or PDF, up to 5 MB each. They are private: only barangay staff and the applicant
          can open them. Staff compare each one with the details above before approving.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => {
            const p = pickedFor(g.label, g.anyOf);
            const id = `doc-${g.label.replace(/\W+/g, "-")}`;
            return (
              <div key={g.label} className="space-y-1.5 rounded-lg border border-border p-3">
                <Label htmlFor={id}>
                  {g.label}
                  {mode === "online" && <span className="text-destructive"> *</span>}
                </Label>
                {g.anyOf.length > 1 && (
                  <select
                    aria-label={`Which document for ${g.label}`}
                    className={SELECT_CLASS}
                    value={p.type}
                    onChange={(e) =>
                      setDoc(g.label, {
                        type: e.target.value as DocType,
                        file: p.file,
                        file2: p.file2 ?? null,
                      })
                    }
                  >
                    {g.anyOf.map((t) => (
                      <option key={t} value={t}>
                        {DOC_TYPES[t].label}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-muted-foreground">{DOC_TYPES[p.type].hint}</p>
                <Input
                  id={id}
                  type="file"
                  accept={FILE_ACCEPT}
                  onChange={(e) =>
                    setDoc(g.label, {
                      type: p.type,
                      file: e.target.files?.[0] ?? null,
                      file2: p.file2 ?? null,
                    })
                  }
                />
                {p.file && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {p.file.name} · {Math.max(1, Math.round(p.file.size / 1024))} KB
                    </p>
                    <Label
                      htmlFor={`${id}-2`}
                      className="pt-1 text-xs font-normal text-muted-foreground"
                    >
                      Second photo (optional), for example the back of the ID
                    </Label>
                    <Input
                      id={`${id}-2`}
                      type="file"
                      accept={FILE_ACCEPT}
                      onChange={(e) =>
                        setDoc(g.label, {
                          type: p.type,
                          file: p.file,
                          file2: e.target.files?.[0] ?? null,
                        })
                      }
                    />
                    {p.file2 && (
                      <p className="text-xs text-muted-foreground">
                        {p.file2.name} · {Math.max(1, Math.round(p.file2.size / 1024))} KB
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2 rounded-lg bg-secondary/50 p-4">
        <p className="text-sm font-medium">Checks before you submit</p>
        <ul className="space-y-1.5 text-sm">
          {checks.map((c) => (
            <li key={c.text} className="flex items-start gap-2">
              {c.state === "ok" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="OK" />
              ) : c.state === "warn" ? (
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-amber-600"
                  aria-label="Check"
                />
              ) : (
                <CircleDashed
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-label="To do"
                />
              )}
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Staff also check for duplicate ID numbers and whether the same person is registered twice.
        </p>
      </div>

      {mode === "online" ? (
        <ConsentCheckbox checked={f.consent} onCheckedChange={(v) => set("consent", v)} />
      ) : (
        <div className="flex items-start gap-3">
          <Checkbox
            id="walkin-consent"
            checked={f.consent}
            onCheckedChange={(v) => set("consent", v === true)}
            className="mt-0.5"
          />
          <Label
            htmlFor="walkin-consent"
            className="cursor-pointer text-sm font-normal leading-snug"
          >
            The resident agreed to have their personal data and documents recorded for this registry
            (Data Privacy Act).
          </Label>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" variant="gold" className="w-full sm:w-auto">
        Review answers
      </Button>
    </form>
  );
}
