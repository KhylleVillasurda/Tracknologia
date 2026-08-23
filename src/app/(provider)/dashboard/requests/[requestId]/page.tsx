import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireProviderContext } from "@/features/auth";
import { getProviderServiceModes } from "@/features/providers";
import {
  getRepairRequest,
  type RepairRequestStatus,
} from "@/features/repair-requests";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

import { RequestDecisionForm } from "./_components/request-decision-form";

export const metadata: Metadata = {
  title: "Review Repair Request — Tracknologia",
  description: "Review customer-submitted Repair Request details",
};

const STATUS_STYLES: Record<RepairRequestStatus, string> = {
  SUBMITTED: "border-primary/20 bg-primary/10 text-primary",
  ACCEPTED: "border-primary/20 bg-primary/10 text-primary",
  DECLINED: "border-border bg-muted text-muted-foreground",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function DetailValue({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">
        {value || "Not provided"}
      </dd>
    </div>
  );
}

export default async function RepairRequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const supabase = await createClient();
  const context = await requireProviderContext(supabase);
  const [request, serviceModes] = await Promise.all([
    getRepairRequest(requestId, supabase),
    getProviderServiceModes(context.providerId, supabase),
  ]);

  if (!request) {
    notFound();
  }

  const processedAt = request.acceptedAt ?? request.declinedAt;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/dashboard/requests"
            className={cn(
              buttonVariants({ variant: "link", size: "sm" }),
              "-ml-3 mb-1",
            )}
          >
            ← Back to Requests
          </Link>
          <p className="font-mono text-xs text-muted-foreground">
            {request.referenceCode}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {request.brand || request.model
              ? [request.brand, request.model].filter(Boolean).join(" ")
              : request.deviceType}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitted by {request.customerName} ·{" "}
            {formatDate(request.submittedAt)}
          </p>
        </div>
        <span
          className={cn(
            "w-fit rounded-full border px-3 py-1 text-xs font-semibold",
            STATUS_STYLES[request.status],
          )}
        >
          {request.status}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Customer-reported information</CardTitle>
          <CardDescription>
            This is Request intake, not Provider Diagnosis or authoritative
            Repair data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <DetailValue label="Customer" value={request.customerName} />
            <DetailValue label="Phone" value={request.customerPhone} />
            <DetailValue label="Email" value={request.customerEmail} />
            <DetailValue label="Device type" value={request.deviceType} />
            <DetailValue label="Brand" value={request.brand} />
            <DetailValue label="Model" value={request.model} />
            <DetailValue label="Serial number" value={request.serialNumber} />
            <DetailValue label="Color / variant" value={request.colorVariant} />
            <DetailValue label="Specifications" value={request.deviceSpecs} />
          </dl>
          <div className="border-t border-border/80 pt-5">
            <dl className="grid gap-5 sm:grid-cols-2">
              <DetailValue
                label="Reported Problem"
                value={request.reportedProblem}
              />
              <DetailValue
                label="When it started"
                value={request.problemStartedAt}
              />
              <DetailValue
                label="Preceding event"
                value={request.precedingEvent}
              />
              <DetailValue
                label="Troubleshooting attempted"
                value={request.troubleshootingAttempted}
              />
              <DetailValue
                label="Additional information"
                value={request.additionalInformation}
              />
              <DetailValue
                label="Preferred Service Mode"
                value={
                  request.preferredServiceMode
                    ? request.preferredServiceMode.replaceAll("_", " ")
                    : null
                }
              />
              <DetailValue
                label="Arrangement details"
                value={request.serviceModeDetails}
              />
            </dl>
          </div>
        </CardContent>
      </Card>

      {request.status === "SUBMITTED" ? (
        <RequestDecisionForm request={request} serviceModes={serviceModes} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Request already processed</CardTitle>
            <CardDescription>
              {request.status === "ACCEPTED"
                ? "Request created one authoritative Repair."
                : "Request was declined and no Repair was created."}
              {processedAt ? ` Processed ${formatDate(processedAt)}.` : ""}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
