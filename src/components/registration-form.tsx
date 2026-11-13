import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConsentCheckbox } from "@/components/consent-checkbox";
import { DocumentsPanel } from "@/components/documents-panel";
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

const PH_MOBILE = /^(09|\+639)\d{9}$/;
const FILE_ACCEPT = "image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf";

type FormState = {
  category: RegistryCategory;
  applicantType: "self" | "representative";
  repName: string;
  repRelationship: string;
  repContact: string;
  fullName: string;
  birthDate: string;
  sex: "" | "Male" | "Female";
  civilStatus: string;
  address: string;
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
  fullName: "",
  birthDate: "",
  sex: "",
  civilStatus: "",
  address: "",
  contactNumber: "",
  disabilityType: "",
  idNumber: "",
  idExpiry: "",
  pensionApplicant: false,
  receivesOtherPension: false,
  consent: false,
};

type PickedDoc = { type: DocType; file: File | null; file2?: File | null };
type Check = { state: "ok" | "warn" | "todo"; text: string };

function validate(f: FormState): string | null {
  if (f.applicantType === "representative") {
    if (f.repName.trim().length < 2) return "Please enter the representative's full name.";
    if (!f.repRelationship.trim()) return "Please enter the representative's relationship to the beneficiary.";
    if (!PH_MOBILE.test(f.repContact.replace(/[\s-]/g, ""))) {
      return "Enter the representative's mobile number, like 09171234567.";
    }
  }
  if (f.fullName.trim().length < 2) return "Please enter the beneficiary's full name.";
  if (!f.birthDate) return "Please enter the date of birth.";
  const today = new Date().toISOString().slice(0, 10);
  if (f.birthDate >= today) return "Date of birth must be in the past.";
  if (f.category === "senior" && ageFromBirthDate(f.birthDate) < 60) {
    return "Senior citizens must be at least 60 years old.";
  }
  if (!f.sex) return "Please select the sex.";
  if (f.address.trim().length < 5) return "Please enter the complete address.";
  if (f.contactNumber.trim() && !PH_MOBILE.test(f.contactNumber.replace(/[\s-]/g, ""))) {
    return "Contact number should look like 09171234567.";
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
}: {
  mode: "online" | "walk_in";
  onRegistered?: (r: Registrant) => void;
}) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [docs, setDocs] = useState<Record<string, PickedDoc>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Registrant | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [uploadFailures, setUploadFailures] = useState<string[]>([]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setF((prev) => ({ ...prev, [key]: value }));

  const isRep = f.applicantType === "representative";
  const groups = requiredDocGroups(f.category, isRep);
  const pickedFor = (label: string, anyOf: DocType[]): PickedDoc =>
    docs[label] ?? { type: anyOf[0] ?? "valid_id", file: null };
  const setDoc = (label: string, value: PickedDoc) => setDocs((prev) => ({ ...prev, [label]: value }));

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
    f.address.trim() === ""
      ? { state: "todo", text: "Enter the home address (it should be in Wawa)." }
      : /wawa/i.test(f.address)
        ? { state: "ok", text: "The address is in Wawa." }
        : { state: "warn", text: "The address does not mention Wawa. Staff will check the proof of residence carefully." },
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = validate(f);
    if (problem) {
      setError(problem);
      return;
    }

    // Check the attached files before anything is saved.
    const prepared: { type: DocType; file: File; mime: "image/jpeg" | "image/png" | "application/pdf" }[] = [];
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
          setError(`${g.label}: ${picked.name} is larger than 5 MB. Please use a smaller photo or scan.`);
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
      full_name: f.fullName.trim(),
      birth_date: f.birthDate,
      sex: f.sex as "Male" | "Female",
      civil_status: f.civilStatus || null,
      address: f.address.trim(),
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
            <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-medium">The application was saved, but these files did not upload:</p>
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

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-card p-6" noValidate>
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
              onClick={() => set("category", c)}
            >
              {CATEGORY_LABEL[c]}
            </Button>
          ))}
        </div>
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
            Put the beneficiary's details in the fields below. You will need to attach a signed authorization
            letter and the representative's valid ID. Staff will verify both.
          </p>
        )}
      </fieldset>

      {isRep && (
        <div className="grid gap-4 rounded-lg bg-secondary/50 p-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="repName">Representative's full name</Label>
            <Input id="repName" value={f.repName} onChange={(e) => set("repName", e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repRelationship">Relationship to the beneficiary</Label>
            <Input
              id="repRelationship"
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
              inputMode="tel"
              placeholder="09171234567"
              value={f.repContact}
              onChange={(e) => set("repContact", e.target.value)}
              required
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fullName">Beneficiary's full name (as on the ID)</Label>
          <Input
            id="fullName"
            autoComplete={isRep ? "off" : "name"}
            value={f.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="birthDate">Date of birth</Label>
          <Input
            id="birthDate"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={f.birthDate}
            onChange={(e) => set("birthDate", e.target.value)}
            required
          />
          {f.category === "senior" && f.birthDate && ageFromBirthDate(f.birthDate) < 60 && (
            <p className="text-xs text-destructive">Senior citizens must be at least 60 years old.</p>
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
          <Label htmlFor="contactNumber">Beneficiary's contact number (optional)</Label>
          <Input
            id="contactNumber"
            inputMode="tel"
            placeholder="09171234567"
            value={f.contactNumber}
            onChange={(e) => set("contactNumber", e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="address">Home address in Wawa</Label>
          <Input
            id="address"
            autoComplete="street-address"
            placeholder="House/Lot no., Street, Wawa, Taguig City"
            value={f.address}
            onChange={(e) => set("address", e.target.value)}
            required
          />
        </div>

        {f.category === "pwd" && (
          <div className="space-y-1.5 sm:col-span-2">
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
            Existing {f.category === "pwd" ? "PWD ID" : "Senior Citizen (OSCA) ID"} number (optional)
          </Label>
          <Input id="idNumber" value={f.idNumber} onChange={(e) => set("idNumber", e.target.value)} />
        </div>
        {f.category === "pwd" && (
          <div className="space-y-1.5">
            <Label htmlFor="idExpiry">PWD ID expiry date</Label>
            <Input id="idExpiry" type="date" value={f.idExpiry} onChange={(e) => set("idExpiry", e.target.value)} />
            <p className="text-xs text-muted-foreground">A PWD ID is valid for 3 years.</p>
          </div>
        )}
      </div>

      {f.category === "senior" && (
        <fieldset className="space-y-3 rounded-lg bg-secondary/50 p-4">
          <legend className="px-1 text-sm font-medium">Social pension</legend>
          <div className="flex items-start gap-3">
            <Checkbox
              id="pensionApplicant"
              checked={f.pensionApplicant}
              onCheckedChange={(v) => set("pensionApplicant", v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="pensionApplicant" className="cursor-pointer text-sm font-normal leading-snug">
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
            <Label htmlFor="receivesOtherPension" className="cursor-pointer text-sm font-normal leading-snug">
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
          JPG, PNG or PDF, up to 5 MB each. They are private: only barangay staff and the applicant can open them.
          Staff compare each one with the details above before approving.
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
                      setDoc(g.label, { type: e.target.value as DocType, file: p.file, file2: p.file2 ?? null })
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
                    setDoc(g.label, { type: p.type, file: e.target.files?.[0] ?? null, file2: p.file2 ?? null })
                  }
                />
                {p.file && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {p.file.name} · {Math.max(1, Math.round(p.file.size / 1024))} KB
                    </p>
                    <Label htmlFor={`${id}-2`} className="pt-1 text-xs font-normal text-muted-foreground">
                      Second photo (optional), for example the back of the ID
                    </Label>
                    <Input
                      id={`${id}-2`}
                      type="file"
                      accept={FILE_ACCEPT}
                      onChange={(e) =>
                        setDoc(g.label, { type: p.type, file: p.file, file2: e.target.files?.[0] ?? null })
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
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Check" />
              ) : (
                <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="To do" />
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
          <Label htmlFor="walkin-consent" className="cursor-pointer text-sm font-normal leading-snug">
            The resident agreed to have their personal data and documents recorded for this registry (Data Privacy Act).
          </Label>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" variant="gold" className="w-full sm:w-auto" disabled={busy}>
        {busy ? "Saving and uploading…" : mode === "online" ? "Submit application" : "Save registrant"}
      </Button>
    </form>
  );
}
