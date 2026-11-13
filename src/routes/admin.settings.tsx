import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  deleteService,
  getSiteData,
  saveService,
  setFeatureFlag,
  updateSettings,
  type SiteFlag,
  type SiteService,
} from "@/lib/settings.functions";
import { serviceSchema, settingsSchema } from "@/lib/validation";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

type SettingsForm = {
  hall_address: string;
  office_hours: string;
  office_email: string;
  office_phone: string;
  facebook_url: string;
  court_fee: string;
};

type ServiceDraft = {
  id?: string;
  code: string;
  name: string;
  description: string;
  requirementsText: string;
  fee: string;
  sort: string;
  enabled: boolean;
};

const BLANK_SERVICE: ServiceDraft = {
  code: "",
  name: "",
  description: "",
  requirementsText: "",
  fee: "0",
  sort: "0",
  enabled: true,
};

function toDraft(service: SiteService): ServiceDraft {
  const requirements = Array.isArray(service.requirements)
    ? (service.requirements as string[])
    : [];
  return {
    id: service.id,
    code: service.code,
    name: service.name,
    description: service.description,
    requirementsText: requirements.join("\n"),
    fee: String(service.fee),
    sort: String(service.sort),
    enabled: service.enabled,
  };
}

function peso(amount: number) {
  return amount === 0
    ? "Free"
    : `₱${Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function SettingsPage() {
  const siteFn = useServerFn(getSiteData);
  const settingsFn = useServerFn(updateSettings);
  const flagFn = useServerFn(setFeatureFlag);
  const saveServiceFn = useServerFn(saveService);
  const deleteServiceFn = useServerFn(deleteService);

  const [form, setForm] = useState<SettingsForm | null>(null);
  const [flags, setFlags] = useState<SiteFlag[]>([]);
  const [services, setServices] = useState<SiteService[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [serviceDraft, setServiceDraft] = useState<ServiceDraft | null>(null);
  const [serviceError, setServiceError] = useState("");
  const [removing, setRemoving] = useState<SiteService | null>(null);

  const reload = useCallback(async () => {
    const site = await siteFn();
    setFlags(site.flags);
    setServices(site.services);
    if (site.settings) {
      setForm({
        hall_address: site.settings.hall_address,
        office_hours: site.settings.office_hours,
        office_email: site.settings.office_email,
        office_phone: site.settings.office_phone,
        facebook_url: site.settings.facebook_url,
        court_fee: String(site.settings.court_fee),
      });
    }
  }, [siteFn]);

  useEffect(() => {
    reload()
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not load settings."),
      )
      .finally(() => setLoading(false));
  }, [reload]);

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await reload();
      setMessage(done);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    if (!form) return;
    const parsed = settingsSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the office details.");
      setMessage("");
      return;
    }
    await run(async () => {
      await settingsFn({ data: parsed.data });
    }, "Office details saved.");
  };

  const toggleFlag = (flag: SiteFlag, enabled: boolean) =>
    run(
      async () => {
        await flagFn({ data: { key: flag.key, enabled } });
      },
      `${flag.label} is now ${enabled ? "on" : "off"}.`,
    );

  const submitService = async () => {
    if (!serviceDraft) return;
    const parsed = serviceSchema.safeParse({
      id: serviceDraft.id,
      code: serviceDraft.code.trim().toUpperCase(),
      name: serviceDraft.name,
      description: serviceDraft.description,
      requirements: serviceDraft.requirementsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      fee: serviceDraft.fee,
      sort: serviceDraft.sort,
      enabled: serviceDraft.enabled,
    });
    if (!parsed.success) {
      setServiceError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }
    setServiceError("");
    const wasNew = !serviceDraft.id;
    const payload = parsed.data;
    setServiceDraft(null);
    await run(
      async () => {
        await saveServiceFn({ data: payload });
      },
      wasNew ? "Service added." : "Service saved.",
    );
  };

  const toggleService = (service: SiteService, enabled: boolean) =>
    run(
      async () => {
        await saveServiceFn({
          data: {
            id: service.id,
            code: service.code,
            name: service.name,
            description: service.description,
            requirements: Array.isArray(service.requirements)
              ? (service.requirements as string[])
              : [],
            fee: Number(service.fee),
            sort: service.sort,
            enabled,
          },
        });
      },
      `${service.name} is now ${enabled ? "available" : "hidden from residents"}.`,
    );

  const confirmRemove = async () => {
    if (!removing) return;
    const target = removing;
    setRemoving(null);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await deleteServiceFn({ data: { id: target.id } });
      await reload();
      setMessage(`${target.name} was deleted.`);
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : "";
      setError(
        text.includes("foreign key")
          ? `${target.name} already has requests, so it can't be deleted. Switch it off instead.`
          : text || "Could not delete the service.",
      );
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof SettingsForm, label: string, hint?: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`setting-${key}`}>{label}</Label>
      <Input
        id={`setting-${key}`}
        type={type}
        value={form?.[key] ?? ""}
        onChange={(event) =>
          setForm((prev) => (prev ? { ...prev, [key]: event.target.value } : prev))
        }
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  if (loading) return <p className="text-sm text-muted-foreground">Loading settings…</p>;

  return (
    <div className="space-y-10">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-forest">
          {message}
        </p>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-forest-deep">
            Office details and fees
          </h2>
          <p className="text-sm text-muted-foreground">
            Shown on the Contact page and in the website footer.
          </p>
        </div>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            {field("hall_address", "Barangay hall address")}
            {field("office_hours", "Office hours")}
            {field("office_email", "Office email", undefined, "email")}
            {field("office_phone", "Office phone")}
            {field("facebook_url", "Facebook page link")}
            {field("court_fee", "Court reservation fee (₱)", "Use 0 for free.", "number")}
          </div>
        )}
        <Button variant="gold" disabled={busy || !form} onClick={() => void saveSettings()}>
          Save office details
        </Button>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-forest-deep">Website features</h2>
          <p className="text-sm text-muted-foreground">
            Switch a feature off and residents can no longer use it. Switch it back on any time.
          </p>
        </div>
        <ul className="divide-y divide-border border border-border">
          {flags.map((flag) => (
            <li key={flag.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <Label htmlFor={`flag-${flag.key}`} className="text-sm font-medium">
                {flag.label}
              </Label>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{flag.enabled ? "On" : "Off"}</span>
                <Switch
                  id={`flag-${flag.key}`}
                  checked={flag.enabled}
                  disabled={busy}
                  onCheckedChange={(checked) => void toggleFlag(flag, checked)}
                />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-forest-deep">
              Services and fees
            </h2>
            <p className="text-sm text-muted-foreground">
              The documents residents can request, with their fee and requirements.
            </p>
          </div>
          <Button
            variant="gold"
            size="sm"
            onClick={() => {
              setServiceError("");
              setServiceDraft({ ...BLANK_SERVICE, sort: String(services.length + 1) });
            }}
          >
            <Plus className="size-4" aria-hidden />
            New service
          </Button>
        </div>
        <div className="overflow-x-auto border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Requirements</TableHead>
                <TableHead>Available</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((service) => {
                const requirements = Array.isArray(service.requirements)
                  ? (service.requirements as string[])
                  : [];
                return (
                  <TableRow key={service.id} className={service.enabled ? "" : "opacity-60"}>
                    <TableCell>
                      <p className="font-medium">{service.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{service.code}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {peso(Number(service.fee))}
                    </TableCell>
                    <TableCell className="max-w-60 text-xs text-muted-foreground">
                      {requirements.join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        aria-label={`${service.name} available`}
                        checked={service.enabled}
                        disabled={busy}
                        onCheckedChange={(checked) => void toggleService(service, checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setServiceError("");
                            setServiceDraft(toDraft(service));
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setRemoving(service)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={!!serviceDraft} onOpenChange={(open) => !open && setServiceDraft(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{serviceDraft?.id ? "Edit service" : "New service"}</DialogTitle>
            <DialogDescription>
              Residents see the name, fee and requirements when they file a request.
            </DialogDescription>
          </DialogHeader>
          {serviceDraft && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="svc-code">Code</Label>
                <Input
                  id="svc-code"
                  value={serviceDraft.code}
                  maxLength={8}
                  placeholder="CLR"
                  onChange={(event) =>
                    setServiceDraft({ ...serviceDraft, code: event.target.value.toUpperCase() })
                  }
                />
                <p className="text-xs text-muted-foreground">2–8 capital letters or digits.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-name">Name</Label>
                <Input
                  id="svc-name"
                  value={serviceDraft.name}
                  maxLength={120}
                  onChange={(event) =>
                    setServiceDraft({ ...serviceDraft, name: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="svc-description">Description</Label>
                <Textarea
                  id="svc-description"
                  rows={3}
                  value={serviceDraft.description}
                  maxLength={500}
                  onChange={(event) =>
                    setServiceDraft({ ...serviceDraft, description: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="svc-requirements">Requirements</Label>
                <Textarea
                  id="svc-requirements"
                  rows={4}
                  value={serviceDraft.requirementsText}
                  placeholder={"Valid ID\nProof of residence"}
                  onChange={(event) =>
                    setServiceDraft({ ...serviceDraft, requirementsText: event.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">One requirement per line, up to 10.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-fee">Fee (₱)</Label>
                <Input
                  id="svc-fee"
                  type="number"
                  min={0}
                  value={serviceDraft.fee}
                  onChange={(event) =>
                    setServiceDraft({ ...serviceDraft, fee: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="svc-sort">Order in the list</Label>
                <Input
                  id="svc-sort"
                  type="number"
                  min={0}
                  value={serviceDraft.sort}
                  onChange={(event) =>
                    setServiceDraft({ ...serviceDraft, sort: event.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-3 sm:col-span-2">
                <Switch
                  id="svc-enabled"
                  checked={serviceDraft.enabled}
                  onCheckedChange={(checked) =>
                    setServiceDraft({ ...serviceDraft, enabled: checked })
                  }
                />
                <Label htmlFor="svc-enabled">
                  {serviceDraft.enabled ? "Available to residents" : "Hidden from residents"}
                </Label>
              </div>
              {serviceError && (
                <p role="alert" className="text-sm text-destructive sm:col-span-2">
                  {serviceError}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setServiceDraft(null)}>
              Cancel
            </Button>
            <Button variant="gold" onClick={() => void submitService()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this service?</DialogTitle>
            <DialogDescription>
              “{removing?.name}” will be removed. If residents already filed requests for it, it
              can't be deleted. Switch it off instead.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmRemove()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
