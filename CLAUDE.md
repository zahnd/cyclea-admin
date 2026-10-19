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
  `docs/setup.md` § *Removing a creator*. TESTCREATOR was removed the same
  way; there are no creators in either project now (2026-10-01).
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
- **Creator portal, first step** (`/portal`): invited creator logins (the
  Creator role, migration 0006), sign-in by email code only, and a page with the
  creator's code, status and **referrals per month** (app view
  `creator_referral_counts`, cyclea-app 0059). Earnings wait for payout terms.
  **Live** (2026-10-01): both migrations applied, verified in production with a
  throwaway `ZZPORTAL` creator and `stefan+creatortest@cyclea.app` (audit 16
  create, 17 invite; the session was aal1 with no factors), then fully removed
  (18 remove login, 19 account delete, 20 creator record delete; the app-side
  row by hand). Render is in the app privacy policy.
- **Contracts and payout method** (migration 0007): each creator's contract
  state (No contract / Sent / Signed / Ended, with dates) and a link to it in
  **Skribble**, where the contract and the bank details in it stay; payout
  method Bank or Wise. Manual, audited. `docs/payouts.md` § *Contracts and
  payee details*. **Live** (2026-10-01), verified with a throwaway
  `ZZCONTRACT` (audit 21-27; 28 its removal). The live test found that a
  refused save emptied the typed fields — those forms are controlled now.
- **Feedback moves from Slack into the admin** (**live** 2026-10-14:
  tested with a TestFlight feedback, triage and manual entries with images;
  `admin_portal` reads the real row through the view and is refused
  `app_feedback`, `cycles` and `daily_logs` with `42501`). Top bar: Creators · Feedback · Users · Audit log; the Feedback
  section has one page per kind — **App feedback** (`/admin/feedback/app`)
  and **Content feedback** (`/admin/feedback/content`) — plus **Add feedback**
  (`/admin/feedback/new`).
  App feedback merges two sources: what users sent from the app, through the
  app view `app_feedback_admin` (cyclea-app 0066 — no user id, no screenshot
  path), and **manual entries** for feedback that came via WhatsApp, in person
  or email (`manual_feedback`, 0008 — the channel only, never who). Triage per
  item (New / In progress / Done / Won't fix, note, link) is `feedback_triage`
  (0008, keyed by kind + id, audited, never an app user's message). A New
  count sits on the Feedback section. App screenshots open in the Supabase
  dashboard only. A manual entry can carry one image (0009, applied and
  verified 2026-10-14): private bucket `manual-feedback` here, re-encoded to WebP so
  photo metadata never lands, shown only via a `requireAdmin()` route, with a
  no-personal-data notice on the form. The notice is the only safeguard
  against cycle data in a picture; accepted knowingly (2026-10-14), because
  only the user adds manual entries. The `app_feedback` Edge Function no
  longer pings Slack (cyclea-app `fdda920`, 2026-10-15); `lib/feedback/` is
  what the MCP tools will call. The privacy policy (15 October 2026) covers
  all of it: app feedback and manual feedback under Render, manual feedback
  and its image under Communications, Slack for reports and content ratings
  only.
- **Content feedback in the admin** (**live** 2026-10-15: tested with two
  TestFlight ratings, titles stamped, Directus mirror intact, triage audited;
  `admin_portal` reads the real rows and is refused `content_feedback`):
  thumbs and notes on CMS content through the app view
  `content_feedback_admin` (cyclea-app 0067 — no user id; `content_title` is
  the title stamped by `content_feedback_sync`, `note_changed_at` set by a
  trigger). Two views: **All ratings** and **By content**, grouped by
  (kind, Directus id), never by title, with every title an item had. Only
  ratings **with a note** are triaged (`feedback_triage` kind `content`, 0010)
  and count as New; a changed note reopens a triaged one, a flipped thumb does
  not. "Open in Directus" links to the live item. The Directus mirror stays;
  the sync function no longer posts to Slack (cyclea-app `a582b0b`).
- **Email notifications** (**live** 2026-10-15, tested; migration
  0011): each admin picks Immediately / Daily 08:00 Zürich / Off per kind on
  *Notification settings* (account menu). pg_cron calls
  `/api/notifications/sweep` every 5 minutes (bearer secret in Vault and
  `NOTIFY_SWEEP_SECRET`); each item reaches each admin once
  (`notification_deliveries`, ids and times only). Emails never contain user
  text. Sent through the separate Postmark server *Cyclea Admin*
  (`POSTMARK_ADMIN_TOKEN`) -- it cannot read the app server's sent mail, but
  can send as any cyclea.app address. Setup: `docs/setup.md` §
  Notifications. The New badge stays.
- **User reports in the admin** (**live** 2026-10-15, tested with two
  TestFlight reports; `admin_portal` reads them and is refused the table): the
  top-bar section **Reports** (`/admin/reports`) reads the app view
  `user_reports_admin` (cyclea-app 0068): the reported account's names then
  and now and its report count — **never the reporter, no user ids**. What we
  did is `report_triage` (0012): New / In progress / Closed, an action
  (required to close; *Account deleted* records a `make delete-user`, this app
  never deletes accounts), a note; audited without names, and purged 12 months
  after the report like the app purges the report. Notified through the sweep
  as kind `user_report`; at least one admin must stay on Immediately
  (enforced), else everyone gets them; one reminder for a report still New
  after 24 h. **Slack is gone** (cyclea-app `cce85e9`): no function posts
  there and its secrets are unset.
- **MCP endpoint** (**live** 2026-10-15, tested with Claude Code: consent,
  approval record, `list_feedback`; log lines carry no content; migration 0013):
  `https://admin.cyclea.app/mcp` lets an AI client (Claude Code, claude.ai)
  read feedback and set its status, note and link **as the admin who
  approved it**. This project's Supabase Auth is the OAuth 2.1 server
  (`[auth.oauth_server]`, clients registered by hand, no self-registration); the consent page
  `/oauth/consent` needs a fresh authenticator code and records the approval
  in `mcp_grants` for **30 days** — the endpoint refuses any token without an
  active row (`lib/mcp/auth.ts`), whatever Supabase's own grant says. Never
  reports, support conversations, screenshots, images or who sent anything;
  the server instructions tell agents to **paraphrase, never quote or copy
  user text** out of the admin. Writes are audited as "<admin> via MCP (<client>)". Approvals and
  Revoke: *AI clients* in the account menu. The privacy policy names Anthropic
  (published 2026-10-15). One OAuth client, *Claude Code*
  (`e5ac8f42-…`, public, callback `localhost:33418`), serves every admin —
  approvals are per admin; a new client only for a different callback (e.g. a
  claude.ai connector).
- **Image prep** (`/image-prep`, 2026-10-16): a **public** page, no
  sign-in, that shrinks photos for Directus in the browser (longest side
  2000/3000/4000, JPEG quality 70/80/90, metadata stripped). Directus Cloud
  refuses to transform images over 6000 px; the 23 library files that were
  are all replaced (same ids, 2026-10-16). Directus Cloud has no upload
  limit setting (no `FILES_MAX_UPLOAD_SIZE` in its dashboard, despite the
  handover), so a new oversized upload is only caught by checking the
  library (Directus MCP, width or height > 6000).
  Prerendered, no server side -- **keep it that way**
  (`docs/architecture.md` § *The image prep page*). Not linked from the
  admin. `hooks/use-file-upload.ts` (ReUI) has one local fix: a duplicate
  no longer drops the files after it.
- **Support inbox** (built 2026-10-17, **not live**: waits for cyclea-app
  migration 0069 and admin migration 0014): top-bar section **Support**
  (`/admin/support`) reads the app views `support_threads_admin` (username,
  display name, device, app version, language, entitled, counts — no user id,
  no email) and `support_messages_admin`; default filter *Waiting for us*,
  longest waiting first; transcript rows from the AI chat are marked *Before
  handoff (AI chat)*. Replies and Close/Reopen go through the app functions
  `support_team_reply` / `support_set_status` (granted to `admin_portal`), are
  signed with the admin's first name (`admins.support_name`, 0014, set on
  *Profile* in the account menu; replying is blocked until it is), and are
  audited as `support.reply` / `support.close` / `support.reopen` with the
  thread id only. Notified through the sweep as kind `support`: a waiting
  thread is news at each user message, one reminder 24 h after the user's
  last message. **Not exposed through `/mcp`.** Unit tests: `npm test`
  (Node's runner, pure modules only).
- **Next steps**: none planned. Manual entries about content wait until asked
  for.
  Still open besides: a revenue overview once production purchases exist, CI
  for lint/typecheck/build and the Docker migration tests, and payouts once
  `docs/payouts.md` is answered.
- **Nothing is decided about payout amounts.** `docs/payouts.md` lists the four
  open questions; all block the first payout, none blocks building.

## Commands

```bash
npm run dev                          # Next.js dev server
npm run build                        # production build
npm run lint
npm run typecheck                    # next typegen && tsc --noEmit
npm test                             # node --test lib/**/*.test.ts (pure modules, no database)
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
  grants are `SELECT` on seven views (`creator_revenue_events`,
  `creator_referral_counts`, `app_feedback_admin`, `content_feedback_admin`,
  `user_reports_admin`, `support_threads_admin`, `support_messages_admin`),
  `EXECUTE` on two functions (`support_team_reply`, `support_set_status`)
  and `INSERT/UPDATE` on `public.creators`. Postgres enforces that; our code
  is not what makes it safe.
  `app_feedback_admin.message`, `content_feedback_admin.note`,
  `user_reports_admin.note` and `support_messages_admin.body` are user-typed
  free text and may mention health details or name people — accepted
  knowingly; **never copy them into this project, the audit log or an
  email**, nor a support user's username (audit entries carry the thread id,
  emails a count and a link).
- **No `NEXT_PUBLIC_` variables at all.** The prefix ships a value to every
  visitor; every Supabase call here runs on the server, so nothing needs one —
  and for the app project it would be a breach.
- Name the clients so a wrong import reads wrong — `adminDb()` (admin secret
  key), `adminDbAsUser()` (the signed-in user's session), `appDbAsAdminPortal()`
  (the app project as `admin_portal` — not "read-only": it writes `creators`) —
  never `supabase` and `supabase2`.
- **Roles are derived, one table each**: Admin = `public.admins`, Creator =
  `public.creator_logins` (0006); **never both**, enforced by the database.
  `getRole()` / `requireCreator()` in `lib/auth/dal.ts`. **Every role function
  locks `admins, creator_logins` in that order**, and **`delete_account()` must
  learn every new role**, or that role's accounts become deletable as "no access".
- **The portal reads only the creator id from `creator_logins`**, never from
  the request, and only aggregates (monthly at the finest).
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
- **Icons are lucide** (shadcn's and ReUI's default), like the whole shell.
  The global Font Awesome rule is for projects that use Font Awesome (the
  Flutter app); it does not apply here.
- **Dark mode follows the OS** (`prefers-color-scheme`); there is no `.dark`
  class and no switch.
- **Dates shown in client components go through `lib/format.ts`**, never
  `Intl.DateTimeFormat`: Node's and the browser's locale data differ ("Sept" vs
  "Sep"), which breaks hydration.
- **Code fields are `CodeField`** (`components/code-field.tsx`), one plain
  input — not shadcn's six-box `input-otp`, which Bitwarden's inline suggestion
  cannot fill (tested 2026-10-01, input-otp#152). Server actions strip
  whitespace before the 6-digit check.
- A data-grid in `/portal` still shows **bucketed rows only** — the privacy
  rule above is about the grain, and a grid makes per-row display the path of
  least resistance.

## Conventions

- Do **not** use Supabase MCP `apply_migration`. Use the CLI, and commit the
  file.
- Commit to `main` by default; no self-made feature branches unless asked.
- Never write to Directus from here. The CMS is the app's, and changes there are
  made by hand by the user.

## Memory: local and Basic Memory, kept in sync

Memory lives in two places with the same content: Claude Code's local memory
for this repo, and the **Basic Memory** project `cyclea`, folder
**`Cyclea Admin`** (one note per memory, same title, plus the overview note
`Cyclea Admin` that lists them).

- Every memory written, changed or deleted locally gets the same change in
  `Cyclea Admin` in the same session, and the other way round. Update the
  overview note's list and append a dated line to the project's root `log`
  note when a note is added or removed.
- Before relying on a memory, check whether the Basic Memory copy is newer
  (it may have been edited from another device or session) and bring the
  local copy up to date.
- The same rule as for local memory applies: nothing derivable from the repo,
  no secrets, no app user data.
