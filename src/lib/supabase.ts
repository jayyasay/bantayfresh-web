import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabasePublishableKey.length > 0;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;

const SUPABASE_CONFIGURATION_ERROR =
  "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to web/.env and restart the app.";

function requireSupabaseClient() {
  if (!supabase) {
    throw new Error(SUPABASE_CONFIGURATION_ERROR);
  }

  return supabase;
}

export async function signInWithEmailPassword(credentials: {
  email: string;
  password: string;
}) {
  return requireSupabaseClient().auth.signInWithPassword(credentials);
}

export type OAuthProvider = "google";

export async function signInWithOAuthProvider(
  provider: OAuthProvider,
  redirectTo: string,
) {
  return requireSupabaseClient().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
    },
  });
}

export async function signUpWithEmailPassword(credentials: {
  email: string;
  password: string;
  options?: {
    data?: {
      full_name?: string;
      organization?: string;
    };
  };
}) {
  return requireSupabaseClient().auth.signUp(credentials);
}

export async function signOutCurrentUser() {
  return requireSupabaseClient().auth.signOut();
}
