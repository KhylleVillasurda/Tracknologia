import { getUser, getProviderContext } from "@/features/auth";
import { signOutAction } from "@/app/(auth)/actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) {
    redirect("/login");
  }

  const context = await getProviderContext();
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
