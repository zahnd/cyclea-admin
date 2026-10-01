// The admin project's URL and publishable key. Both are safe to be seen, but
// nothing here runs in the browser, so neither carries a NEXT_PUBLIC_ prefix --
// which keeps "no NEXT_PUBLIC_ variable" a rule without exceptions.
//
// No "server-only" import: the proxy needs these, and that package throws
// outside React Server Components. The secret key is read in admin.ts, which
// is server-only.

export function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. See .env.example and docs/setup.md.`);
  }
  return value;
}

export const supabaseUrl = () => required("SUPABASE_URL");
export const supabasePublishableKey = () => required("SUPABASE_PUBLISHABLE_KEY");
