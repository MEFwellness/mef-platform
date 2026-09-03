# The acquisition funnel

How somebody with no reason to create a Rooted Reset account gets from a
referral partner's link to an active member, what is recorded at each step,
and how to read it.

The experience is **Where Your Energy Goes**, at `/energy`. Migration 197
built everything below.

## The path

```
a partner hands out /energy/dr-okafor
  -> entry_viewed          the page opened
  -> experience_started    the first question was reached
  -> chapter_completed x4  each of the four chapters finished
  -> experience_completed  the nine answers resolved to a pattern
  -> result_engaged        she read past the fold of her own result
  -> notes_unlocked        she left an email at the optional step
  -> app_clicked           she clicked toward Rooted Reset
  -> signup_completed      an account exists            (member_wellness_events)
  -> public_entry_claimed  the account was bound to the arrival
  -> onboarding_completed  she finished her Baseline Assessment
  -> session_started       she came back
```

The first eight steps happen before any account exists. They live in
`public_entry_events` and `public_entry_sessions`, because
`member_wellness_events.member_id` is `not null references auth.users(id)`
and an anonymous visitor has no row to reference. Everything from
`signup_completed` onward is the existing product analytics pipeline,
unchanged. `member_public_entry_origin` is the join between the two halves.

## The one query you will actually run

```sql
select
  source_label,
  count(*)                                   as reached,
  count(*) filter (where did_start)          as started,
  count(*) filter (where did_complete)       as finished,
  count(*) filter (where did_leave_email)    as left_email,
  count(*) filter (where did_click_to_app)   as clicked_in,
  count(*) filter (where did_create_account) as accounts
from public_entry_funnel
where is_test = false
group by source_label
order by reached desc;
```

`/admin/acquisition` runs exactly this and prints it, along with the pattern
spread and the ready-made links. Use the screen unless you need something it
does not show.

**Never omit `where is_test = false`** on a number anyone will act on. The
view settles it from both ends: an arrival is test traffic when the SOURCE is
one of ours (`public_entry_sources.is_test`, which `qa` is) or when the
member who later claimed it is a test account (`profiles.is_test`).

## Reading past the account

The steps after signup are behaviour inside the product, so they come from
`product_analytics_events`, joined to a source through the bind:

```sql
-- Activation: who finished their Baseline Assessment, by source.
select o.source_code, count(distinct e.member_id) as activated
from member_public_entry_origin o
join product_analytics_events e on e.member_id = o.member_id
join profiles p on p.id = o.member_id
where e.event_type = 'onboarding_completed'
  and e.is_test = false
  and coalesce(p.is_test, false) = false
group by o.source_code
order by activated desc;

-- Return: who signed in again on a later day than the day they joined.
select o.source_code, count(distinct e.member_id) as returned
from member_public_entry_origin o
join product_analytics_events e on e.member_id = o.member_id
where e.event_type = 'session_started'
  and e.is_test = false
  and e.local_date > (o.claimed_at at time zone 'UTC')::date
group by o.source_code
order by returned desc;
```

`public_entry_claimed` carries the source code on its own payload, so a
rollup that only wants "which source produced members" can read it straight
from `product_analytics_events` without touching the acquisition tables at
all.

## Source codes

One row per **individual source**, not per channel. Two partners on the same
channel have to stay tellable apart, because "social sent 40 people" is not
an answer to any question worth asking of a hundred visitors.

A code is **permanent once a link is handed out**, because a printed card or
a QR code cannot be edited. The `label` is free to change at any time, which
is why the seeded set includes numbered slots: allocate `partner-03` to a
real person the moment they say yes, relabel it, and no deploy is needed.

```sql
-- Allocate a slot to a real partner.
update public_entry_sources
   set label = 'Dr Okafor, Ridgeway Physio', notes = 'Met 2026-09-02'
 where code = 'partner-01';

-- Add a new one.
insert into public_entry_sources (code, label, channel)
values ('greenwood-gym', 'Greenwood Gym front desk', 'partner');

-- Retire one without breaking its printed links.
update public_entry_sources set active = false where code = 'partner-05';
```

Both link shapes resolve to the same code:

```
https://app.mefwellness.com/energy/dr-okafor      the printed form
https://app.mefwellness.com/energy?ref=dr-okafor  what survives being pasted
```

`utm_source` and `source` are accepted as query parameters too, because a
partner will paste them without asking. When a path segment and a query
parameter disagree, the path wins: a printed link is a deliberate act.

**Attribution is first touch and never moves.** Whoever sent somebody the
first time is who sent them, even if they wander off and come back through a
social post a week later. Last touch would make every source's number depend
on how the other sources behaved, which is unreadable at this scale.

An **unregistered code** is recorded verbatim in `source_raw`, resolves to no
source row, and shows in the funnel as "Unregistered code" under its own
name. That is deliberate: a mistyped or invented link is something to
investigate, not something to fold into direct traffic.

## Full attribution (migration 200)

Migration 197 recorded one thing about where an arrival came from: our own
source code. Migration 200 records the rest of it, and carries it forward
onto the lead and onto the account.

### What is captured

| Field | Where it comes from |
| --- | --- |
| `utm_source` `utm_medium` `utm_campaign` `utm_content` `utm_term` | the URL |
| `source_code` `source_raw` | the path segment or `ref` / `utm_source` / `source` |
| `fbclid` `ttclid` `gclid` | the URL, kept verbatim |
| `landing_path` `referrer_host` | the browser, host only, never a full referring URL |
| `geo_country` `geo_region` `geo_city` | the edge headers on the visitor's own API request |
| `landed_at` | the arrival |

**Coarse geo and nothing finer.** Country, region and city, read from
`x-vercel-ip-country`, `x-vercel-ip-country-region` and `x-vercel-ip-city`,
which are already on every request. No IP address is handled, stored or sent
anywhere, latitude and longitude are deliberately not read, and there is no
column either could be written into.

### The three places it lives

```
public_entry_attribution     one row per (session, touch)
  -> captured_lead_acquisition   copied when she leaves an email
  -> user_acquisition            copied when her account is bound
```

All three share **one shape**, defined once in migration 200 and copied into
each table with `LIKE ... INCLUDING CONSTRAINTS`. Three hand-written copies
would drift the first time one of them gained a parameter, and a report that
reads three shapes believing they are one is the failure that guards against.

The two later ones are **copies, not joins**. A lead and an account are
historical records: where somebody came from has to survive the deletion of
the anonymous session it came from, and those sessions are routinely purged.
The integration test asserts the copy equals the first-touch row at the
moment it is taken.

### First touch and last touch

`touch = 'first'` is who sent them and **cannot be changed**: a trigger
raises on any update, so this is a property of the database rather than a
habit of the code.

`touch = 'last'` is written only when a LATER arrival on the same visitor
token carried campaign parameters that genuinely differ. Coming back from a
different referring page, or from the next town, is not a second campaign. An
ordinary single visit has exactly one attribution row.

`user_acquisition` and `captured_lead_acquisition` refuse an update outright,
for the same reason: there is no correct reason to revise where somebody came
from.

### Joining to paid conversion

`user_acquisition.member_id` joins straight to `member_subscriptions`, to
`member_wellness_events` and to `profiles`. Nothing in this build reads it;
the acquisition report is a separate build.

```sql
-- Which campaign produced members who now hold a paid tier.
select a.utm_campaign, a.source_code, count(*) as members
from user_acquisition a
join member_subscriptions s on s.member_id = a.member_id
join profiles p on p.id = a.member_id
where coalesce(p.is_test, false) = false
  and s.tier not in ('trial')
group by a.utm_campaign, a.source_code
order by members desc;
```

**Test accounts are excluded the same way they are everywhere else**: join
`profiles.is_test`, or read `public_entry_funnel`, which settles it from both
ends already.

### Two kinds of place, never confused

`public_entry_sources.partner_name` / `location_name` / `location_city` /
`location_region` / `location_country` describe the **physical place a source
code stands for**: a card on a clinic counter is a location, and no request
header will ever say so. A human types it into the link builder.

`geo_country` / `geo_region` / `geo_city` on the attribution tables describe
**where a request appeared to come from**. They are never in the same table,
and a report may group by either.

## The link builder

`/admin/acquisition/links`. Every tracking link is built here, never typed.

The form writes **two things in one submit**: the link row, and the source
code to partner and location mapping it depends on. `public_entry_links.
source_code` has a foreign key into `public_entry_sources`, so a link whose
code has never been registered cannot be inserted at all. The mapping and the
link cannot disagree.

Every value is normalised on the way out and on the way back in by the same
functions (`lib/acquisition/normalize.ts`):

- a **source code** is lowercase with hyphens: `ridgeway-physio`. It has to
  be, because it is a path segment in a printed link.
- **every other utm value** is lowercase with underscores: `counter_card`,
  `autumn_run`, `card_a`. That is what every ad platform and marketer writes.
- `utm_source` **is** the source code, so it takes the hyphen shape. If the
  two normalised differently, one partner would arrive as two.

So `Card A`, `card_a`, `CARD-A` and `card.a` are one creative, and a unique
index on `(source_code, utm_medium, utm_campaign, utm_content, utm_term)`
refuses a second copy of one link rather than quietly making a second row.

A generated link looks like this:

```
https://app.mefwellness.com/energy/ridgeway-physio
  ?utm_source=ridgeway-physio
  &utm_medium=counter_card
  &utm_campaign=autumn_run
  &utm_content=card_a
```

The code is in the path **and** in `utm_source`, deliberately: the path
survives being read aloud and printed, the query is what an ad platform
appends. Both resolve to the same code.

## What is never recorded

- **No free text, anywhere.** Every answer is one of a fixed set of slugs,
  and `public_entry_answers` has a regex check refusing anything else. A
  stranger with no account and no consent flow must not be able to type a
  health disclosure into this product, and the way to guarantee that is to
  give them nowhere to type it.
- **No referring page.** Only the referring HOST, which answers "which
  platform" without recording what somebody was reading before they arrived.
- **No health content on any event.** `public_entry_events.detail` is a short
  slug or nothing, enforced by its own regex. `public_entry_claimed` carries
  a source code and an experience key, and there is no payload field it
  could carry anything else in.
- **No health content in attribution.** Every attribution column is a
  normalised slug, an opaque ad click id, a host, a path, a coarse place
  name or a timestamp, and each one is shape-checked by the database. There
  is no column an answer, a result pattern or an email could be written
  into, and `tests/acquisition-integration.test.ts` proves each attempt is
  refused.
- **Nothing on the admin screen shows what a visitor answered.** A coach who
  needs to reach a lead uses the leads surface, which is where a lead with an
  email already lands.

## Provenance: why a public answer is never an assessment

`member_public_entry_origin.origin` is check-constrained to
`'public_acquisition'` and `.preliminary` is check-constrained to `true`.
Those are constraints, not defaults, so no insert and no later update can
restate a row as anything else. A row in that table is, by the database's own
definition, a preliminary public impression.

`public_entry_answers` has no foreign key into any assessment, check-in or
scoring table, and nothing in the codebase copies a row out of it.
`tests/public-entry-provenance.test.ts` scans the feature's source and fails
the build if a write to any member data table appears.

Root is allowed to say "this is what you told us when you first arrived", and
does, once, in the welcome pop-up. Nothing is allowed to say "this is your
assessment".

## The email step

There is no outbound email provider in this application, only Supabase's own
auth emails. So the email step delivers **on the page**, and the copy says so
in as many words: "Nothing lands in your inbox today." What the email is
actually for is stated too: a coach sees the result and can reach out.

A captured email writes a `lead_conversations` + `captured_leads` pair and
notifies every active coach through the existing in-app notification
channel, so a lead from this experience lands in exactly the same place as a
lead from the chat widget and reads the same way, with the same pattern
vocabulary.
