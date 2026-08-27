"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { PublicRepairView, TrackingStatus } from "@/features/tracking";
import { cn } from "@/lib/utils";

import { trackRepairAction, type TrackRepairActionState } from "../actions";

const STATUS_STYLES: Record<TrackingStatus, string> = {
  IN_PROGRESS: "border-primary/20 bg-primary/10 text-primary",
  WAITING_FOR_PARTS: "border-amber-700/20 bg-amber-700/10 text-amber-700",
  AWAITING_APPROVAL: "border-orange-700/20 bg-orange-700/10 text-orange-700",
  READY: "border-emerald-700/20 bg-emerald-700/10 text-emerald-700",
  COMPLETED: "border-border bg-muted text-muted-foreground",
  SUBMITTED: "border-primary/20 bg-primary/10 text-primary",
  DECLINED: "border-destructive/20 bg-destructive/10 text-destructive",
};

export function getProgressEmptyMessage(status: TrackingStatus): string {
  if (status === "SUBMITTED") {
    return "Your request is awaiting provider review. Updates will appear here once accepted.";
  }
  if (status === "DECLINED") {
    return "This request was declined. No repair progress updates are available for this request.";
  }
  return "No public customer updates have been posted yet. Check back soon.";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function TrackingResult({ view }: { view: PublicRepairView }) {
  const [latestUpdate, ...earlierUpdates] = view.customerUpdates;

  return (
    <section aria-live="polite" className="space-y-5">
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="border-b border-border/80 bg-muted/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                {view.providerDisplayName}
              </p>
              <CardTitle className="mt-2 text-2xl">
                {view.deviceSummary}
              </CardTitle>
            </div>
            <span
              className={cn(
                "inline-flex w-fit rounded-full border px-3 py-1.5 text-xs font-semibold",
                STATUS_STYLES[view.currentStatus] ??
                  "border-border bg-muted text-muted-foreground",
              )}
            >
              {view.statusLabel}
            </span>
          </div>
          <CardDescription className="pt-2 text-sm text-foreground">
            {view.statusDescription}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/80 bg-background/80 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Service arrangement
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {view.serviceModeLabel ?? "To be arranged with Provider"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background/80 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Latest update
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatDateTime(view.lastUpdatedAt)}
              </p>
            </div>
          </div>

          {view.handoverMessage && (
            <div className="rounded-2xl border border-emerald-700/20 bg-emerald-700/10 p-4 text-sm text-emerald-950">
              <p className="font-semibold">Next steps</p>
              <p className="mt-1">{view.handoverMessage}</p>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Progress updates
            </h2>
            {latestUpdate ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-border/80 bg-muted/20 p-4">
                  <p className="text-xs font-medium text-muted-foreground">
                    {formatDateTime(latestUpdate.createdAt)}
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {latestUpdate.message}
                  </p>
                </div>

                {earlierUpdates.length > 0 && (
                  <details className="rounded-2xl border border-border/80 bg-background/80 p-4 text-sm">
                    <summary className="cursor-pointer font-medium text-foreground">
                      Earlier updates ({earlierUpdates.length})
                    </summary>
                    <div className="mt-3 space-y-3 border-t border-border/80 pt-3">
                      {earlierUpdates.map((update, index) => (
                        <div
                          key={`${update.createdAt}-${index}`}
                          className="space-y-1"
                        >
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(update.createdAt)}
                          </p>
                          <p className="text-foreground">{update.message}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {getProgressEmptyMessage(view.currentStatus)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

export function TrackingForm({ initialCode = "" }: { initialCode?: string }) {
  const [state, formAction, pending] = useActionState<
    TrackRepairActionState,
    FormData
  >(trackRepairAction, null);

  const errorMessage =
    state?.outcome === "not-found" || state?.outcome === "unavailable"
      ? state.message
      : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Enter Tracking Code</CardTitle>
          <CardDescription>
            Enter your Tracking Code (<span className="font-mono">TRK-</span>)
            or Request Reference Code (<span className="font-mono">REQ-</span>).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trackingCode">Tracking Code / Request Code</Label>
              <Input
                id="trackingCode"
                name="trackingCode"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={32}
                defaultValue={initialCode}
                placeholder="e.g. TRK-0123... or REQ-0123..."
                className="h-11 font-mono uppercase tracking-wide"
                aria-invalid={Boolean(errorMessage)}
                aria-describedby={
                  errorMessage ? "tracking-code-error" : undefined
                }
                required
              />
              {errorMessage && (
                <p
                  id="tracking-code-error"
                  role="alert"
                  className="text-xs text-destructive"
                >
                  {errorMessage}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={pending}
              className="w-full sm:w-auto"
            >
              {pending ? (
                <>
                  <LoadingSpinner className="size-4" />
                  <span>Looking up...</span>
                </>
              ) : (
                "Track Status"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {state?.outcome === "found" && <TrackingResult view={state.view} />}
    </div>
  );
}
