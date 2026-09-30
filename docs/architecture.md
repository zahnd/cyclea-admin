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
| admin project service role | `SUPABASE_SERVICE_ROLE_KEY` | payouts, rates, audit log, creator logins — no app data at all |
| `admin_portal` Postgres role, **app** project | `CYCLEA_APP_DATABASE_URL` | `creator_revenue_events`, and writes to `public.creators`. Nothing else. |
| app project service role | — | **never exists here.** Edge Functions only, and it never leaves Supabase. |

`admin_portal` is a plain login role with hand-written grants. Postgres enforces
them, which is a far stronger guarantee than a code review of every query this
app will ever contain. The grants are in
`cyclea-app/docs/todo.md` § *The `admin_portal` Postgres role does not exist
yet*; keep the list exactly that short, and when something new is needed, prefer
**a new view in the app project** over widening the role.

Two consequences that are easy to violate by accident:

- **No `NEXT_PUBLIC_` variable may ever describe the app project.** The admin
  project's URL and anon key are public by design — they go to the browser and
  RLS is what protects them. Anything app-project-related is server-only, with
  no exceptions, because a `NEXT_PUBLIC_` prefix is a one-character mistake that
  ships a credential to every visitor.
- **Name the two Supabase clients unmistakably.** Not `supabase` and
  `supabase2`. Something like `adminDb` and `appDbReadOnly`, so a wrong import
  reads wrong.

## The app-side read surface

One view, `public.creator_revenue_events` (app project, migration 0056). Its
shape carries three rules that code here must respect:

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
