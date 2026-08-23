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
import { Textarea } from "@/components/ui/textarea";
import type { ProviderServiceMode } from "@/features/providers";

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
  const submitAction = submitRepairRequestAction.bind(null, providerSlug);
  const [state, formAction, pending] = useActionState(submitAction, null);

  if (state?.receipt) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <div className="mb-2 inline-flex w-fit rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Request submitted
          </div>
          <CardTitle>Request sent to {providerName}</CardTitle>
          <CardDescription>
            Provider will review your information before any Repair is created.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Request Reference
            </p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-wide text-foreground">
              {state.receipt.referenceCode}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Save this reference for your records. It is not a Repair Tracking
            Code. Tracking begins only after Provider accepts Request and
            creates Repair.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive"
        >
          {state.error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your contact details</CardTitle>
          <CardDescription>
            Give Provider a reliable way to follow up about Request.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customerName">Full name *</Label>
            <Input
              id="customerName"
              name="customerName"
              autoComplete="name"
              defaultValue={state?.values?.customerName}
              maxLength={120}
              required
              disabled={pending}
            />
            <FieldError field="customerName" state={state} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerPhone">Phone number *</Label>
            <Input
              id="customerPhone"
              name="customerPhone"
              type="tel"
              autoComplete="tel"
              defaultValue={state?.values?.customerPhone}
              maxLength={40}
              required
              disabled={pending}
            />
            <FieldError field="customerPhone" state={state} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerEmail">Email (optional)</Label>
            <Input
              id="customerEmail"
              name="customerEmail"
              type="email"
              autoComplete="email"
              defaultValue={state?.values?.customerEmail}
              maxLength={254}
              disabled={pending}
            />
            <FieldError field="customerEmail" state={state} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Device details</CardTitle>
          <CardDescription>
            Device type is required. Add other identifiers when known.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="deviceType">Device type *</Label>
            <Input
              id="deviceType"
              name="deviceType"
              list={
                supportedDevices.length > 0 ? "supported-devices" : undefined
              }
              placeholder="Phone, laptop, game console..."
              defaultValue={state?.values?.deviceType}
              maxLength={80}
              required
              disabled={pending}
            />
            {supportedDevices.length > 0 && (
              <datalist id="supported-devices">
                {supportedDevices.map((device) => (
                  <option value={device} key={device} />
                ))}
              </datalist>
            )}
            <FieldError field="deviceType" state={state} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand">Brand</Label>
            <Input
              id="brand"
              name="brand"
              defaultValue={state?.values?.brand}
              maxLength={80}
              disabled={pending}
            />
            <FieldError field="brand" state={state} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              name="model"
              defaultValue={state?.values?.model}
              maxLength={80}
              disabled={pending}
            />
            <FieldError field="model" state={state} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serialNumber">Serial number</Label>
            <Input
              id="serialNumber"
              name="serialNumber"
              defaultValue={state?.values?.serialNumber}
              maxLength={120}
              disabled={pending}
            />
            <FieldError field="serialNumber" state={state} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="colorVariant">Color or variant</Label>
            <Input
              id="colorVariant"
              name="colorVariant"
              defaultValue={state?.values?.colorVariant}
              maxLength={80}
              disabled={pending}
            />
            <FieldError field="colorVariant" state={state} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="deviceSpecs">Specifications</Label>
            <Textarea
              id="deviceSpecs"
              name="deviceSpecs"
              defaultValue={state?.values?.deviceSpecs}
              maxLength={1000}
              disabled={pending}
            />
            <FieldError field="deviceSpecs" state={state} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reported Problem</CardTitle>
          <CardDescription>
            Describe what you observe. Provider will verify technical details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reportedProblem">What is happening? *</Label>
            <Textarea
              id="reportedProblem"
              name="reportedProblem"
              placeholder="Symptoms, error messages, intermittent behavior..."
              defaultValue={state?.values?.reportedProblem}
              maxLength={2000}
              required
              disabled={pending}
            />
            <FieldError field="reportedProblem" state={state} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="problemStartedAt">When did it start?</Label>
            <Input
              id="problemStartedAt"
              name="problemStartedAt"
              defaultValue={state?.values?.problemStartedAt}
              maxLength={200}
              disabled={pending}
            />
            <FieldError field="problemStartedAt" state={state} />
          </div>
          <details className="rounded-2xl border border-border/80 p-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Add more problem context (optional)
            </summary>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="precedingEvent">
                  What happened before problem started?
                </Label>
                <Textarea
                  id="precedingEvent"
                  name="precedingEvent"
                  defaultValue={state?.values?.precedingEvent}
                  maxLength={1000}
                  disabled={pending}
                />
                <FieldError field="precedingEvent" state={state} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="troubleshootingAttempted">
                  Troubleshooting already attempted
                </Label>
                <Textarea
                  id="troubleshootingAttempted"
                  name="troubleshootingAttempted"
                  defaultValue={state?.values?.troubleshootingAttempted}
                  maxLength={1000}
                  disabled={pending}
                />
                <FieldError field="troubleshootingAttempted" state={state} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="additionalInformation">
                  Additional information
                </Label>
                <Textarea
                  id="additionalInformation"
                  name="additionalInformation"
                  defaultValue={state?.values?.additionalInformation}
                  maxLength={2000}
                  disabled={pending}
                />
                <FieldError field="additionalInformation" state={state} />
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      {serviceModes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Preferred Service Mode</CardTitle>
            <CardDescription>
              Preference is not final until Provider reviews Request.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/80 p-4">
                <input
                  type="radio"
                  name="preferredServiceMode"
                  value=""
                  defaultChecked={!state?.values?.preferredServiceMode}
                  className="mt-1 accent-primary"
                  disabled={pending}
                />
                <span className="text-sm font-medium text-foreground">
                  No preference
                </span>
              </label>
              {serviceModes.map((serviceMode) => (
                <label
                  key={serviceMode.mode}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/80 p-4"
                >
                  <input
                    type="radio"
                    name="preferredServiceMode"
                    value={serviceMode.mode}
                    defaultChecked={
                      state?.values?.preferredServiceMode === serviceMode.mode
                    }
                    className="mt-1 accent-primary"
                    disabled={pending}
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {SERVICE_MODE_LABELS[serviceMode.mode]}
                    </span>
                    {serviceMode.details && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {serviceMode.details}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <FieldError field="preferredServiceMode" state={state} />
            <div className="space-y-2">
              <Label htmlFor="serviceModeDetails">Arrangement details</Label>
              <Input
                id="serviceModeDetails"
                name="serviceModeDetails"
                placeholder="Location, schedule preference, or other context"
                defaultValue={state?.values?.serviceModeDetails}
                maxLength={240}
                disabled={pending}
              />
              <FieldError field="serviceModeDetails" state={state} />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 text-sm text-muted-foreground">
        Submitting creates Request only. Provider may verify or correct details,
        accept and create Repair, or decline Request.
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full sm:w-auto"
        disabled={pending}
      >
        {pending ? (
          <span className="flex items-center gap-2">
            <LoadingSpinner size="sm" /> Submitting Request...
          </span>
        ) : (
          "Submit Repair Request"
        )}
      </Button>
    </form>
  );
}
