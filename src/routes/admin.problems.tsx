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
import { PROBLEM_ACTIVE, StatusBadge } from "@/components/status-badge";
import { adminListProblemReports, adminUpdateProblemReport } from "@/lib/problems.functions";

export const Route = createFileRoute("/admin/problems")({
  component: ProblemsPage,
});

type ProblemStatus = "submitted" | "under_review" | "in_progress" | "resolved" | "rejected";

type Report = {
  id: string;
  category: string;
  description: string;
  street: string;
  purok: string;
  barangay: string;
  status: ProblemStatus;
  admin_reply: string | null;
  created_at: string;
  resident: {
    first_name: string;
    middle_name: string;
    last_name: string;
    email: string;
  } | null;
};

type View = "active" | "resolved" | "rejected" | "all";

const VIEWS: Array<{ key: View; label: string }> = [
  { key: "active", label: "Active" },
  { key: "resolved", label: "Resolved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function viewOf(status: ProblemStatus): Exclude<View, "all"> {
  if (PROBLEM_ACTIVE.includes(status)) return "active";
  return status === "resolved" ? "resolved" : "rejected";
}

/** The one forward step an admin can take from each active status. */
const NEXT_STEP: Partial<
  Record<ProblemStatus, { status: ProblemStatus; label: string; done: string }>
> = {
  submitted: { status: "under_review", label: "Start review", done: "is under review" },
  under_review: { status: "in_progress", label: "Mark in progress", done: "is in progress" },
};

function residentName(resident: Report["resident"]) {
  if (!resident) return "Resident not found";
  const name = [resident.first_name, resident.middle_name, resident.last_name]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return name || resident.email;
}

function location(report: Report) {
  return [report.street, report.purok, report.barangay]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

type Closing = { report: Report; outcome: "resolved" | "rejected" };

function ProblemsPage() {
  const listFn = useServerFn(adminListProblemReports);
  const updateFn = useServerFn(adminUpdateProblemReport);

  const [reports, setReports] = useState<Report[]>([]);
  const [view, setView] = useState<View>("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState<Closing | null>(null);
  const [reply, setReply] = useState("");

  const reload = useCallback(async () => {
    setReports((await listFn()) as unknown as Report[]);
  }, [listFn]);

  useEffect(() => {
    let active = true;
    listFn()
      .then((rows) => {
        if (active) setReports(rows as unknown as Report[]);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load reports.");
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
      active: reports.filter((item) => viewOf(item.status) === "active").length,
      resolved: reports.filter((item) => viewOf(item.status) === "resolved").length,
      rejected: reports.filter((item) => viewOf(item.status) === "rejected").length,
      all: reports.length,
    }),
    [reports],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports.filter((item) => {
      if (view !== "all" && viewOf(item.status) !== view) return false;
      if (!term) return true;
      return `${item.category} ${item.description} ${residentName(item.resident)} ${location(item)}`
        .toLowerCase()
        .includes(term);
    });
  }, [reports, view, search]);

  const update = async (item: Report, status: ProblemStatus, done: string, adminReply?: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateFn({ data: { id: item.id, status, admin_reply: adminReply } });
      await reload();
      setMessage(`Report from ${residentName(item.resident)} ${done}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the report.");
    } finally {
      setBusy(false);
    }
  };

  const closeDialog = () => {
    setClosing(null);
    setReply("");
  };

  const confirmClose = async () => {
    if (!closing) return;
    const trimmed = reply.trim();
    if (closing.outcome === "rejected" && trimmed.length < 5) return;
    const target = closing;
    closeDialog();
    await update(
      target.report,
      target.outcome,
      target.outcome === "resolved" ? "was resolved" : "was rejected",
      trimmed || undefined,
    );
  };

  const rejecting = closing?.outcome === "rejected";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter reports">
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
          <Label htmlFor="problem-search" className="sr-only">
            Search reports
          </Label>
          <Input
            id="problem-search"
            placeholder="Search category, resident, or place"
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
        <p className="mt-6 text-sm text-muted-foreground">Loading reports…</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No reports in this view.</p>
      ) : (
        <div className="mt-4 overflow-x-auto border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filed</TableHead>
                <TableHead>Resident</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => {
                const next = NEXT_STEP[item.status];
                const isActive = PROBLEM_ACTIVE.includes(item.status);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(item.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{residentName(item.resident)}</p>
                      <p className="text-xs text-muted-foreground">{item.resident?.email}</p>
                    </TableCell>
                    <TableCell className="max-w-72 text-sm">
                      <p className="font-medium">{item.category}</p>
                      <p
                        className="mt-1 line-clamp-3 text-muted-foreground"
                        title={item.description}
                      >
                        {item.description}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">{location(item) || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                      {item.admin_reply && (
                        <p
                          className={`mt-1 max-w-48 text-xs ${item.status === "rejected" ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {item.admin_reply}
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
                        {item.status === "in_progress" && (
                          <Button
                            size="sm"
                            variant="gold"
                            disabled={busy}
                            onClick={() => {
                              setReply(item.admin_reply ?? "");
                              setClosing({ report: item, outcome: "resolved" });
                            }}
                          >
                            Resolve
                          </Button>
                        )}
                        {isActive && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setReply("");
                              setClosing({ report: item, outcome: "rejected" });
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
        open={!!closing}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{rejecting ? "Reject report" : "Resolve report"}</DialogTitle>
            <DialogDescription>
              {rejecting
                ? "The resident is notified and sees this reason."
                : "The resident is notified. You can add a note about what was done."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="problem-reply">{rejecting ? "Reason" : "Note (optional)"}</Label>
            <Textarea
              id="problem-reply"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              maxLength={1000}
              placeholder={
                rejecting
                  ? "For example: this is outside the barangay, please contact the city office."
                  : "For example: the streetlight was replaced on Monday."
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              variant={rejecting ? "destructive" : "gold"}
              disabled={rejecting && reply.trim().length < 5}
              onClick={() => void confirmClose()}
            >
              {rejecting ? "Reject report" : "Mark resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
