# Payouts and the creator portal

## Decided: creators see a running balance

Chosen 2026-09-30, over settled-payouts-only and over a frozen monthly
snapshot. A creator opening the portal sees what they have earned *so far*, not
only what has already been paid.

That is the motivating choice, and it buys two problems that the settled-only
option would not have had. Both are cheap to design for now and expensive to
retrofit.

## Problem one: the number moves, so split it

A balance computed from live store events **goes down** — refunds, failed
renewals, currency movement. A creator who saw CHF 240 on Tuesday and CHF 190 on
Friday will ask why, and "the store reversed a purchase" is a fine answer only
if the interface said so beforehand.

So the balance is **two numbers, not one**:

| shown as | what it is |
|---|---|
| **Pending** | earned, but still inside the window where a purchase can be reversed |
| **Available** | past that window — this is what a payout run pays |

Only *Available* is ever paid out, so the number that matters stops moving
before anyone is promised it, and *Pending* falling is expected rather than
alarming because it is labelled as provisional.

**The holdback window is not yet chosen.** It should come from observed refund
behaviour rather than a guess — Google's self-serve refund window is short,
Apple's support-granted refunds can arrive much later, and the refund taxonomy
is itself still unconfirmed (see *Still open*). Start conservative; shortening a
holdback later is a pleasant surprise, lengthening it is a broken promise.

## Problem two: a balance invites "show me the transactions"

It is the obvious next request, and it is where the privacy rule can quietly
come undone.

`creator_revenue_events` has no `user_id` precisely so a creator cannot learn
who they referred. But **a list of transactions with timestamps is a
correlation channel even without identities.** A creator who knows a friend
signed up on the 14th, and sees one purchase on the 14th, has learned something
the design is supposed to prevent — and with few referrals, most rows are
identifiable that way.

So: **bucket before showing.** Daily at the very least, weekly or monthly
preferably, and never a row per transaction. Aggregate counts and sums are
fine; the grain is what leaks.

This is stricter than "no user_id", and it is the reason the rule has to exist
at the presentation layer too rather than being considered solved by the view's
shape.

## Currency

Revenue arrives in whatever the customer paid — `price_in_purchased_currency`
plus `currency` — while `price` is RevenueCat's USD normalization. A creator
paid in one currency from mixed-currency revenue therefore needs a policy:

- **Compute the share in the transaction's own currency**, so the arithmetic
  matches what the customer actually paid.
- **Convert at payout time, and store the rate on the payout row.** A payout is
  a historical fact; it must not change because a rate moved.
- **Never re-convert history.** A recomputed past payout that disagrees with the
  bank transfer is worse than no figure at all.

For a running balance this means *Pending* and *Available* need a display
currency and a rate that is clearly "indicative until paid". Saying so in the
interface costs one sentence and prevents the whole class of question.

## Caching

A running balance is recomputed on every portal page view, which is a query
across to the app project each time. The pooler runs in session mode with a
deliberately small pool, so cache per creator with a short TTL (a minute is
plenty — this is money that moves daily, not by the second) rather than letting
page views map one-to-one onto database round trips.

## Contracts and payee details

Decided 2026-10-01. **Bank details never enter this system** — not in a form,
not in the portal, not in a webhook. The path is:

1. The contract is signed in **Skribble** (Zürich, hosted in Switzerland; free
   plan, by hand — no API, which is Pro only). The creator writes their bank
   details into the contract.
2. An admin copies them **by hand** into the e-banking or Wise as a payee.
3. The admin app records only *that* it exists: the **payout method** (`bank` or
   `wise` — the only two we can pay through; no Revolut or PayPal business
   account), the **payee reference** (the payee's name in the e-banking, or the
   Wise recipient id), and the **contract's state** with a link to it in
   Skribble (migration 0007).

**A change of bank details is confirmed by phone**, on a number we already had,
before the payee is changed in the bank. "I've changed banks, please pay to this
IBAN" from a hacked or look-alike address is the classic payout fraud. A changed
payee reference also lands in the audit log, old and new.

**The contract link may only point at Skribble** (`my.skribble.com` / `.de`,
enforced by a CHECK). A Skribble link carries a document id and needs the
Skribble login; a Dropbox or Drive share link could hand the PDF, bank details
included, to anyone holding it.

**No payout without a signed contract** — the rule the payout run must enforce
when it is built. Portal access is deliberately not gated on it: the portal
shows the creator's own aggregates only.

If the contracts are ever automated through Skribble's API, the key on Render
can read the signed contracts. Use it only to send a request and learn that it
was signed — the same narrowing as `admin_portal` on the app project.

## Still open

All four block the first payout, none blocks building the app:

1. **The share percentage.**
2. **Gross or net** of store commission and VAT. `commission_percentage` and
   `tax_percentage` are stored unapplied so either is possible; this is a
   contract question. See `cyclea-app/docs/admin-platform.md`.
3. **Refund taxonomy** — which `cancel_reason` values actually return money.
   Unconfirmed; every cancellation observed so far carried `price = 0.0000`, but
   none was a genuine refund.
4. **The holdback window**, which depends on 3.
