import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/status-badge";
import {
  adminListRequests,
  adminUpdateRequest,
  getRequestQuotaStats,
} from "@/lib/queue.functions";

export const Route = createFileRoute("/admin/requests")({
  component: RequestsPage,
});

type RequestStatus = "pending" | "in_queue" | "processing" | "ready" | "completed" | "rejected" | "cancelled";

type Resident = {
  first_name: string; middle_name: string; last_name: string;
  street: string; purok: string; barangay: string;
  contact_number: string; is_senior: boolean; is_pwd: boolean;
};

type ServiceRequest = {
  id: string; code: string; status: RequestStatus; details: string;
  rejection_reason: string | null; created_at: string;
  pickup_date?: string | null; certificate_path?: string | null;
  service: { name: string; fee: number | string | null; code: string } | null;
  resident: Resident | null;
};

type View = "active" | "ready" | "completed" | "closed" | "all";

const ACTIVE_STATUSES: RequestStatus[] = ["pending", "in_queue", "processing"];

function viewOf(status: RequestStatus): Exclude<View, "all"> {
  if (status === "ready") return "ready";
  if (ACTIVE_STATUSES.includes(status)) return "active";
  return status === "completed" ? "completed" : "closed";
}

function residentName(r: Resident | null) {
  if (!r) return "Resident not found";
  const n = [r.first_name, r.middle_name, r.last_name].map((p) => p.trim()).filter(Boolean).join(" ");
  return n || "No name on file";
}
function residentAddress(r: Resident | null) {
  if (!r) return "";
  return [r.street, r.purok].map((p) => p.trim()).filter(Boolean).join(", ");
}

const VIEWS: Array<{ key: View; label: string }> = [
  { key: "active",    label: "Active" },
  { key: "ready",     label: "Ready for pickup" },
  { key: "completed", label: "Completed" },
  { key: "closed",    label: "Rejected / Cancelled" },
  { key: "all",       label: "All" },
];

function RequestsPage() {
  const listFn       = useServerFn(adminListRequests);
  const updateFn     = useServerFn(adminUpdateRequest);
  const quotaFn      = useServerFn(getRequestQuotaStats);
  const confirm      = useConfirm();

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [view,     setView]     = useState<View>("active");
  const [search,   setSearch]   = useState("");
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState("");
  const [message,  setMessage]  = useState("");
  const [rejecting, setRejecting] = useState<ServiceRequest | null>(null);
  const [reason,    setReason]    = useState("");
  const [quota, setQuota] = useState<{ quota: number; todayCount: number; today: string } | null>(null);

  const reload = useCallback(async () => {
    const [rows, q] = await Promise.all([
      listFn({ data: {} }) as Promise<ServiceRequest[]>,
      quotaFn(),
    ]);
    setRequests(rows);
    setQuota(q);
  }, [listFn, quotaFn]);

  // Realtime: refresh the list and quota bar whenever a request is inserted or updated
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  useEffect(() => {
    const channel = supabase
      .channel("admin-requests-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_requests" },
        () => { void reloadRef.current(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    let active = true;
    reload()
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load requests.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const counts = useMemo(() => ({
    active:    requests.filter((r) => viewOf(r.status) === "active").length,
    ready:     requests.filter((r) => viewOf(r.status) === "ready").length,
    completed: requests.filter((r) => viewOf(r.status) === "completed").length,
    closed:    requests.filter((r) => viewOf(r.status) === "closed").length,
    all:       requests.length,
  }), [requests]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (view !== "all" && viewOf(r.status) !== view) return false;
      if (!term) return true;
      return `${r.code} ${residentName(r.resident)} ${r.service?.name ?? ""}`.toLowerCase().includes(term);
    });
  }, [requests, view, search]);

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true); setError(""); setMessage("");
    try { await work(); await reload(); setMessage(done); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the request."); }
    finally { setBusy(false); }
  };

  /**
   * "Generate PDF" = mark as ready + open the certificate PDF.
   * This is the single action admins take after the captain signs.
   */
  const generatePdf = async (item: ServiceRequest) => {
    const ok = await confirm({
      title:        `Generate certificate for ${item.code}?`,
      description:  "This marks the request as ready for pickup and downloads the PDF for printing. The resident is notified.",
      confirmLabel: "Yes, generate",
    });
    if (!ok) return;

    // 1. Mark as ready (resident gets notified by adminUpdateRequest)
    await run(
      () => updateFn({ data: { id: item.id, status: "ready" } }),
      `Certificate generated — request ${item.code} is now ready for pickup.`,
    );

    // 2. Open PDF
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setError("Sign in again to download the certificate."); return; }
    const base = import.meta.env["VITE_CSHARP_API_URL"] ?? "http://localhost:5000";
    const popup = window.open("", "_blank");
    if (popup) {
      popup.opener = null;
      popup.location.href = `${base}/api/certificates/${item.id}?token=${encodeURIComponent(token)}`;
    } else {
      setError("Allow pop-ups to download the certificate PDF.");
    }
  };

  const downloadCertificate = async (item: ServiceRequest) => {
    setError("");
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { setError("Sign in again to download the certificate."); return; }
    const base = import.meta.env["VITE_CSHARP_API_URL"] ?? "http://localhost:5000";
    const popup = window.open("", "_blank");
    if (popup) {
      popup.opener = null;
      popup.location.href = `${base}/api/certificates/${item.id}?token=${encodeURIComponent(token)}`;
    } else {
      setError("Allow pop-ups to download the certificate.");
    }
  };

  const confirmReject = async () => {
    if (!rejecting || reason.trim().length < 5) return;
    const target = rejecting; const why = reason.trim();
    setRejecting(null); setReason("");
    await run(
      () => updateFn({ data: { id: target.id, status: "rejected", reason: why } }),
      `Request ${target.code} rejected.`,
    );
  };

  const markCollected = async (item: ServiceRequest) => {
    const ok = await confirm({
      title: `Mark ${item.code} as collected?`,
      description: "The resident picked up their document.",
      confirmLabel: "Yes, mark collected",
    });
    if (!ok) return;
    await run(
      () => updateFn({ data: { id: item.id, status: "completed" } }),
      `Request ${item.code} marked as collected.`,
    );
  };

  return (
    <div className="space-y-4">
      {/* Daily quota banner */}
      {quota && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-forest-deep">
              Next pickup day — {quota.today}
            </span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                quota.todayCount >= quota.quota
                  ? "bg-destructive/10 text-destructive"
                  : quota.todayCount >= Math.ceil(quota.quota * 0.75)
                  ? "bg-gold-soft text-gold-deep"
                  : "bg-forest/10 text-forest"
              }`}
            >
              {quota.todayCount >= quota.quota
                ? "Full — new requests go to the next available day"
                : `${quota.quota - quota.todayCount} of ${quota.quota} slots remaining`}
            </span>
          </div>
          {/* Progress bar */}
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                quota.todayCount >= quota.quota
                  ? "bg-destructive"
                  : quota.todayCount >= Math.ceil(quota.quota * 0.75)
                  ? "bg-gold-deep"
                  : "bg-forest"
              }`}
              style={{ width: `${Math.min(100, Math.round((quota.todayCount / quota.quota) * 100))}%` }}
              role="progressbar"
              aria-valuenow={quota.todayCount}
              aria-valuemin={0}
              aria-valuemax={quota.quota}
              aria-label={`${quota.todayCount} of ${quota.quota} daily slots used`}
            />
            {/* Slot tick marks */}
            {Array.from({ length: quota.quota - 1 }, (_, i) => (
              <div
                key={i}
                className="absolute top-0 h-full w-px bg-background/40"
                style={{ left: `${((i + 1) / quota.quota) * 100}%` }}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {quota.todayCount} / {quota.quota} requests assigned for pickup on {quota.today}.
            {quota.todayCount >= quota.quota
              ? " New requests will be assigned to the following working day (FIFO)."
              : " Each accepted request fills one slot. FIFO order is maintained."}
          </p>
        </div>
      )}

      {/* Filter tabs + search */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter requests">
          {VIEWS.map((v) => (
            <Button
              key={v.key}
              role="tab"
              aria-selected={view === v.key}
              size="sm"
              variant={view === v.key ? "default" : "outline"}
              onClick={() => setView(v.key)}
            >
              {v.label} ({counts[v.key]})
            </Button>
          ))}
        </div>
        <div className="w-full space-y-1 sm:w-72">
          <Label htmlFor="request-search" className="sr-only">Search requests</Label>
          <Input
            id="request-search"
            placeholder="Search code, name, or service"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error   && <p role="alert"  className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm text-forest">{message}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading requests…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">No requests in this view.</p>
      ) : (
        <div className="overflow-x-auto border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Resident</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Filed</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap font-mono text-sm">{item.code}</TableCell>
                  <TableCell>
                    <p className="font-medium">
                      {residentName(item.resident)}
                      {item.resident?.is_senior && <span className="ml-1.5 text-xs text-gold-deep">Senior</span>}
                      {item.resident?.is_pwd    && <span className="ml-1.5 text-xs text-gold-deep">PWD</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.resident?.contact_number}</p>
                    <p className="text-xs text-muted-foreground">{residentAddress(item.resident) || "No address"}</p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.service?.name ?? "Unknown service"}
                    {item.details && (
                      <p className="mt-0.5 max-w-56 truncate text-xs text-muted-foreground" title={item.details}>
                        {item.details}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(item.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {item.pickup_date
                      ? new Date(item.pickup_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                    {item.status === "rejected" && item.rejection_reason && (
                      <p className="mt-1 max-w-48 text-xs text-destructive">{item.rejection_reason}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {/* Generate PDF — available on pending/in_queue/processing (captain has not signed yet) */}
                      {ACTIVE_STATUSES.includes(item.status) && (
                        <Button
                          size="sm"
                          variant="gold"
                          disabled={busy}
                          title="Generate certificate PDF and mark as ready for pickup"
                          onClick={() => void generatePdf(item)}
                        >
                          <FileDown className="size-3.5 mr-1" aria-hidden />
                          Generate PDF
                        </Button>
                      )}
                      {/* Re-download certificate once ready/completed */}
                      {(item.status === "ready" || item.status === "completed") && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          title="Download certificate PDF again"
                          onClick={() => void downloadCertificate(item)}
                        >
                          <Download className="size-3.5 mr-1" aria-hidden />
                          PDF
                        </Button>
                      )}
                      {/* Mark collected — only on ready */}
                      {item.status === "ready" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void markCollected(item)}
                        >
                          Mark collected
                        </Button>
                      )}
                      {/* Reject — available while still active */}
                      {ACTIVE_STATUSES.includes(item.status) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => { setReason(""); setRejecting(item); }}
                        >
                          Reject
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejecting} onOpenChange={(open) => { if (!open) { setRejecting(null); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject request {rejecting?.code}</DialogTitle>
            <DialogDescription>The resident is notified and sees this reason on their account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="req-reject-reason">Reason</Label>
            <Textarea
              id="req-reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="e.g. Missing proof of residency — please file again with a valid ID."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={reason.trim().length < 5} onClick={() => void confirmReject()}>
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
