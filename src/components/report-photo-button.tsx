import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getReportPhotoUrl } from "@/lib/problems.functions";

/**
 * Opens the photo attached to a problem report in a dialog.
 * The link is requested when the button is pressed and expires after a few minutes,
 * so the photo is only reachable by the resident who filed the report and by admins.
 */
export function ReportPhotoButton({ reportId }: { reportId: string }) {
  const photoFn = useServerFn(getReportPhotoUrl);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const show = async () => {
    setOpen(true);
    setBusy(true);
    setError("");
    setUrl("");
    try {
      const result = await photoFn({ data: { id: reportId } });
      setUrl(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the photo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => void show()}>
        <ImageIcon className="size-4" aria-hidden />
        View photo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Photo of the problem</DialogTitle>
            <DialogDescription>Attached by the resident who sent this report.</DialogDescription>
          </DialogHeader>
          {busy && <p className="text-sm text-muted-foreground">Loading photo…</p>}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {url && (
            <img
              src={url}
              alt="Photo attached to the problem report"
              className="max-h-[70vh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
