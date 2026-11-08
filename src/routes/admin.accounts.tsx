import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
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

const FILTERS: Array<{ key: AccountStatus | "all"; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "suspended", label: "Deactivated" },
  { key: "all", label: "All" },
];

function AccountsPage() {
  const { userId } = useAdmin();
  const listFn = useServerFn(adminListAccounts);
  const setStatusFn = useServerFn(adminSetAccountStatus);
  const deleteFn = useServerFn(adminDeleteAccount);
  const documentFn = useServerFn(getDocumentUrl);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filter, setFilter] = useState<AccountStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rejecting, setRejecting] = useState<Account | null>(null);
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState<Account | null>(null);

  const reload = useCallback(async () => {
    setAccounts((await listFn()) as Account[]);
  }, [listFn]);

  useEffect(() => {
    let active = true;
    listFn()
      .then((rows) => {
        if (active) setAccounts(rows as Account[]);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load accounts.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listFn]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: accounts.length };
    for (const account of accounts) result[account.status] = (result[account.status] ?? 0) + 1;
    return result;
  }, [accounts]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (filter !== "all" && account.status !== filter) return false;
      if (!term) return true;
      return `${account.first_name} ${account.middle_name} ${account.last_name} ${account.email} ${account.contact_number}`
        .toLowerCase()
        .includes(term);
    });
  }, [accounts, filter, search]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await reload();
      setMessage(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (account: Account, status: AccountStatus, success: string, why?: string) =>
    run(() => setStatusFn({ data: { userId: account.id, status, reason: why } }), success);

  const confirmReject = async () => {
    if (!rejecting) return;
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError("Give a rejection reason (at least 5 characters).");
      return;
    }
    const target = rejecting;
    setRejecting(null);
    setReason("");
    await changeStatus(
      target,
      "rejected",
      `${target.first_name} ${target.last_name} was rejected.`,
      trimmed,
    );
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    await run(
      () => deleteFn({ data: { userId: target.id } }),
      `${target.first_name} ${target.last_name} was deleted.`,
    );
  };

  const openDocument = async (path: string) => {
    setError("");
    // Open the tab synchronously so pop-up blockers allow it, then point it at the signed link.
    const popup = window.open("", "_blank");
    if (!popup) {
      setError("Allow pop-ups for this site to view the document.");
      return;
    }
    try {
      const { url } = await documentFn({ data: { path } });
      popup.opener = null;
      popup.location.href = url;
    } catch (cause) {
      popup.close();
      setError(cause instanceof Error ? cause.message : "Could not open the document.");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter accounts by status">
          {FILTERS.map((item) => (
            <Button
              key={item.key}
              role="tab"
              aria-selected={filter === item.key}
              size="sm"
              variant={filter === item.key ? "default" : "outline"}
              onClick={() => setFilter(item.key)}
            >
              {item.label} ({counts[item.key] ?? 0})
            </Button>
          ))}
        </div>
        <div className="w-full space-y-1 sm:w-72">
          <Label htmlFor="account-search" className="sr-only">
            Search accounts
          </Label>
          <Input
            id="account-search"
            placeholder="Search name, email, or number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm text-forest">
          {message}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading accounts…</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No accounts match this view.</p>
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
              {visible.map((account) => {
                const isSelf = account.id === userId;
                return (
                  <TableRow key={account.id}>
                    <TableCell>
                      <p className="font-medium">
                        {account.first_name} {account.middle_name} {account.last_name}
                        {isSelf && (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{account.email}</p>
                      <p className="text-xs text-muted-foreground">{account.contact_number}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {account.street}, {account.purok}
                      <br />
                      <span className="text-xs text-muted-foreground">{account.barangay}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {account.is_senior && (
                          <Badge
                            variant="outline"
                            title={
                              account.senior_id_number
                                ? `ID ${account.senior_id_number}`
                                : undefined
                            }
                          >
                            Senior
                          </Badge>
                        )}
                        {account.is_pwd && (
                          <Badge
                            variant="outline"
                            title={
                              [
                                account.pwd_id_number && `ID ${account.pwd_id_number}`,
                                account.pwd_disability_type,
                              ]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }
                          >
                            PWD
                          </Badge>
                        )}
                        {!account.is_senior && !account.is_pwd && (
                          <span className="text-xs text-muted-foreground">Resident</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(account.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={account.status} />
                      {account.status === "rejected" && account.rejection_reason && (
                        <p className="mt-1 max-w-48 text-xs text-muted-foreground">
                          {account.rejection_reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {account.document_path && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void openDocument(account.document_path as string)}
                          >
                            View ID
                          </Button>
                        )}
                        {!isSelf && (
                          <>
                            {(account.status === "pending" || account.status === "rejected") && (
                              <Button
                                size="sm"
                                variant="gold"
                                disabled={busy}
                                onClick={() =>
                                  void changeStatus(
                                    account,
                                    "approved",
                                    `${account.first_name} ${account.last_name} was approved.`,
                                  )
                                }
                              >
                                Approve
                              </Button>
                            )}
                            {account.status === "pending" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  setError("");
                                  setReason("");
                                  setRejecting(account);
                                }}
                              >
                                Reject
                              </Button>
                            )}
                            {account.status === "approved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  void changeStatus(
                                    account,
                                    "suspended",
                                    `${account.first_name} ${account.last_name} was deactivated.`,
                                  )
                                }
                              >
                                Deactivate
                              </Button>
                            )}
                            {account.status === "suspended" && (
                              <Button
                                size="sm"
                                variant="gold"
                                disabled={busy}
                                onClick={() =>
                                  void changeStatus(
                                    account,
                                    "approved",
                                    `${account.first_name} ${account.last_name} was reactivated.`,
                                  )
                                }
                              >
                                Reactivate
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={busy}
                              onClick={() => setDeleting(account)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={!!rejecting}
        onOpenChange={(open) => {
          if (!open) {
            setRejecting(null);
            setReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject account</DialogTitle>
            <DialogDescription>
              {rejecting
                ? `${rejecting.first_name} ${rejecting.last_name} will see this reason on their account page.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              placeholder="For example: the ID photo is unreadable, please upload a clearer copy."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejecting(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 5}
              onClick={() => void confirmReject()}
            >
              Reject account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this account?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `${deleting.first_name} ${deleting.last_name} (${deleting.email}) will be permanently removed and can no longer sign in. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep account</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
