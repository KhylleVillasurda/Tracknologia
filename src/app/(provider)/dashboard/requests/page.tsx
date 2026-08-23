import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  listRepairRequests,
  repairRequestPageSchema,
  repairRequestStatusEnum,
  type RepairRequestStatus,
} from "@/features/repair-requests";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Repair Requests — Tracknologia",
  description: "Review customer-submitted Repair Requests",
};

const FILTERS: Array<{ label: string; status?: RepairRequestStatus }> = [
  { label: "All" },
  { label: "Submitted", status: "SUBMITTED" },
  { label: "Accepted", status: "ACCEPTED" },
  { label: "Declined", status: "DECLINED" },
];

const STATUS_STYLES: Record<RepairRequestStatus, string> = {
  SUBMITTED: "border-primary/20 bg-primary/10 text-primary",
  ACCEPTED: "border-emerald-700/20 bg-emerald-700/10 text-emerald-700",
  DECLINED: "border-border bg-muted text-muted-foreground",
};

function formatSubmittedAt(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function deviceLabel(
  deviceType: string,
  brand?: string | null,
  model?: string | null,
) {
  return [brand, model].filter(Boolean).join(" ") || deviceType;
}

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function repairRequestInboxHref(status?: RepairRequestStatus, page = 1) {
  const params = new URLSearchParams();
  if (status) {
    params.set("status", status);
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return `/dashboard/requests${query ? `?${query}` : ""}`;
}

export default async function RepairRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const rawStatus = firstSearchParam(params.status);
  const parsedStatus = repairRequestStatusEnum.safeParse(rawStatus);
  const status = parsedStatus.success ? parsedStatus.data : undefined;
  const parsedPage = repairRequestPageSchema.safeParse(
    firstSearchParam(params.page),
  );
  const page = parsedPage.success ? parsedPage.data : 1;
  const requestPage = await listRepairRequests({ status, page });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Repair Requests
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review customer-reported information before creating an authoritative
          Repair.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Request status filters">
        {FILTERS.map((filter) => {
          const active =
            filter.status === status || (!filter.status && !status);
          const href = repairRequestInboxHref(filter.status);

          return (
            <Link
              key={filter.label}
              href={href}
              className={cn(
                buttonVariants({
                  variant: active ? "default" : "outline",
                  size: "sm",
                }),
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </div>

      {requestPage.items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">No matching Requests</CardTitle>
            <CardDescription>
              New customer submissions will appear here for Provider review.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {requestPage.items.map((request) => (
            <Card key={request.id} className="flex flex-col">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">
                      {request.referenceCode}
                    </p>
                    <CardTitle className="mt-1 truncate text-lg">
                      {deviceLabel(
                        request.deviceType,
                        request.brand,
                        request.model,
                      )}
                    </CardTitle>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                      STATUS_STYLES[request.status],
                    )}
                  >
                    {request.status}
                  </span>
                </div>
                <CardDescription>
                  {request.customerName} ·{" "}
                  {formatSubmittedAt(request.submittedAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {request.reportedProblem}
                </p>
                <Link
                  href={`/dashboard/requests/${request.id}`}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "mt-auto w-full sm:w-fit",
                  )}
                >
                  Review Request
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {requestPage.hasPrevious || requestPage.hasNext ? (
        <nav
          className="flex items-center justify-between gap-3"
          aria-label="Repair Request pagination"
        >
          {requestPage.hasPrevious ? (
            <Link
              href={repairRequestInboxHref(status, requestPage.page - 1)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "min-w-24",
              )}
            >
              Previous
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none min-w-24 opacity-50",
              )}
              aria-disabled="true"
            >
              Previous
            </span>
          )}

          <span className="text-sm tabular-nums text-muted-foreground">
            Page {requestPage.page}
          </span>

          {requestPage.hasNext ? (
            <Link
              href={repairRequestInboxHref(status, requestPage.page + 1)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "min-w-24",
              )}
            >
              Next
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "pointer-events-none min-w-24 opacity-50",
              )}
              aria-disabled="true"
            >
              Next
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
