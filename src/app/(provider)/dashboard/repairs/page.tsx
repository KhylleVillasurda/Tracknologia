import type { Metadata } from "next";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  listRepairs,
  repairListOptionsSchema,
  repairPageSchema,
  repairStatusEnum,
  type RepairStatus,
} from "@/features/repairs";
import { cn } from "@/lib/utils";

import { RepairStatusBadge } from "./_components/repair-status-badge";

export const metadata: Metadata = {
  title: "Repairs — Tracknologia",
  description: "Manage active and completed Repairs",
};

const FILTERS: Array<{ label: string; status?: RepairStatus }> = [
  { label: "All" },
  { label: "In Progress", status: "IN_PROGRESS" },
  { label: "Waiting for Parts", status: "WAITING_FOR_PARTS" },
  { label: "Awaiting Approval", status: "AWAITING_APPROVAL" },
  { label: "Ready", status: "READY" },
  { label: "Completed", status: "COMPLETED" },
];

function firstSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function repairListHref({
  status,
  query,
  page = 1,
}: {
  status?: RepairStatus;
  query?: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `/dashboard/repairs${search ? `?${search}` : ""}`;
}

function formatUpdatedAt(value: string) {
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

export default async function RepairsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    q?: string | string[];
    page?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const statusResult = repairStatusEnum.safeParse(
    firstSearchParam(params.status),
  );
  const status = statusResult.success ? statusResult.data : undefined;
  const pageResult = repairPageSchema.safeParse(firstSearchParam(params.page));
  const page = pageResult.success ? pageResult.data : 1;
  const queryCandidate = firstSearchParam(params.q)?.trim() || undefined;
  const optionsResult = repairListOptionsSchema.safeParse({
    status,
    query: queryCandidate,
    page,
  });
  const options = optionsResult.success
    ? optionsResult.data
    : { status, page: 1, query: undefined };
  const repairPage = await listRepairs(options);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Repairs
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage accepted work from intake through completion.
          </p>
        </div>
        <Link
          href="/dashboard/repairs/new"
          className={cn(buttonVariants(), "w-full sm:w-fit")}
        >
          Create Repair
        </Link>
      </div>

      <form
        method="get"
        className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row"
      >
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <Input
          type="search"
          name="q"
          defaultValue={options.query ?? ""}
          placeholder="Search ticket, customer, or device"
          maxLength={80}
          aria-label="Search Repairs"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {options.query ? (
          <Link
            href={repairListHref({ status })}
            className={cn(buttonVariants({ variant: "ghost" }), "sm:w-fit")}
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2" aria-label="Repair status filters">
        {FILTERS.map((filter) => {
          const active =
            filter.status === status || (!filter.status && !status);
          return (
            <Link
              key={filter.label}
              href={repairListHref({
                status: filter.status,
                query: options.query,
              })}
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

      {repairPage.items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">No matching Repairs</CardTitle>
            <CardDescription>
              Create a direct Repair or accept a customer Repair Request.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {repairPage.items.map((repair) => (
            <Card key={repair.id} className="flex flex-col">
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-muted-foreground">
                      {repair.ticketNumber}
                    </p>
                    <CardTitle className="mt-1 truncate text-lg">
                      {deviceLabel(
                        repair.deviceType,
                        repair.brand,
                        repair.model,
                      )}
                    </CardTitle>
                  </div>
                  <RepairStatusBadge status={repair.currentStatus} />
                </div>
                <CardDescription>
                  {repair.customerName} · Updated{" "}
                  {formatUpdatedAt(repair.updatedAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="line-clamp-3 text-sm text-muted-foreground">
                  {repair.reportedProblem}
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {repair.origin === "CUSTOMER_REQUEST"
                      ? "Customer Request"
                      : "Provider-created"}
                  </span>
                  <Link
                    href={`/dashboard/repairs/${repair.id}`}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                    )}
                  >
                    Open Repair
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {repairPage.hasPrevious || repairPage.hasNext ? (
        <nav
          className="flex items-center justify-between gap-3"
          aria-label="Repair pagination"
        >
          {repairPage.hasPrevious ? (
            <Link
              href={repairListHref({
                status,
                query: options.query,
                page: repairPage.page - 1,
              })}
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
            Page {repairPage.page}
          </span>
          {repairPage.hasNext ? (
            <Link
              href={repairListHref({
                status,
                query: options.query,
                page: repairPage.page + 1,
              })}
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
