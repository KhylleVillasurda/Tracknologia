import "server-only";
import { getServerConfig } from "@/lib/config/server";
import { createClient } from "@/lib/supabase/server";
import type { LoginInput, RegisterInput } from "./schemas";

export async function loginWithPassword(credentials: LoginInput) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function registerProviderAccount(
  params: RegisterInput & { emailRedirectTo?: string },
) {
  const supabase = await createClient();
  const config = getServerConfig();

  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      emailRedirectTo: params.emailRedirectTo,
      data: {
        intent: params.intent,
        provider_type:
          params.intent === "SHOP" || params.intent === "INDEPENDENT"
            ? params.intent
            : undefined,
      },
    },
  });

  if (error) {
    // If Supabase encountered an email delivery failure (e.g. SMTP config / rate limit), check if user was created and can sign in
    const isEmailError =
      error.message.includes("confirmation email") ||
      error.message.includes("rate limit") ||
      error.message.includes("SMTP") ||
      error.status === 429;

    if (isEmailError) {
      try {
        const signInResult = await supabase.auth.signInWithPassword({
          email: params.email,
          password: params.password,
        });

        if (signInResult.data?.session && signInResult.data?.user) {
          return signInResult.data;
        }
      } catch {
        // continue
      }

      if (config.runtime === "production") {
        throw new Error(
          "Confirmation email delivery failed. Please try again later or contact support.",
        );
      }

      throw new Error(
        "Email delivery failed. If using Custom SMTP, verify your SMTP credentials (or Google App Password). To skip email verification in development, disable 'Confirm email' in Supabase -> Authentication -> Email.",
      );
    }

    throw new Error(error.message);
  }

  return data;
}

export async function requestPasswordReset(params: {
  email: string;
  redirectTo?: string;
}) {
  const supabase = await createClient();
  const config = getServerConfig();
  const { data, error } = await supabase.auth.resetPasswordForEmail(
    params.email,
    {
      redirectTo: params.redirectTo,
    },
  );

  if (error) {
    if (config.runtime === "production") {
      throw new Error(
        "Unable to send password reset email at this time. Please try again later.",
      );
    }
    throw new Error(error.message);
  }

  return data;
}

export async function resetPassword(params: { newPassword: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({
    password: params.newPassword,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function signOutUser() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}
