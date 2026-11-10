import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  NotificationDialog,
  NotificationRow,
  type NotificationItem,
} from "@/components/notifications-ui";
import { adminGetAlerts } from "@/lib/admin-reports.functions";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";

export type AlertCounts = { accounts: number; requests: number; problems: number };

const EMPTY: AlertCounts = { accounts: 0, requests: 0, problems: 0 };
const REFRESH_MS = 30_000;

/**
 * Keeps two things fresh for the admin panel:
 * - the counts of work still waiting (red badges on the tabs), and
 * - the admin's own notifications, which can be opened and marked as read.
 */
export function useAdminAlerts() {
  const alertsFn = useServerFn(adminGetAlerts);
  const listFn = useServerFn(getMyNotifications);
  const readFn = useServerFn(markNotificationRead);
  const readAllFn = useServerFn(markAllNotificationsRead);
  const [counts, setCounts] = useState<AlertCounts>(EMPTY);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      setCounts((await alertsFn()).counts);
    } catch {
      // Keep the last known counts if one refresh fails.
    }
    try {
      setNotifications((await listFn()) as NotificationItem[]);
    } catch {
      // Same for notifications.
    }
  }, [alertsFn, listFn]);

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

  const markRead = useCallback(
    (item: NotificationItem) => {
      if (item.read) return;
      setNotifications((rows) =>
        rows.map((row) => (row.id === item.id ? { ...row, read: true } : row)),
      );
      void readFn({ data: { id: item.id } }).catch(() => {
        setNotifications((rows) =>
          rows.map((row) => (row.id === item.id ? { ...row, read: false } : row)),
        );
      });
    },
    [readFn],
  );

  const markAllRead = useCallback(async () => {
    setNotifications((rows) => rows.map((row) => ({ ...row, read: true })));
    try {
      await readAllFn();
    } catch {
      void refresh();
    }
  }, [readAllFn, refresh]);

  return { counts, notifications, markRead, markAllRead };
}

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-5 text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AlertBell({
  notifications,
  onRead,
  onReadAll,
}: {
  notifications: NotificationItem[];
  onRead: (item: NotificationItem) => void;
  onReadAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<NotificationItem | null>(null);
  const unread = notifications.filter((item) => !item.read).length;

  const openOne = (item: NotificationItem) => {
    setOpen(false);
    setSelected({ ...item, read: true });
    onRead(item);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" aria-label={`Alerts, ${unread} unread`}>
            <Bell className="size-4" aria-hidden />
            <span className="hidden sm:inline">Alerts</span>
            <CountBadge count={unread} />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-forest-deep">Alerts</p>
              <p className="text-xs text-muted-foreground">{unread} unread</p>
            </div>
            {unread > 0 && (
              <Button size="sm" variant="ghost" onClick={onReadAll}>
                Mark all read
              </Button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Nothing new. You are all caught up.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {notifications.slice(0, 20).map((item) => (
                <NotificationRow key={item.id} item={item} onOpen={openOne} />
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      <NotificationDialog item={selected} onClose={() => setSelected(null)} />
    </>
  );
}
