import type { Metadata } from "next";
import Link from "next/link";
import { requireProviderContext } from "@/features/auth";
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
  const context = await requireProviderContext();

  const providerTypeLabel =
    context.providerType === "INDEPENDENT"
      ? "Independent Repairer"
      : "Repair Shop";

  return (
    <div className="space-y-6 max-w-4xl">
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

      {/* Provider Workspace Card */}
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
            Welcome to your Tracknologia workspace. Review incoming customer
            Requests, or update Provider profile and Service Mode settings.
          </p>
          <Link
            href="/dashboard/requests"
            className={cn(buttonVariants(), "w-full sm:w-fit")}
          >
            Open Repair Requests
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
