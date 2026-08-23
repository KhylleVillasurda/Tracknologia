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
import type { RepairRequestDetail } from "@/features/repair-requests";

import {
  acceptRepairRequestAction,
  declineRepairRequestAction,
  type RepairRequestActionState,
} from "../../actions";

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
  state: RepairRequestActionState | null;
}) {
  const message = state?.fieldErrors?.[field];
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

interface RequestDecisionFormProps {
  request: RepairRequestDetail;
  serviceModes: ProviderServiceMode[];
}

export function RequestDecisionForm({
  request,
  serviceModes,
}: RequestDecisionFormProps) {
  const [acceptState, acceptAction, acceptPending] = useActionState(
    acceptRepairRequestAction,
    null,
  );
  const [declineState, declineAction, declinePending] = useActionState(
    declineRepairRequestAction,
    null,
  );
  const preferredModeSupported = serviceModes.some(
    (mode) => mode.mode === request.preferredServiceMode,
  );

  if (acceptState?.acceptedRepair) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">Repair created</CardTitle>
          <CardDescription>
            Request is accepted. New Repair starts IN_PROGRESS.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Ticket Number
            </p>
            <p className="mt-1 font-mono font-semibold">
              {acceptState.acceptedRepair.ticketNumber}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/40 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Tracking Code
            </p>
            <p className="mt-1 break-all font-mono font-semibold">
              {acceptState.acceptedRepair.trackingCode}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (declineState?.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request declined</CardTitle>
          <CardDescription>
            No Repair was created. Request cannot be processed again.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle>Verify and create Repair</CardTitle>
          <CardDescription>
            Values below become authoritative Repair snapshot. Correct customer
            input and add Provider-only intake details before accepting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={acceptAction} className="space-y-6">
            <input type="hidden" name="requestId" value={request.id} />

            {acceptState?.error && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {acceptState.error}
              </div>
            )}

            <section className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">
                  Verified customer and device
                </h3>
                <p className="text-xs text-muted-foreground">
                  Review customer-reported values before they become Repair
                  data.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="customerName">Customer name *</Label>
                  <Input
                    id="customerName"
                    name="customerName"
                    defaultValue={request.customerName}
                    maxLength={120}
                    required
                    disabled={acceptPending}
                  />
                  <FieldError field="customerName" state={acceptState} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerPhone">Customer phone *</Label>
                  <Input
                    id="customerPhone"
                    name="customerPhone"
                    type="tel"
                    defaultValue={request.customerPhone}
                    maxLength={40}
                    required
                    disabled={acceptPending}
                  />
                  <FieldError field="customerPhone" state={acceptState} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="customerEmail">Customer email</Label>
                  <Input
                    id="customerEmail"
                    name="customerEmail"
                    type="email"
                    defaultValue={request.customerEmail ?? ""}
                    maxLength={254}
                    disabled={acceptPending}
                  />
                  <FieldError field="customerEmail" state={acceptState} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deviceType">Device type *</Label>
                  <Input
                    id="deviceType"
                    name="deviceType"
                    defaultValue={request.deviceType}
                    maxLength={80}
                    required
                    disabled={acceptPending}
                  />
                  <FieldError field="deviceType" state={acceptState} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand">Brand</Label>
                  <Input
                    id="brand"
                    name="brand"
                    defaultValue={request.brand ?? ""}
                    maxLength={80}
                    disabled={acceptPending}
                  />
                  <FieldError field="brand" state={acceptState} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    name="model"
                    defaultValue={request.model ?? ""}
                    maxLength={80}
                    disabled={acceptPending}
                  />
                  <FieldError field="model" state={acceptState} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serialNumber">Serial number</Label>
                  <Input
                    id="serialNumber"
                    name="serialNumber"
                    defaultValue={request.serialNumber ?? ""}
                    maxLength={120}
                    disabled={acceptPending}
                  />
                  <FieldError field="serialNumber" state={acceptState} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="colorVariant">Color or variant</Label>
                  <Input
                    id="colorVariant"
                    name="colorVariant"
                    defaultValue={request.colorVariant ?? ""}
                    maxLength={80}
                    disabled={acceptPending}
                  />
                  <FieldError field="colorVariant" state={acceptState} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="deviceSpecs">Device specifications</Label>
                  <Textarea
                    id="deviceSpecs"
                    name="deviceSpecs"
                    defaultValue={request.deviceSpecs ?? ""}
                    maxLength={1000}
                    disabled={acceptPending}
                  />
                  <FieldError field="deviceSpecs" state={acceptState} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="reportedProblem">Reported Problem *</Label>
                  <Textarea
                    id="reportedProblem"
                    name="reportedProblem"
                    defaultValue={request.reportedProblem}
                    maxLength={2000}
                    required
                    disabled={acceptPending}
                  />
                  <FieldError field="reportedProblem" state={acceptState} />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-border/80 bg-muted/30 p-4 sm:p-5">
              <div>
                <h3 className="font-semibold text-foreground">
                  Provider intake information
                </h3>
                <p className="text-xs text-muted-foreground">
                  Technical and internal fields remain Provider-private.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="physicalCondition">Physical condition</Label>
                  <Textarea
                    id="physicalCondition"
                    name="physicalCondition"
                    maxLength={2000}
                    disabled={acceptPending}
                  />
                  <FieldError field="physicalCondition" state={acceptState} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accessoriesReceived">
                    Accessories received
                  </Label>
                  <Textarea
                    id="accessoriesReceived"
                    name="accessoriesReceived"
                    maxLength={1000}
                    disabled={acceptPending}
                  />
                  <FieldError field="accessoriesReceived" state={acceptState} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="initialObservation">
                    Initial observation
                  </Label>
                  <Textarea
                    id="initialObservation"
                    name="initialObservation"
                    maxLength={2000}
                    disabled={acceptPending}
                  />
                  <FieldError field="initialObservation" state={acceptState} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="diagnosis">Diagnosis</Label>
                  <Textarea
                    id="diagnosis"
                    name="diagnosis"
                    maxLength={2000}
                    disabled={acceptPending}
                  />
                  <FieldError field="diagnosis" state={acceptState} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="internalNotes">Internal Notes</Label>
                  <Textarea
                    id="internalNotes"
                    name="internalNotes"
                    maxLength={4000}
                    disabled={acceptPending}
                  />
                  <FieldError field="internalNotes" state={acceptState} />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="font-semibold text-foreground">
                  Service arrangement
                </h3>
                <p className="text-xs text-muted-foreground">
                  Customer preference may be changed before Repair creation.
                </p>
              </div>
              {serviceModes.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/80 p-4">
                    <input
                      type="radio"
                      name="serviceMode"
                      value=""
                      defaultChecked={!preferredModeSupported}
                      className="mt-1 accent-primary"
                      disabled={acceptPending}
                    />
                    <span className="text-sm font-medium">No Service Mode</span>
                  </label>
                  {serviceModes.map((mode) => (
                    <label
                      key={mode.mode}
                      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/80 p-4"
                    >
                      <input
                        type="radio"
                        name="serviceMode"
                        value={mode.mode}
                        defaultChecked={
                          preferredModeSupported &&
                          request.preferredServiceMode === mode.mode
                        }
                        className="mt-1 accent-primary"
                        disabled={acceptPending}
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {SERVICE_MODE_LABELS[mode.mode]}
                        </span>
                        {mode.details && (
                          <span className="text-xs text-muted-foreground">
                            {mode.details}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Provider has no configured Service Modes. Repair can be
                  created without one.
                </p>
              )}
              <FieldError field="serviceMode" state={acceptState} />
              <div className="space-y-2">
                <Label htmlFor="serviceModeDetails">Arrangement details</Label>
                <Input
                  id="serviceModeDetails"
                  name="serviceModeDetails"
                  defaultValue={
                    preferredModeSupported
                      ? (request.serviceModeDetails ?? "")
                      : ""
                  }
                  maxLength={240}
                  disabled={acceptPending}
                />
                <FieldError field="serviceModeDetails" state={acceptState} />
              </div>
            </section>

            <Button type="submit" size="lg" disabled={acceptPending}>
              {acceptPending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" /> Creating Repair...
                </span>
              ) : (
                "Accept & Create Repair"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Decline Request</CardTitle>
          <CardDescription>
            Declining is terminal for Request and creates no Repair.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={declineAction}
            onSubmit={(event) => {
              if (!window.confirm("Decline this Repair Request?")) {
                event.preventDefault();
              }
            }}
            className="space-y-3"
          >
            <input type="hidden" name="requestId" value={request.id} />
            {declineState?.error && (
              <p role="alert" className="text-sm text-destructive">
                {declineState.error}
              </p>
            )}
            <Button
              type="submit"
              variant="destructive"
              disabled={declinePending || acceptPending}
            >
              {declinePending ? "Declining..." : "Decline Request"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
