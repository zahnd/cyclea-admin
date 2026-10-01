# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

**Read `docs/architecture.md` before writing code here.** It holds the rules
below in full, with the reasoning. This file is the short form.

This is Next.js 16, which differs from older versions in ways that matter —
check the bundled docs before writing Next.js code:

@AGENTS.md

## What this is

The admin platform for Cyclea (the Flutter app, in the sibling repo
`cyclea-app`). Creator referral payouts first, other administrative actions as
they are needed, and a creator self-serve portal on the same codebase —
`/admin` for us, `/portal` for creators.

Stack: **Next.js (App Router) + shadcn/ui + ReUI**, TypeScript throughout, one
service on **Render** (Frankfurt), two **Supabase** projects (Zürich).

The decision record for why this is a separate repo and a separate database is
`cyclea-app/docs/admin-platform.md`.

## Where things stand (2026-09-30)

- **The architecture is proven, not assumed.** A deployed probe confirmed that
  `admin_portal` reaches the app project through the pooler in session mode from
  Render, and that reads of `cycles`, `daily_logs`, `daily_log_selections`,
  `profiles` and `revenuecat_events` are all refused with `42501`. See
  `docs/setup.md`.
- **App-side schema is ready**: `cyclea-app` migrations 0056 (revenue columns +
  the `creator_revenue_events` view), 0057 (what the values mean) and 0058 (the
  RLS policy this role needs) are applied.
- **Next.js 16 is scaffolded and deployed** (TypeScript, Tailwind v4, App
  Router, npm, no `src/`), with shadcn/ui and the `@reui` registry wired in.
- **Migration 0001 (the append-only audit log) is applied** to the admin
  project and its VERIFY block passed against production (2026-09-30).
- **Admin sign-in is live** (2026-10-01): email code via Postmark, then a
  mandatory authenticator, re-asked after 12 h; `lib/auth/dal.ts` is the
  boundary. Migration 0002 (`admins` + `grant_admin`) and the auth config are
  applied; one admin (the user), bootstrapped by `scripts/admin.ts`.
  `docs/setup.md` § *Admin sign-in* has the traps hit on the way (misnamed
  `[auth.email] enable_signup`, SMTP password not pushed, init defaults).
- **Next step**: the first admin feature.
- **Nothing is decided about payout amounts.** `docs/payouts.md` lists the four
  open questions; all block the first payout, none blocks building.

## Commands

```bash
npm run dev                          # Next.js dev server
npm run build                        # production build
npm run lint
npm run typecheck                    # next typegen && tsc --noEmit
npm run admin -- grant <email>       # make an admin (needs SUPABASE_SECRET_KEY)
npm run admin -- reset-mfa <email>   # lost authenticator
supabase link --project-ref mtcnwjpjbupsbkbhqbph   # the ADMIN project
supabase db push                     # apply migrations — check what is linked first
```

## The rule that overrides convenience

**Nothing this app holds may be able to read health data.** Cyclea tracks
menstrual cycles; `cycles`, `daily_logs`, `daily_log_selections` and
`planner_entries` in the app project are the most sensitive rows in the company,
and this app runs on a public web host.

- A **service-role key for the app project must never exist** in this repo, in
  Render's environment, or in anyone's `.env`. If a task seems to need one, the
  answer is a new view in the app project, not a wider credential.
- The app project is reached **only** as the `admin_portal` Postgres role, whose
  grants are `SELECT` on `public.creator_revenue_events` and `INSERT/UPDATE` on
  `public.creators`. Postgres enforces that; our code is not what makes it safe.
- **No `NEXT_PUBLIC_` variables at all.** The prefix ships a value to every
  visitor; every Supabase call here runs on the server, so nothing needs one —
  and for the app project it would be a breach.
- Name the clients so a wrong import reads wrong — `adminDb()` (admin secret
  key), `adminDbAsUser()` (the signed-in user's session), `appDbReadOnly` —
  never `supabase` and `supabase2`.
- **Every admin page and server action calls `requireAdmin()`**
  (`lib/auth/dal.ts`). The proxy only refreshes sessions and redirects early;
  a layout check alone misses client navigation and direct action POSTs.

## Working with the two databases

| project | ref | role here |
|---|---|---|
| Cyclea Admin PROD | `mtcnwjpjbupsbkbhqbph` | this app's own data; migrations live here |
| Cyclea App PROD | `zekaahjqdynuhjmgkpqf` | read-only through one view; **migrations belong in `cyclea-app`** |

A schema change the app project needs is a numbered migration **in the app
repo**, committed there. Never apply DDL to the app project from here.

Postgres cannot join across projects: read each side separately and **join in
the Next.js server**. `postgres_fdw` and a scheduled sync were both considered
and rejected — see `docs/architecture.md`.

## Money

- **`price` is USD. `currency` describes `price_in_purchased_currency`, not
  `price`.** The two are adjacent in the view and are not a pair — 8.30 CHF
  arrives as `price = 10.059`. Compute shares from
  `price_in_purchased_currency` + `currency`.
- **`commission_percentage` / `tax_percentage` are 0–1 fractions.** Play's 15%
  is `0.150000`.
- **The view reports facts, not totals.** It filters `price IS NOT NULL`, not
  `price > 0`, so zero-price lifecycle events are rows and a naive `count(*)`
  overcounts transactions.
- **Two inputs are still open and block the first payout**: whether the share is
  computed on gross or net of store commission and VAT (a contract question),
  and whether a real refund returns the amount (unobserved — every cancellation
  seen so far carries `price = 0.0000`, but none was a refund). **Do not encode
  a guess for either.**
- Money columns are `numeric`, never a float.
- **Never store bank details.** Reference a payee by its id in the bank or Wise.
- **Creators see a running balance**, split into *Pending* and *Available* so
  the number that gets paid stops moving before anyone is promised it. A
  balance invites "show me the transactions" — **bucket by day at minimum**,
  because a per-transaction list with timestamps is a correlation channel even
  without `user_id`. `docs/payouts.md` has the reasoning.

## Privacy rules that are structural, not stylistic

- **A creator must never learn who they referred.** The view has no `user_id`
  precisely so that this cannot be undone by a later query. Aggregate counts and
  amounts are fine; a list of accounts, signup dates or anything per-subscriber
  is not — referred users are app users with cycle data, and a short list is
  often enough to guess identities.
- **Append-only audit log** (`public.audit_log`, migration 0001): who created
  which creator, who marked which payout paid, who changed a rate. Append-only
  means no `UPDATE`/`DELETE`/`TRUNCATE` grant for the application role, plus
  triggers that stop even the owner — not merely that the code does not issue
  them. A correction is a new row. Never put an app user's id in `details`.
- **This project's default privileges grant `TRUNCATE` to `anon`,
  `authenticated` and `service_role`** on every new public table. Start each new
  table with `REVOKE ALL ... FROM PUBLIC, anon, authenticated, service_role`
  and grant back what is needed.

## Database migrations

Numbered SQL files under `supabase/migrations/`, applied with
`supabase db push`, committed with the change that needs them. **Never edit an
applied migration — add another one.**

The app repo's migrations are the house-style reference: they explain *why* in
the file, and they end with a `VERIFY` block of queries that prove the change
did what it claims. `cyclea-app/supabase/migrations/0056_*.sql` is a good
example.

New `public` tables need explicit `GRANT`s in the same migration — Supabase
stopped granting defaults to `anon`/`authenticated` as of 2026-10-30. And
`REVOKE ... FROM PUBLIC` alone is not enough; name `anon` and `authenticated`
explicitly.

## UI

- **shadcn/ui on Base UI** (`style: base-nova` in `components.json`), not
  Radix. Docs and examples written for Radix use different props.
- **ReUI is a shadcn registry**, `@reui` in `components.json`. shadcn
  components land in `components/ui/`, ReUI's in `components/reui/`:
  `npx shadcn@latest add button`, `npx shadcn@latest add @reui/data-grid`.
  `badge` and `alert` exist in both — `@reui/badge` is the ReUI one.
- **Use the ReUI MCP before writing props**: `search`, then `get_component` for
  the real API, then `get_examples`. Its components are reused, not restyled;
  tables are `data-grid`, never a hand-rolled `<table>`.
- **Free tier only**: the 22 components and `c-*` examples. Premium blocks need a
  license key, which would go in `REUI_LICENSE_KEY` (and `.env.example`) with an
  `Authorization` header on the registry — not set up, not needed so far.
- **Pick one surface** (ReUI `frame` or shadcn `card`) when the first real page
  is built, and pass it on every ReUI `search`. Not yet chosen.
- A data-grid in `/portal` still shows **bucketed rows only** — the privacy
  rule above is about the grain, and a grid makes per-row display the path of
  least resistance.

## Conventions

- Do **not** use Supabase MCP `apply_migration`. Use the CLI, and commit the
  file.
- Commit to `main` by default; no self-made feature branches unless asked.
- Never write to Directus from here. The CMS is the app's, and changes there are
  made by hand by the user.
