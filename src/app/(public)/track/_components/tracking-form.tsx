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
import type { RepairStatus } from "@/features/repairs";
import type { PublicRepairView } from "@/features/tracking";
import { cn } from "@/lib/utils";

import { trackRepairAction, type TrackRepairActionState } from "../actions";

const STATUS_STYLES: Record<RepairStatus, string> = {
  IN_PROGRESS: "border-primary/20 bg-primary/10 text-primary",
  WAITING_FOR_PARTS: "border-amber-700/20 bg-amber-700/10 text-amber-700",
  AWAITING_APPROVAL: "border-orange-700/20 bg-orange-700/10 text-orange-700",
  READY: "border-emerald-700/20 bg-emerald-700/10 text-emerald-700",
  COMPLETED: "border-border bg-muted text-muted-foreground",
};

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
                STATUS_STYLES[view.currentStatus],
              )}
            >
              {view.statusLabel}
            </span>
          </div>
          <CardDescription className="pt-2 text-sm leading-relaxed">
            {view.statusDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <dl className="grid gap-4 rounded-2xl border border-border/80 bg-muted/30 p-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Last updated
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                <time dateTime={view.lastUpdatedAt}>
                  {formatDateTime(view.lastUpdatedAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Service Mode
              </dt>
              <dd className="mt-1 text-sm font-medium text-foreground">
                {view.serviceModeLabel ?? "Arrangement with Provider"}
              </dd>
            </div>
          </dl>

          {view.handoverMessage && (
            <div className="rounded-2xl border border-emerald-700/20 bg-emerald-700/10 p-4 text-sm leading-relaxed text-emerald-800">
              {view.handoverMessage}
            </div>
          )}

          <div>
            <h2 className="text-base font-semibold text-foreground">
              Latest Customer Update
            </h2>
            {latestUpdate ? (
              <div className="mt-3 rounded-2xl border border-border/80 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {latestUpdate.message}
                </p>
                <time
                  dateTime={latestUpdate.createdAt}
                  className="mt-2 block text-xs text-muted-foreground"
                >
                  {formatDateTime(latestUpdate.createdAt)}
                </time>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Provider has not posted a Customer Update yet. Current status
                above remains latest available progress.
              </p>
            )}
          </div>

          {earlierUpdates.length > 0 && (
            <details className="rounded-2xl border border-border/80 p-4">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Earlier updates ({earlierUpdates.length})
              </summary>
              <ol className="mt-4 space-y-4 border-l border-border pl-4">
                {earlierUpdates.map((update, index) => (
                  <li key={`${update.createdAt}-${index}`}>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {update.message}
                    </p>
                    <time
                      dateTime={update.createdAt}
                      className="mt-1 block text-xs text-muted-foreground"
                    >
                      {formatDateTime(update.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

export function TrackingForm() {
  const [state, formAction, pending] = useActionState<
    TrackRepairActionState,
    FormData
  >(trackRepairAction, null);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Enter Tracking Code</CardTitle>
          <CardDescription>
            Code starts with <span className="font-mono">TRK-</span> and is
            different from Ticket Number or Request Reference.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="trackingCode">Tracking Code</Label>
              <Input
                id="trackingCode"
                name="trackingCode"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={32}
                placeholder="TRK-0123456789ABCDEF01234567"
                className="h-11 font-mono uppercase tracking-wide"
                required
                disabled={pending}
                aria-describedby="tracking-help"
              />
              <p id="tracking-help" className="text-xs text-muted-foreground">
                Use code exactly as provided by your Repair Provider.
              </p>
            </div>

            {state && state.outcome !== "found" && (
              <div
                role="alert"
                className={cn(
                  "rounded-2xl border p-4 text-sm",
                  state.outcome === "not-found"
                    ? "border-border bg-muted/40 text-foreground"
                    : "border-destructive/20 bg-destructive/10 text-destructive",
                )}
              >
                {state.message}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full sm:w-auto"
              disabled={pending}
            >
              {pending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" /> Checking Repair...
                </span>
              ) : (
                "Track Repair"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {state?.outcome === "found" && <TrackingResult view={state.view} />}
    </div>
  );
}
