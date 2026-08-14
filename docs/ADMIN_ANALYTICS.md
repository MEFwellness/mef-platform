# Admin Analytics: the service layer

The server-side layer that turns the behavioral events already being
recorded into answers. No dashboard, no member-facing change, and no second
tracking system. It reads the one event stream that already exists.

Companion document: `docs/PRODUCT_ANALYTICS.md` describes the events
themselves, where each one is written, and what may never go in a payload.
This document describes what is computed from them.

```
member_wellness_events  (migration 63, the one events table)
  -> product_analytics_events  (migration 146, behavioral types only, is_test joined on)
     -> analytics_* functions  (migration 149, all aggregation)
        -> lib/analytics-service/*  (thin wrappers, the documented rules)
           -> app/actions/analyticsAdmin.ts  (admin authorized entry points)
           -> app/admin/analytics/*  (the six dashboard screens)
```

## The dashboard

Six admin-only server-rendered screens, added in the two builds after this
layer. They consume the entry points above and nothing else.

| Route | Reads |
| --- | --- |
| `/admin/analytics` | `analytics_overview` for this window and the previous one, `analytics_feature_usage` for both (Food Lens scans), `analytics_drop_off` for the unmeasurable list |
| `/admin/analytics/funnel` | `analytics_funnel` |
| `/admin/analytics/features` | `analytics_feature_usage` |
| `/admin/analytics/drop-off` | `analytics_drop_off` |
| `/admin/analytics/members` | `getMemberEngagementStates`, and `findMembersForCoachFollowUp` for the signal counts |
| `/admin/analytics/members/[memberId]` | `getMemberFrictionSignals`, `getMemberActivityTimeline`, `analytics_member_window_comparison` |
| `/admin/analytics/insights` | `findWeakestFunnelStage`, `findFeaturesWithUnusualUsageDrops`, `findMembersWithIncompleteFlows`, `findDisengagedMembers`, `findMembersWithReducedUsage` |

The chosen window and the test-account toggle live in the URL
(`?range=7d|30d|90d|custom&from=&to=&test=on`), so changing either is a
navigation and the aggregation re-runs in Postgres. The member views add
`&state=` for the engagement filter, `&sort=` for the table ordering, and
`&ref=`/`&window=` for the before/after comparison, on the same principle. Nothing in the section is a
client component; no event row reaches a browser.

`lib/analytics-dashboard/` holds the five pure modules the screens depend
on: `viewState.ts` (what a URL means, and the previous equivalent period),
`trend.ts` (comparison against that period, with no percentage invented
from a zero baseline), `presentation.ts` (formatting, the "too few to rate"
rule, and the empty-state copy), `memberView.ts` (engagement sorting and
filtering, the six table orderings, the basis and signal labels, the
before/after readout, and the member views' empty copy), and
`insightsView.ts` (the product insights cards, and the rule that an empty
result and a failed query are never rendered the same way). The screens themselves cannot be unit-rendered in
this repo, so those rules live there and are tested directly.

### The member views

The engagement table lists every in-scope member, sorted most in need of
attention first: INACTIVE, then WATCH, then ACTIVE, and inside each of those
the longest away first. NEW is the service layer's fourth state and sorts
last, below ACTIVE: a member whose first activity was four days ago has not
disengaged, and putting her above a member who genuinely stopped would push
the real absences down the list. She is listed, never hidden.

Each row carries the state, the basis **in the service layer's own token**
(`self_comparison`, `fixed_thresholds`, `new_member`, `never_active`) beside
its plain-language expansion, days since last active, her usual rhythm where
one is known, and how many friction signals are raised.

The signal count comes from `findMembersForCoachFollowUp`, which runs the
per-member friction queries only for members already in a WATCH or INACTIVE
state. An ACTIVE or NEW member is therefore shown as **"Not counted"**, never
as a zero: an uncounted member and a member with nothing raised are different
facts, and a zero would make the second claim on the first's behalf.

The detail shows her state and reason, her signals as cards (the observation
verbatim, since when, the evidence counts, and the evidence sufficiency), her
activity timeline, and the before/after comparison. The before/after
reference date defaults to one whole window before the end of the selected
range, so the after window has finished elapsing. Defaulting to today would
show an empty after window, which reads as a collapse whether or not anything
collapsed.

### The activity timeline, the one row-level read

`lib/analytics-service/timeline.ts` is the only function in this layer that
reads rows rather than handing a whole question to Postgres. There is no
per-day, per-feature database function to ask, and the question is about one
member over one bounded range, so it reads that member's rows through the
same `product_analytics_events` view and groups them in TypeScript. No new
database function and no new migration.

Four things keep it honest and inside the doctrine above:

- **Authorization is inherited, not reimplemented.** The first call is
  `analytics_member_engagement_facts` for that member, which runs
  `analytics_assert_admin()` and raises 42501. A non-administrator is refused
  before a single row is read, with the same `AnalyticsAccessDeniedError`
  every other function raises. That call is also what decides whether the id
  is an in-scope member, so there is no second scope rule.
- **The rows never leave the server.** What the action returns is counts: a
  day, a feature, how many events, how many starts, how many completions. No
  payload, no event id, no timestamp finer than the calendar day.
- **The labels come from the database.** `analytics_feature_registry()` and
  `analytics_flow_registry()` are read over RPC rather than copied into
  TypeScript, so a timeline cannot label a feature differently from the
  feature usage screen or disagree about which events are a start.
- **It is capped, and says when it capped.** `TIMELINE_ROW_CAP` is 2000. On
  reaching it the oldest included day is dropped, because it is the only one
  that could be half read, and the screen says which days are missing rather
  than looking complete.

An event type with no registry entry (a sign-in, a signup, a paywall view)
still appears, labelled with its own event type made readable. Dropping it
would make a member's week look quieter than it was, and a second registry of
labels would drift. Note that this is a wider set than **meaningful
activity**: a signup on its own is not app usage for the engagement rules,
but it is something that happened and it belongs on her timeline.

The dashboard never resolves a date range of its own: `parseDashboardView`
builds an `AnalyticsPeriod` and hands it to `resolveAnalyticsRange`, the
same function every query here uses, so a card's label and the query
underneath it cannot drift apart.

## What was reused, and what is new

Reused, unchanged: the event stream, the read view, the write path, the
allowlists in `lib/analytics/surfaces.ts`, `profiles.is_test`, the
`platform_administrator` role, `has_active_role`, and the existing row level
security policies.

New in this build: migration 149 (twenty read-only database functions and
one index), `lib/analytics-service/`, and `app/actions/analyticsAdmin.ts`.
Nothing existing was modified.

Added by the two dashboard builds after it, with no migration and no new
database function: `lib/analytics-dashboard/`, `components/admin/analytics/`,
the six page routes, `lib/analytics-service/timeline.ts`, and one action,
`getMemberActivityTimelineAction`.

## Definitions

These are the words the whole layer is built on. Each one is a decision, and
each is stated here rather than left implicit in a query.

**Meaningful activity.** Any behavioral event that means the member was in
the app. Three analytics event types are deliberately excluded:
`signup_completed` (creating an account is not usage),
`membership_tier_changed` (written by a trigger, usually by an
administrator), and `purchase_completed` (nothing emits it). Defined once,
in `is_meaningful_activity_event_type`.

**Active.** A member is active on a calendar day if she produced at least
one meaningful event on that day, and active in a period if she was active
on at least one day in it.

**Session.** One session means one active member-day. It does **not** mean
one sign-in. `session_started` fires only on a completed sign-in, and this
app keeps members signed in for weeks, so counting sign-ins would undercount
real visits badly. Sign-ins are still reported, separately, as `signIns`.

**Member.** A profile that is not a test account (unless the caller asked
for them) and holds no coach, administrator or clinician role grant. A coach
signing in to review a caseload writes the same events a member does;
counting that as member activity would inflate every number. Defined once,
in `analytics_member_scope`.

**Day.** Always `local_date`, the member's own calendar day computed in her
timezone at write time. Never `occurred_at`, which is her wall clock stamped
as UTC and is correct only for ordering events relative to each other. This
was a real bug once. Two tests in
`tests/analytics-service-integration.test.ts` exist purely to keep it fixed,
and both fail if any function filters on the wrong column.

## The rule about honest empty states

Every rate is `null`, never `0`, when its denominator is zero. A period with
no Daily Resets started reports a null completion rate, not "0 percent
completion". Real member activity is currently very small and a fabricated
zero would be read as a failure that did not happen.

The same applies to anything that cannot be measured at all: it is returned
with `measurable: false` and a plain-language reason, never as a count of
zero.

## Service groups

### A. Overview, `analytics_overview`

Total members, new members, active members, daily and weekly actives (plus a
per-day series), returning members, sessions, sign-ins, average sessions per
active member, average days between visits, Daily Reset and onboarding
completion rates, and per-feature member counts for nutrition, Today, Today's
Focus, the Reset Plan and Your Case. Paywall views and tier changes are
reported as the monetization signals; purchases are reported as unmeasurable.

`newMembers` counts `signup_completed` events; `profilesCreatedInRange`
counts `profiles.created_at`. Both are returned so the gap between them, for
accounts created before product analytics shipped, is visible rather than
looking like nobody signed up.

### B. Funnel, `analytics_funnel`

The cohort is every in-scope member whose `signup_completed` event falls
inside the range. Each later stage asks whether that member has **ever**
reached it, up to the end of the range, rather than whether she did so
inside the range. A member who signed up on the last day of the range has
not had time to do anything else in it, and counting her as a drop-off would
be false.

| Stage | Measurable | From |
| --- | --- | --- |
| Account created | yes | `signup_completed` |
| Onboarding started | yes | `onboarding_started` |
| Onboarding completed | yes | `onboarding_completed` |
| First meaningful app use | yes | any meaningful event other than sign-in and onboarding |
| First Daily Reset started | yes | `daily_reset_started` |
| First Daily Reset completed | yes | `daily_reset_completed` |
| Returned another day | yes | activity on two or more calendar days |
| Used another major feature | yes | food events, `feature_engaged`, or a non-Home surface view |
| Viewed a premium or locked feature | yes | `paywall_viewed` |
| Completed a purchase | **no** | nothing emits `purchase_completed` |

Percentages of the cohort and of the previous **measurable** stage are added
in `lib/analytics-service/reports.ts`, which is where they belong: skipping
over an unmeasurable stage needs the whole ordered list at once.

### C. Feature usage, `analytics_feature_usage`

Per feature: unique members, total events, share of active members, repeat
members, multi-day members, average events per member, and a completion rate
where a real started/completed pair exists. Ranked most to least used.
Features nobody used are returned as honest zeros rather than omitted, so
"nobody has opened Movement" is visible instead of invisible.

The feature list is declared once, in `analytics_feature_registry`, from the
same closed allowlist the instrumentation writes against.

### D. Drop-off, `analytics_drop_off`

Started and completed counts, completion rate and drop-off rate for every
flow that genuinely emits both halves: the Daily Reset, onboarding, a
Today's Focus item, Reset Plan setup, and the Priority Card. Worst drop-off
first.

Two things are reported as unmeasurable rather than guessed:

- **Experiences.** `lib/analytics/surfaces.ts` accepts `questionnaire` as an
  engageable feature with `started` and `completed` actions, but no call
  site writes them. An experience is only ever observed as a surface view.
  Showing this as "100 percent drop-off" would be a lie about a real
  feature.
- **Per-question drop-off.** No per-screen or per-question event exists.
  Where inside a flow a member stopped cannot be attributed, and nothing
  here pretends otherwise.

### E. Engagement states, `analytics_member_engagement_facts` plus `lib/analytics-service/engagementState.ts`

The database returns facts. The classification is pure TypeScript, so every
rule can be read, tested and argued with without a database.

These states describe **behavioral engagement only**. They are not health
scores, not wellness scores, and not a judgment about a member. A member can
be doing beautifully and be INACTIVE here.

The rules, in order:

0. **Never active.** Account created within 14 days: NEW. Older: INACTIVE.
1. **NEW.** Her first activity was within the last 14 days. There is no such
   thing as a decline against three days of history.
2. **Self-comparison**, used when she has at least 42 days of history and
   was active on at least 4 days in the baseline window:
   - Away longer than **three times her own usual gap between visits**,
     floored at 7 days: INACTIVE.
   - Recent visit rate below **half** her baseline rate: WATCH.
   - Otherwise: ACTIVE.
3. **Fixed fallback**, only when there is not enough of her own history for
   step 2, and labelled `fixed_thresholds` so nobody mistakes it for a
   personalized judgment:
   - Active within 7 days: ACTIVE
   - 8 to 21 days: WATCH
   - Longer: INACTIVE

Windows: recent is the 14 days ending on the reference date, baseline is the
28 days immediately before that. Every threshold is a named constant in
`engagementState.ts`.

### F. Agent-ready queries, `lib/analytics-service/queries.ts`

Which members have disengaged, which have not returned within an explicit
threshold, which started something and did not finish, which have reduced
their own usage, which features have unusual usage drops, which funnel stage
is losing the most members, and which members may deserve a coach follow-up.

Every one is a wrapper. None contains a detection of its own.

`findMembersForCoachFollowUp` returns a shortlist for a human to look at,
ordered by an `attentionScore` that is a deterministic count of reasons: two
for a disengaged member, one for a watched member, one per friction signal
that indicates something stuck. It is not a ranking of clinical need and it
sees nothing about anyone's health.

**Nothing here messages anyone.** There is no autonomous agent, no
scheduling, and no LLM call in this build.

## One detection, many consumers

Where an agent-ready query and a friction signal detect the same condition,
they call the same function. There is exactly one implementation of each:

| Condition | The one function | Consumed by |
| --- | --- | --- |
| Absence, decline, history sufficiency | `analytics_member_engagement_facts` | engagement states, disengaged / not-returned / reduced-usage queries, long-absence, activity-decline, returned-after-absence and insufficient-history signals |
| Started and did not finish | `analytics_detect_incomplete_flows` | incomplete-flows query, repeated-incomplete-flow and onboarding-not-completed signals |
| A feature used less than before | `analytics_detect_feature_change` | member feature-decline query, feature-decline signal |
| Opened and never acted on | `analytics_detect_view_without_engagement` | viewed-without-engaging and opened-once-not-revisited signals |
| A habit that is holding | `analytics_detect_consistent_feature_use` | consistent-use signal |
| A feature declining across everybody | `analytics_feature_trend` | unusual-usage-drops query |

Two implementations of the same condition would eventually disagree, and an
admin dashboard and a coaching prompt disagreeing about whether a member has
disengaged is worse than either being wrong alone. A test asserts the query
and the signal read identical numbers.

## Behavioral friction signals

`lib/analytics-service/friction.ts`. Deterministic, no LLM, no
interpretation.

| Signal | Evidence required |
| --- | --- |
| `repeated_incomplete_flow` | a flow started at least 3 times and finished less than half the time |
| `onboarding_not_completed` | onboarding started at least once and never completed |
| `viewed_without_engaging` | a feature opened at least 3 times with zero interactions |
| `opened_once_not_revisited` | opened on exactly one day, at least 7 days ago, with app use since |
| `feature_use_declined` | at least 3 baseline events, recent rate below half the baseline rate |
| `overall_activity_declined` | recent visit rate below half her own baseline rate, self-comparison only |
| `long_absence` | away longer than 3 times her usual gap, floored at 7 days |
| `returned_after_absence` | a closed gap of 14 days or more, with the return within the last 7 |
| `consistent_feature_use` | a feature on at least 60 percent of her active days, over at least 5 active days |
| `insufficient_behavioral_history` | fewer than 7 days of history, or no activity at all |

Every signal carries a signal type, a plain-language reason, the behavioral
evidence behind it, the comparison period where one applies, and an evidence
sufficiency level.

**Evidence sufficiency is not a confidence score and not a medical score.**
It answers one question: how much behavior did we actually observe before
saying this. Strong is at least 10 observations across at least 21 days of
history; moderate is at least 4 across at least 10 days; anything less is
low.

**What a signal may say:** "The Daily Reset was started 5 times and
completed 1 time in this period."

**What a signal may never say:** "The member lacks motivation." Why she
behaved this way is not in the data. A test asserts that no signal contains
interpretive language.

When there is not enough history for any pattern claim, the report contains
exactly one signal saying so and no others. Returning a half-confident
decline alongside "we do not have enough data" would contradict itself.

## The before/after primitive

`analytics_member_window_comparison`. One member, one reference date, the
same measurements for the window before and the window after.

- **The reference day belongs to neither window.** It is the pivot: the day
  the thing being observed happened. Counting it in the after window would
  mean an intervention's own day counts as its own result.
- **`afterWindowComplete` must be checked.** An after window that has not
  finished elapsing has fewer days of opportunity than the before window, so
  it will look like a decline whether or not anything declined. The
  primitive says so rather than quietly returning the smaller number.
- `compareWindows` returns `null`, not `Infinity`, for a change ratio when
  the before window is zero. "She went from nothing to something" is a real
  observation; an infinite percentage increase is not.

Friction signals use it for baseline comparison. A future coaching layer
will use it to observe whether an intervention changed behavior.

## Privacy

Behavioral events only. No check-in answer, pain information, sleep answer,
questionnaire response, nutrition detail or health symptom enters or leaves
any function in this layer.

This is structural, not a matter of discipline. Every read goes through
`product_analytics_events`, which excludes the five health-content wellness
event types by construction. No function in migration 149 selects from any
table holding health answers.

Two tests enforce it: one writes real health content into the event stream
and asserts it appears in no service output and that no output carries a
health-answer field name; another asserts no friction signal contains
anything that could only have come from an answer.

A note on wording: a feature **name** is not health content. A signal saying
a member stopped using "Food and protein logging" has to be able to name the
feature. What may never appear is what she logged.

## What cannot be measured yet, and why

| Not measurable | Why |
| --- | --- |
| Purchases and revenue | Checkout happens entirely outside this application. Nothing emits `purchase_completed`. Tier changes and paywall views are used instead. |
| Experience start and completion | No call site emits `feature_engaged` for the questionnaire feature. Only surface views exist. |
| Per-question drop-off inside a flow | No per-screen or per-question event exists. |
| Signups before product analytics shipped | `signup_completed` only exists from the day migration 146 was deployed. `profilesCreatedInRange` is returned alongside the cohort so the gap is visible. |
| Time spent on a screen | Only an open event is recorded; nothing records leaving. |

## Authorization

Three independent layers:

1. `app/actions/analyticsAdmin.ts` checks `platform_administrator` through
   the same `hasActiveRole` helper the rest of the app uses, and returns an
   error result rather than data.
2. Every database function calls `analytics_assert_admin()` first, which
   raises `42501`. A bug in the action layer could not get past it.
3. The functions are **security invoker**, so row level security still
   applies underneath. A member who somehow reached them would still see
   only her own rows.

An access denial surfaces as a distinct `AnalyticsAccessDeniedError`, never
as an empty report. An empty analytics report and a rejected one look
identical on a dashboard, and confusing the two is how a permissions bug
hides for months.

Direct database sessions and service-role connections are allowed through,
because they already bypass row level security. That is what lets a cron job
and the future Engagement Agent call this layer.

## Performance

All aggregation happens in Postgres. Nothing in this layer loads raw event
rows into application memory, and nothing should: the event table is
designed to grow to tens of millions of rows.

One index was added, `member_wellness_events (local_date, event_type)`.
Every query here is "all members, one calendar-day range, some event types",
which neither existing index can serve: one needs a member id, the other is
on `occurred_at`. It is additive; no existing reader's plan changes.

**No materialized view or rollup table was added**, deliberately. At current
volume every function is one range scan over a few thousand rows, and a
rollup would add a staleness contract and a refresh job for no measurable
gain. If the event table passes roughly ten million rows, the next step is a
`member_analytics_daily` summary keyed on `(member_id, local_date)`,
refreshed by the existing cron infrastructure, which every function here
could read instead with no change to its own shape.

The one place to watch is `findMembersForCoachFollowUp`, which runs
per-member friction queries. It shortlists to members already in a WATCH or
INACTIVE state and caps at 25 by default, rather than querying every member
on the platform.

## Tests

| File | Covers |
| --- | --- |
| `tests/analytics-service-range.test.ts` | date range resolution, presets, boundaries, leap days, the calendar-day rule |
| `tests/analytics-service-engagement-state.test.ts` | every engagement rule branch, both the self-comparison path and the insufficient-history fallback |
| `tests/analytics-service-friction-signals.test.ts` | every signal, from both sides of every threshold, plus the no-interpretation and no-health-content rules |
| `tests/analytics-service-integration.test.ts` | every metric against a hand-countable fixture, the funnel including the unmeasurable stage, test-account exclusion and the toggle, member isolation, privacy, authorization, empty states |
| `tests/admin-analytics-dashboard-view.test.ts` | the dashboard's pure rules: range parsing and fallbacks, the previous period, trend, the toggle across links, empty and thin-data copy, plus structural checks on the four pages |
| `tests/admin-analytics-dashboard-access.test.ts` | the four reports the dashboard reads: administrator admitted, member, coach and visitor each refused, the toggle moving real numbers, range switching reaching the database, an empty window returning nulls |
| `tests/admin-analytics-member-view.test.ts` | the member views' pure rules: state sorting and filtering, the toggle across every link, the basis and signal labels, the insufficient-history case, the before/after controls and readout, every empty state, plus structural checks on the two pages |
| `tests/admin-analytics-member-access.test.ts` | the five reads the member views make: administrator admitted, member, coach and visitor each refused, the timeline refusing before it reads a row, the toggle moving the list and the per-member reads, real signals with no interpretation, health content written into the same stream reaching neither screen, and the before/after primitive over two real windows |

## Live verification

`scripts/verify-analytics-live.mjs` is read only and safe to run against
production at any time. It calls each function and, independently, pulls the
raw event rows for the same range and counts them in JavaScript using none
of those functions, then prints both columns side by side. A number that
only ever checks itself is not verified.

```bash
cd apps/consumer-web-app
ANALYTICS_SUPABASE_URL=https://<ref>.supabase.co \
ANALYTICS_SERVICE_ROLE_KEY=<Settings, API, service_role key> \
  node scripts/verify-analytics-live.mjs
```

Run against production on 2026-08-12, all 13 cross-checks agreed, the test
account toggle moved the numbers from 1 active member to 4, and a signed-out
visitor, a signed-in member and a signed-in coach were each refused by all
twelve endpoints.

Note that a direct `psql` connection to `db.<ref>.supabase.co` resolves to
IPv6 and may be unreachable; the session-mode pooler on
`aws-1-us-west-2.pooler.supabase.com:5432` works over IPv4.

## Non-vacuous guard tests

The guard tests were proved non-vacuous by breaking the code and watching
them fail:

| Mutation | Result |
| --- | --- |
| `analytics_scoped_events` filtered on `occurred_at` instead of `local_date` | 2 tests failed |
| the test-account filter removed from `analytics_member_scope` | 2 tests failed |
| `analytics_assert_admin` made a no-op | 6 tests failed |

Each was reverted and the suite re-verified green.
