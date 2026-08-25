import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { SupabaseClient } from "@supabase/supabase-js";

function getServiceRoleEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase service configuration: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured for public operations.",
    );
  }

  return { url, key };
}

// This client bypasses RLS. It exists solely so public, accountless
// operations (Tracking lookup, Tracking observation, Repair Request
// submission) cannot be invoked directly with the publishable key.
// Never expose it through imports reachable by client components,
// never pass its credentials into NEXT_PUBLIC_* variables, and never
// widen its usage beyond those public operation seams.
export async function createPublicOperationClient(): Promise<SupabaseClient> {
  const { url, key } = getServiceRoleEnv();

  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
