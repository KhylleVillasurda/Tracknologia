import type { Metadata } from "next";
import { requireProviderContext } from "@/features/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
            Welcome to your Tracknologia workspace. Provider profile and Service
            Mode settings are available now. Repair Jobs, Intake Requests, and
            Customer Tracking will appear here as each feature is enabled.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
