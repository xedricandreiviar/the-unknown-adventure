import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { statusMeta } from "@/components/status-badge";
import { adminGetReport } from "@/lib/admin-reports.functions";
import { SITE } from "@/lib/site";

export const Route = createFileRoute("/admin/reports")({
  component: ReportsPage,
});

type Report = Awaited<ReturnType<typeof adminGetReport>>;
type Preset = "today" | "yesterday" | "week" | "month" | "custom";

const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: "today", label: "Today (end of shift)" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom dates" },
];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function dateInput(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The local-time range for a preset. Today ends now, so the report is "up to this moment". */
function rangeFor(
  preset: Preset,
  customFrom: string,
  customTo: string,
): { from: Date; to: Date } | null {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: now };
  if (preset === "yesterday") {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return { from: startOfDay(day), to: endOfDay(day) };
  }
  if (preset === "week") {
    const monday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - ((now.getDay() + 6) % 7),
    );
    return { from: startOfDay(monday), to: now };
  }
  if (preset === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (!customFrom || !customTo) return null;
  const from = new Date(`${customFrom}T00:00:00`);
  const to = new Date(`${customTo}T23:59:59.999`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null;
  return { from, to };
}

function fullName(person: { first_name: string; middle_name?: string; last_name: string } | null) {
  if (!person) return "—";
  const name = [person.first_name, person.middle_name, person.last_name]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return name || "—";
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function peso(amount: number) {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SummaryRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-1.5 text-sm">
      <dt>{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function ReportTable({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: Array<Array<string | number>>;
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <table className="w-full border-collapse text-left text-xs">
      <thead>
        <tr>
          {head.map((cell) => (
            <th key={cell} className="border border-border bg-secondary px-2 py-1 font-semibold">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className="border border-border px-2 py-1 align-top">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportsPage() {
  const reportFn = useServerFn(adminGetReport);
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState(dateInput(new Date()));
  const [customTo, setCustomTo] = useState(dateInput(new Date()));
  const [report, setReport] = useState<Report | null>(null);
  const [period, setPeriod] = useState<{ from: Date; to: Date } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const range = useMemo(
    () => rangeFor(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const load = useCallback(async () => {
    const next = rangeFor(preset, customFrom, customTo);
    if (!next) {
      setError("Choose a start date that is not after the end date.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await reportFn({
        data: { from: next.from.toISOString(), to: next.to.toISOString() },
      });
      setReport(result);
      setPeriod(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not build the report.");
    } finally {
      setLoading(false);
    }
  }, [reportFn, preset, customFrom, customTo]);

  useEffect(() => {
    if (preset !== "custom") void load();
  }, [preset, load]);

  const periodText = period
    ? `${period.from.toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" })} to ${period.to.toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" })}`
    : "";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Report period">
          {PRESETS.map((item) => (
            <Button
              key={item.key}
              role="tab"
              aria-selected={preset === item.key}
              size="sm"
              variant={preset === item.key ? "default" : "outline"}
              onClick={() => setPreset(item.key)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            {loading ? "Updating…" : "Refresh"}
          </Button>
          <Button variant="gold" size="sm" disabled={!report} onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {preset === "custom" && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="report-from">From</Label>
            <Input
              id="report-from"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-to">To</Label>
            <Input
              id="report-to"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={!range || loading} onClick={() => void load()}>
            Build report
          </Button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {!report ? (
        <p className="mt-6 text-sm text-muted-foreground">{loading ? "Building report…" : ""}</p>
      ) : (
        <article id="print-area" className="mt-6 border border-border bg-white p-6 text-black">
          <header className="border-b-2 border-black pb-3 text-center">
            <p className="text-xs uppercase tracking-widest">
              Republic of the Philippines · {SITE.city}
            </p>
            <h2 className="font-display text-2xl font-bold">{SITE.name}</h2>
            <p className="text-xs">{SITE.address}</p>
            <p className="mt-2 text-lg font-semibold">
              {preset === "today" ? "End-of-Shift Report" : "Barangay Service Report"}
            </p>
            <p className="text-xs">Period: {periodText}</p>
          </header>

          <section className="mt-4 grid gap-x-8 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold uppercase">Service requests</h3>
              <dl>
                <SummaryRow label="Received" value={report.summary.requestsReceived} />
                <SummaryRow label="Completed" value={report.summary.requestsCompleted} />
                <SummaryRow label="Rejected" value={report.summary.requestsRejected} />
                <SummaryRow
                  label="Cancelled by resident"
                  value={report.summary.requestsCancelled}
                />
                <SummaryRow
                  label="Still open (carried over)"
                  value={report.summary.requestsStillOpen}
                />
                <SummaryRow
                  label="Fees for completed requests"
                  value={peso(report.summary.feesCollected)}
                />
              </dl>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase">Problem reports and accounts</h3>
              <dl>
                <SummaryRow
                  label="Problem reports received"
                  value={report.summary.problemsReceived}
                />
                <SummaryRow label="Resolved" value={report.summary.problemsResolved} />
                <SummaryRow label="Rejected" value={report.summary.problemsRejected} />
                <SummaryRow
                  label="Still open (carried over)"
                  value={report.summary.problemsStillOpen}
                />
                <SummaryRow
                  label="New resident accounts"
                  value={report.summary.accountsRegistered}
                />
                <SummaryRow
                  label="Accounts waiting for review"
                  value={report.summary.accountsAwaitingReview}
                />
              </dl>
            </div>
          </section>

          <section className="mt-5">
            <h3 className="mb-1 text-sm font-bold uppercase">
              Service requests ({report.requests.length})
            </h3>
            <ReportTable
              empty="No request activity in this period."
              head={["Reference", "Resident", "Service", "Filed", "Status", "Remarks"]}
              rows={report.requests.map((row) => [
                row.code,
                `${fullName(row.resident)}${row.resident?.is_senior ? " (Senior)" : ""}${row.resident?.is_pwd ? " (PWD)" : ""}`,
                row.service?.name ?? "—",
                when(row.created_at),
                statusMeta(row.status).label,
                row.rejection_reason ?? "",
              ])}
            />
          </section>

          <section className="mt-5">
            <h3 className="mb-1 text-sm font-bold uppercase">
              Problem reports ({report.problems.length})
            </h3>
            <ReportTable
              empty="No problem reports in this period."
              head={[
                "Filed",
                "Resident",
                "Category",
                "Location",
                "Problem",
                "Status",
                "Action taken",
              ]}
              rows={report.problems.map((row) => [
                when(row.created_at),
                fullName(row.resident),
                row.category,
                [row.street, row.purok].filter(Boolean).join(", "),
                row.description,
                statusMeta(row.status).label,
                row.admin_reply ?? "",
              ])}
            />
          </section>

          <section className="mt-5">
            <h3 className="mb-1 text-sm font-bold uppercase">
              New resident accounts ({report.accounts.length})
            </h3>
            <ReportTable
              empty="No new accounts in this period."
              head={["Registered", "Name", "Email", "Category", "Status"]}
              rows={report.accounts.map((row) => [
                when(row.created_at),
                fullName(row),
                row.email,
                [row.is_senior ? "Senior" : "", row.is_pwd ? "PWD" : ""]
                  .filter(Boolean)
                  .join(", ") || "—",
                statusMeta(row.status).label,
              ])}
            />
          </section>

          <footer className="mt-10 grid grid-cols-2 gap-10 text-center text-xs">
            <div>
              <div className="border-t border-black pt-1">
                <p className="font-semibold">{report.preparedBy}</p>
                <p>Prepared by</p>
              </div>
            </div>
            <div>
              <div className="border-t border-black pt-1">
                <p className="font-semibold">&nbsp;</p>
                <p>Noted by (Punong Barangay / Secretary)</p>
              </div>
            </div>
            <p className="col-span-2 text-left text-[10px] text-neutral-600">
              Generated {new Date(report.generatedAt).toLocaleString("en-PH")} from the{" "}
              {SITE.shortName} system.
            </p>
          </footer>
        </article>
      )}
    </div>
  );
}
