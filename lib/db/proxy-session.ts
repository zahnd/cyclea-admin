import { createServerClient } from "@supabase/ssr";
import type { JwtPayload } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { supabasePublishableKey, supabaseUrl } from "@/lib/db/env";

// Refreshes the session cookie before the request reaches the app, because
// Server Components cannot write cookies. Returns the verified claims so the
// proxy can redirect early -- an optimistic check only; lib/auth/dal.ts is the
// one that decides.
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  claims: JwtPayload | null;
}> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        // Into the request, so Server Components see the refreshed token...
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        // ...and into the response, so the browser keeps it. The headers are
        // the no-store set: a response that sets a session cookie must never
        // be cached and served to someone else.
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // getClaims verifies the token; getSession would trust the cookie as sent.
  // Nothing may run between creating the client and this call, or a refresh
  // can be lost and the user signed out at random.
  const { data } = await supabase.auth.getClaims();

  return { response, claims: data?.claims ?? null };
}
