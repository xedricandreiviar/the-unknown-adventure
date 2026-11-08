import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHero } from "@/components/page-hero";
import { RegistrationForm } from "@/components/registration-form";
import { RegistrantDetail } from "@/components/registrant-detail";
import { SITE } from "@/lib/site";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  ageFromBirthDate,
  registryErrorMessage,
  type Registrant,
  type RegistryCategory,
  type RegistryStatus,
} from "@/lib/registry";

export const Route = createFileRoute("/admin/registry")({
  head: () => ({
    meta: [
      { title: `Registry Admin — ${SITE.name}` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminRegistryPage,
});

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:outline-2 focus-visible:outline-gold-deep";

type Access = "loading" | "signed_out" | "denied" | "admin";

function AdminRegistryPage() {
  const [access, setAccess] = useState<Access>("loading");
  const [adminId, setAdminId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!data.user) {
        setAccess("signed_out");
        return;
      }
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: data.user.id,
        _role: "admin",
      });
      if (!mounted) return;
      setAdminId(data.user.id);
      setAccess(isAdmin ? "admin" : "denied");
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div>
      <PageHero
        kicker="Barangay staff"
        title="PWD & Senior Registry"
        body="Verify documents, cross-check applicants, encode walk-ins, and record incentive releases."
      />
      <section className="mx-auto max-w-6xl px-4 py-10">
        {access === "loading" && <p className="text-sm text-muted-foreground">Checking access…</p>}
        {access === "signed_out" && (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">Please log in with a staff account.</p>
            <Button asChild variant="gold" className="mt-4">
              <Link to="/auth">Log in</Link>
            </Button>
          </div>
        )}
        {access === "denied" && (
          <div role="alert" className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            This page is for barangay staff only. If you should have access, ask the system
            administrator to give your account the admin role.
          </div>
        )}
        {access === "admin" && adminId && <AdminPanel adminId={adminId} />}
      </section>
    </div>
  );
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function AdminPanel({ adminId }: { adminId: string }) {
  const [rows, setRows] = useState<Registrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<"all" | RegistryCategory>("all");
  const [status, setStatus] = useState<"all" | RegistryStatus>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: dbError } = await supabase
      .from("registrants")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (dbError) setError(registryErrorMessage(dbError));
    else {
      setError(null);
      setRows(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      pwd: rows.filter((r) => r.category === "pwd" && r.status === "approved").length,
      senior: rows.filter((r) => r.category === "senior" && r.status === "approved").length,
      reps: rows.filter((r) => r.applicant_type === "representative").length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (category === "all" || r.category === category) &&
        (status === "all" || r.status === status) &&
        (!q || r.full_name.toLowerCase().includes(q) || r.reference_code.toLowerCase().includes(q)),
    );
  }, [rows, category, status, query]);

  const exportCsv = () => {
    const head = [
      "Reference", "Category", "Status", "Source", "Filed by", "Representative", "Full name", "Birth date",
      "Age", "Sex", "Address", "Contact", "Disability", "ID number", "PWD ID expiry", "Pension applicant", "Created",
    ];
    const lines = filtered.map((r) =>
      [
        r.reference_code, CATEGORY_LABEL[r.category], STATUS_LABEL[r.status], r.source,
        r.applicant_type, r.rep_full_name, r.full_name,
        r.birth_date, ageFromBirthDate(r.birth_date), r.sex, r.address, r.contact_number,
        r.disability_type, r.id_number, r.id_expiry, r.pension_applicant ? "Yes" : "No", r.created_at,
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[head.map(csvCell).join(","), ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registry-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Applications", counts.total],
          ["Pending", counts.pending],
          ["Approved", counts.approved],
          ["PWD (approved)", counts.pwd],
          ["Seniors (approved)", counts.senior],
          ["Via representative", counts.reps],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-xl border border-border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-display text-2xl font-semibold text-forest-deep">{n}</dd>
          </div>
        ))}
      </dl>

      <Tabs defaultValue="registry">
        <TabsList>
          <TabsTrigger value="registry">Registry</TabsTrigger>
          <TabsTrigger value="walkin">Encode walk-in</TabsTrigger>
        </TabsList>

        <TabsContent value="registry" className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 md:flex-row md:items-end">
            <div className="relative flex-1 space-y-1.5">
              <Label htmlFor="search">Search name or reference</Label>
              <Search className="pointer-events-none absolute bottom-2.5 left-3 size-4 text-muted-foreground" aria-hidden />
              <Input id="search" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:w-44">
              <Label htmlFor="f-category">Category</Label>
              <select id="f-category" className={SELECT_CLASS} value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
                <option value="all">All</option>
                <option value="pwd">PWD</option>
                <option value="senior">Senior Citizen</option>
              </select>
            </div>
            <div className="space-y-1.5 md:w-44">
              <Label htmlFor="f-status">Status</Label>
              <select id="f-status" className={SELECT_CLASS} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <Button variant="outline" className="gap-2" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="size-4" aria-hidden /> Export CSV
            </Button>
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No records match.
            </p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((r) => (
                <li key={r.id} className="rounded-xl border border-border bg-card">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
                    aria-expanded={selectedId === r.id}
                    onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                  >
                    <span>
                      <span className="block font-medium text-forest-deep">{r.full_name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {CATEGORY_LABEL[r.category]} · age {ageFromBirthDate(r.birth_date)} ·{" "}
                        <span className="font-mono">{r.reference_code}</span> ·{" "}
                        {r.source === "walk_in" ? "walk-in" : "online"}
                        {r.applicant_type === "representative" ? " · via representative" : ""}
                      </span>
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </button>
                  {selectedId === r.id && (
                    <RegistrantDetail registrant={r} allRows={rows} adminId={adminId} onChanged={load} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="walkin">
          <div className="mx-auto max-w-3xl">
            <p className="mb-3 text-sm text-muted-foreground">
              For residents who came to the barangay hall. Save the record, upload scans of their
              documents, then open it under Registry to verify the documents and finish the
              cross-checks before approving.
            </p>
            <RegistrationForm mode="walk_in" onRegistered={() => load()} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
