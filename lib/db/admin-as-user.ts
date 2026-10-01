import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseUrl } from "@/lib/db/env";

// The admin project as the signed-in user, from the request's cookies. Used for
// auth.* calls: signing in, MFA, signing out. A new client per request, because
// it is bound to that request's cookies.
export async function adminDbAsUser() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
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
          // Called from a Server Component, which cannot set cookies. The proxy
          // refreshes the session on every /admin and /login request, so the
          // write it would have made has already happened there.
        }
      },
    },
  });
}
