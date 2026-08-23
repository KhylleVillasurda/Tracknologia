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
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { ProviderServiceMode } from "@/features/providers";

import { createRepairAction } from "../../actions";
import {
  RepairFields,
  type RepairFieldValues,
} from "../../_components/repair-fields";

export function CreateRepairForm({
  serviceModes,
}: {
  serviceModes: ProviderServiceMode[];
}) {
  const [state, action, pending] = useActionState(createRepairAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Repair intake</CardTitle>
        <CardDescription>
          Create an authoritative Repair without requiring a customer Request.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-8">
          {state?.error ? (
            <div
              className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {state.error}
            </div>
          ) : null}

          <RepairFields
            values={state?.values as RepairFieldValues | undefined}
            fieldErrors={state?.fieldErrors}
            serviceModes={serviceModes}
            disabled={pending}
          />

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner size="sm" /> Creating Repair...
              </span>
            ) : (
              "Create Repair"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
