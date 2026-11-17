import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export type ReviewRow = { label: string; value: ReactNode };

/**
 * "Check your answers" screen: everything the person filled in, read-only,
 * with a way back to edit and a button to send it.
 */
export function ReviewPanel({
  title = "Review your answers",
  intro = "Check everything below. Nothing is sent until you press the submit button.",
  rows,
  busy,
  error,
  submitLabel = "Submit",
  busyLabel = "Submitting…",
  onBack,
  onSubmit,
}: {
  title?: string;
  intro?: string;
  rows: ReviewRow[];
  busy?: boolean | undefined;
  error?: string | undefined;
  submitLabel?: string;
  busyLabel?: string;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <section className="border border-border bg-card p-6" aria-labelledby="review-title">
      <h2 id="review-title" className="font-display text-xl font-semibold text-forest-deep">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      <dl className="mt-5 divide-y divide-border border-y border-border">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
            <dt className="text-xs font-semibold uppercase text-muted-foreground">{row.label}</dt>
            <dd className="whitespace-pre-wrap break-words text-sm">
              {row.value === "" || row.value == null ? (
                <span className="text-muted-foreground">Nothing entered</span>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" onClick={onBack} disabled={busy}>
          Back to edit
        </Button>
        <Button variant="gold" onClick={onSubmit} disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </Button>
      </div>
    </section>
  );
}
