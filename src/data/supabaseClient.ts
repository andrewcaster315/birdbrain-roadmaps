// Supabase client singleton. Returns null when env vars aren't configured so
// the rest of the app can fall back to the localStorage mock for local dev.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const anonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
)?.trim();

export const supabaseEnabled = !!(url && anonKey);

// Implicit flow (the default) for email-OTP magic links. PKCE adds a
// code-verifier-in-localStorage requirement which conflicts with users
// clearing storage between requesting a link and clicking it. Implicit
// puts the token directly in the URL hash on redirect, so the magic link
// is self-contained.
export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
