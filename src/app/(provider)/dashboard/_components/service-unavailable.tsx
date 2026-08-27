import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function ServiceUnavailable() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="max-w-md w-full p-6 border border-border rounded-lg shadow-xs bg-card space-y-4 text-center">
        <h2 className="text-xl font-bold text-foreground">
          Service temporarily unavailable
        </h2>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t verify your account right now. Your session has not
          been signed out. Please try again in a moment.
        </p>
        <div className="pt-2 flex justify-center">
          <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
            Try again
          </Link>
        </div>
      </div>
    </div>
  );
}
