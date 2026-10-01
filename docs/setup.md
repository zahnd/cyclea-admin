# Setup

## Confirmed working (2026-09-30)

**The `admin_portal` role reaches the app project from a deployed Render
service**, through the pooler in session mode, and the boundary holds: reads of
`cycles`, `daily_logs`, `daily_log_selections`, `profiles` and
`revenuecat_events` are all refused with `42501`, while the payout view, the
`creators` read and a rolled-back `creators` insert all succeed.

That was the one assumption that could have forced a different shape, so the
fallbacks below are recorded but **not needed**. The rest of this section is
kept as the reasoning, and as the diagnosis if it ever breaks.

Two findings worth carrying forward:

- **A grant is only half of it.** `creators` has RLS on; a grant without a
  policy gives a SELECT that returns zero rows and no error. See the role
  section below.
- **The password must be hex.** A base64 password breaks the connection URL
  before a packet is sent, with a message that reads like a network failure.

<details>
<summary>The original reasoning, and what to do if this ever fails</summary>

**Can the `admin_portal` role reach the app project from Render?** Everything
here assumed yes, and it was the one assumption that could force a different
shape, so it was tested with a throwaway probe before any application code.

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

</details>

**Use port 5432 on the pooler host — session mode.** The two ports are
different poolers, not a fallback pair:

| port | mode | for |
|---|---|---|
| 5432 | session | a persistent server holding a pool — **this app** |
| 6543 | transaction | serverless / edge, many short-lived connections |

Transaction mode returns the connection to the pool after every transaction,
which is why it cannot support named prepared statements, session-level `SET`
or `LISTEN`. Render runs a long-lived Node process, so session mode fits and
`pg` or Drizzle need no special configuration.

The cost of session mode is that a server connection is held for as long as the
client holds it, so **keep the pool small** — `max: 5` or fewer. One Render
instance with a modest pool is well inside the project's connection limit.

Both ports are on the pooler host and both are IPv4; only
`db.<ref>.supabase.co` is IPv6-only. So the port choice does not affect the
reachability question above.

## First time on a machine

```bash
cp .env.example .env.local
# then fill in the values below
```

| variable | where it comes from |
|---|---|
| `SUPABASE_URL` | already filled in — the admin project |
| `SUPABASE_PUBLISHABLE_KEY` | already filled in — public by design |
| `SUPABASE_SECRET_KEY` | Admin project → Settings → API Keys → a `sb_secret_…` key. Server-only. |
| `CYCLEA_APP_DATABASE_URL` | assembled by hand — see below |

`.env.local` is gitignored. `.env.example` is the committed shape and must be
updated whenever a variable is added, or the next machine silently starts with a
missing one.

None of these carries a `NEXT_PUBLIC_` prefix: every Supabase call runs on the
server, so nothing needs to reach the browser.

## Admin sign-in

Email code, then an authenticator app (TOTP) — mandatory, and asked again after
12 hours (`TOTP_FRESH_FOR_SECONDS` in `lib/auth/dal.ts`). No passwords, no magic
links. Signup is off: an account exists only if a script created it.

**Adding an admin** (and the very first one), from a machine with
`SUPABASE_SECRET_KEY` in `.env.local` (Node 22.18+ for TypeScript scripts):

```bash
npm run admin -- grant someone@cyclea.app
```

Creates the account if needed and calls `grant_admin()`, which writes the
`admins` row and its `audit_log` entry in one transaction. Re-running is a
no-op. They then sign in at `/login` and set up their authenticator.

**Lost authenticator** — the only way back in for a sole admin:

```bash
npm run admin -- reset-mfa someone@cyclea.app
```

Deletes their TOTP factors (audited as `admin.reset_mfa`); they set up a new
one at the next sign-in.

### Auth settings live in `supabase/config.toml`

Signup off, code length and expiry, the code-only email template
(`supabase/templates/login-code.html`), Postmark SMTP and TOTP are versioned
there and applied with `supabase config push`.

Always diff first. It is read-only, and every line it prints is a change the
push would make to **production**:

```bash
supabase config diff --project-ref mtcnwjpjbupsbkbhqbph
```

A push changes every property the file *declares* and differs (undeclared ones
are left alone). `supabase init` declared nearly everything with local-dev
values, and some of those are live settings — on the first diff the pooler
sizes, storage analytics and email confirmations would all have changed
production. Those are now set to production's values or commented out; keep
it that way, so the diff only ever shows what a change meant to change.

Then push, with the Postmark **Server API token** (it is both SMTP username
and password). It is read from the environment and never committed; it is
needed on **every** push, since the file declares the SMTP settings:

```bash
read -rs "POSTMARK_SMTP_TOKEN?Postmark server token: "; export POSTMARK_SMTP_TOKEN
supabase config push --project-ref mtcnwjpjbupsbkbhqbph
unset POSTMARK_SMTP_TOKEN
```

Run these one line at a time, and without trailing `# comments`: zsh does not
treat `#` as a comment at an interactive prompt, so the words are passed to the
CLI as arguments and it prints its help instead of pushing.

Postmark sends from `no-reply@cyclea.app`; the domain is verified there. It is
a subprocessor and belongs in the privacy policy.

## Creating the `admin_portal` role

In the **app** project's SQL editor (`zekaahjqdynuhjmgkpqf`), not here. By hand
rather than in a migration, because a migration cannot carry a password:

```sql
CREATE ROLE admin_portal LOGIN PASSWORD '…';   -- hex, not base64 — see below
GRANT USAGE  ON SCHEMA public TO admin_portal;
GRANT SELECT ON public.creator_revenue_events TO admin_portal;
GRANT SELECT, INSERT, UPDATE (name, active, note) ON public.creators TO admin_portal;
```

**A grant is only half of it.** `creators` has RLS enabled with no policies
(0054, "service role only"), and `admin_portal` is a plain login role that does
**not** bypass RLS the way the service role does. Migration **0058** adds the
policy that lets it through.

The half that bites is the read, not the write. An ungranted INSERT fails
loudly with `42501`; an RLS-filtered SELECT returns **zero rows and no error**,
which looks exactly like an empty table. A payout screen showing "no creators"
is a plausible wrong answer, so this is worth knowing rather than discovering.

**Order matters on a fresh database**: 0058 skips its policy with a notice when
the role does not exist yet, since the role is created by hand. Create the role
first, or re-run the policy statement afterwards.

Keep that list exactly this short. When something new is needed, add **a view in
the app project** and grant that, rather than widening the role to a base table.
`docs/architecture.md` § *The credential boundary* explains why this is the whole
design and not a formality.

Generate the password as **hex**, not base64:

```bash
openssl rand -hex 32
```

This is not fussiness. The password goes into a URL, and base64's alphabet
includes `/`, `+` and `=` — a `/` ends the userinfo and starts the path, so
`pg` rejects the whole string with `Invalid URL` before it sends a single
packet. That reads exactly like a network problem and is not one. Hex has no
character that needs encoding, and 64 hex characters is ample entropy.

The same applies to the dashboard's `[YOUR-PASSWORD]` placeholder: the square
brackets are structural in a URL and must not survive into the value.

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

| setting | value |
|---|---|
| build command | `npm ci && npm run build` |
| start command | `npm start` |

`next start` reads `PORT` from Render and binds `0.0.0.0`, so neither needs
setting. The build command matters: the probe's `build` script was a no-op, and
`next start` without a prior `next build` exits at boot.

Environment variables are the four above. Render is a **named subprocessor** in
the privacy policy even holding no data at rest, because it processes it in
transit.

## What is not set up yet

- Admin sign-in exists (see *Admin sign-in*); `/admin` is a placeholder page.
  Creator logins and `/portal` come with the portal.
- No domain. `admin.cyclea.app` and the portal route are DNS in the same place
  the marketing site is managed.
