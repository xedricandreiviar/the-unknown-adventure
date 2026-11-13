import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "@/lib/validation";

type Context = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

async function assertAdmin(context: Context) {
  const { data } = await context.supabase.rpc("is_admin");
  if (!data) throw new Error("Admin access required.");
}

type AlertItem = {
  kind: "account" | "request" | "problem";
  id: string;
  title: string;
  detail: string;
  created_at: string;
  to: "/admin/accounts" | "/admin/requests" | "/admin/problems";
};

type NameParts = { first_name?: string; last_name?: string } | null;

function fullName(person: NameParts) {
  const name = [person?.first_name, person?.last_name]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return name || "A resident";
}

/** Supabase returns a joined row as an object, but its generated type allows an array. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** What needs the admin's attention right now: new accounts, new requests, new reports. */
export const adminGetAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = context.supabase;

    const [accounts, requests, problems] = await Promise.all([
      db
        .from("profiles")
        .select("id, first_name, last_name, email, created_at", { count: "exact" })
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(8),
      db
        .from("service_requests")
        .select(
          "id, code, created_at, service:services(name), resident:profiles(first_name, last_name)",
          {
            count: "exact",
          },
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(8),
      db
        .from("problem_reports")
        .select("id, category, created_at, resident:profiles(first_name, last_name)", {
          count: "exact",
        })
        .eq("status", "submitted")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    for (const result of [accounts, requests, problems]) {
      if (result.error) throw new Error(result.error.message);
    }

    const items: AlertItem[] = [
      ...(accounts.data ?? []).map((row) => ({
        kind: "account" as const,
        id: row.id as string,
        title: "New account to review",
        detail:
          fullName(row as NameParts) === "A resident"
            ? String(row.email)
            : fullName(row as NameParts),
        created_at: row.created_at as string,
        to: "/admin/accounts" as const,
      })),
      ...(requests.data ?? []).map((row) => ({
        kind: "request" as const,
        id: row.id as string,
        title: "New request",
        detail: `${one(row.service as { name: string } | null)?.name ?? "Service"} · ${fullName(one(row.resident as NameParts))}`,
        created_at: row.created_at as string,
        to: "/admin/requests" as const,
      })),
      ...(problems.data ?? []).map((row) => ({
        kind: "problem" as const,
        id: row.id as string,
        title: "New problem report",
        detail: `${row.category as string} · ${fullName(one(row.resident as NameParts))}`,
        created_at: row.created_at as string,
        to: "/admin/problems" as const,
      })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));

    return {
      counts: {
        accounts: accounts.count ?? 0,
        requests: requests.count ?? 0,
        problems: problems.count ?? 0,
      },
      items: items.slice(0, 12),
    };
  });

const rangeSchema = z
  .object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  })
  .refine((range) => new Date(range.from) <= new Date(range.to), {
    message: "The start must be before the end.",
  })
  .refine(
    (range) => new Date(range.to).getTime() - new Date(range.from).getTime() <= 366 * 86400000,
    {
      message: "Choose a range of one year or less.",
    },
  );

export type ReportRequest = {
  code: string;
  status: string;
  created_at: string;
  updated_at: string;
  rejection_reason: string | null;
  service: { name: string; fee: number } | null;
  resident: {
    first_name: string;
    middle_name: string;
    last_name: string;
    is_senior: boolean;
    is_pwd: boolean;
  } | null;
};

export type ReportProblem = {
  category: string;
  description: string;
  street: string;
  purok: string;
  status: string;
  created_at: string;
  updated_at: string;
  admin_reply: string | null;
  resident: { first_name: string; middle_name: string; last_name: string } | null;
};

export type ReportAccount = {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  status: string;
  created_at: string;
  is_senior: boolean;
  is_pwd: boolean;
};

/** Everything that happened in a date range, for the printed barangay report. */
export const adminGetReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    const within = (column: string) => `and(${column}.gte.${data.from},${column}.lte.${data.to})`;
    const inRange = (value: string) => value >= data.from && value <= data.to;

    const [requests, problems, accounts, open, openProblems, pendingAccounts, preparer] =
      await Promise.all([
        db
          .from("service_requests")
          .select(
            "code, status, created_at, updated_at, rejection_reason, service:services(name, fee), resident:profiles(first_name, middle_name, last_name, is_senior, is_pwd)",
          )
          .or(`${within("created_at")},${within("updated_at")}`)
          .order("created_at", { ascending: true }),
        db
          .from("problem_reports")
          .select(
            "category, description, street, purok, status, created_at, updated_at, admin_reply, resident:profiles(first_name, middle_name, last_name)",
          )
          .or(`${within("created_at")},${within("updated_at")}`)
          .order("created_at", { ascending: true }),
        db
          .from("profiles")
          .select(
            "first_name, middle_name, last_name, email, status, created_at, is_senior, is_pwd",
          )
          .gte("created_at", data.from)
          .lte("created_at", data.to)
          .order("created_at", { ascending: true }),
        db
          .from("service_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "in_queue", "processing"]),
        db
          .from("problem_reports")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "under_review", "in_progress"]),
        db.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
        db.from("profiles").select("first_name, last_name").eq("id", context.userId).maybeSingle(),
      ]);
    for (const result of [requests, problems, accounts, open, openProblems, pendingAccounts]) {
      if (result.error) throw new Error(result.error.message);
    }

    const requestRows = (requests.data ?? []).map((row) => ({
      ...row,
      service: one(row.service),
      resident: one(row.resident),
    })) as unknown as ReportRequest[];
    const problemRows = (problems.data ?? []).map((row) => ({
      ...row,
      resident: one(row.resident),
    })) as unknown as ReportProblem[];
    const accountRows = (accounts.data ?? []) as unknown as ReportAccount[];

    const finishedIn = (rows: Array<{ status: string; updated_at: string }>, status: string) =>
      rows.filter((row) => row.status === status && inRange(row.updated_at)).length;

    const completedRequests = requestRows.filter(
      (row) => row.status === "completed" && inRange(row.updated_at),
    );

    return {
      generatedAt: new Date().toISOString(),
      preparedBy: fullName(preparer.data as NameParts),
      requests: requestRows,
      problems: problemRows,
      accounts: accountRows,
      summary: {
        requestsReceived: requestRows.filter((row) => inRange(row.created_at)).length,
        requestsCompleted: completedRequests.length,
        requestsRejected: finishedIn(requestRows, "rejected"),
        requestsCancelled: finishedIn(requestRows, "cancelled"),
        requestsStillOpen: open.count ?? 0,
        feesCollected: completedRequests.reduce(
          (sum, row) => sum + Number(row.service?.fee ?? 0),
          0,
        ),
        problemsReceived: problemRows.filter((row) => inRange(row.created_at)).length,
        problemsResolved: finishedIn(problemRows, "resolved"),
        problemsRejected: finishedIn(problemRows, "rejected"),
        problemsStillOpen: openProblems.count ?? 0,
        accountsRegistered: accountRows.length,
        accountsAwaitingReview: pendingAccounts.count ?? 0,
      },
    };
  });
