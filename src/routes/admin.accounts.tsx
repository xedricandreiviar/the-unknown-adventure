import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { useAdmin } from "@/components/admin/admin-context";
import {
  adminDeleteAccount,
  adminListAccounts,
  adminSetAccountStatus,
  getDocumentUrl,
} from "@/lib/profiles.functions";

export const Route = createFileRoute("/admin/accounts")({
  component: AccountsPage,
});

type AccountStatus = "pending" | "approved" | "rejected" | "suspended";

type Account = {
  id: string;
  email: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  street: string;
  purok: string;
  barangay: string;
  contact_number: string;
  status: AccountStatus;
  rejection_reason: string | null;
  is_senior: boolean;
  is_pwd: boolean;
  senior_id_number: string | null;
  pwd_id_number: string | null;
  pwd_disability_type: string | null;
  document_path: string | null;
  created_at: string;
};

// Sections that can be individually rejected
const REJECTION_SECTIONS = [
  { key: "identity",   label: "Name / Identity" },
  { key: "address",    label: "Address" },
  { key: "contact",    label: "Contact number" },
  { key: "senior_id",  label: "Senior Citizen ID" },
  { key: "pwd_id",     label: "PWD ID / disability" },
  { key: "document",   label: "Supporting document" },
] as const;
type SectionKey = (typeof REJECTION_SECTIONS)[number]["key"];

const FILTERS: Array<{ key: AccountStatus | "all"; label: string }> = [
  { key: "pending",   label: "Pending" },
  { key: "approved",  label: "Approved" },
  { key: "rejected",  label: "Rejected" },
  { key: "suspended", label: "Deactivated" },
  { key: "all",       label: "All" },
];

const NO_NAME = "No name on file";

function displayName(a: Pick<Account, "first_name" | "middle_name" | "last_name">) {
  const n = [a.first_name, a.middle_name, a.last_name].map((p) => p.trim()).filter(Boolean).join(" ");
  return n || NO_NAME;
}
function accountLabel(a: Pick<Account, "first_name" | "middle_name" | "last_name" | "email">) {
  const n = displayName(a);
  return n === NO_NAME ? a.email : n;
}
function displayAddress(a: Pick<Account, "street" | "purok">) {
  return [a.street, a.purok].map((p) => p.trim()).filter(Boolean).join(", ");
}

/** Detect if this is a resubmission: has rejection_reason mentioning sections */
function isResubmission(a: Account): boolean {
  return a.status === "pending" && !!a.rejection_reason;
}

/** Parse section keys from a rejection_reason string like "REJECTED_SECTIONS:identity,address" */
function parsedRejectedSections(reason: string | null): SectionKey[] {
  if (!reason) return [];
  const match = reason.match(/REJECTED_SECTIONS:([\w,]+)/);
  if (!match?.[1]) return [];
  return match[1].split(",") as SectionKey[];
}

function humanReason(reason: string | null): string {
  if (!reason) return "";
  return reason.replace(/REJECTED_SECTIONS:[\w,]+\s*/g, "").trim();
}

// ── Full-info dialog ──────────────────────────────────────────────────────────

function ViewDialog({
  account,
  onClose,
  onApprove,
  onReject,
  onDeactivate,
  onReactivate,
  onDelete,
}: {
  account: Account | null;
  onClose: () => void;
  onApprove: (a: Account) => Promise<void>;
  onReject: (a: Account, reason: string, sections: SectionKey[]) => Promise<void>;
  onDeactivate: (a: Account) => Promise<void>;
  onReactivate: (a: Account) => Promise<void>;
  onDelete: (a: Account) => void;
}) {
  const documentFn = useServerFn(getDocumentUrl);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [sections, setSections] = useState<SectionKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [docError, setDocError] = useState("");

  useEffect(() => {
    if (!account) { setRejecting(false); setReason(""); setSections([]); }
  }, [account]);

  if (!account) return null;

  const resubmit = isResubmission(account);
  const prevRejectedSections = parsedRejectedSections(account.rejection_reason);

  const openDoc = async () => {
    if (!account.document_path) return;
    setDocError("");
    const popup = window.open("", "_blank");
    if (!popup) { setDocError("Allow pop-ups to view the document."); return; }
    try {
      const { url } = await documentFn({ data: { path: account.document_path } });
      popup.opener = null;
      popup.location.href = url;
    } catch (e) {
      popup.close();
      setDocError(e instanceof Error ? e.message : "Could not open document.");
    }
  };

  const toggleSection = (key: SectionKey) =>
    setSections((prev) => prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]);

  const submitReject = async () => {
    if (reason.trim().length < 5) return;
    setBusy(true);
    await onReject(account, reason.trim(), sections);
    setBusy(false);
    setRejecting(false);
  };

  // Which sections are "cleared" (not in the new rejection) on a resubmission
  const clearedSections = resubmit
    ? prevRejectedSections.filter((s) => !sections.includes(s))
    : [];

  const isSelf = false; // admin can't deactivate themselves here (handled in list)

  // Info rows — name, address, etc.
  const infoRows: Array<{ section: SectionKey; label: string; value: string; present: boolean }> = [
    { section: "identity", label: "Full name",        value: displayName(account),          present: !!(account.first_name || account.last_name) },
    { section: "address",  label: "Address",          value: displayAddress(account) || "—", present: !!(account.street && account.purok) },
    { section: "contact",  label: "Contact number",   value: account.contact_number || "—",  present: !!account.contact_number },
    { section: "senior_id",label: "Senior ID",        value: account.senior_id_number || (account.is_senior ? "Required — not provided" : "N/A"), present: !account.is_senior || !!account.senior_id_number },
    { section: "pwd_id",   label: "PWD ID / disability", value: [account.pwd_id_number, account.pwd_disability_type].filter(Boolean).join(" · ") || (account.is_pwd ? "Required — not provided" : "N/A"), present: !account.is_pwd || !!(account.pwd_id_number && account.pwd_disability_type) },
    { section: "document", label: "Supporting document", value: account.document_path ? "On file" : "Not uploaded", present: !!account.document_path },
  ];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-forest-deep flex items-center gap-2">
            {displayName(account)}
            {resubmit && (
              <Badge variant="outline" className="border-gold-deep/60 text-gold-deep text-xs">
                Resubmission
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>{account.email}</DialogDescription>
        </DialogHeader>

        {/* Status + category badges */}
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={account.status} />
          {account.is_senior && <Badge variant="outline">Senior</Badge>}
          {account.is_pwd    && <Badge variant="outline">PWD</Badge>}
          <span className="text-xs text-muted-foreground self-center">
            Registered {new Date(account.created_at).toLocaleDateString("en-PH")}
          </span>
        </div>

        {/* Previous rejection reason */}
        {resubmit && account.rejection_reason && (
          <div className="rounded-lg border border-gold-deep/40 bg-gold-soft/20 p-3 text-sm">
            <p className="font-semibold text-gold-deep text-xs uppercase tracking-wide mb-1">Previous rejection reason</p>
            <p className="text-muted-foreground">{humanReason(account.rejection_reason)}</p>
            {prevRejectedSections.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Sections to re-check:{" "}
                {prevRejectedSections
                  .map((s) => REJECTION_SECTIONS.find((r) => r.key === s)?.label)
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </div>
        )}

        {/* Info table — previously-cleared sections are dimmed with ✓ */}
        <dl className="space-y-2 text-sm">
          {infoRows.map((row) => {
            const wasRejected = prevRejectedSections.includes(row.section);
            const isCleared = resubmit && wasRejected && row.present;
            const stillMissing = resubmit && wasRejected && !row.present;

            return (
              <div
                key={row.section}
                className={`flex items-start justify-between gap-3 rounded-md px-2 py-1.5 ${
                  isCleared ? "opacity-50 bg-secondary/40" : stillMissing ? "bg-destructive/5" : ""
                }`}
              >
                <dt className="text-xs font-semibold uppercase text-muted-foreground w-32 shrink-0">
                  {row.label}
                  {isCleared && <CheckCircle2 className="inline ml-1 size-3 text-forest" />}
                </dt>
                <dd className={stillMissing ? "text-destructive" : ""}>{row.value}</dd>
              </div>
            );
          })}
        </dl>

        {/* Document button */}
        {account.document_path && (
          <div>
            <Button size="sm" variant="outline" onClick={() => void openDoc()}>
              View supporting document
            </Button>
            {docError && <p className="mt-1 text-xs text-destructive">{docError}</p>}
          </div>
        )}

        {/* Rejection form */}
        {rejecting && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <p className="text-sm font-semibold text-destructive">Reject this account</p>
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Reason (shown to resident)</Label>
              <Textarea
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="e.g. ID photo is unreadable, please upload a clearer copy."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Which sections need correction? (resident only re-submits these)
              </Label>
              <div className="flex flex-wrap gap-2">
                {REJECTION_SECTIONS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleSection(s.key)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      sections.includes(s.key)
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : "border-border hover:border-destructive/50"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setRejecting(false)}>Cancel</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={reason.trim().length < 5 || busy}
                onClick={() => void submitReject()}
              >
                {busy ? "Rejecting…" : "Confirm rejection"}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {/* Approve */}
          {(account.status === "pending" || account.status === "rejected") && (
            <Button
              variant="gold"
              disabled={busy}
              onClick={async () => { setBusy(true); await onApprove(account); setBusy(false); onClose(); }}
            >
              Verify &amp; approve
            </Button>
          )}
          {/* Reject */}
          {account.status === "pending" && !rejecting && (
            <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}>
              Reject
            </Button>
          )}
          {/* Deactivate */}
          {account.status === "approved" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => { setBusy(true); await onDeactivate(account); setBusy(false); onClose(); }}
            >
              Deactivate
            </Button>
          )}
          {/* Reactivate */}
          {(account.status === "rejected" || account.status === "suspended") && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => { setBusy(true); await onReactivate(account); setBusy(false); onClose(); }}
            >
              <RefreshCw className="size-3.5 mr-1.5" /> Reactivate
            </Button>
          )}
          {/* Delete */}
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => { onClose(); onDelete(account); }}
          >
            Delete
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function AccountsPage() {
  const { userId } = useAdmin();
  const listFn        = useServerFn(adminListAccounts);
  const setStatusFn   = useServerFn(adminSetAccountStatus);
  const deleteFn      = useServerFn(adminDeleteAccount);
  const confirm       = useConfirm();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter,   setFilter]   = useState<AccountStatus | "all">("pending");
  const [search,   setSearch]   = useState("");
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const [message,  setMessage]  = useState("");
  const [viewing,  setViewing]  = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  const reload = useCallback(async () => {
    // FIFO: oldest pending first, then rest newest first
    const rows = await listFn() as Account[];
    rows.sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      if (a.status === "pending" && b.status === "pending") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    setAccounts(rows);
  }, [listFn]);

  useEffect(() => {
    let active = true;
    reload()
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load accounts.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const counts = useMemo(() => {
    const r: Record<string, number> = { all: accounts.length };
    for (const a of accounts) r[a.status] = (r[a.status] ?? 0) + 1;
    return r;
  }, [accounts]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (filter !== "all" && a.status !== filter) return false;
      if (!term) return true;
      return `${a.first_name} ${a.middle_name} ${a.last_name} ${a.email} ${a.contact_number}`
        .toLowerCase()
        .includes(term);
    });
  }, [accounts, filter, search]);

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(""); setMessage("");
    try {
      await work();
      await reload();
      setMessage(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async (a: Account) => {
    const ok = await confirm({
      title:        `Verify and approve ${accountLabel(a)}?`,
      description:  "They will be able to file requests and use all resident features.",
      confirmLabel: "Yes, approve",
    });
    if (!ok) return;
    await run(
      () => setStatusFn({ data: { userId: a.id, status: "approved" } }),
      `${accountLabel(a)} approved.`,
    );
  };

  const handleReject = async (a: Account, reason: string, sections: SectionKey[]) => {
    const ok = await confirm({
      title:        `Reject ${accountLabel(a)}?`,
      description:  "The resident will see your reason and can resubmit.",
      confirmLabel: "Yes, reject",
      destructive:  true,
    });
    if (!ok) return;
    // Encode section keys into the reason so they survive the round-trip
    const encoded = sections.length > 0
      ? `${reason} REJECTED_SECTIONS:${sections.join(",")}`
      : reason;
    await run(
      () => setStatusFn({ data: { userId: a.id, status: "rejected", reason: encoded } }),
      `${accountLabel(a)} rejected.`,
    );
  };

  const handleDeactivate = async (a: Account) => {
    const ok = await confirm({
      title:        `Deactivate ${accountLabel(a)}?`,
      description:  "They will not be able to use resident features until reactivated.",
      confirmLabel: "Yes, deactivate",
      destructive:  true,
    });
    if (!ok) return;
    await run(
      () => setStatusFn({ data: { userId: a.id, status: "suspended" } }),
      `${accountLabel(a)} deactivated.`,
    );
  };

  const handleReactivate = async (a: Account) => {
    const ok = await confirm({
      title:        `Reactivate ${accountLabel(a)}?`,
      confirmLabel: "Yes, reactivate",
    });
    if (!ok) return;
    await run(
      () => setStatusFn({ data: { userId: a.id, status: "pending" } }),
      `${accountLabel(a)} set back to pending.`,
    );
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    await run(
      () => deleteFn({ data: { userId: target.id } }),
      `${accountLabel(target)} deleted.`,
    );
  };

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter accounts">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
            >
              {f.label} ({counts[f.key] ?? 0})
            </Button>
          ))}
        </div>
        <div className="w-full space-y-1 sm:w-72">
          <Label htmlFor="account-search" className="sr-only">Search accounts</Label>
          <Input
            id="account-search"
            placeholder="Search name, email, or number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error   && <p role="alert"  className="mt-4 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-forest">{message}</p>}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading accounts…</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No accounts in this view.</p>
      ) : (
        <div className="mt-4 overflow-x-auto border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resident</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((a) => {
                const isSelf  = a.id === userId;
                const resubmit = isResubmission(a);
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <p className="font-medium flex items-center gap-1.5">
                        {displayName(a)}
                        {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                        {resubmit && (
                          <Badge variant="outline" className="border-gold-deep/60 text-gold-deep text-[10px] px-1.5 py-0">
                            Resubmit
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                      <p className="text-xs text-muted-foreground">{a.contact_number}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {displayAddress(a) || <span className="text-xs text-muted-foreground">No address</span>}
                      <br />
                      <span className="text-xs text-muted-foreground">{a.barangay}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {a.is_senior && <Badge variant="outline">Senior</Badge>}
                        {a.is_pwd    && <Badge variant="outline">PWD</Badge>}
                        {!a.is_senior && !a.is_pwd && <span className="text-xs text-muted-foreground">Resident</span>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(a.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                      {a.status === "rejected" && a.rejection_reason && (
                        <p className="mt-1 max-w-48 text-xs text-destructive">
                          {humanReason(a.rejection_reason)}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="gold"
                        disabled={busy}
                        onClick={() => setViewing(a)}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Full-info dialog */}
      <ViewDialog
        account={viewing}
        onClose={() => setViewing(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onDeactivate={handleDeactivate}
        onReactivate={handleReactivate}
        onDelete={(a) => setDeleting(a)}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${accountLabel(deleting)}${accountLabel(deleting) === deleting.email ? "" : ` (${deleting.email})`} will be permanently removed. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep account</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete account</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
