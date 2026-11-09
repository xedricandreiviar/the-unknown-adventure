import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { REQUEST_ACTIVE, StatusBadge } from "@/components/status-badge";

export type MyRequest = {
  id: string;
  code: string;
  status: string;
  created_at: string;
  updated_at?: string;
  rejection_reason: string | null;
  service: { name: string } | null;
};

type View = "active" | "finished";

/** A resident's requests in one table, with active and finished ones kept apart. */
export function MyRequestsTable({
  requests,
  busy,
  onCancel,
}: {
  requests: MyRequest[];
  busy: boolean;
  onCancel: (id: string) => void;
}) {
  const [view, setView] = useState<View>("active");
  const activeCount = requests.filter((item) => REQUEST_ACTIVE.includes(item.status)).length;
  const finishedCount = requests.length - activeCount;
  const rows = requests.filter(
    (item) => REQUEST_ACTIVE.includes(item.status) === (view === "active"),
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-forest-deep">
          <FileText className="size-5 text-gold-deep" aria-hidden />
          My service requests
        </h2>
        <Button asChild size="sm" variant="gold">
          <Link to="/request">File a request</Link>
        </Button>
      </div>

      <div className="mt-3 flex gap-2" role="tablist" aria-label="Filter my requests">
        <Button
          role="tab"
          aria-selected={view === "active"}
          size="sm"
          variant={view === "active" ? "default" : "outline"}
          onClick={() => setView("active")}
        >
          Active ({activeCount})
        </Button>
        <Button
          role="tab"
          aria-selected={view === "finished"}
          size="sm"
          variant={view === "finished" ? "default" : "outline"}
          onClick={() => setView("finished")}
        >
          Finished ({finishedCount})
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {view === "active" ? "No active requests." : "No finished requests yet."}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>{view === "active" ? "Filed" : "Closed"}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap font-mono text-sm">{item.code}</TableCell>
                  <TableCell className="text-sm">
                    {item.service?.name ?? "Unknown service"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(
                      view === "active" ? item.created_at : (item.updated_at ?? item.created_at),
                    ).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                    {item.status === "rejected" && item.rejection_reason && (
                      <p className="mt-1 max-w-56 text-xs text-destructive">
                        {item.rejection_reason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onCancel(item.id)}
                      >
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
