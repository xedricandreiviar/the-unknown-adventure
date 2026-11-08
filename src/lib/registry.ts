import type { Tables } from "@/integrations/supabase/types";

export type Registrant = Tables<"registrants">;
export type BenefitRelease = Tables<"benefit_releases">;
export type RegistryCategory = Registrant["category"];
export type RegistryStatus = Registrant["status"];
export type ReleaseStatus = BenefitRelease["status"];

export const CATEGORY_LABEL: Record<RegistryCategory, string> = {
  pwd: "PWD",
  senior: "Senior Citizen",
};

export const STATUS_LABEL: Record<RegistryStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

export const STATUS_STYLE: Record<RegistryStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900",
};

export const RELEASE_LABEL: Record<ReleaseStatus, string> = {
  scheduled: "Scheduled",
  released: "Released",
  unclaimed: "Unclaimed",
};

export const RELEASE_STYLE: Record<ReleaseStatus, string> = {
  scheduled: "bg-sky-100 text-sky-900",
  released: "bg-emerald-100 text-emerald-900",
  unclaimed: "bg-amber-100 text-amber-900",
};

/** Disability categories used on PWD IDs (RA 7277 / RA 10754 / RA 11228). */
export const DISABILITY_TYPES = [
  "Psychosocial disability",
  "Intellectual disability",
  "Learning disability",
  "Visual disability",
  "Hearing disability",
  "Speech and language impairment",
  "Orthopedic / physical disability",
  "Chronic illness",
  "Cancer",
  "Rare disease",
  "Other",
] as const;

export const CIVIL_STATUSES = ["Single", "Married", "Widowed", "Separated", "Divorced"] as const;

/**
 * Incentives. The `type` strings are stored in benefit_releases.benefit_type and must match the
 * SQL migration (20261107000000_incentive_tiers.sql). Each person gets each type once per year.
 */
export const BENEFIT_TYPE = {
  pwdBirthday: "PWD Birthday Gift",
  pwdJuly: "PWD Special Needs Assistance (July)",
  pwdDecember: "PWD Special Needs Assistance (December)",
  seniorBirthday: "Senior Birthday Cash Gift",
} as const;

export type BenefitDef = {
  type: string;
  label: string;
  when: string;
  /** Fixed amount; seniors use the age tiers in seniorGiftAmount() instead. */
  amount: number | null;
};

export const BENEFITS_BY_CATEGORY: Record<RegistryCategory, BenefitDef[]> = {
  pwd: [
    {
      type: BENEFIT_TYPE.pwdBirthday,
      label: "Birthday cash gift",
      when: "Once a year, on the PWD's birthday",
      amount: 1000,
    },
    {
      type: BENEFIT_TYPE.pwdJuly,
      label: "Special Needs Assistance (July)",
      when: "July, National Disability Rights Week",
      amount: 1000,
    },
    {
      type: BENEFIT_TYPE.pwdDecember,
      label: "Special Needs Assistance (December)",
      when: "December, International Day of Persons with Disabilities",
      amount: 1000,
    },
  ],
  senior: [
    {
      type: BENEFIT_TYPE.seniorBirthday,
      label: "Birthday cash gift",
      when: "Once a year, around the birth month (delivered house to house)",
      amount: null,
    },
  ],
};

/**
 * Senior birthday cash gift by the age the person turns this year.
 * Keep in sync with public.senior_gift_amount() in the SQL migration.
 */
export const SENIOR_TIERS = [
  { from: 60, to: 69, amount: 3000 },
  { from: 70, to: 79, amount: 4000 },
  { from: 80, to: 89, amount: 5000 },
  { from: 90, to: 99, amount: 10000 },
  { from: 100, to: null, amount: 100000 },
] as const;

export function seniorGiftAmount(age: number): number | null {
  const tier = SENIOR_TIERS.find((t) => age >= t.from && (t.to === null || age <= t.to));
  return tier ? tier.amount : null;
}

/** Age the person reaches during the given calendar year. */
export function ageTurningInYear(birthDateIso: string, year: number): number {
  return year - Number(birthDateIso.slice(0, 4));
}

export function expectedAmount(
  category: RegistryCategory,
  type: string,
  birthDateIso: string,
  year: number,
): number | null {
  if (category === "senior") return seniorGiftAmount(ageTurningInYear(birthDateIso, year));
  return BENEFITS_BY_CATEGORY.pwd.find((b) => b.type === type)?.amount ?? null;
}

export function benefitLabel(type: string): string {
  for (const list of Object.values(BENEFITS_BY_CATEGORY)) {
    const found = list.find((b) => b.type === type);
    if (found) return `${type.startsWith("PWD") ? "PWD" : "Senior"} ${found.label}`;
  }
  return type;
}

export function ageFromBirthDate(iso: string, today: Date = new Date()): number {
  const b = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(b.getTime())) return 0;
  let age = today.getFullYear() - b.getFullYear();
  const beforeBirthday =
    today.getMonth() < b.getMonth() ||
    (today.getMonth() === b.getMonth() && today.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(d);
}

export function formatPeso(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
}

export type RegistrantDocument = Tables<"registrant_documents">;
export type AuditEntry = Tables<"registry_audit">;
export type DocStatus = "pending" | "verified" | "rejected";

export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  pending: "Awaiting review",
  verified: "Verified",
  rejected: "Rejected",
};

export const DOC_STATUS_STYLE: Record<DocStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  verified: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900",
};

/** Document kinds. Keys must match the doc_type check in the SQL migration. */
export const DOC_TYPES = {
  valid_id: { label: "Valid government ID", hint: "Shows the name, birth date and photo (front side is enough for a clear scan)." },
  birth_certificate: { label: "PSA birth certificate", hint: "Proves the age. A valid ID showing the birth date also works." },
  residency_proof: { label: "Proof of residence", hint: "Barangay clearance or certificate, voter's certification, or a utility bill with the address." },
  id_photo: { label: "Recent ID photo (1x1 or 2x2)", hint: "Clear, front-facing, plain background." },
  disability_proof: { label: "Proof of disability", hint: "Medical certificate or clinical abstract from a licensed specialist, or a Certificate of Apparent Disability." },
  authorization_letter: { label: "Authorization letter", hint: "Signed by the beneficiary, naming the representative." },
  representative_id: { label: "Representative's valid ID", hint: "Valid government ID of the person acting on behalf of the beneficiary." },
} as const;

export type DocType = keyof typeof DOC_TYPES;

export function docTypeLabel(type: string): string {
  return type in DOC_TYPES ? DOC_TYPES[type as DocType].label : type;
}

export type DocGroup = { label: string; anyOf: DocType[] };

/** Guide for applicants. The database enforces the same rules (registrant_blockers). */
export function requiredDocGroups(category: RegistryCategory, representative: boolean): DocGroup[] {
  const groups: DocGroup[] =
    category === "senior"
      ? [{ label: "Proof of age", anyOf: ["birth_certificate", "valid_id"] }]
      : [
          { label: "Valid government ID", anyOf: ["valid_id"] },
          { label: "Proof of disability", anyOf: ["disability_proof"] },
        ];
  groups.push(
    { label: "Proof of residence", anyOf: ["residency_proof"] },
    { label: "ID photo", anyOf: ["id_photo"] },
  );
  if (representative) {
    groups.push(
      { label: "Authorization letter", anyOf: ["authorization_letter"] },
      { label: "Representative's valid ID", anyOf: ["representative_id"] },
    );
  }
  return groups;
}

export function uploadableDocTypes(category: RegistryCategory, representative: boolean): DocType[] {
  const base: DocType[] =
    category === "senior"
      ? ["birth_certificate", "valid_id", "residency_proof", "id_photo"]
      : ["valid_id", "residency_proof", "id_photo", "disability_proof"];
  return representative ? [...base, "authorization_letter", "representative_id"] : base;
}

export const DOC_BUCKET = "registry-docs";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Checks the real file signature (not just the name or browser-reported type). */
export async function sniffFileType(
  file: File,
): Promise<"image/jpeg" | "image/png" | "application/pdf" | null> {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf";
  }
  return null;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(d);
}

/** Friendly message for common database errors. */
export function registryErrorMessage(error: { code?: string; message: string }): string {
  if (error.message.includes("benefit_releases_unique_per_year")) {
    return "That benefit is already recorded for this person and year.";
  }
  if (error.message.includes("registrants_unique_id_number")) {
    return "That PWD / senior ID number is already registered to someone else.";
  }
  if (error.code === "23505") return "This person is already registered in this category.";
  if (error.code === "42501") return "You do not have permission to do that.";
  return error.message;
}
