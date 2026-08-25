import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur-xs">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-foreground">
              Tracknologia
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className={cn(buttonVariants({ variant: "default" }))}
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 md:py-28">
          <div className="mx-auto inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary mb-6">
            Repair Operations & Tracking Platform
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl text-foreground">
            Repair tracking built for{" "}
            <span className="text-primary">
              shops and independent repairers
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-muted-foreground">
            Streamline intake, provide live customer tracking codes, eliminate
            repetitive status inquiries, and manage repair lifecycles
            effortlessly.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/track"
              className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
            >
              Track Repair
            </Link>
            <Link
              href="/register"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full sm:w-auto",
              )}
            >
              Create Provider Account
            </Link>
          </div>
        </section>

        {/* Feature Highlights */}
        <section className="border-t border-border/80 bg-muted/30 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Customer Intake & Requests
                  </CardTitle>
                  <CardDescription>
                    Direct repair intake or customer-submitted repair requests
                    with device snapshot and problem details.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Accept customer requests with one click into authoritative
                  repairs, whether dropping off, meeting up, or home service.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Live Public Tracking
                  </CardTitle>
                  <CardDescription>
                    Customers can check repair status and updates anytime with
                    unguessable tracking codes.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Keep customers informed while protecting your internal notes
                  and diagnostic documentation.
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Built for Single & Multi-Tech
                  </CardTitle>
                  <CardDescription>
                    From solo independent repairers operating from a phone to
                    multi-staff repair shops.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  No bloated enterprise menus. Clear statuses, quick updates,
                  and mobile-friendly operational controls.
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/80 bg-background py-8 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-6xl px-4">
          <p>© {new Date().getFullYear()} Tracknologia. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
