import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
};

export function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * One notification in a list. Unread ones are bold with a gold edge and a soft shadow;
 * read ones are flat and faded, so the two are easy to tell apart.
 */
export function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={cn(
          "block w-full border-l-4 px-3 py-3 text-left transition",
          item.read
            ? "border-transparent bg-transparent opacity-60 hover:opacity-90"
            : "border-gold-deep bg-gold-soft/40 shadow-sm hover:bg-gold-soft/60",
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cn("text-sm", item.read ? "font-normal" : "font-semibold")}>
            {item.title}
          </span>
          {!item.read && (
            <span className="size-2 shrink-0 rounded-full bg-gold-deep" aria-label="Unread" />
          )}
        </span>
        <span className="mt-0.5 line-clamp-1 block text-xs text-muted-foreground">{item.body}</span>
        <span className="mt-1 block text-xs text-gold-deep">{timeAgo(item.created_at)}</span>
      </button>
    </li>
  );
}

/** The full notification. Opening it is what marks it as read (the parent does that). */
export function NotificationDialog({
  item,
  onClose,
}: {
  item: NotificationItem | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const link = item?.link && item.link.startsWith("/") ? item.link : null;

  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item?.title}</DialogTitle>
          <DialogDescription>
            {item ? new Date(item.created_at).toLocaleString() : ""}
          </DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap text-sm">{item?.body || "No more details."}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {link && (
            <Button
              variant="gold"
              onClick={() => {
                onClose();
                void navigate({ to: link as never });
              }}
            >
              Go there
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
