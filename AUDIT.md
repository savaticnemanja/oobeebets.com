# Launch readiness audit

**Date:** 2026-07-29
**Commit:** `39134b9`
**Scope:** full codebase — schema, auth, gating, billing, admin, public surfaces, CI/deploy

---

## Summary

The engineering here is strong. Tier gating strips locked picks from the payload rather than
hiding them in CSS, sessions are DB-backed and revocable, the pick record is append-only with
an audit trail, and the compliance surface (18+, responsible-gambling links, "we sell
information, not wagers") is handled properly. That is a better foundation than most products
in this category ever get.

The gaps are not in the build quality. They are that **the things which acquire and retain
customers are either missing or half-finished**, and that the product's central claim —
a public, honest track record — is unverifiable from outside and will be empty on launch day.

Three categories below, roughly in the order they block revenue.

---

## Part 1 — Defects found and fixed

Both are committed; detail lives in the commit messages.

| | Commit | Impact |
|---|---|---|
| Sitemap DB reads failed the build | `ad41259` | **CI red, and deploys broken.** `/sitemap.xml` sets `revalidate`, so its two DB reads run during `next build`. CI builds before it migrates; the Docker builder points `DATABASE_URL` at a placeholder host. Both threw `relation "picks" does not exist`. Reads now fall back to build time. |
| Seed used the UTC calendar, not the betting day | `39134b9` | **Intermittent CI failure, 8 hours a day.** A betting day starts 04:00 in `SLATE_TIMEZONE` (UTC−8 for New York), so between 00:00–08:00 UTC the seed wrote its newest slate a day ahead of what the app serves — the demo's "live board" was yesterday's settled slate. Verified across every hour of a year including both DST transitions. |

Verified by a clean-room run in CI's exact order (fresh DB, build → migrate → seed → verify →
e2e): 32/32 verify checks, 20/20 e2e checks.

---

## Part 2 — Launch blockers

### 1. No email capability anywhere in the stack — **critical**

`emailVerifiedAt` exists in [`src/db/schema.ts`](src/db/schema.ts) and nothing ever sets it.
There is no mail provider, no template, no send path.

Consequences:

- **No password reset.** A locked-out subscriber has no route back except a support email
  answered by hand.
- **No daily hook.** This is a daily-use product. Picks drop and nothing tells anyone. This is
  the single largest missing retention lever.
- **No trial conversion sequence.** A 3-day trial with zero touches will convert poorly.
- **No dunning.** [`src/lib/auth.ts`](src/lib/auth.ts) deliberately keeps `past_due` users in
  access while Stripe retries — a good call — but with no email you absorb failed payments
  silently.

### 2. Stripe is a stub — **critical**

Every method in [`src/lib/billing/stripe.ts`](src/lib/billing/stripe.ts) throws
`"Stripe provider not implemented"`. No money can be taken.

The seam itself is well designed: the mock writes the same fields Stripe would, the
subscription row mirrors a Stripe object, and price is frozen per-row so grandfathering
survives a price rise. The swap is genuinely contained — it just hasn't happened.

### 3. No analytics — **high**

No Plausible, PostHog, Umami, or anything else. Launching uninstrumented means no way to tell
which channel worked or where the funnel leaks, during the only period where that information
is cheap to act on.

---

## Part 3 — Built but dead

Fastest wins in the codebase: the mechanics exist, they just aren't wired to anything.

### The waitlist has no UI

The `waitlist` table is defined in [`src/db/schema.ts`](src/db/schema.ts) and referenced by
**nothing**. Worse, [`src/lib/billing/mock.ts`](src/lib/billing/mock.ts) rejects at-capacity
checkouts with *"We're at capacity. Join the waitlist."* — a waitlist that does not exist.
That is peak purchase intent hitting a dead end.

Pre-launch, a waitlist is not a nice-to-have. It is the launch strategy.

### "1000 of 1000 seats left"

[`src/app/(site)/page.tsx`](<src/app/(site)/page.tsx>) renders
`${seats.left} of ${seats.cap} seats left`, computed from the live subscription count. With
zero members that reads as *nobody has bought this*.

The scarcity mechanic inverts into anti-social-proof at exactly the moment it can do the most
damage. Show seats **taken**, or suppress the counter below a threshold.

### The free daily pick is `noindex`

[`src/app/(site)/picks/page.tsx`](<src/app/(site)/picks/page.tsx>) sets
`robots: { index: false, follow: false }`, and the sitemap deliberately omits `/picks`.

Correct for the paid board — but rank 1 is public to anonymous visitors, and it is the most
linkable, most shareable artifact the product generates. A dedicated indexable free-pick page,
with reasoning and a per-pick OG image, is a compounding SEO and social asset currently thrown
away once a day, every day.

---

## Part 4 — The trust problem

The track record page states results are *"measured, never self-reported."*

They are not. An admin types the final score into
[`src/components/admin/settle-list.tsx`](src/components/admin/settle-list.tsx).

The integrity controls behind it are real and well built — published picks cannot be deleted
([`src/app/actions/admin.ts`](src/app/actions/admin.ts) enforces void-instead-of-delete),
unpublishing is blocked once anything has settled, and every mutation is audit-logged. But
**none of it is checkable from outside**, and every scam tout in this market makes the exact
same claim. The controls protect you from yourself; they do not persuade a stranger.

Options, roughly by strength:

1. **Track closing line value.** The schema stores `price` and `book` but no closing price.
   CLV is the metric sharp bettors actually respect *and* it is falsifiable against public
   closing odds — anyone can verify it independently. Strictly more credible than a win rate.
   The existing `vsMarket` comparison is already pointed this way.
2. **Publish a commitment hash when a slate drops.** Hash the full slate at publish time and
   post it somewhere public. Cheap to build, and it converts "we logged this before kickoff"
   from an assertion into something checkable.
3. **Auto-settle from a results API** rather than manual entry, which would make the claim on
   the page literally true.
4. **Market the honesty already built in.** Suppressing win rate below 30 settled picks is
   principled and rare — most competitors would show 8-2 and call it 80%. Say so.

---

## Part 5 — Acquisition, given the constraints

**Assume paid acquisition is closed.** Google and Meta both gate gambling-adjacent advertising
behind certification that varies by jurisdiction, and a tipster service frequently does not
qualify. Plan as though you cannot buy traffic.

What remains:

- **SEO** — off the free daily pick (see above) and the track record, which already emits
  `Dataset` JSON-LD.
- **X/Twitter betting community** — daily free pick, results threads. The commitment-hash idea
  doubles as recurring content.
- **Affiliates and creators** — betting newsletters and YouTubers on revenue share. No
  referral, coupon, or affiliate mechanism exists in the codebase today.
- **Referral loop** — fits the capped-seat model unusually well: invite a friend, both get a
  month.
- **Reddit / Discord** — participate, do not advertise. Most communities ban tout promotion
  outright and the downside is reputational.

---

## Part 6 — Two decisions worth revisiting

**The 3-day trial is too short for a variance-heavy product.** A customer can watch three
losing days that say nothing about whether an edge exists, and churn. Seven days is better. A
*net-units-negative-first-month refund* is stronger still: it answers the trust objection
head-on and is the highest-converting offer shape in this category. Real exposure, but it is
the argument no competitor will make.

**Reconsider the $49 floor.** Base at $49/mo sold to cold traffic with no track record is a
hard ask. A cheaper or free tier — the top 3 picks, say — widens the funnel into the daily
email habit, which is where conversion actually happens.

---

## Part 7 — Sequencing

The uncomfortable implication of everything above:

> **Do not launch paid on day one.**

The conversion asset is the track record, and it will be empty. It cannot be bought, faked, or
accelerated — only accumulated. The seed data hides this, because it renders a populated,
credible-looking board that the real launch state will not resemble.

Suggested shape:

1. **Now → +90 days.** Publish the board publicly and free. Build a genuine settled record.
   Collect a waitlist. Post daily on X with the commitment hash.
2. **Meanwhile.** Ship email, Stripe, analytics, waitlist UI, the indexable free-pick page.
3. **Launch.** Open paid seats to the waitlist, with real history behind the paywall and
   scarcity that is true rather than asserted.

The waitlist and seat cap you have already built are exactly the right instruments for this
play. They are just not connected to anything yet.

---

## Appendix — What is already good

Worth stating plainly, because the list above is all problems:

- **Tier gating** ([`src/lib/gating.ts`](src/lib/gating.ts)) strips locked picks from the
  payload entirely. Blurring is decoration over an already-empty object. Verified by test.
- **Sessions** are DB-backed with SHA-256 token hashes, sliding expiry written at most daily,
  and immediate server-side revocation.
- **Login timing** is equalised with a real bcrypt decoy hash, generated at first use
  specifically so a malformed hash cannot short-circuit it.
- **Admin routes 404 rather than 403** for non-admins, so the route's existence stays private.
- **Role model** is three-level with owner-only role management — an admin cannot escalate a
  peer or remove the owner.
- **Record immutability** is enforced at the action layer, not by convention.
- **Sample-size suppression** below 30 settled picks, which is an honest and unusual choice.
- **Compliance** — 18+, BeGambleAware and NCPG links, explicit "not a bookmaker" framing.
- **The billing seam** is clean enough that swapping mock → Stripe changes no queries.
