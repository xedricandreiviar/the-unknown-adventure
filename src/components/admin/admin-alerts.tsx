import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { adminGetAlerts, type AlertItem } from "@/lib/admin-reports.functions";

export type AlertState = {
  counts: { accounts: number; requests: number; problems: number };
  items: AlertItem[];
};

const EMPTY: AlertState = { counts: { accounts: 0, requests: 0, problems: 0 }, items: [] };
const REFRESH_MS = 30_000;

/** Polls for new accounts, requests and reports so the admin sees them without reloading. */
export function useAdminAlerts() {
  const alertsFn = useServerFn(adminGetAlerts);
  const [alerts, setAlerts] = useState<AlertState>(EMPTY);

  const refresh = useCallback(async () => {
    try {
      setAlerts((await alertsFn()) as AlertState);
    } catch {
      // Keep showing the last known counts if one refresh fails.
    }
  }, [alertsFn]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { alerts, refresh };
}

function ago(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString();
}

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-5 text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AlertBell({ alerts }: { alerts: AlertState }) {
  const total = alerts.counts.accounts + alerts.counts.requests + alerts.counts.problems;
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Alerts, ${total} waiting`}>
          <Bell className="size-4" aria-hidden />
          <span className="hidden sm:inline">Alerts</span>
          <CountBadge count={total} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-forest-deep">Waiting for you</p>
          <p className="text-xs text-muted-foreground">
            {alerts.counts.accounts} accounts · {alerts.counts.requests} requests ·{" "}
            {alerts.counts.problems} reports
          </p>
        </div>
        {alerts.items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Nothing new. You are all caught up.
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {alerts.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-secondary"
                >
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                  <p className="mt-0.5 text-xs text-gold-deep">{ago(item.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
