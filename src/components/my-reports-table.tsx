import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PROBLEM_ACTIVE, StatusBadge } from "@/components/status-badge";

export type MyReport = {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
  updated_at?: string;
  admin_reply: string | null;
};

type View = "active" | "finished";

/** A resident's problem reports in one table, with active and finished ones kept apart. */
export function MyReportsTable({ reports }: { reports: MyReport[] }) {
  const [view, setView] = useState<View>("active");
  const activeCount = reports.filter((item) => PROBLEM_ACTIVE.includes(item.status)).length;
  const finishedCount = reports.length - activeCount;
  const rows = reports.filter(
    (item) => PROBLEM_ACTIVE.includes(item.status) === (view === "active"),
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-forest-deep">
          <Megaphone className="size-5 text-gold-deep" aria-hidden />
          My problems / reports
        </h2>
        <Button asChild size="sm" variant="gold">
          <Link to="/report">Report a problem</Link>
        </Button>
      </div>

      <div className="mt-3 flex gap-2" role="tablist" aria-label="Filter my reports">
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
          Resolved / Rejected ({finishedCount})
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {view === "active" ? "No active reports." : "No resolved or rejected reports yet."}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{view === "active" ? "Filed" : "Closed"}</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Problem</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Barangay reply</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(
                      view === "active" ? item.created_at : (item.updated_at ?? item.created_at),
                    ).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-sm">{item.category}</TableCell>
                  <TableCell className="max-w-64 text-sm text-muted-foreground">
                    <p className="line-clamp-2" title={item.description}>
                      {item.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell
                    className={`max-w-56 text-xs ${item.status === "rejected" ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {item.admin_reply || "—"}
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
