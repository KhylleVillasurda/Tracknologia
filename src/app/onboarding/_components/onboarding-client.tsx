"use client";

import { useActionState, useState } from "react";
import {
  onboardIndependentAction,
  onboardShopAction,
  acceptStaffInviteAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { InvitationShopDetails } from "@/features/providers";

const DEVICE_OPTIONS = [
  "Smartphones",
  "Laptops & PCs",
  "Tablets",
  "Gaming Consoles",
  "Audio & Wearables",
  "Other Electronics",
];

const SERVICE_MODE_OPTIONS = [
  { value: "DROP_OFF", label: "Drop-off" },
  { value: "MEETUP", label: "Meetup" },
  { value: "HOME_SERVICE", label: "Home service" },
  { value: "OTHER", label: "Other arrangement" },
] as const;

function ProviderOperatingFields({
  prefix,
  isPending,
  fieldErrors,
}: {
  prefix: string;
  isPending: boolean;
  fieldErrors?: Record<string, string>;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-description`}>Provider Description</Label>
        <Textarea
          id={`${prefix}-description`}
          name="description"
          placeholder="Briefly describe your repair services and specialties"
          disabled={isPending}
          maxLength={1000}
        />
        {fieldErrors?.description && (
          <p className="text-xs text-destructive">{fieldErrors.description}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-address`}>Public Address (Optional)</Label>
          <Input
            id={`${prefix}-address`}
            name="publicAddress"
            placeholder="Storefront or public meeting address"
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${prefix}-area`}>Service Area (Optional)</Label>
          <Input
            id={`${prefix}-area`}
            name="serviceArea"
            placeholder="e.g. Metro Cebu and nearby cities"
            disabled={isPending}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          Supported Service Modes
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SERVICE_MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 p-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
            >
              <input
                type="checkbox"
                name="serviceModes"
                value={option.value}
                className="rounded border-border accent-primary"
                disabled={isPending}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <Input
          name="serviceModeDetails.OTHER"
          aria-label="Other Service Mode details"
          placeholder="If Other is selected, describe the arrangement"
          disabled={isPending}
          maxLength={240}
        />
        {fieldErrors?.serviceModes && (
          <p className="text-xs text-destructive">{fieldErrors.serviceModes}</p>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          Supported Device Categories
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {DEVICE_OPTIONS.map((device) => (
            <label
              key={device}
              className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 p-2 text-xs font-medium text-muted-foreground hover:bg-muted/40"
            >
              <input
                type="checkbox"
                name="supportedDevices"
                value={device}
                className="rounded border-border accent-primary"
                disabled={isPending}
              />
              <span>{device}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 p-3">
        <input
          type="checkbox"
          name="acceptingRequests"
          className="mt-0.5 rounded border-border accent-primary"
          defaultChecked
          disabled={isPending}
        />
        <span>
          <span className="block text-sm font-medium text-foreground">
            Accept new Repair Requests
          </span>
          <span className="block text-xs text-muted-foreground">
            Show this Provider on public request surfaces.
          </span>
        </span>
      </label>
    </>
  );
}

interface OnboardingClientProps {
  defaultInviteToken?: string;
  initialProviderType?: "SHOP" | "INDEPENDENT";
  initialDisplayName?: string;
  initialEmail?: string;
  shopDetails?: InvitationShopDetails | null;
}

export function OnboardingClient({
  defaultInviteToken,
  initialProviderType,
  initialDisplayName,
  initialEmail,
  shopDetails,
}: OnboardingClientProps) {
  // If the user registered as a specific provider type or has an invite token/shopDetails, lock to that sole flow
  const lockedType =
    defaultInviteToken || shopDetails ? "STAFF" : initialProviderType;
  const [selectedType, setSelectedType] = useState<
    "INDEPENDENT" | "SHOP" | "STAFF"
  >(lockedType ?? "INDEPENDENT");

  const [indState, indAction, indPending] = useActionState(
    onboardIndependentAction,
    null,
  );
  const [shopState, shopAction, shopPending] = useActionState(
    onboardShopAction,
    null,
  );
  const [staffState, staffAction, staffPending] = useActionState(
    acceptStaffInviteAction,
    null,
  );

  const isPending = indPending || shopPending || staffPending;
  const currentFlow = lockedType ?? selectedType;

  return (
    <div className="space-y-6">
      {/* Only show tab switcher if the user did not register as a specific account type */}
      {!lockedType && (
        <div className="grid grid-cols-3 gap-2 p-1 bg-muted/60 rounded-2xl border border-border/80">
          <button
            type="button"
            onClick={() => setSelectedType("INDEPENDENT")}
            disabled={isPending}
            className={cn(
              "rounded-xl py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer",
              selectedType === "INDEPENDENT"
                ? "bg-background text-foreground shadow-xs ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Independent
          </button>

          <button
            type="button"
            onClick={() => setSelectedType("SHOP")}
            disabled={isPending}
            className={cn(
              "rounded-xl py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer",
              selectedType === "SHOP"
                ? "bg-background text-foreground shadow-xs ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Repair Shop
          </button>

          <button
            type="button"
            onClick={() => setSelectedType("STAFF")}
            disabled={isPending}
            className={cn(
              "rounded-xl py-2.5 px-3 text-xs font-semibold transition-all cursor-pointer",
              selectedType === "STAFF"
                ? "bg-background text-foreground shadow-xs ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Shop Staff (Invite)
          </button>
        </div>
      )}

      {/* 1. Independent Repairer Sole Onboarding */}
      {currentFlow === "INDEPENDENT" && (
        <form action={indAction} className="space-y-4">
          <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base">🛠️</span>
              <h3 className="text-sm font-semibold text-foreground">
                Independent Repairer Profile
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Confirm your person identity, repair brand, contact info, and
              service coverage. No physical storefront address required.
            </p>
          </div>

          {indState?.error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {indState.error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ind-ownerName">Your Full Name *</Label>
            <Input
              id="ind-ownerName"
              name="ownerName"
              placeholder="e.g. Alex Martinez"
              disabled={isPending}
              required
            />
            {indState?.fieldErrors?.ownerName && (
              <p className="text-xs text-destructive">
                {indState.fieldErrors.ownerName}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ind-ownerPhone">Your Contact Phone</Label>
            <Input
              id="ind-ownerPhone"
              name="ownerContactPhone"
              type="tel"
              placeholder="+63 912 345 6789"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ind-name">Repair Brand / Business Name *</Label>
            <Input
              id="ind-name"
              name="displayName"
              defaultValue={initialDisplayName ?? ""}
              placeholder="e.g. Alex Tech Services"
              disabled={isPending}
              required
            />
            {indState?.fieldErrors?.displayName && (
              <p className="text-xs text-destructive">
                {indState.fieldErrors.displayName}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ind-email">Contact Email</Label>
              <Input
                id="ind-email"
                name="contactEmail"
                type="email"
                defaultValue={initialEmail ?? ""}
                placeholder="alex@mobiletech.com"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ind-phone">Contact Phone</Label>
              <Input
                id="ind-phone"
                name="contactPhone"
                type="tel"
                placeholder="+63 912 345 6789"
                disabled={isPending}
              />
            </div>
          </div>

          <ProviderOperatingFields
            prefix="ind"
            isPending={isPending}
            fieldErrors={indState?.fieldErrors}
          />

          <Button type="submit" className="w-full" disabled={isPending}>
            {indPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Setting up Independent Provider...
              </span>
            ) : (
              "Complete Setup & Go to Dashboard"
            )}
          </Button>
        </form>
      )}

      {/* 2. Repair Shop Owner Sole Onboarding */}
      {currentFlow === "SHOP" && (
        <form action={shopAction} className="space-y-4">
          <div className="rounded-2xl border border-border/80 bg-muted/30 p-4 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base">🏬</span>
              <h3 className="text-sm font-semibold text-foreground">
                Repair Shop Profile
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Configure your owner identity, shop information, and public
              storefront location to start managing repairs and staff.
            </p>
          </div>

          {shopState?.error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {shopState.error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="shop-ownerName">Your Full Name (Owner) *</Label>
            <Input
              id="shop-ownerName"
              name="ownerName"
              placeholder="e.g. Maria Santos"
              disabled={isPending}
              required
            />
            {shopState?.fieldErrors?.ownerName && (
              <p className="text-xs text-destructive">
                {shopState.fieldErrors.ownerName}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="shop-ownerPhone">Your Contact Phone</Label>
            <Input
              id="shop-ownerPhone"
              name="ownerContactPhone"
              type="tel"
              placeholder="+63 912 345 6789"
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shop-name">Shop / Business Name *</Label>
            <Input
              id="shop-name"
              name="displayName"
              defaultValue={initialDisplayName ?? ""}
              placeholder="e.g. Apex Electronics Repair Center"
              disabled={isPending}
              required
            />
            {shopState?.fieldErrors?.displayName && (
              <p className="text-xs text-destructive">
                {shopState.fieldErrors.displayName}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shop-email">Shop Contact Email</Label>
              <Input
                id="shop-email"
                name="contactEmail"
                type="email"
                defaultValue={initialEmail ?? ""}
                placeholder="owner@apexrepairs.com"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shop-phone">Shop Phone (Optional)</Label>
              <Input
                id="shop-phone"
                name="contactPhone"
                type="tel"
                placeholder="(032) 123-4567"
                disabled={isPending}
              />
            </div>
          </div>

          <ProviderOperatingFields
            prefix="shop"
            isPending={isPending}
            fieldErrors={shopState?.fieldErrors}
          />

          <Button type="submit" className="w-full" disabled={isPending}>
            {shopPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Registering Repair Shop...
              </span>
            ) : (
              "Complete Setup & Go to Dashboard"
            )}
          </Button>
        </form>
      )}

      {/* 3. Shop Staff Invitation Acceptance Sole Flow */}
      {currentFlow === "STAFF" && (
        <form action={staffAction} className="space-y-4">
          {defaultInviteToken && (
            <input type="hidden" name="token" value={defaultInviteToken} />
          )}

          {/* Shop Connection Card */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🏬</span>
              <div>
                <h4 className="text-sm font-semibold text-foreground">
                  {shopDetails?.shopName || "Repair Shop Invitation"}
                </h4>
                <p className="text-xs text-muted-foreground">
                  Role:{" "}
                  <span className="font-semibold text-primary">Staff</span>
                </p>
              </div>
            </div>
            {(shopDetails?.publicAddress || shopDetails?.serviceArea) && (
              <p className="text-xs text-muted-foreground pt-1">
                📍{" "}
                {[shopDetails.publicAddress, shopDetails.serviceArea]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            )}
          </div>

          {staffState?.error && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
              {staffState.error}
            </div>
          )}

          {/* If token was not prefilled, show input */}
          {!defaultInviteToken && (
            <div className="space-y-2">
              <Label htmlFor="invite-token">Invitation Token / Code *</Label>
              <Input
                id="invite-token"
                name="token"
                placeholder="Paste invitation token here"
                disabled={isPending}
                required
              />
            </div>
          )}

          {/* Staff Personal Profile Details */}
          <div className="space-y-2">
            <Label htmlFor="staff-fullName">Your Full Name *</Label>
            <Input
              id="staff-fullName"
              name="fullName"
              defaultValue={initialDisplayName ?? ""}
              placeholder="e.g. Alex Martinez"
              disabled={isPending}
              required
            />
            {staffState?.fieldErrors?.fullName && (
              <p className="text-xs text-destructive">
                {staffState.fieldErrors.fullName}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-contactPhone">Contact Phone (Optional)</Label>
            <Input
              id="staff-contactPhone"
              name="contactPhone"
              type="tel"
              placeholder="+63 912 345 6789"
              disabled={isPending}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {staffPending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                Joining shop team...
              </span>
            ) : (
              "Complete Profile & Enter Shop Dashboard"
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
