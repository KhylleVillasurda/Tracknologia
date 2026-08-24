import type { Metadata } from "next";
import Link from "next/link";
import { requireProviderContext } from "@/features/auth";
import { getRepairCounts } from "@/features/repairs";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Dashboard — Tracknologia",
  description: "Provider Dashboard Overview",
};

export default async function DashboardPage() {
  const [context, repairCounts] = await Promise.all([
    requireProviderContext(),
    getRepairCounts(),
  ]);

  const providerTypeLabel =
    context.providerType === "INDEPENDENT"
      ? "Independent Repairer"
      : "Repair Shop";

  return (
    <div className="max-w-6xl space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
          {context.providerName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
          <span>{context.email}</span>
          <span>•</span>
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {providerTypeLabel}
          </span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Active",
            count: repairCounts.active,
            href: "/dashboard/repairs?status=IN_PROGRESS",
          },
          {
            label: "Waiting",
            count: repairCounts.waiting,
            href: "/dashboard/repairs?status=WAITING",
          },
          {
            label: "Ready",
            count: repairCounts.ready,
            href: "/dashboard/repairs?status=READY",
          },
          {
            label: "Completed",
            count: repairCounts.completed,
            href: "/dashboard/repairs?status=COMPLETED",
          },
        ].map((item) => (
          <Link key={item.label} href={item.href}>
            <Card className="h-full transition-colors hover:border-primary/30">
              <CardHeader className="pb-3">
                <CardDescription>{item.label} Repairs</CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {item.count}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Provider Workspace
          </CardTitle>
          <CardDescription>
            Your provider account has been authenticated and authorized with
            trusted session context.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Review incoming Requests, create direct Repairs, and keep active
            work current through meaningful lifecycle states.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/dashboard/repairs/new"
              className={cn(buttonVariants(), "w-full sm:w-fit")}
            >
              Create Repair
            </Link>
            <Link
              href="/dashboard/repairs"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full sm:w-fit",
              )}
            >
              Open Repairs
            </Link>
            <Link
              href="/dashboard/requests"
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "w-full sm:w-fit",
              )}
            >
              Review Requests
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
