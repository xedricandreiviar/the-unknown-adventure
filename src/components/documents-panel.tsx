import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleDashed, Clock, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DOC_BUCKET,
  DOC_STATUS_LABEL,
  DOC_STATUS_STYLE,
  DOC_TYPES,
  MAX_UPLOAD_BYTES,
  docTypeLabel,
  formatDate,
  registryErrorMessage,
  requiredDocGroups,
  sniffFileType,
  type DocGroup,
  type DocStatus,
  type DocType,
  type Registrant,
  type RegistrantDocument,
} from "@/lib/registry";

/** The most files one requirement can have (for example the front and back of an ID). */
export const MAX_FILES_PER_REQUIREMENT = 2;

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-gold-deep";

type Preview = { id: string; url: string; mime: string };

/**
 * A registrant's documents, one card per requirement.
 * - Each requirement holds at most two files. Rejected files do not count, so they can be replaced.
 * - Residents can upload while the application is pending.
 * - Staff can open, verify or reject each file. They can add files only to walk-in records,
 *   because those residents have no account of their own to upload with.
 * - Files open inside the panel instead of a new browser tab.
 */
export function DocumentsPanel({
  registrant: r,
  adminId,
  onChanged,
}: {
  registrant: Registrant;
  adminId?: string;
  onChanged?: () => void;
}) {
  const isAdmin = Boolean(adminId);
  const representative = r.applicant_type === "representative";
  const groups = requiredDocGroups(r.category, representative);
  const canUpload = r.status === "pending" && (!isAdmin || r.source === "walk_in");

  const [docs, setDocs] = useState<RegistrantDocument[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("registrant_documents")
      .select("*")
      .eq("registrant_id", r.id)
      .order("created_at", { ascending: true });
    if (error) setMsg(registryErrorMessage(error));
    else setDocs(data ?? []);
  }, [r.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const togglePreview = async (d: RegistrantDocument) => {
    if (preview?.id === d.id) {
      setPreview(null);
      return;
    }
    setMsg(null);
    const { data, error } = await supabase.storage
      .from(DOC_BUCKET)
      .createSignedUrl(d.storage_path, 300);
    if (error || !data) {
      setMsg(error?.message ?? "Could not open the file.");
      return;
    }
    setPreview({ id: d.id, url: data.signedUrl, mime: d.mime_type });
  };

  const review = async (
    d: RegistrantDocument,
    next: "verified" | "rejected",
    note: string | null,
  ) => {
    if (!adminId) return;
    setMsg(null);
    const { error } = await supabase
      .from("registrant_documents")
      .update({
        verification_status: next,
        verified_by: adminId,
        verified_at: new Date().toISOString(),
        note,
      })
      .eq("id", d.id);
    if (error) {
      setMsg(registryErrorMessage(error));
      return;
    }
    setRejectingId(null);
    setRejectNote("");
    await load();
    onChanged?.();
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Documents are private. Only barangay staff and the person who applied can open them.
        Accepted: JPG, PNG or PDF, up to 5 MB each. Up to {MAX_FILES_PER_REQUIREMENT} files per
        requirement.
      </p>

      <div className="grid items-stretch gap-4 sm:grid-cols-2">
        {groups.map((group) => (
          <RequirementCard
            key={group.label}
            group={group}
            registrant={r}
            docs={docs.filter((d) => (group.anyOf as string[]).includes(d.doc_type))}
            canUpload={canUpload}
            isAdmin={isAdmin}
            preview={preview}
            rejectingId={rejectingId}
            rejectNote={rejectNote}
            onRejectNote={setRejectNote}
            onToggleReject={(id) => {
              setRejectingId(rejectingId === id ? null : id);
              setRejectNote("");
            }}
            onPreview={togglePreview}
            onReview={review}
            onUploaded={async () => {
              await load();
              onChanged?.();
            }}
            onError={setMsg}
          />
        ))}
      </div>

      {msg && (
        <p role="alert" className="text-sm text-destructive">
          {msg}
        </p>
      )}
    </div>
  );
}

function RequirementCard({
  group,
  registrant: r,
  docs,
  canUpload,
  isAdmin,
  preview,
  rejectingId,
  rejectNote,
  onRejectNote,
  onToggleReject,
  onPreview,
  onReview,
  onUploaded,
  onError,
}: {
  group: DocGroup;
  registrant: Registrant;
  docs: RegistrantDocument[];
  canUpload: boolean;
  isAdmin: boolean;
  preview: Preview | null;
  rejectingId: string | null;
  rejectNote: string;
  onRejectNote: (value: string) => void;
  onToggleReject: (id: string) => void;
  onPreview: (d: RegistrantDocument) => Promise<void>;
  onReview: (
    d: RegistrantDocument,
    next: "verified" | "rejected",
    note: string | null,
  ) => Promise<void>;
  onUploaded: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [type, setType] = useState<DocType>(group.anyOf[0] ?? "valid_id");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const kept = docs.filter((d) => d.verification_status !== "rejected");
  const state: "verified" | "pending" | "missing" = kept.some(
    (d) => d.verification_status === "verified",
  )
    ? "verified"
    : kept.length > 0
      ? "pending"
      : "missing";
  const full = kept.length >= MAX_FILES_PER_REQUIREMENT;

  const upload = async () => {
    onError(null);
    if (!file) {
      onError("Choose a file first.");
      return;
    }
    if (full) {
      onError(`${group.label} already has ${MAX_FILES_PER_REQUIREMENT} files.`);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      onError("The file is larger than 5 MB. Please use a smaller photo or scan.");
      return;
    }
    const mime = await sniffFileType(file);
    if (!mime) {
      onError("Only JPG, PNG or PDF files are accepted.");
      return;
    }
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      onError("Your session expired. Please log in again.");
      setBusy(false);
      return;
    }
    const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
    const path = `${r.id}/${type}-${Date.now()}.${ext}`;
    const { error: upError } = await supabase.storage
      .from(DOC_BUCKET)
      .upload(path, file, { contentType: mime, upsert: false });
    if (upError) {
      onError(upError.message);
      setBusy(false);
      return;
    }
    const { error } = await supabase.from("registrant_documents").insert({
      registrant_id: r.id,
      doc_type: type,
      storage_path: path,
      file_name: file.name.slice(0, 200),
      mime_type: mime,
      size_bytes: file.size,
      uploaded_by: uid,
    });
    if (error) {
      await supabase.storage.from(DOC_BUCKET).remove([path]);
      onError(registryErrorMessage(error));
      setBusy(false);
      return;
    }
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setBusy(false);
    await onUploaded();
  };

  return (
    <section className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-medium text-forest-deep">{group.label}</h4>
          <p className="text-xs text-muted-foreground">
            {kept.length} of {MAX_FILES_PER_REQUIREMENT} files
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          {state === "verified" ? (
            <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
          ) : state === "pending" ? (
            <Clock className="size-4 text-amber-600" aria-hidden />
          ) : (
            <CircleDashed className="size-4 text-muted-foreground" aria-hidden />
          )}
          <span className="text-muted-foreground">
            {state === "verified" ? "Verified" : state === "pending" ? "Awaiting review" : "Needed"}
          </span>
        </span>
      </header>

      {docs.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {docs.map((d) => {
            const status = d.verification_status as DocStatus;
            const open = preview?.id === d.id;
            return (
              <li key={d.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {group.anyOf.length > 1 ? docTypeLabel(d.doc_type) : d.file_name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {group.anyOf.length > 1 ? `${d.file_name} · ` : ""}
                      {formatDate(d.created_at)}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${DOC_STATUS_STYLE[status] ?? ""}`}
                  >
                    {DOC_STATUS_LABEL[status] ?? d.verification_status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => void onPreview(d)}
                  >
                    {open ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                    {open ? "Hide" : "View"}
                  </Button>
                  {isAdmin && status !== "verified" && (
                    <Button
                      size="sm"
                      variant="gold"
                      type="button"
                      onClick={() => void onReview(d, "verified", null)}
                    >
                      Verify
                    </Button>
                  )}
                  {isAdmin && status !== "rejected" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => onToggleReject(d.id)}
                    >
                      Reject
                    </Button>
                  )}
                </div>
                {status === "rejected" && d.note && (
                  <p className="text-xs text-destructive">Reason: {d.note}</p>
                )}
                {isAdmin && rejectingId === d.id && (
                  <div className="flex flex-col gap-2">
                    <Input
                      aria-label="Reason for rejecting this document"
                      placeholder="Reason (e.g. blurry, name does not match)"
                      value={rejectNote}
                      onChange={(e) => onRejectNote(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      disabled={rejectNote.trim().length < 3}
                      onClick={() => void onReview(d, "rejected", rejectNote.trim())}
                    >
                      Confirm reject
                    </Button>
                  </div>
                )}
                {open && preview && (
                  <div className="overflow-hidden rounded-md border border-border bg-muted">
                    {preview.mime === "application/pdf" ? (
                      <iframe src={preview.url} title={d.file_name} className="h-96 w-full" />
                    ) : (
                      <img
                        src={preview.url}
                        alt={d.file_name}
                        className="max-h-96 w-full object-contain"
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto space-y-2">
        {canUpload && !full && (
          <>
            {group.anyOf.length > 1 && (
              <select
                aria-label={`Which document for ${group.label}`}
                className={SELECT_CLASS}
                value={type}
                onChange={(e) => setType(e.target.value as DocType)}
              >
                {group.anyOf.map((t) => (
                  <option key={t} value={t}>
                    {DOC_TYPES[t].label}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-muted-foreground">{DOC_TYPES[type].hint}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                ref={fileRef}
                type="file"
                aria-label={`File for ${group.label}`}
                accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="gold"
                onClick={() => void upload()}
                disabled={busy || !file}
              >
                {busy ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </>
        )}
        {canUpload && full && (
          <p className="text-xs text-muted-foreground">
            This requirement has {MAX_FILES_PER_REQUIREMENT} files. If one is rejected, you can
            upload a new copy.
          </p>
        )}
        {!canUpload && kept.length === 0 && (
          <p className="text-xs text-muted-foreground">No files uploaded.</p>
        )}
      </div>
    </section>
  );
}
