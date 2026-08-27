"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import type { ProviderServiceMode } from "@/features/providers";
import { cn } from "@/lib/utils";

import {
  submitRepairRequestAction,
  type SubmitRepairRequestActionState,
} from "../actions";

const SERVICE_MODE_LABELS = {
  DROP_OFF: "Drop-off",
  MEETUP: "Meetup",
  HOME_SERVICE: "Home service",
  OTHER: "Other arrangement",
} as const;

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return Boolean(success);
    } catch {
      return false;
    }
  }

  return false;
}

function FieldError({
  field,
  state,
}: {
  field: string;
  state: SubmitRepairRequestActionState | null;
}) {
  const message = state?.fieldErrors?.[field];
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

function RequestReceiptCard({
  referenceCode,
  providerName,
}: {
  referenceCode: string;
  providerName: string;
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyCode = async () => {
    const success = await copyTextToClipboard(referenceCode);
    if (success) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleCopyLink = async () => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://tracknologia.com";
    const trackUrl = `${origin}/track?code=${encodeURIComponent(referenceCode)}`;

    const success = await copyTextToClipboard(trackUrl);
    if (success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  return (
    <Card className="border-primary/20 shadow-xs">
      <CardHeader>
        <div className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <span className="inline-block size-1.5 rounded-full bg-primary" />
          Request submitted
        </div>
        <CardTitle className="text-2xl">
          Request sent to {providerName}
        </CardTitle>
        <CardDescription>
          Provider will review your information before creating an active
          repair.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Request Reference Code
            </p>
            <p className="mt-1 font-mono text-xl font-bold tracking-wider text-foreground">
              {referenceCode}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant={copiedCode ? "default" : "outline"}
              size="sm"
              onClick={handleCopyCode}
              aria-label="Copy reference code to clipboard"
              className="w-full shrink-0 sm:w-auto"
            >
              {copiedCode ? (
                <>
                  <svg
                    className="size-4 text-emerald-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2.5"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  </svg>
                  <span>Code Copied!</span>
                </>
              ) : (
                <>
                  <svg
                    className="size-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                  <span>Copy Code</span>
                </>
              )}
            </Button>

            <Button
              type="button"
              variant={copiedLink ? "default" : "outline"}
              size="sm"
              onClick={handleCopyLink}
              aria-label="Copy tracking link to clipboard"
              className="w-full shrink-0 sm:w-auto"
            >
              {copiedLink ? (
                <>
                  <svg
                    className="size-4 text-emerald-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2.5"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m4.5 12.75 6 6 9-13.5"
                    />
                  </svg>
                  <span>Link Copied!</span>
                </>
              ) : (
                <>
                  <svg
                    className="size-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-3.35 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                    />
                  </svg>
                  <span>Copy Tracking Link</span>
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/50 p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">Track Anytime:</p>
          <p className="mt-1">
            You can check your request review status and subsequent repair
            updates on our Public Tracking page using this reference code.
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Link
            href={`/track?code=${encodeURIComponent(referenceCode)}`}
            prefetch={false}
            className={cn(
              buttonVariants({ variant: "default" }),
              "w-full sm:w-auto",
            )}
          >
            Track Status Now
          </Link>

          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
            className="w-full sm:w-auto"
          >
            Submit Another Request
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface RepairRequestFormProps {
  providerSlug: string;
  providerName: string;
  supportedDevices: string[];
  serviceModes: ProviderServiceMode[];
}

export function RepairRequestForm({
  providerSlug,
  providerName,
  supportedDevices,
  serviceModes,
}: RepairRequestFormProps) {
  const [state, formAction, pending] = useActionState<
    SubmitRepairRequestActionState | null,
    FormData
  >(submitRepairRequestAction.bind(null, providerSlug), null);

  const [selectedServiceMode, setSelectedServiceMode] = useState<string>(
    serviceModes[0]?.mode ?? "DROP_OFF",
  );

  if (state?.receipt) {
    return (
      <RequestReceiptCard
        referenceCode={state.receipt.referenceCode}
        providerName={providerName}
      />
    );
  }

  return (
    <Card className="border-border/80 shadow-xs">
      <CardHeader>
        <CardTitle className="text-xl">Request Repair Service</CardTitle>
        <CardDescription>
          Provide device details and problem description to help {providerName}{" "}
          prepare for your repair.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-6">
          {state?.error && (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {state.error}
            </div>
          )}

          {/* Contact Details */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Your Contact Information
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customerName">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customerName"
                  name="customerName"
                  required
                  defaultValue={state?.values?.customerName ?? ""}
                  placeholder="e.g. Maria Santos"
                  autoComplete="name"
                />
                <FieldError field="customerName" state={state} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customerPhone">
                  Phone Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customerPhone"
                  name="customerPhone"
                  type="tel"
                  required
                  defaultValue={state?.values?.customerPhone ?? ""}
                  placeholder="e.g. 0917 123 4567"
                  autoComplete="tel"
                />
                <FieldError field="customerPhone" state={state} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerEmail">Email Address (Optional)</Label>
              <Input
                id="customerEmail"
                name="customerEmail"
                type="email"
                defaultValue={state?.values?.customerEmail ?? ""}
                placeholder="e.g. maria@example.com"
                autoComplete="email"
              />
              <FieldError field="customerEmail" state={state} />
            </div>
          </div>

          {/* Device Details */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Device Information
            </h2>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="deviceType">
                  Device Type <span className="text-destructive">*</span>
                </Label>
                {supportedDevices.length > 0 ? (
                  <select
                    id="deviceType"
                    name="deviceType"
                    required
                    defaultValue={
                      state?.values?.deviceType ?? supportedDevices[0]
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {supportedDevices.map((device) => (
                      <option key={device} value={device}>
                        {device}
                      </option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                ) : (
                  <Input
                    id="deviceType"
                    name="deviceType"
                    required
                    defaultValue={state?.values?.deviceType ?? ""}
                    placeholder="e.g. Smartphone, Laptop"
                  />
                )}
                <FieldError field="deviceType" state={state} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  name="brand"
                  defaultValue={state?.values?.brand ?? ""}
                  placeholder="e.g. Apple, Samsung"
                />
                <FieldError field="brand" state={state} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  name="model"
                  defaultValue={state?.values?.model ?? ""}
                  placeholder="e.g. iPhone 13, Galaxy S22"
                />
                <FieldError field="model" state={state} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="colorVariant">Color / Variant</Label>
                <Input
                  id="colorVariant"
                  name="colorVariant"
                  defaultValue={state?.values?.colorVariant ?? ""}
                  placeholder="e.g. Space Gray, 128GB"
                />
                <FieldError field="colorVariant" state={state} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serialNumber">
                  Serial Number / IMEI (Optional)
                </Label>
                <Input
                  id="serialNumber"
                  name="serialNumber"
                  defaultValue={state?.values?.serialNumber ?? ""}
                  placeholder="e.g. F2LZ..."
                />
                <FieldError field="serialNumber" state={state} />
              </div>
            </div>
          </div>

          {/* Problem Details */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Problem Description
            </h2>

            <div className="space-y-2">
              <Label htmlFor="reportedProblem">
                What is the issue? <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reportedProblem"
                name="reportedProblem"
                required
                rows={3}
                defaultValue={state?.values?.reportedProblem ?? ""}
                placeholder="Describe what is wrong with the device (e.g. Screen cracked, battery draining fast, won't turn on)..."
              />
              <FieldError field="reportedProblem" state={state} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="problemStartedAt">
                  When did it start? (Optional)
                </Label>
                <Input
                  id="problemStartedAt"
                  name="problemStartedAt"
                  defaultValue={state?.values?.problemStartedAt ?? ""}
                  placeholder="e.g. Yesterday, 2 weeks ago"
                />
                <FieldError field="problemStartedAt" state={state} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="precedingEvent">
                  What happened before? (Optional)
                </Label>
                <Input
                  id="precedingEvent"
                  name="precedingEvent"
                  defaultValue={state?.values?.precedingEvent ?? ""}
                  placeholder="e.g. Dropped on concrete, water splash"
                />
                <FieldError field="precedingEvent" state={state} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="troubleshootingAttempted">
                Troubleshooting Attempted (Optional)
              </Label>
              <Input
                id="troubleshootingAttempted"
                name="troubleshootingAttempted"
                defaultValue={state?.values?.troubleshootingAttempted ?? ""}
                placeholder="e.g. Restarted device, charged with different cable"
              />
              <FieldError field="troubleshootingAttempted" state={state} />
            </div>
          </div>

          {/* Service Mode Preference */}
          {serviceModes.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Service Arrangement Preference
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                {serviceModes.map((sm) => (
                  <label
                    key={sm.mode}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${
                      selectedServiceMode === sm.mode
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border hover:border-border/80"
                    }`}
                  >
                    <input
                      type="radio"
                      name="preferredServiceMode"
                      value={sm.mode}
                      checked={selectedServiceMode === sm.mode}
                      onChange={() => setSelectedServiceMode(sm.mode)}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <span className="font-medium">
                        {SERVICE_MODE_LABELS[sm.mode] ?? sm.mode}
                      </span>
                      {sm.details && (
                        <p className="text-xs text-muted-foreground">
                          {sm.details}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              <div className="space-y-2">
                <Label htmlFor="serviceModeDetails">
                  Arrangement Notes (Optional)
                </Label>
                <Input
                  id="serviceModeDetails"
                  name="serviceModeDetails"
                  defaultValue={state?.values?.serviceModeDetails ?? ""}
                  placeholder="e.g. Preferred time, drop-off day, landmark"
                />
                <FieldError field="serviceModeDetails" state={state} />
              </div>
            </div>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? (
              <>
                <LoadingSpinner className="size-4" />
                <span>Submitting Request...</span>
              </>
            ) : (
              "Submit Repair Request"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
