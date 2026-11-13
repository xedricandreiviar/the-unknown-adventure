import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  adminListAnnouncements,
  deleteAnnouncement,
  saveAnnouncement,
} from "@/lib/settings.functions";
import { newsSchema } from "@/lib/validation";

export const Route = createFileRoute("/admin/announcements")({
  component: AnnouncementsPage,
});

type Announcement = {
  id: string;
  title: string;
  category: string;
  body: string;
  published: boolean;
  published_at: string | null;
  created_at: string;
};

type Draft = { id?: string; title: string; category: string; body: string; published: boolean };

const EMPTY: Draft = { title: "", category: "Notices", body: "", published: true };
const CATEGORY_SUGGESTIONS = ["Notices", "Events", "Programs", "Health", "Advisories"];

type View = "all" | "published" | "draft";

function AnnouncementsPage() {
  const listFn = useServerFn(adminListAnnouncements);
  const saveFn = useServerFn(saveAnnouncement);
  const deleteFn = useServerFn(deleteAnnouncement);

  const [items, setItems] = useState<Announcement[]>([]);
  const [view, setView] = useState<View>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [removing, setRemoving] = useState<Announcement | null>(null);

  const reload = useCallback(async () => {
    setItems((await listFn()) as unknown as Announcement[]);
  }, [listFn]);

  useEffect(() => {
    let active = true;
    listFn()
      .then((rows) => {
        if (active) setItems(rows as unknown as Announcement[]);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Could not load announcements.");
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
      all: items.length,
      published: items.filter((item) => item.published).length,
      draft: items.filter((item) => !item.published).length,
    }),
    [items],
  );

  const visible = items.filter((item) =>
    view === "all" ? true : view === "published" ? item.published : !item.published,
  );

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

  const submitDraft = async () => {
    if (!draft) return;
    const parsed = newsSchema.safeParse({ ...draft, id: draft.id });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }
    setFormError("");
    const wasNew = !draft.id;
    const payload = parsed.data;
    setDraft(null);
    await run(
      async () => {
        await saveFn({ data: payload });
      },
      wasNew ? "Announcement added." : "Announcement saved.",
    );
  };

  const togglePublished = (item: Announcement) =>
    run(
      async () => {
        await saveFn({
          data: {
            id: item.id,
            title: item.title,
            category: item.category,
            body: item.body,
            published: !item.published,
          },
        });
      },
      item.published ? "Announcement hidden from the public page." : "Announcement published.",
    );

  const confirmRemove = async () => {
    if (!removing) return;
    const target = removing;
    setRemoving(null);
    await run(async () => {
      await deleteFn({ data: { id: target.id } });
    }, "Announcement deleted.");
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter announcements">
          {(
            [
              ["all", "All"],
              ["published", "Published"],
              ["draft", "Drafts"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              role="tab"
              aria-selected={view === key}
              size="sm"
              variant={view === key ? "default" : "outline"}
              onClick={() => setView(key)}
            >
              {label} ({counts[key]})
            </Button>
          ))}
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={() => {
            setFormError("");
            setDraft({ ...EMPTY });
          }}
        >
          <Plus className="size-4" aria-hidden />
          New announcement
        </Button>
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
        <p className="mt-6 text-sm text-muted-foreground">Loading announcements…</p>
      ) : visible.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nothing in this view.</p>
      ) : (
        <div className="mt-4 overflow-x-auto border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-72">
                    <p className="font-medium">{item.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                  </TableCell>
                  <TableCell className="text-sm">{item.category}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        item.published
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {item.published ? "Published" : "Draft"}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(item.published_at ?? item.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setFormError("");
                          setDraft({
                            id: item.id,
                            title: item.title,
                            category: item.category,
                            body: item.body,
                            published: item.published,
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void togglePublished(item)}
                      >
                        {item.published ? "Unpublish" : "Publish"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setRemoving(item)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Edit announcement" : "New announcement"}</DialogTitle>
            <DialogDescription>
              Published announcements appear on the public Announcements page.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="news-title">Title</Label>
                <Input
                  id="news-title"
                  value={draft.title}
                  maxLength={160}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="news-category">Category</Label>
                <Input
                  id="news-category"
                  list="news-categories"
                  value={draft.category}
                  maxLength={40}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                />
                <datalist id="news-categories">
                  {CATEGORY_SUGGESTIONS.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="news-body">Message</Label>
                <Textarea
                  id="news-body"
                  rows={7}
                  value={draft.body}
                  maxLength={8000}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="news-published"
                  checked={draft.published}
                  onCheckedChange={(checked) => setDraft({ ...draft, published: checked })}
                />
                <Label htmlFor="news-published">
                  {draft.published ? "Published" : "Saved as a draft"}
                </Label>
              </div>
              {formError && (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button variant="gold" onClick={() => void submitDraft()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this announcement?</DialogTitle>
            <DialogDescription>
              “{removing?.title}” will be removed for good. To hide it for now, use Unpublish
              instead.
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
