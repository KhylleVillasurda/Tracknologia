import { validateProductionRuntimeConfig } from "@/lib/config/server";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.APP_ENV === "production" ||
      process.env.APP_ENV === "staging"
    ) {
      validateProductionRuntimeConfig();
    }
  }
}
