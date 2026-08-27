import {
  getUser,
  getProviderContext,
  AuthError,
  type AuthenticatedUser,
  type ProviderContext,
} from "@/features/auth";
import { signOutAction } from "@/app/(auth)/actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { ServiceUnavailable } from "./_components/service-unavailable";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: AuthenticatedUser | null = null;
  let context: ProviderContext | null = null;

  try {
    user = await getUser();
    if (user) {
      context = await getProviderContext();
    }
  } catch (err) {
    if (err instanceof AuthError) {
      if (err.code === "INFRASTRUCTURE_FAILURE") {
        return <ServiceUnavailable />;
      }

      if (err.code === "AMBIGUOUS_PROVIDER_CONTEXT") {
        return (
          <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
            <div className="max-w-md w-full p-6 border border-border rounded-lg shadow-xs bg-card space-y-4 text-center">
              <h2 className="text-xl font-bold text-foreground">
                Multiple Provider Accounts Found
              </h2>
              <p className="text-sm text-muted-foreground">
                Your account is associated with multiple provider profiles.
                Multi-provider switching is currently restricted. Please contact
                support or your workshop administrator.
              </p>
              <div className="pt-2 flex justify-center">
                <form action={signOutAction}>
                  <Button variant="outline" size="sm" type="submit">
                    Sign Out
                  </Button>
                </form>
              </div>
            </div>
          </div>
        );
      }
    }
    throw err;
  }

  if (!user) {
    redirect("/login");
  }

  if (!context) {
    redirect("/onboarding");
  }

  const roleDisplay =
    context.providerType === "INDEPENDENT"
      ? "Independent Repairer"
      : context.role === "OWNER"
        ? "Shop Owner"
        : "Staff";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Provider Dashboard Top Header */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-xs">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-foreground">
                Tracknologia
              </span>
            </Link>
            <nav className="hidden items-center gap-4 text-sm font-medium md:flex">
              <Link
                href="/dashboard"
                className="text-foreground font-medium transition-colors hover:text-primary"
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/requests"
                className="text-muted-foreground font-medium transition-colors hover:text-foreground"
              >
                Requests
              </Link>
              <Link
                href="/dashboard/repairs"
                className="text-muted-foreground font-medium transition-colors hover:text-foreground"
              >
                Repairs
              </Link>
              {context.providerType === "SHOP" && (
                <Link
                  href="/dashboard/team"
                  className="text-muted-foreground font-medium transition-colors hover:text-foreground"
                >
                  Team & Staff
                </Link>
              )}
              <Link
                href="/dashboard/settings"
                className="text-muted-foreground font-medium transition-colors hover:text-foreground"
              >
                Settings
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex flex-col items-end text-xs">
              <span className="font-medium text-foreground">
                {context.providerName}
              </span>
              <span className="text-muted-foreground text-[11px]">
                {context.email} •{" "}
                <span className="font-medium text-primary">{roleDisplay}</span>
              </span>
            </div>
            <form action={signOutAction}>
              <Button variant="outline" size="sm" type="submit">
                Sign Out
              </Button>
            </form>
          </div>
        </div>
        <nav className="flex items-center gap-4 overflow-x-auto border-t border-border/70 px-4 py-2 text-xs font-medium md:hidden">
          <Link
            href="/dashboard"
            className="shrink-0 text-foreground transition-colors hover:text-primary"
          >
            Dashboard
          </Link>
          <Link
            href="/dashboard/requests"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            Requests
          </Link>
          <Link
            href="/dashboard/repairs"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            Repairs
          </Link>
          {context.providerType === "SHOP" && (
            <Link
              href="/dashboard/team"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              Team & Staff
            </Link>
          )}
          <Link
            href="/dashboard/settings"
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            Settings
          </Link>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
