import { createBrowserClient } from "@supabase/ssr";

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be configured.",
    );
  }

  return { url, key };
}

export function createClient() {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient(url, key);
}
