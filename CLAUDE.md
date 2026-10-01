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
- **Creators is live** (`/admin/creators`, 2026-10-01): list, create, rename,
  activate/deactivate, and the admin-side business record (contract date, payee
  reference, internal note), all audited. Verified in production with a
  throwaway `ZZVERIFY` creator (audit entries 4-11), then removed by hand per
  `docs/setup.md` § *Removing a creator*. TESTCREATOR remains, deliberately
  without an admin record, until creator codes no longer need it.
- **Admin management is live** (`/admin/admins`, 2026-10-01): add, revoke
  (migration 0004: never yourself, never the last admin, race-safe), reset
  another admin's authenticator, and a read-only **audit log** page; admin-rights
  changes need a TOTP code from the last 5 minutes. Verified in production with
  `stefan+admintest@cyclea.app` (audit 12 grant, 13 revoke); that account stays
  without access, by decision.
- **Users is live** (`/admin/users`, 2026-10-01), replacing the Admins section:
  every login in this project with its role (Admin, later Creator, else No
  access); make admin, revoke, reset authenticator, and **delete accounts
  without a role** (migration 0005). Top bar: Creators · Users · Audit log.
  Verified in production: `stefan+admintest@cyclea.app` deleted through the UI
  (audit 14; no sessions, identities or factors left). One account remains: the
  user, as the only admin.
- **Address: `https://admin.cyclea.app`** (2026-10-01). The Render subdomain is
  off; Supabase Auth's `site_url` matches. Paid Render instance (no spin-down).
- **Next step**: the creator portal's first step (invited creator logins, the
  Creator role, `/portal`). The revenue/referral overview waits for production
  data: 0 creators and only sandbox purchases so far.
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
  key), `adminDbAsUser()` (the signed-in user's session), `appDbAsAdminPortal()`
  (the app project as `admin_portal` — not "read-only": it writes `creators`) —
  never `supabase` and `supabase2`.
- **Roles are derived, one table each**: Admin = `public.admins`; creator
  portal logins will add a creator link. **`delete_account()` (0005) must learn
  every new role**, or that role's accounts become deletable as "no access".
- **Step-up for role and account actions**: grant, revoke, reset-authenticator
  and delete also call `requireRecentTotp()` (`lib/auth/step-up.ts`) — a TOTP code from the
  last 5 minutes, asked for inline (`StepUpField`) when older.
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
- **Surface: ReUI Frame**, chosen with the first real page. Pass
  `surface: "frame"` on every ReUI `search`; no shadcn Card layouts.
- **The shell** (`components/admin-shell/`): a sticky top bar with the
  *sections*, the current section's *pages* in a sidebar below it (an icon rail
  when collapsed, a drawer on phones). Both come from **`lib/nav.ts`** — add a
  section or page there, and only for routes that exist. Every page starts with
  **`PageHeader`** (`components/page-header.tsx`): explicit breadcrumbs, title,
  description, actions.
- **Dark mode follows the OS** (`prefers-color-scheme`); there is no `.dark`
  class and no switch.
- **Dates shown in client components go through `lib/format.ts`**, never
  `Intl.DateTimeFormat`: Node's and the browser's locale data differ ("Sept" vs
  "Sep"), which breaks hydration.
- A data-grid in `/portal` still shows **bucketed rows only** — the privacy
  rule above is about the grain, and a grid makes per-row display the path of
  least resistance.

## Conventions

- Do **not** use Supabase MCP `apply_migration`. Use the CLI, and commit the
  file.
- Commit to `main` by default; no self-made feature branches unless asked.
- Never write to Directus from here. The CMS is the app's, and changes there are
  made by hand by the user.
