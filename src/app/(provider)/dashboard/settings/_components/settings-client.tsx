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
import type {
  Provider,
  ProviderServiceMode,
  ProviderUserProfile,
} from "@/features/providers";

import {
  updatePersonalProfileAction,
  updateProviderProfileAction,
  updateServiceModesAction,
  type SettingsActionState,
} from "../actions";

const SERVICE_MODE_OPTIONS = [
  { value: "DROP_OFF", label: "Drop-off" },
  { value: "MEETUP", label: "Meetup" },
  { value: "HOME_SERVICE", label: "Home service" },
  { value: "OTHER", label: "Other arrangement" },
] as const;

function ActionMessage({ state }: { state: SettingsActionState | null }) {
  if (state?.error) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive">
        {state.error}
      </div>
    );
  }

  if (state?.success) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs font-medium text-primary">
        {state.success}
      </div>
    );
  }

  return null;
}

interface SettingsClientProps {
  provider: Provider;
  personalProfile: ProviderUserProfile;
  serviceModes: ProviderServiceMode[];
  canManageProvider: boolean;
}

export function SettingsClient({
  provider,
  personalProfile,
  serviceModes,
  canManageProvider,
}: SettingsClientProps) {
  const [personalState, personalAction, personalPending] = useActionState(
    updatePersonalProfileAction,
    null,
  );
  const [providerState, providerAction, providerPending] = useActionState(
    updateProviderProfileAction,
    null,
  );
  const [modeState, modeAction, modePending] = useActionState(
    updateServiceModesAction,
    null,
  );
  const configuredModes = new Map(
    serviceModes.map((mode) => [mode.mode, mode.details]),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Profile</CardTitle>
          <CardDescription>
            This is your personal identity within the Provider workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={personalAction} className="space-y-4">
            <ActionMessage state={personalState} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="person-displayName">Full Name</Label>
                <Input
                  id="person-displayName"
                  name="displayName"
                  defaultValue={personalProfile.displayName}
                  required
                  disabled={personalPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="person-contactPhone">Contact Phone</Label>
                <Input
                  id="person-contactPhone"
                  name="contactPhone"
                  type="tel"
                  defaultValue={personalProfile.contactPhone ?? ""}
                  disabled={personalPending}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-avatarUrl">Avatar URL</Label>
              <Input
                id="person-avatarUrl"
                name="avatarUrl"
                type="url"
                defaultValue={personalProfile.avatarUrl ?? ""}
                placeholder="https://example.com/avatar.jpg"
                disabled={personalPending}
              />
            </div>
            <Button type="submit" disabled={personalPending}>
              {personalPending ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner size="sm" /> Saving profile...
                </span>
              ) : (
                "Save Personal Profile"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {!canManageProvider && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Provider Configuration</CardTitle>
            <CardDescription>
              Only a Provider Owner can change business and Service Mode
              settings.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {canManageProvider && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Provider Profile</CardTitle>
              <CardDescription>
                Provider type and slug are stable identity fields. These
                operating details may be updated by an Owner.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={providerAction} className="space-y-4">
                <ActionMessage state={providerState} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="provider-type">Provider Type</Label>
                    <Input
                      id="provider-type"
                      value={
                        provider.providerType === "SHOP"
                          ? "Repair Shop"
                          : "Independent Repairer"
                      }
                      disabled
                      readOnly
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-slug">Public Slug</Label>
                    <Input
                      id="provider-slug"
                      value={provider.slug}
                      disabled
                      readOnly
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider-displayName">Provider Name</Label>
                  <Input
                    id="provider-displayName"
                    name="displayName"
                    defaultValue={provider.displayName}
                    required
                    disabled={providerPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider-description">Description</Label>
                  <Textarea
                    id="provider-description"
                    name="description"
                    defaultValue={provider.description ?? ""}
                    maxLength={1000}
                    disabled={providerPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider-image">Profile Image URL</Label>
                  <Input
                    id="provider-image"
                    name="profileImageUrl"
                    type="url"
                    defaultValue={provider.profileImageUrl ?? ""}
                    placeholder="https://example.com/provider.jpg"
                    disabled={providerPending}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="provider-email">Contact Email</Label>
                    <Input
                      id="provider-email"
                      name="contactEmail"
                      type="email"
                      defaultValue={provider.contactEmail ?? ""}
                      disabled={providerPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-phone">Contact Phone</Label>
                    <Input
                      id="provider-phone"
                      name="contactPhone"
                      type="tel"
                      defaultValue={provider.contactPhone ?? ""}
                      disabled={providerPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-address">Public Address</Label>
                    <Input
                      id="provider-address"
                      name="publicAddress"
                      defaultValue={provider.publicAddress ?? ""}
                      disabled={providerPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-area">Service Area</Label>
                    <Input
                      id="provider-area"
                      name="serviceArea"
                      defaultValue={provider.serviceArea ?? ""}
                      disabled={providerPending}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider-devices">Supported Devices</Label>
                  <Input
                    id="provider-devices"
                    name="supportedDevices"
                    defaultValue={provider.supportedDevices.join(", ")}
                    placeholder="Smartphones, Laptops, Tablets"
                    disabled={providerPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    Separate device categories with commas.
                  </p>
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3">
                  <input
                    type="checkbox"
                    name="acceptingRequests"
                    defaultChecked={provider.acceptingRequests}
                    className="mt-0.5 rounded border-border accent-primary"
                    disabled={providerPending}
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      Accept new Repair Requests
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Include this Provider in public request surfaces.
                    </span>
                  </span>
                </label>
                <Button type="submit" disabled={providerPending}>
                  {providerPending ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="sm" /> Saving Provider...
                    </span>
                  ) : (
                    "Save Provider Profile"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Service Modes</CardTitle>
              <CardDescription>
                Choose how customers can arrange repairs with this Provider.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={modeAction} className="space-y-4">
                <ActionMessage state={modeState} />
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SERVICE_MODE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 p-3 text-sm font-medium"
                    >
                      <input
                        type="checkbox"
                        name="serviceModes"
                        value={option.value}
                        defaultChecked={configuredModes.has(option.value)}
                        className="rounded border-border accent-primary"
                        disabled={modePending}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mode-other-details">
                    Other Arrangement Details
                  </Label>
                  <Input
                    id="mode-other-details"
                    name="serviceModeDetails.OTHER"
                    defaultValue={configuredModes.get("OTHER") ?? ""}
                    maxLength={240}
                    disabled={modePending}
                  />
                </div>
                <Button type="submit" disabled={modePending}>
                  {modePending ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="sm" /> Saving modes...
                    </span>
                  ) : (
                    "Save Service Modes"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
