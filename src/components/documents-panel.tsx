import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleDashed, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  uploadableDocTypes,
  type DocStatus,
  type DocType,
  type Registrant,
  type RegistrantDocument,
} from "@/lib/registry";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-gold-deep";

/**
 * Upload and review of a registrant's documents.
 * - Residents (no adminId): can upload while the application is pending and see each file's status.
 * - Staff (adminId given): can also open the files, verify them, or reject them with a note.
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
  const types = uploadableDocTypes(r.category, representative);
  const groups = requiredDocGroups(r.category, representative);
  const canUpload = isAdmin || r.status === "pending";

  const [docs, setDocs] = useState<RegistrantDocument[]>([]);
  const [type, setType] = useState<DocType>(types[0] ?? "valid_id");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("registrant_documents")
      .select("*")
      .eq("registrant_id", r.id)
      .order("created_at", { ascending: false });
    if (error) setMsg(registryErrorMessage(error));
    else setDocs(data ?? []);
  }, [r.id]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async () => {
    setMsg(null);
    if (!file) {
      setMsg("Choose a file first.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setMsg("The file is larger than 5 MB. Please use a smaller photo or scan.");
      return;
    }
    const mime = await sniffFileType(file);
    if (!mime) {
      setMsg("Only JPG, PNG or PDF files are accepted.");
      return;
    }
    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) {
      setMsg("Your session expired. Please log in again.");
      setBusy(false);
      return;
    }
    const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
    const path = `${r.id}/${type}-${Date.now()}.${ext}`;
    const { error: upError } = await supabase.storage
      .from(DOC_BUCKET)
      .upload(path, file, { contentType: mime, upsert: false });
    if (upError) {
      setMsg(upError.message);
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
      setMsg(registryErrorMessage(error));
      setBusy(false);
      return;
    }
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
    setBusy(false);
    await load();
    onChanged?.();
  };

  const view = async (d: RegistrantDocument) => {
    const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(d.storage_path, 120);
    if (error || !data) {
      setMsg(error?.message ?? "Could not open the file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const review = async (d: RegistrantDocument, next: "verified" | "rejected", note: string | null) => {
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

  const groupState = (anyOf: DocType[]): "verified" | "pending" | "missing" => {
    const matching = docs.filter((d) => (anyOf as string[]).includes(d.doc_type));
    if (matching.some((d) => d.verification_status === "verified")) return "verified";
    if (matching.some((d) => d.verification_status === "pending")) return "pending";
    return "missing";
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Documents are private. Only barangay staff and the person who applied can open them. Accepted: JPG, PNG or PDF, up to 5 MB each.
      </p>

      <ul className="grid gap-2 sm:grid-cols-2">
        {groups.map((g) => {
          const s = groupState(g.anyOf);
          return (
            <li key={g.label} className="flex items-center gap-2 text-sm">
              {s === "verified" ? (
                <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
              ) : s === "pending" ? (
                <Clock className="size-4 text-amber-600" aria-hidden />
              ) : (
                <CircleDashed className="size-4 text-muted-foreground" aria-hidden />
              )}
              <span>
                {g.label}
                <span className="ml-1 text-xs text-muted-foreground">
                  {s === "verified" ? "verified" : s === "pending" ? "awaiting review" : "needed"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {canUpload && (
        <div className="grid gap-3 rounded-lg bg-secondary/50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor={`doctype-${r.id}`}>Document</Label>
            <select
              id={`doctype-${r.id}`}
              className={SELECT_CLASS}
              value={type}
              onChange={(e) => setType(e.target.value as DocType)}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPES[t].label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{DOC_TYPES[type].hint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`docfile-${r.id}`}>File</Label>
            <Input
              id={`docfile-${r.id}`}
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="button" variant="gold" onClick={upload} disabled={busy || !file}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
      )}

      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {docs.map((d) => {
            const status = d.verification_status as DocStatus;
            return (
              <li key={d.id} className="space-y-2 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{docTypeLabel(d.doc_type)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {d.file_name} · {formatDate(d.created_at)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${DOC_STATUS_STYLE[status] ?? ""}`}>
                      {DOC_STATUS_LABEL[status] ?? d.verification_status}
                    </span>
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="outline" type="button" onClick={() => view(d)}>
                          View
                        </Button>
                        {status !== "verified" && (
                          <Button size="sm" variant="gold" type="button" onClick={() => review(d, "verified", null)}>
                            Verify
                          </Button>
                        )}
                        {status !== "rejected" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            onClick={() => {
                              setRejectingId(rejectingId === d.id ? null : d.id);
                              setRejectNote("");
                            }}
                          >
                            Reject
                          </Button>
                        )}
                      </>
                    )}
                  </span>
                </div>
                {status === "rejected" && d.note && (
                  <p className="text-xs text-destructive">Reason: {d.note}</p>
                )}
                {isAdmin && rejectingId === d.id && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      aria-label="Reason for rejecting this document"
                      placeholder="Reason (e.g. blurry, name does not match)"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      disabled={rejectNote.trim().length < 3}
                      onClick={() => review(d, "rejected", rejectNote.trim())}
                    >
                      Confirm reject
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {msg && (
        <p role="alert" className="text-sm text-destructive">
          {msg}
        </p>
      )}
    </div>
  );
}
