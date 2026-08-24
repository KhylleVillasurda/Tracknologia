import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProviderServiceMode, ServiceMode } from "@/features/providers";
import type { DirectRepairInput } from "@/features/repairs";

export type RepairFieldValues = Partial<
  Record<keyof DirectRepairInput, string>
>;

interface RepairFieldsProps {
  values?: RepairFieldValues;
  fieldErrors?: Record<string, string>;
  serviceModes: ProviderServiceMode[];
  recordedServiceMode?: ServiceMode | null;
  disabled?: boolean;
}

function FieldError({
  name,
  errors,
}: {
  name: keyof DirectRepairInput;
  errors?: Record<string, string>;
}) {
  const message = errors?.[name];
  return message ? (
    <p className="text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null;
}

const SERVICE_MODE_LABELS: Record<ServiceMode, string> = {
  DROP_OFF: "Drop-off",
  MEETUP: "Meetup",
  HOME_SERVICE: "Home service",
  OTHER: "Other arrangement",
};

function modeLabel(mode: ServiceMode) {
  return SERVICE_MODE_LABELS[mode];
}

export function RepairFields({
  values = {},
  fieldErrors,
  serviceModes,
  recordedServiceMode,
  disabled = false,
}: RepairFieldsProps) {
  const historicalServiceMode =
    recordedServiceMode &&
    !serviceModes.some((mode) => mode.mode === recordedServiceMode)
      ? recordedServiceMode
      : null;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Customer information</h2>
          <p className="text-sm text-muted-foreground">
            Contact snapshot for this Repair only.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customerName">Customer name</Label>
            <Input
              id="customerName"
              name="customerName"
              defaultValue={values.customerName ?? ""}
              required
              maxLength={120}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors?.customerName)}
            />
            <FieldError name="customerName" errors={fieldErrors} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerPhone">Phone</Label>
            <Input
              id="customerPhone"
              name="customerPhone"
              type="tel"
              defaultValue={values.customerPhone ?? ""}
              required
              maxLength={40}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors?.customerPhone)}
            />
            <FieldError name="customerPhone" errors={fieldErrors} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customerEmail">Email (optional)</Label>
            <Input
              id="customerEmail"
              name="customerEmail"
              type="email"
              defaultValue={values.customerEmail ?? ""}
              maxLength={254}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors?.customerEmail)}
            />
            <FieldError name="customerEmail" errors={fieldErrors} />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Device Snapshot</h2>
          <p className="text-sm text-muted-foreground">
            Record the device and anything received with it.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="deviceType">Device type</Label>
            <Input
              id="deviceType"
              name="deviceType"
              defaultValue={values.deviceType ?? ""}
              required
              maxLength={80}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors?.deviceType)}
            />
            <FieldError name="deviceType" errors={fieldErrors} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand">Brand</Label>
            <Input
              id="brand"
              name="brand"
              defaultValue={values.brand ?? ""}
              maxLength={80}
              disabled={disabled}
            />
            <FieldError name="brand" errors={fieldErrors} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              name="model"
              defaultValue={values.model ?? ""}
              maxLength={80}
              disabled={disabled}
            />
            <FieldError name="model" errors={fieldErrors} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serialNumber">Serial number</Label>
            <Input
              id="serialNumber"
              name="serialNumber"
              defaultValue={values.serialNumber ?? ""}
              maxLength={120}
              disabled={disabled}
            />
            <FieldError name="serialNumber" errors={fieldErrors} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="colorVariant">Color / variant</Label>
            <Input
              id="colorVariant"
              name="colorVariant"
              defaultValue={values.colorVariant ?? ""}
              maxLength={80}
              disabled={disabled}
            />
            <FieldError name="colorVariant" errors={fieldErrors} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deviceSpecs">Specifications</Label>
            <Input
              id="deviceSpecs"
              name="deviceSpecs"
              defaultValue={values.deviceSpecs ?? ""}
              maxLength={1000}
              disabled={disabled}
            />
            <FieldError name="deviceSpecs" errors={fieldErrors} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="physicalCondition">Physical condition</Label>
            <Textarea
              id="physicalCondition"
              name="physicalCondition"
              defaultValue={values.physicalCondition ?? ""}
              maxLength={2000}
              disabled={disabled}
              rows={3}
            />
            <FieldError name="physicalCondition" errors={fieldErrors} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accessoriesReceived">Accessories received</Label>
            <Textarea
              id="accessoriesReceived"
              name="accessoriesReceived"
              defaultValue={values.accessoriesReceived ?? ""}
              maxLength={1000}
              disabled={disabled}
              rows={3}
            />
            <FieldError name="accessoriesReceived" errors={fieldErrors} />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Repair information</h2>
          <p className="text-sm text-muted-foreground">
            Keep the Customer&apos;s Reported Problem separate from Provider
            Diagnosis.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="reportedProblem">Reported Problem</Label>
            <Textarea
              id="reportedProblem"
              name="reportedProblem"
              defaultValue={values.reportedProblem ?? ""}
              required
              maxLength={2000}
              disabled={disabled}
              rows={5}
              aria-invalid={Boolean(fieldErrors?.reportedProblem)}
            />
            <FieldError name="reportedProblem" errors={fieldErrors} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="initialObservation">Initial observation</Label>
            <Textarea
              id="initialObservation"
              name="initialObservation"
              defaultValue={values.initialObservation ?? ""}
              maxLength={2000}
              disabled={disabled}
              rows={5}
            />
            <FieldError name="initialObservation" errors={fieldErrors} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="diagnosis">Diagnosis</Label>
            <Textarea
              id="diagnosis"
              name="diagnosis"
              defaultValue={values.diagnosis ?? ""}
              maxLength={2000}
              disabled={disabled}
              rows={5}
            />
            <FieldError name="diagnosis" errors={fieldErrors} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="internalNotes">Internal Notes</Label>
            <Textarea
              id="internalNotes"
              name="internalNotes"
              defaultValue={values.internalNotes ?? ""}
              maxLength={4000}
              disabled={disabled}
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              Provider-private. Never shown in public Tracking.
            </p>
            <FieldError name="internalNotes" errors={fieldErrors} />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Service arrangement</h2>
          <p className="text-sm text-muted-foreground">
            Select one configured Service Mode when applicable.
          </p>
        </div>
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="sr-only">Service Mode</legend>
          <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <input
              type="radio"
              name="serviceMode"
              value=""
              defaultChecked={!values.serviceMode}
              className="mt-1"
            />
            <span>No Service Mode selected</span>
          </label>
          {historicalServiceMode ? (
            <label className="flex items-start gap-3 rounded-xl border border-amber-700/20 bg-amber-700/5 p-3 text-sm">
              <input
                type="radio"
                name="serviceMode"
                value={historicalServiceMode}
                defaultChecked={values.serviceMode === historicalServiceMode}
                className="mt-1"
              />
              <span>
                <span className="font-medium">
                  {modeLabel(historicalServiceMode)}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Recorded on this Repair; no longer offered.
                </span>
              </span>
            </label>
          ) : null}
          {serviceModes.map((mode) => (
            <label
              key={mode.mode}
              className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm"
            >
              <input
                type="radio"
                name="serviceMode"
                value={mode.mode}
                defaultChecked={values.serviceMode === mode.mode}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{modeLabel(mode.mode)}</span>
                {mode.details ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {mode.details}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
        <FieldError name="serviceMode" errors={fieldErrors} />
        <div className="space-y-2">
          <Label htmlFor="serviceModeDetails">Arrangement details</Label>
          <Input
            id="serviceModeDetails"
            name="serviceModeDetails"
            defaultValue={values.serviceModeDetails ?? ""}
            maxLength={240}
            disabled={disabled}
          />
          <FieldError name="serviceModeDetails" errors={fieldErrors} />
        </div>
      </section>
    </div>
  );
}
