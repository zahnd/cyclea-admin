import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { required, supabaseUrl } from "@/lib/db/env";

// The admin project as service_role: bypasses RLS, reaches no app data at all.
// For the data access layer's own lookups and for admin data -- never for
// anything a request's user should be the one doing; that is adminDbAsUser().
let client: SupabaseClient | undefined;

export function adminDb(): SupabaseClient {
  client ??= createClient(supabaseUrl(), required("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
