import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { REQUEST_ACTIVE, StatusBadge } from "@/components/status-badge";
import { adminListRequests, adminUpdateRequest } from "@/lib/queue.functions";

export const Route = createFileRoute("/admin/requests")({
  component: RequestsPage,
});

type RequestStatus = "pending" | "in_queue" | "processing" | "completed" | "rejected" | "cancelled";

type ServiceRequest = {
  id: string;
  code: string;
  status: RequestStatus;
  first_name: string;
  middle_name: string;
  last_name: string;
  street: string;
  purok: string;
  contact_number: string;
  details: string;
  rejection_reason: string | null;
  created_at: string;
  service: { name: string; fee: number | string | null; code: string } | null;
};

type View = "active" | "finished" | "all";

const VIEWS: Array<{ key: View; label: string }> = [
  { key: "active", label: "Active" },
  { key: "finished", label: "Finished" },
  { key: "all", label: "All" },
];

/** The one forward step an admin can take from each status. */
const NEXT_STEP: Partial<
  Record<RequestStatus, { status: RequestStatus; label: string; done: string }>
> = {
  pending: { status: "in_queue", label: "Add to queue", done: "placed in the queue" },
  in_queue: { status: "processing", label: "Start processing", done: "marked as processing" },
  processing: { status: "completed", label: "Mark completed", done: "marked as completed" },
};

function RequestsPage() {
  const listFn = useServerFn(adminListRequests);
  const updateFn = useServerFn(adminUpdateRequest);

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [view, setView] = useState<View>("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rejecting, setRejecting] = useState<ServiceRequest | null>(null);
  const [reason, setReason] = useState("");

  const reload = useCallback(async () => {
    setRequests((await listFn({ data: {} })) as ServiceRequest[]);
  }, [listFn]);

  useEffect(() => {
    let active = true;
    listFn({ data: {} })
      .then((rows) => {
        if (active) setRequests(rows as ServiceRequest[]);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load requests.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listFn]);

  const counts = useMemo(
    () => ({
      active: requests.filter((item) => REQUEST_ACTIVE.includes(item.status)).length,
      finished: requests.filter((item) => !REQUEST_ACTIVE.includes(item.status)).length,
      all: requests.length,
    }),
    [requests],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests.filter((item) => {
      const isActive = REQUEST_ACTIVE.includes(item.status);
      if (view === "active" && !isActive) return false;
      if (view === "finished" && isActive) return false;
      if (!term) return true;
      return `${item.code} ${item.first_name} ${item.last_name} ${item.service?.name ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [requests, view, search]);

  const update = async (
    item: ServiceRequest,
    status: RequestStatus,
    done: string,
    why?: string,
  ) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateFn({ data: { id: item.id, status, reason: why } });
      await reload();
      setMessage(`Request ${item.code} ${done}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the request.");
    } finally {
      setBusy(false);
    }
  };

  const confirmReject = async () => {
    if (!rejecting) return;
    const trimmed = reason.trim();
    if (trimmed.length < 5) return;
    const target = rejecting;
    setRejecting(null);
    setReason("");
    await update(target, "rejected", "was rejected", trimmed);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter requests">
          {VIEWS.map((item) => (
            <Button
              key={item.key}
              role="tab"
              aria-selected={view === item.key}
              size="sm"
              variant={view === item.key ? "default" : "outline"}
              onClick={() => setView(item.key)}
            >
              {item.label} ({counts[item.key]})
            </Button>
          ))}
        </div>
        <div className="w-full space-y-1 sm:w-72">
          <Label htmlFor="request-search" className="sr-only">
            Search requests
          </Label>
          <Input
            id="request-search"
            placeholder="Search code, name, or service"
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
        <p className="mt-6 text-sm text-muted-foreground">Loading requests…</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No requests in this view.</p>
      ) : (
        <div className="mt-4 overflow-x-auto border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Resident</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Filed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => {
                const next = NEXT_STEP[item.status];
                const canReject = REQUEST_ACTIVE.includes(item.status);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap font-mono text-sm">
                      {item.code}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">
                        {item.first_name} {item.middle_name} {item.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.contact_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.street}, {item.purok}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.service?.name ?? "Unknown service"}
                      {item.details && (
                        <p
                          className="mt-1 max-w-56 truncate text-xs text-muted-foreground"
                          title={item.details}
                        >
                          {item.details}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(item.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                      {item.status === "rejected" && item.rejection_reason && (
                        <p className="mt-1 max-w-48 text-xs text-muted-foreground">
                          {item.rejection_reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {next && (
                          <Button
                            size="sm"
                            variant="gold"
                            disabled={busy}
                            onClick={() => void update(item, next.status, next.done)}
                          >
                            {next.label}
                          </Button>
                        )}
                        {canReject && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setReason("");
                              setRejecting(item);
                            }}
                          >
                            Reject
                          </Button>
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
            <DialogTitle>Reject request {rejecting?.code}</DialogTitle>
            <DialogDescription>
              The resident is notified and sees this reason on their account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="request-reject-reason">Reason</Label>
            <Textarea
              id="request-reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              placeholder="For example: missing proof of residency, please file again with a valid ID."
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
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
