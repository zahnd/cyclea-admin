# Architecture

## What this is

The admin plane for Cyclea. Creator referral payouts are the first job; other
administrative actions follow as they are needed. Within a year the same app
also serves a **creator self-serve portal**, so it has two audiences from the
outset — `/admin` for us, `/portal` for creators — and the boundary between them
is enforced, not conventional.

| piece | where |
|---|---|
| this app (admin UI + creator portal) | Next.js on Render, Frankfurt |
| admin data: payouts, rates, audit log, logins | Supabase **Cyclea Admin PROD** (`mtcnwjpjbupsbkbhqbph`), Zürich |
| app data: profiles, cycles, referrals, purchases | Supabase **Cyclea App PROD** (`zekaahjqdynuhjmgkpqf`), Zürich — **read through one view** |
| money movement | the bank / Wise. Never this system. |

Both Supabase projects are in the same organization, so the second one costs
compute rather than a second plan fee. Same region as the app, so nothing here
adds a cross-border transfer.

The decision record — why a second project rather than a schema in the app's
database, and why not Lovable or Django — is `cyclea-app/docs/admin-platform.md`.
This document is the part a person writing code in *this* repo has to obey.

## The credential boundary

**Nothing this app holds may be able to read health data.** Not "our queries
only touch the safe tables" — the credential itself must be incapable of it.
Cyclea is a menstrual-cycle tracker; `cycles`, `daily_logs`,
`daily_log_selections` and `planner_entries` are the most sensitive rows in the
company, and this app runs on a public web host.

Three credentials, and the second one is the whole design:

| credential | env var | reaches |
|---|---|---|
| admin project secret key (role `service_role`) | `SUPABASE_SECRET_KEY` | payouts, rates, audit log, creator logins — no app data at all |
| `admin_portal` Postgres role, **app** project | `CYCLEA_APP_DATABASE_URL` | seven views — `creator_revenue_events`, `creator_referral_counts`, `app_feedback_admin`, `content_feedback_admin`, `user_reports_admin`, `support_threads_admin`, `support_messages_admin` — two functions — `support_team_reply`, `support_set_status` — and writes to `public.creators`. Nothing else. |
| app project service role | — | **never exists here.** Edge Functions only, and it never leaves Supabase. |

`admin_portal` is a plain login role with hand-written grants. Postgres enforces
them, which is a far stronger guarantee than a code review of every query this
app will ever contain. The grants are in `docs/setup.md` § *Creating the
`admin_portal` role* (and `cyclea-app/docs/admin-platform.md`); keep the list
exactly that short, and when something new is needed, prefer **a new view in the
app project** over widening the role.

Two consequences that are easy to violate by accident:

- **No `NEXT_PUBLIC_` variable may ever describe the app project.** In practice
  there are none at all: every Supabase call runs on the server, so even the
  admin project's URL and publishable key (public by design, protected by RLS)
  stay server-side. Anything app-project-related is server-only, with no
  exceptions, because a `NEXT_PUBLIC_` prefix is a one-character mistake that
  ships a credential to every visitor.
- **Name the Supabase clients unmistakably.** Not `supabase` and `supabase2`:
  `adminDb()` (secret key), `adminDbAsUser()` (the signed-in user's session) and
  `appDbAsAdminPortal()` (the app project as `admin_portal`) in `lib/db/`, so a
  wrong import reads wrong. The last is not called "read-only": the role also
  creates and edits `creators`.

## The app-side read surface

Seven views in the app project, each granted to `admin_portal` alone, plus
two functions for the support inbox (below). The
first, `public.creator_revenue_events` (migration 0056), carries three rules
that code here must respect:

**No `user_id`, by design.** A creator must never learn *which* accounts they
referred. Referred users are app users with cycle data, and a creator handed a
list of 14 signups can often guess identities from timing alone. The column is
absent from the view, so even a full compromise of this host cannot correlate a
subscriber to a creator. `event_id` is there so a payout dispute can be traced
through the Supabase dashboard as the service role, which is where that kind of
investigation belongs.

**`price` is USD; `currency` is not about it.** The view exposes `price` (USD,
normalized by RevenueCat) next to `price_in_purchased_currency` and `currency` —
and the first and last are **not a pair**. 8.30 CHF arrives as `price = 10.059`.
Computing a share from `price` and paying it in `currency` is wrong by the whole
exchange rate, silently, for most customers of a Swiss app. **Compute shares
from `price_in_purchased_currency` + `currency`.**

**`commission_percentage` and `tax_percentage` are 0–1 fractions.** Play's 15%
arrives as `0.150000`. Reading it as a percent understates the store's cut 100×.

**`creator_referral_counts` (0059)** is referrals per creator per month —
aggregates only, for the portal and the creator pages.

**`app_feedback_admin` (0066)** is in-app feedback for `/admin/feedback`. It
leaves out `user_id` (nobody here needs to know who wrote it) and the
screenshot path: screenshots can show cycle data, so they stay in the app
project's private bucket and the page links to the Supabase dashboard, behind a
Supabase login. What it does carry is `message`, **free text the user typed**,
which can mention health details. That is the one place this host reads text a
user wrote, accepted knowingly (it went to Slack before) and named in the
privacy policy under Render; the role still reaches none of the health tables.
Our triage of it — status, note, link — lives in this project
(`feedback_triage`, 0008) and never copies the message, so deleting an app
account still removes the text everywhere.

**`content_feedback_admin` (0067)** is content ratings for
`/admin/feedback/content`: a thumb, an optional note (free text again, accepted
the same way), the item's kind and Directus id, no `user_id`. This host has no
Directus credential, so the item's name comes from `content_title`, which the
app's `content_feedback_sync` stamps when it mirrors a rating into Directus —
the title at rating time; the summary groups by (kind, Directus id) and lists
every title an item had, and "Open in Directus" opens the live item.
`note_changed_at`, set by a trigger, is what reopens a triaged rating whose
note changed; `updated_at` moves with sync stamps and re-tapped thumbs too.
Only ratings with a note are triaged (`feedback_triage`, kind `content`, 0010).

**`user_reports_admin` (0068)** is abuse reports for `/admin/reports`, and the
one view that names an app user on purpose: moderation needs to know who was
reported, so it carries the reported account's username and display name at
report time and now, whether the account exists, and how many reports it has
drawn. It never carries the reporter — not even a count — nor any user id,
since every id keys the health tables. The reporter's `note` is free text and
may name people. What we did lives here in `report_triage` (0012), audited
without names; it is deleted 12 months after the report by a pg_cron job, the
same window in which the app purges the report itself (0026), so our record
never outlives what it describes. Acting on an account stays
`make delete-user` in cyclea-app: this host holds no credential that could.

**`support_threads_admin` and `support_messages_admin` (0069)** are the
support inbox, `/admin/support`: conversations a user started with the team
in the app (cyclea-app `docs/support.md`). The thread view names who wrote —
username and display name — with platform, app version, language and whether
the user is entitled; never a user id or an email address, because a reply
needs no address: it lands in the app, and the app emails the user a note
without the text. The messages view carries the bodies, **free text the user
typed** (and, for a conversation handed over from the AI chat, the transcript
rows, `from_transcript`), accepted on the same terms as feedback messages.

The inbox is the one place this host **writes user-facing text into the app
project**, and it does so only through two `SECURITY DEFINER` functions
granted to `admin_portal` — never a grant on the tables:
`support_team_reply(thread, body, team_name)` (a team message; the thread
becomes *answered*) and `support_set_status(thread, 'open' | 'closed')`. The
functions raise `thread_closed` / `invalid` / `open_thread_exists`, which the
actions map to a message (`supportRaised`, `lib/support/validation.ts`).
Replies are signed with the admin's first name, `admins.support_name` in this
project (0014), set on *Profile*; replying is blocked until it is set. Here we
keep only the audit entries `support.reply` / `support.close` /
`support.reopen` with the thread id — **never the message text, never the
user's names**: audit rows are permanent, threads go with the account or 12
months after closing. The notification email (kind `support`, 0014) carries a
count and a link, nothing a user wrote.

Feedback that reaches us outside the app (WhatsApp, in person, email) is
entered by an admin into **`manual_feedback`** (0008), in this project, and
shown in the same list. It records the channel and never who said it — no
name, number or handle — so there is nothing to correlate and nothing to
delete on request. Its text is ours to keep; the audit log still records only
that it changed.

A manual entry can carry **one image** (0009) — a screenshot someone sent, a
photo of the bug. It sits in this project's private Storage bucket
`manual-feedback` (no `storage.objects` policies, so only this server's
secret key reaches it) and is shown only through
`/admin/feedback/app/<id>/image`, a route handler that calls
`requireAdmin()` and answers `no-store` — never a public or signed URL. Every
upload is decoded and **re-encoded to WebP** by sharp (`lib/feedback/image.ts`):
that drops EXIF/XMP, so a phone photo's GPS position and camera never get
stored, and only JPEG, PNG, WebP and GIF are accepted, by content (SVG is
refused). What the picture *shows* is the admin's call: the form says no names,
faces, numbers, chat headers or cycle data, crop or blur first. That notice is
the only safeguard: a screenshot of the app can show cycle data, which is why
the app's own screenshots never leave Supabase. Accepted knowingly
(2026-10-14) because one person adds every manual entry; revisit it if that
changes. The object is
`<entry id>/<random uuid>.webp`, replaced under a new name; the audit log
records only added / replaced / removed. Server actions accept 6 MB bodies
(`next.config.ts`) for the 5 MB upload limit.

## Money rules

**The view reports facts, not totals.** Rows are transactions as the store
reported them; what is *owed* is this app's arithmetic, and two inputs to it are
still open:

- **Gross or net?** A share of "revenue" is ambiguous by a factor that matters —
  stores take 15–30% and VAT comes off the top, so 20% of the store price is
  nearer 30% of what arrives. A contract question, not a schema one. It must be
  settled in the creator agreement before the first payout.
- **Refunds.** Every `CANCELLATION` and `EXPIRATION` observed so far carries
  `price = 0.0000`, but none was a genuine refund, so whether a
  `CUSTOMER_SUPPORT` refund returns the amount is unconfirmed. Do not encode a
  guess. Note also that the view filters `price IS NOT NULL`, not `price > 0`,
  so zero-price lifecycle events **are** rows: a naive `count(*)` overcounts
  transactions.

**A creator payout is very hard to claw back.** That makes this the one area
where being slow is cheaper than being wrong, and it is why both questions above
block the first payout rather than being tidied up afterwards.

**Never store bank details.** Reference a payee by its id in the bank or Wise.
The ledger records that a payout happened and for how much; it does not need to
know the account it went to.

**Money is `numeric`, never a float.** Same reason it is `numeric` in the app
project: binary floating point cannot represent 29.99, and these values get
summed and paid out.

## Creator identity spans both projects

`public.creators` lives in the **app** project and cannot move: it is read
synchronously by `claim_creator_code`, so a code has to work the instant it
exists. Any design where the app learns about creators through a sync has a
window where a creator hands out a code that returns `invalid`.

**Creator logins are separate from creators.** Creating a creator does not
create an account. A creator gets a login in *this* project's `auth.users`
through *Give portal access* on the creator's page, linked to the creator id in
`public.creator_logins` (migration 0006). That link is a role, like
`public.admins`, and never alongside it: one account, one audience. It shows as
"Creator" in Users; `grant_admin` and `delete_account` refuse such an account.
Creators sign in with an email code only and land in `/portal`, which reads
their creator id from the link — never from the request — and shows only
aggregates: their code, its status, referrals per month
(`creator_referral_counts`, app migration 0059).

This project owns the creator's *business* record — rate, contract terms, payee
reference, portal login, notes — keyed by **the same uuid**. Creating a creator
is therefore one action writing two rows: the app project's `creators` row
through `admin_portal`, and the local row with the same id. No sync and no
drift, because the id is chosen once and used in both places.

Migration 0054 in the app repo left the door open for exactly this:

> `-- A uuid rather than a serial so either side can generate one, should the`
> `-- creator admin later own creator identity.`

## Joins across the two projects

Postgres cannot join across Supabase projects. **Join in the Next.js server**:
read `creator_revenue_events` through `admin_portal`, read payout records from
the admin project, combine in memory. At this scale — dozens of creators — it is
not a performance question, and it keeps the boundary where the grants put it.

`postgres_fdw` and a scheduled sync were both considered and rejected; the
reasoning is in `cyclea-app/docs/admin-platform.md` § *Cross-project reads*. The
short version: the first re-creates the credential this design exists to avoid,
and the second copies app data into a second store, which is more exposure, not
less.

## The audit log is not optional

Append-only, in the admin project, from the first migration: who created which
creator, who marked which payout paid, who changed a rate, who granted what.
Retrofitting one is always worse, and for money it is the difference between a
discrepancy being explainable and being an argument.

Append-only means no `UPDATE` and no `DELETE` grant on that table for the
application role — not merely that the code does not issue them.

## Conventions carried over from the app repo

- **Numbered SQL migrations** under `supabase/migrations/`, applied with
  `supabase db push`, committed with the change that needs them. Never edit an
  applied migration — add another one. The app repo's migrations are worth
  reading as a house-style reference: they explain *why* in the file, and they
  end with a `VERIFY` block of queries that prove the change did what it claims.
- **New tables need explicit `GRANT`s** in the same migration. Supabase stopped
  granting defaults to `anon`/`authenticated` for new `public` tables as of
  2026-10-30, so a table without grants is simply unreachable — which is the
  right default, but it has to be noticed.
- **`REVOKE ... FROM PUBLIC` alone is not enough.** Name `anon` and
  `authenticated` explicitly; see the app repo's migration 0030 for the incident
  that taught this.

## The MCP endpoint

`/mcp` (lib/mcp, migration 0013) gives an AI client the same feedback an
admin sees, as that admin, and nothing more: it is a delegated session, not a
new credential with its own reach. Tokens come from this project's Supabase
Auth acting as an OAuth 2.1 server, with clients registered by hand (no
dynamic registration, so no stranger can create one); an admin approves each client on
`/oauth/consent` with a fresh authenticator code, and that approval is
recorded in `mcp_grants` for 30 days. `verifyMcpToken` accepts a token only
when Supabase confirms it (`getUser`), it carries a `client_id`, its user is
an admin, and the approval is active — Supabase's own grant lives until
revoked and its `aal` claim says nothing about the authenticator, so neither
is trusted alone. Before showing the consent page, Supabase's remembered
consent is withdrawn for every client without an active approval, so a
re-approval always passes through our page.

The tools read through `lib/feedback` and write only triage
(`set_feedback_triage`), audited as "<admin> via MCP (<client>)". They never
return reports, **support conversations** (`lib/support` is deliberately not
wired into `/mcp`), screenshots, images or anything identifying who sent
feedback. What users wrote does reach the AI provider; the privacy policy says
so, and the server instructions require paraphrasing — no quotes in issues,
commits or other systems.

## The image prep page (public)

`/image-prep` is the one page here without sign-in: editors shrink photos
before uploading them to Directus, without an admin account. Directus Cloud
refuses to transform an image with a side over 6000 px
(`ILLEGAL_ASSET_TRANSFORMATION`), the app always asks for a transformed
copy, and Cloud offers no way to resize on upload — no extensions, no Flow
that can, the limit itself Enterprise-only.

It is public only because it has **no server side**: the page is prerendered
(`force-static`), the proxy does not run on it, and the images are decoded,
resized and re-encoded in the visitor's browser (`lib/image-prep.ts`) and
saved from there — nothing is uploaded. What stays is a public page on the
admin's host, a crafted image decoded by the visitor's own browser, and
Render's usual request log. **Never add a server action, route handler,
database or Directus call to this route**; anything that needs one belongs
under `/admin` behind `requireAdmin()`. Every copy is re-encoded, even when
that makes a small one slightly bigger, so none keeps its EXIF location or
camera data. Not linked from the admin, by decision (2026-10-16).
