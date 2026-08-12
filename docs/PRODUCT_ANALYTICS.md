# Product Analytics

How this platform tracks product behavior, what is tracked, what is not,
and the queries that turn raw events into answers.

## The one pipeline

There is no third-party analytics tool and no second tracking system.
Every behavioral event is a row in the existing `member_wellness_events`
table (migration 63), which already carried the app's typed, payload-
bearing events before any of this existed. Migration 146 widened that
table's `event_type` constraint, exactly as the table's own header comment
said a new event source should, and added a read surface on top.

```
call site  ->  lib/analytics/track.ts (trackProductEvent)
           ->  lib/events/service.ts (recordMemberEvent)
           ->  member_wellness_events
           ->  product_analytics_events (view)  ->  your query
```

Two events are written by the database rather than the app, because
neither has an authenticated app request to hang off:

- `signup_completed` comes from `handle_new_user()`, the trigger that
  already runs once per account creation. At signup there is no session
  yet (email verification comes later), so an app-side insert would be
  rejected by row level security.
- `membership_tier_changed` comes from a trigger on
  `profiles.membership_tier`. That column is changed out of band today, so
  a trigger is the only place that sees every real change.

Both are wrapped so an analytics failure can never break a signup or a
profile update.

## Read from the view, not the table

```sql
select * from product_analytics_events where is_test = false;
```

`product_analytics_events` does two things the raw table cannot:

1. **It excludes health content by construction.** The five original
   wellness event types (`morning_readiness_recorded`, `hydration_logged`,
   `movement_logged`, `concern_flagged`, `evening_reflection_recorded`)
   carry real member answers and are filtered out of this view entirely. An
   analytics query physically cannot reach them through it.
2. **It joins `profiles.is_test`.** Test accounts still write events
   normally; `where is_test = false` is what removes them from a report.
   Never omit that filter on a number anyone will act on.

`occurred_at` is the ordering column, always. `recorded_at` is server write
time and exists only as an audit fact. `local_date` is the member's own
calendar day, computed at write time from `occurred_at` in their timezone.

## Event types

| Event | When it fires | Payload | Written by |
| --- | --- | --- | --- |
| `signup_completed` | An account is created | none | `handle_new_user()` trigger |
| `session_started` | A sign-in completes | `method`: password, passkey | `app/actions/auth.ts` |
| `onboarding_started` | The onboarding question flow renders | none | `app/onboarding/page.tsx` |
| `onboarding_completed` | Onboarding is submitted | `assessmentType`: baseline, reassessment | `app/actions/onboarding.ts` |
| `surface_viewed` | A major screen is opened | `surface` | `TrackSurfaceView` on each page |
| `daily_reset_started` | The Daily Reset wizard opens | none | `app/checkin/page.tsx` |
| `daily_reset_completed` | A Daily Reset is submitted | none | `app/actions/checkin.ts` |
| `food_scan_performed` | A Food Lens scan is analyzed | `scanType` | `app/actions/food-lens.ts` |
| `food_entry_logged` | Any food or protein entry is logged | `entryType`: scan, manual, product | `lib/food-products/data.ts` |
| `feature_engaged` | A real interaction inside a feature | `feature`, `action` | Today's Focus and Reset Plan actions |
| `paywall_viewed` | A locked or premium marker is shown | `feature`, `lockReason` | Locked card components |
| `membership_tier_changed` | `profiles.membership_tier` changes | `fromTier`, `toTier` | trigger |
| `purchase_completed` | Not emitted yet, see below | `toTier`, `term` | nothing |

### Surfaces

`surface_viewed` carries one of a closed set defined in
`lib/analytics/surfaces.ts`: `home`, `daily_reset`, `daily_reset_evening`,
`food_lens`, `progress`, `today`, `your_case`, `movement`,
`questionnaires`, `questionnaire`, `conversation`, `reset_plan`,
`root_score`, `insights`, `noticing`, `recommendations`, `membership`,
`profile`, `body_assessment`.

### Features and actions

`feature_engaged` carries `feature` (`todays_focus`, `reset_plan`,
`food_lens`, `daily_reset`, `questionnaire`) and `action` (`opened_item`,
`completed_item`, `dismissed_item`, `started`, `advanced`, `completed`,
`logged_day`, `chose_focus`, `chose_action_tier`, `acknowledged`).

Today's Focus uses `opened_item` for the view and everything else for
interactions. The Reset Plan uses `chose_focus`, `chose_action_tier`,
`completed`, `logged_day`, and `acknowledged`; opening it is a
`surface_viewed` with surface `reset_plan`.

## The hard rule: behavioral only

An analytics payload may contain an event name, a surface name, a feature
key, a fixed action verb, a timestamp, and a member id. It may never
contain health content: no check-in answers, no pain locations, no sleep
numbers, no questionnaire responses, no reflection text, no food detail.

This is enforced in three places, not left to discipline:

1. `lib/analytics/surfaces.ts` validates every incoming surface, feature,
   action, and lock reason against a closed allowlist, so a client cannot
   send an arbitrary string.
2. `sanitizeAnalyticsPayload` in `lib/analytics/track.ts` drops every key
   not on the known-neutral list and every value over 64 characters, so
   even a mistaken call site cannot persist content.
3. `tests/product-analytics-payload-safety.test.ts` proves both of the
   above against real health-content strings, and scans every analytics
   call site in the codebase for a payload field that is not on the
   allowlist.

## Never blocks the member

Tracking is off the critical path by design:

- Page views fire from a mounted client component
  (`components/analytics/TrackSurfaceView.tsx`), so the insert happens
  after the screen has painted, never during the server render the member
  is waiting on.
- `trackProductEvent` never throws and never rejects. It catches
  everything, logs, and returns `false`. A failed analytics write cannot
  break a page, a check-in, or a login.
- Server-side events are recorded only after the real work has already
  succeeded, in the same best-effort position the existing wellness event
  writes already occupy.
- There are zero member-facing UI changes. The tracking components render
  `null`.

## Return frequency

Return frequency is a derived query, not a stored number and not a
separate mechanism. `session_started` is the raw event: one row per
completed sign-in, written by both the password and the passkey path.

**Daily actives, last 30 days**

```sql
select local_date, count(distinct member_id) as daily_actives
from product_analytics_events
where event_type = 'session_started'
  and is_test = false
  and occurred_at >= now() - interval '30 days'
group by local_date
order by local_date;
```

**Weekly actives**

```sql
select date_trunc('week', occurred_at)::date as week_start,
       count(distinct member_id) as weekly_actives
from product_analytics_events
where event_type = 'session_started'
  and is_test = false
  and occurred_at >= now() - interval '12 weeks'
group by 1
order by 1;
```

**Days between visits, per member**

```sql
with visits as (
  select member_id,
         local_date,
         lag(local_date) over (partition by member_id order by local_date) as previous_visit
  from (
    select distinct member_id, local_date
    from product_analytics_events
    where event_type = 'session_started' and is_test = false
  ) distinct_days
)
select member_id,
       round(avg(local_date - previous_visit), 1) as avg_days_between_visits,
       max(local_date) as last_visit
from visits
where previous_visit is not null
group by member_id
order by avg_days_between_visits;
```

Note the inner `distinct member_id, local_date`: a member who signs in
three times in one day is one visit, not three.

**Returning within 7 days of signup**

```sql
with signups as (
  select member_id, min(occurred_at) as signed_up_at
  from product_analytics_events
  where event_type = 'signup_completed' and is_test = false
  group by member_id
)
select count(*) filter (where returned) * 100.0 / count(*) as pct_returned_within_7d
from (
  select s.member_id,
         exists (
           select 1 from product_analytics_events e
           where e.member_id = s.member_id
             and e.event_type = 'session_started'
             and e.occurred_at between s.signed_up_at + interval '1 day'
                                  and s.signed_up_at + interval '7 days'
         ) as returned
  from signups s
) x;
```

## Funnels

**Onboarding drop-off**

```sql
select
  count(distinct member_id) filter (where event_type = 'onboarding_started') as started,
  count(distinct member_id) filter (where event_type = 'onboarding_completed') as completed
from product_analytics_events
where is_test = false
  and occurred_at >= now() - interval '30 days';
```

**Daily Reset abandonment**

```sql
select local_date,
  count(*) filter (where event_type = 'daily_reset_started') as started,
  count(*) filter (where event_type = 'daily_reset_completed') as completed
from product_analytics_events
where is_test = false
  and occurred_at >= now() - interval '30 days'
group by local_date
order by local_date;
```

**Which paywalls members hit most**

```sql
select payload->>'feature' as feature,
       payload->>'lockReason' as lock_reason,
       count(*) as views,
       count(distinct member_id) as members
from product_analytics_events
where event_type = 'paywall_viewed' and is_test = false
group by 1, 2
order by views desc;
```

**Surface popularity**

```sql
select payload->>'surface' as surface,
       count(*) as views,
       count(distinct member_id) as members
from product_analytics_events
where event_type = 'surface_viewed' and is_test = false
  and occurred_at >= now() - interval '30 days'
group by 1
order by views desc;
```

## Purchases: what cannot be tracked yet, and why

Purchase events cannot be captured today, and nothing here pretends
otherwise.

There is no billing integration in this application. There is no Stripe
SDK, no webhook endpoint, no checkout route, and no code anywhere that
writes `profiles.membership_tier`. The `/membership` screen lists what a
membership includes and points at a support email address. Checkout for
trials, monthly, annual, and the 24-week program happens entirely outside
this codebase, so this codebase has nothing to observe.

What is captured instead:

- `membership_tier_changed`, from a database trigger, records every real
  movement between tiers whenever and however it happens, including a
  manual change made by an administrator. That is the effect of a purchase
  even when the purchase itself is invisible here.
- `paywall_viewed` records the demand side: which locked feature a member
  hit, and when.

`purchase_completed` exists as an accepted event type with a defined
payload (`toTier`, `term`) and nothing emits it. When billing moves in
app, or when a webhook endpoint is added, the one line it needs to call is
`trackProductEvent(supabase, { eventType: 'purchase_completed', ... })`.
No schema change and no new pipeline will be required.
