# Setup

## Verify this before building anything on it

**Can the `admin_portal` role reach the app project from Render?** Everything
here assumes yes, and it is the one assumption that could force a different
shape, so test it with a throwaway script before writing application code.

Two things stack up:

- **Supabase direct connections (`db.<ref>.supabase.co:5432`) are IPv6-only**
  unless the IPv4 add-on is enabled. Render's outbound traffic is IPv4, so the
  direct host is very likely unreachable from a Render service. The **connection
  pooler** (Supavisor) is IPv4 and is the intended path.
- **Custom Postgres roles through the pooler** use a username of
  `<role>.<project-ref>` — `admin_portal.zekaahjqdynuhjmgkpqf` — rather than the
  `postgres.<ref>` the dashboard shows. This is expected to work but has not
  been confirmed for this project.

So: create the role, then connect as it through the pooler **from a deployed
Render service**, not only from a laptop. A laptop has working IPv6 and will
happily connect to a host Render cannot reach, which is the failure mode worth
spending ten minutes to rule out.

If the pooler rejects the custom role, the fallbacks in order of preference are:
a Supabase Edge Function in the app project that exposes the view over HTTP with
a shared secret (keeps the boundary, costs a round trip), or the IPv4 add-on on
the app project (simplest, costs money).

One more pooler detail once it does work: **transaction mode (port 6543) does not
support prepared statements.** With `postgres.js` that means `prepare: false`;
with node-postgres and Drizzle it means avoiding prepared queries. Session mode
(5432 on the pooler host) supports them but holds a connection per client.

## First time on a machine

```bash
cp .env.example .env.local
# then fill in the values below
```

| variable | where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | already filled in — the admin project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Admin project → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin project → Project Settings → API. Server-only. |
| `CYCLEA_APP_DATABASE_URL` | assembled by hand — see below |

`.env.local` is gitignored. `.env.example` is the committed shape and must be
updated whenever a variable is added, or the next machine silently starts with a
missing one.

## Creating the `admin_portal` role

In the **app** project's SQL editor (`zekaahjqdynuhjmgkpqf`), not here. By hand
rather than in a migration, because a migration cannot carry a password:

```sql
CREATE ROLE admin_portal LOGIN PASSWORD '…';
GRANT USAGE  ON SCHEMA public TO admin_portal;
GRANT SELECT ON public.creator_revenue_events TO admin_portal;
GRANT SELECT, INSERT, UPDATE (name, active, note) ON public.creators TO admin_portal;
```

Keep that list exactly this short. When something new is needed, add **a view in
the app project** and grant that, rather than widening the role to a base table.
`docs/architecture.md` § *The credential boundary* explains why this is the whole
design and not a formality.

Generate the password with something that will not be retyped:

```bash
openssl rand -base64 32
```

It goes in `.env.local` here and in Render's environment, and nowhere else.

## Linking the Supabase CLI

```bash
supabase link --project-ref mtcnwjpjbupsbkbhqbph
```

Note both projects are in the same organization, so `supabase projects list`
shows the app project too. **Check which one is linked before every
`supabase db push`** — a migration meant for the admin project applied to the app
project is a bad afternoon.

## Render

One web service, **Frankfurt** region. The app is stateless — Supabase holds the
data, the auth and the storage — so the service holds nothing at rest, and the
region choice is about the round trip to Zürich rather than about residency.

Environment variables are the four above. Render is a **named subprocessor** in
the privacy policy even holding no data at rest, because it processes it in
transit.

## What is not set up yet

- No application code. The stack is Next.js (App Router) + shadcn/ui + ReUI.
- No migrations. The first one should create the audit log
  (`docs/architecture.md` § *The audit log is not optional*).
- No auth. Admins and creators both live in the admin project's `auth.users`,
  separated by role; **public signup must be disabled**, since creators are
  invited and admins are us.
- No domain. `admin.cyclea.app` and the portal route are DNS in the same place
  the marketing site is managed.
