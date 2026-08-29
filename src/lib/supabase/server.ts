import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerConfig } from "@/lib/config/server";

export async function createClient() {
  const config = getServerConfig();
  const cookieStore = await cookies();

  return createServerClient(config.supabase.url, config.supabase.publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if proxy is refreshing sessions.
        }
      },
    },
  });
}
