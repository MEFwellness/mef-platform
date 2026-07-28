# Production test accounts

Every build in this project had been verified only against a local copy or
an identical local Supabase instance — never against a real logged-in
session on `app.mefwellness.com` itself. This doc describes the fix: four
seeded accounts that live in the real production Supabase project, marked
so they can never be mistaken for a real member.

## What exists

One coach and three member states, all with `profiles.is_test = true`
(migration `00000000000114_test_account_flag.sql`):

| Account | Purpose | Check-in history | Forecast history |
| --- | --- | --- | --- |
| `memberPopulated` | Full, busy account — exercises every chart and the correlation/pattern engines | 40 days, realistic variation | 35 scored days each for her and Root (~75%/~65% real accuracy — deliberately imperfect, not a flattering 100%) |
| `memberBelowThreshold` | A few days in, below the forecast calibration threshold | 4 days | 3 scored days (under the 5-forecast minimum before accuracy rates are shown) |
| `memberEmpty` | Brand-new member, zero history | none | none |
| `coach` | A coach assigned to all three member states above | — | — |

`is_test = true` means these accounts are automatically excluded from:
- the admin panel's user list (`app/actions/admin.ts`'s `listUsers`)
- the admin's assignment history (`listAssignmentHistory`)
- any real coach's caseload (`app/actions/coach.ts`'s `listAssignedClients`) —
  the one exception is the seeded test coach itself, which still sees its
  own assigned test members; that pairing is the point of the fixture, not
  a leak.

Any future aggregate/analytics query added to this app should filter
`is_test = false` the same way, so a test account never inflates a real
count.

## Where the credentials live

Same file the screenshot tool already uses for exactly this purpose:
`apps/consumer-web-app/scripts/screenshots/.env.local` — gitignored (never
committed), loaded by both the screenshot tool and (manually, when running
it) the seeding script below.

```
# apps/consumer-web-app/scripts/screenshots/.env.local
MEMBER_POPULATED_EMAIL=...
MEMBER_POPULATED_PASSWORD=...
MEMBER_EMPTY_EMAIL=...
MEMBER_EMPTY_PASSWORD=...
COACH_EMAIL=...
COACH_PASSWORD=...

# Not read by the screenshot tool itself (it only ever drives
# memberPopulated/memberEmpty/coach) -- stored here anyway, in the same
# file, purely so all four production test accounts' credentials live in
# one place instead of two.
MEMBER_BELOW_THRESHOLD_EMAIL=...
MEMBER_BELOW_THRESHOLD_PASSWORD=...
```

`scripts/screenshots/.env.example` documents the variable names (no real
values); see that file for the full list including `SCREENSHOT_TARGET` and
`LIVE_BASE_URL`.

## Re-seeding or updating the accounts

`apps/consumer-web-app/scripts/seed-production-test-accounts.mjs` creates
(or reuses, if already created) the four accounts and (re)writes their
check-in/forecast history. It is idempotent — re-running it is always
safe, and never touches any account other than the four it's told about.

It needs its own set of env vars (separate from `scripts/screenshots/.env.local`,
since it also needs the **service-role** key, which the screenshot tool
never touches):

```bash
SEED_SUPABASE_URL=<production Supabase project's API URL>
SEED_SUPABASE_SERVICE_ROLE_KEY=<production Settings -> API -> service_role key>
SEED_MEMBER_POPULATED_EMAIL=... SEED_MEMBER_POPULATED_PASSWORD=...
SEED_MEMBER_BELOW_THRESHOLD_EMAIL=... SEED_MEMBER_BELOW_THRESHOLD_PASSWORD=...
SEED_MEMBER_EMPTY_EMAIL=... SEED_MEMBER_EMPTY_PASSWORD=...
SEED_COACH_EMAIL=... SEED_COACH_PASSWORD=...
node scripts/seed-production-test-accounts.mjs
```

(from `apps/consumer-web-app`). The service-role key is only ever used
locally, from a human's own terminal, for this one script — same
discipline the rest of this repo already follows (`README.md`'s
"Environment separation" section): it is never set as a Vercel
environment variable read by the deployed app itself... **except** that
this app's own cron routes (`app/api/cron/*`) do legitimately use
`SUPABASE_SERVICE_ROLE_KEY` server-side, which is why it's already a
configured Production environment variable in Vercel. Running this
seeding script from a laptop still requires pasting that same value in
locally, once, to a shell — never into a committed file.

## Running the screenshot tool against production

Already built, never exercised until these accounts existed:

```bash
SCREENSHOT_TARGET=live npm run screenshots
SCREENSHOT_TARGET=live npm run screenshots:tablet
```

(`apps/consumer-web-app/scripts/screenshots/config.mjs` — reads
`scripts/screenshots/.env.local` for credentials, throws immediately if
any required var is missing rather than silently falling back to a
local/dev value.) Local mode is completely unchanged: plain `npm run
screenshots` with no `SCREENSHOT_TARGET` still defaults to `local` and
the existing dev-seed fallback credentials.

## A real limitation, stated plainly

The correlation engine, driver-state engine, and Root Score's own
snapshot cache all populate on a **schedule** (the cron routes in
`app/api/cron/`), not on page load. Right after seeding, the
`memberPopulated` account's raw check-in history is real and immediate,
but its correlation findings / driver states may not appear until the
next scheduled cron run (staggered 12:00-15:00 UTC daily) has processed
that history at least once. The Root Score itself recalculates on
several triggers including a completed check-in, so it should already
reflect real data as soon as it's seeded (confirmed live in local
testing before this was ever run against production).
