"use client";

import { useActionState, useState } from "react";
import {
  inviteStaffAction,
  removeStaffAction,
  revokeStaffAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { cn } from "@/lib/utils";
import type { ProviderInvitation, TeamMember } from "@/features/providers";

interface TeamClientProps {
  isOwner: boolean;
  isShop: boolean;
  members: TeamMember[];
  invitations: ProviderInvitation[];
}

export function TeamClient({
  isOwner,
  isShop,
  members,
  invitations,
}: TeamClientProps) {
  const [state, formAction, isPending] = useActionState(
    inviteStaffAction,
    null,
  );
  const [revokeState, revokeFormAction, isRevokePending] = useActionState(
    revokeStaffAction,
    null,
  );
  const [removeState, removeFormAction, isRemovePending] = useActionState(
    removeStaffAction,
    null,
  );
  const [copied, setCopied] = useState(false);
  const [confirmingRemovalId, setConfirmingRemovalId] = useState<string | null>(
    null,
  );

  if (!isShop) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Independent Provider Team</CardTitle>
          <CardDescription>
            Independent repairers operate independently and manage repairs
            directly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Staff invitations and multi-member teams are designed for{" "}
            <strong>Repair Shops</strong>. Independent Providers remain
            single-member workspaces in the current product model.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Invite Staff Member Card (Owners Only) */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Invite Staff
            </CardTitle>
            <CardDescription>
              Generate an invitation link or email an invitation to staff to
              join your repair shop
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              action={formAction}
              className="flex flex-col sm:flex-row gap-3"
            >
              <div className="flex-1 space-y-1">
                <Label htmlFor="staff-email" className="sr-only">
                  Staff Email
                </Label>
                <Input
                  id="staff-email"
                  name="email"
                  type="email"
                  placeholder="staff@example.com"
                  disabled={isPending}
                  required
                />
                {state?.fieldErrors?.email && (
                  <p className="text-xs text-destructive">
                    {state.fieldErrors.email}
                  </p>
                )}
              </div>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner size="sm" />
                    Generating...
                  </span>
                ) : (
                  "Create Staff Invite"
                )}
              </Button>
            </form>

            {state?.error && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive font-medium">
                {state.error}
              </div>
            )}

            {/* Generated Invite Box (Displayed strictly once at creation time) */}
            {state?.token && state.inviteUrl && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary">
                    {state.emailDeliveryFailed
                      ? "Invitation Created (Email Failed)"
                      : "Invitation Created & Sent!"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Valid for 7 days
                  </span>
                </div>

                {state.emailDeliveryFailed && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    ⚠️ Email delivery could not be completed. You can copy the
                    invitation link below and share it directly with your staff
                    member.
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}${state.inviteUrl}`}
                    className="bg-background font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleCopy(
                        `${typeof window !== "undefined" ? window.location.origin : ""}${state.inviteUrl}`,
                      )
                    }
                  >
                    {copied ? "Copied!" : "Copy Link"}
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Invite Code:</span>
                  <code className="bg-background px-2 py-0.5 rounded border border-border font-mono font-medium text-foreground">
                    {state.token}
                  </code>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isOwner && revokeState?.success && (
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs font-medium text-primary">
          Invitation revoked
        </div>
      )}

      {isOwner && revokeState?.error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive">
          Unable to revoke invitation
        </div>
      )}

      {isOwner && removeState?.success && (
        <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-xs font-medium text-primary">
          {removeState.success}
        </div>
      )}

      {isOwner && removeState?.error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs font-medium text-destructive">
          {removeState.error}
        </div>
      )}

      {/* 2. Pending Invitations (No credentials / hashes displayed) */}
      {isOwner && invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              Pending Staff Invitations
            </CardTitle>
            <CardDescription>
              Unaccepted invitations sent to staff members
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/60">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {inv.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Sent {new Date(inv.createdAt).toLocaleDateString()} •
                      Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={revokeFormAction}>
                      <input type="hidden" name="invitationId" value={inv.id} />
                      <Button
                        variant="ghost"
                        size="sm"
                        type="submit"
                        disabled={isRevokePending}
                        className="text-xs text-destructive hover:text-destructive"
                      >
                        {isRevokePending ? "Revoking..." : "Revoke"}
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Active Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Team Members ({members.length})
          </CardTitle>
          <CardDescription>
            Active staff belonging to this repair shop
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border/60">
            {members.map((member) => {
              const displayName = member.displayName || "Team Member";
              const initials = displayName.charAt(0).toUpperCase();

              return (
                <div
                  key={member.membershipId}
                  className="py-3.5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
                      {initials}
                    </div>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {displayName}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        {member.contactPhone && (
                          <span>{member.contactPhone}</span>
                        )}
                        {member.contactPhone && <span>•</span>}
                        <span>
                          Joined{" "}
                          {new Date(member.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold shrink-0",
                      member.role === "OWNER"
                        ? "bg-primary/10 text-primary font-medium"
                        : "bg-muted text-muted-foreground font-medium",
                    )}
                  >
                    {member.role === "OWNER" ? "Shop Owner" : "Staff"}
                  </span>

                  {isOwner && member.role === "STAFF" && (
                    <div className="shrink-0">
                      {confirmingRemovalId === member.membershipId ? (
                        <form
                          action={removeFormAction}
                          className="flex items-center gap-1"
                        >
                          <input
                            type="hidden"
                            name="membershipId"
                            value={member.membershipId}
                          />
                          <span className="text-xs text-muted-foreground">
                            Remove access?
                          </span>
                          <Button
                            variant="destructive"
                            size="sm"
                            type="submit"
                            disabled={isRemovePending}
                            className="text-xs"
                          >
                            {isRemovePending ? "Removing..." : "Confirm"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            disabled={isRemovePending}
                            className="text-xs"
                            onClick={() => setConfirmingRemovalId(null)}
                          >
                            Cancel
                          </Button>
                        </form>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          className="text-xs text-destructive hover:text-destructive"
                          onClick={() =>
                            setConfirmingRemovalId(member.membershipId)
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
