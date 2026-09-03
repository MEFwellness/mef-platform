-- The reporting half of acquisition attribution, and the one data fix the
-- collection half could not make from the browser.
--
-- WHAT MIGRATION 200 LEFT UNANSWERED. 200 recorded everything a link
-- carried and copied it onto the lead and onto the account. It said so
-- itself: "Nothing in this build reads it." Two things are missing before
-- anybody can act on it.
--
--   1. THE CROSS DEVICE HOLE. The lead to account link worked only through
--      the browser, because the only thing joining an arrival to an account
--      was the visitor token in that browser's localStorage. Somebody who
--      answered the nine questions on her phone, left her email there, and
--      then created her account on a laptop arrived as an untracked
--      account, and the partner who actually sent her was credited with
--      nothing. Her email is the join, and it was sitting in
--      captured_leads the whole time.
--
--   2. NOTHING COULD BE READ AS A FUNNEL. public_entry_funnel answers one
--      row per arrival. A report needs one row per SUBJECT: every arrival,
--      plus every account that has no arrival left to sit on, so the totals
--      are reality rather than the part of reality that was tracked.
--
-- WHAT THIS ADDS. Three views and one backfill. No new table, no second
-- tracking system, no new event type, and not one number that is computed
-- in more than one place.
--
--   member_paid_conversion   when an account first became a paying one
--   public_entry_funnel      widened so a cross device account resolves
--   acquisition_report_rows  one row per subject, the report reads this
--   the backfill             existing untracked accounts, matched by email
--
-- WHAT THE REPORT MAY NEVER CARRY, AND CANNOT. Behavioural columns only.
-- There is no answer, no pattern key, no email and no free text anywhere
-- below. public_entry_funnel deliberately carries pattern_key and this
-- report view deliberately does not select it, because a funnel screen
-- asking whether the rules produce a spread is a different question from a
-- report about where clicks came from.

-- ---------------------------------------------------------------------
-- 1. When an account first became a paying one
-- ---------------------------------------------------------------------
--
-- THREE WAYS OF KNOWING, AND THE EARLIEST ONE WINS. Paid conversion is a
-- tier change to a paid plan, and there are three honest records of one:
--
--   a. The member's own event stream. Migration 159's trigger writes a
--      membership_tier_changed event on every real tier movement, with the
--      tier it moved TO in the payload. This is the record that carries a
--      TIME, which is what a dated report needs.
--   b. A purchase event. Nothing in this application emits
--      purchase_completed today, because checkout happens entirely outside
--      it. It is read here anyway, with no switch to flip, so the day
--      anything starts emitting one it is counted with no further build.
--   c. The subscription itself, standing on a paid plan with no event to
--      explain it. That happens for a change made before the trigger
--      existed, or one whose event write was swallowed (the trigger is
--      deliberately allowed to fail without blocking a tier change). The
--      subscription is the entitlement, so the report would be lying if it
--      showed a paying member as unconverted because an event went
--      missing.
--
-- WHICH TIERS COUNT AS PAID IS DATA, NOT A LIST WRITTEN HERE. Any tier in
-- member_access_tiers that grants access and is not the trial. A paid tier
-- added next year is counted the day it is inserted, with no migration.
--
-- full_access IS DELIBERATELY NOT A PAID SIGNAL. It is the manual "open
-- everything for this person" grant, which is as often a comped account as
-- a paying one, so counting it would inflate paid conversion with people
-- who never paid.

create view member_paid_conversion
  with (security_invoker = true) as
  select member_id, min(paid_at) as paid_at
  from (
    select e.member_id, e.occurred_at as paid_at
      from member_wellness_events e
      join member_access_tiers t on t.key = e.payload ->> 'toTier'
     where e.event_type = 'membership_tier_changed'
       and t.grants_access = true
       and t.key <> 'trial'

    union all

    select e.member_id, e.occurred_at
      from member_wellness_events e
     where e.event_type = 'purchase_completed'

    union all

    select s.member_id, coalesce(s.assigned_at, s.updated_at, s.created_at)
      from member_subscriptions s
      join member_access_tiers t on t.key = s.tier
     where t.grants_access = true
       and t.key <> 'trial'
  ) evidence
  group by member_id;

comment on view member_paid_conversion is
  'The earliest moment an account is known to have become a paying one, from
   its tier change events, from a purchase event if anything ever emits one,
   and from the subscription row itself when it stands on a paid plan with
   no event to explain it. A paid tier is any tier in member_access_tiers
   that grants access and is not the trial, so a new paid tier counts the
   day it is added.';

-- ---------------------------------------------------------------------
-- 2. The funnel view, widened so a cross device account resolves
-- ---------------------------------------------------------------------
--
-- WHY THIS HAD TO CHANGE. member_public_entry_origin is written only by the
-- browser claim, so it is exactly the record a cross device signup does not
-- have. user_acquisition.session_id is unique and is written by both paths,
-- which makes it the safe second way of answering "did this arrival become
-- an account" without any chance of counting one arrival twice.
--
-- Nothing is added and nothing is renamed. Two existing columns, member_id
-- and is_test, are resolved from both binds instead of one, so the funnel
-- screen and the report cannot disagree about whether an arrival converted.

create or replace view public_entry_funnel
  with (security_invoker = true) as
  select
    s.id as session_id,
    s.experience_key,
    s.source_code,
    s.source_raw,
    coalesce(src.label, case when s.source_raw is null then 'Direct (no code)' else 'Unregistered code' end) as source_label,
    coalesce(src.channel, case when s.source_raw is null then 'direct' else 'partner' end) as source_channel,
    s.landing_path,
    s.referrer_host,
    s.first_seen_at,
    s.started_at,
    s.completed_at,
    s.pattern_key,
    s.lead_captured_at,
    coalesce(o.member_id, ua.member_id) as member_id,
    o.claimed_at,
    coalesce(src.is_test, false) or coalesce(p.is_test, false) as is_test,
    (s.started_at is not null) as did_start,
    (s.completed_at is not null) as did_complete,
    (s.lead_captured_at is not null) as did_leave_email,
    exists (
      select 1 from public_entry_events e
      where e.session_id = s.id and e.event_type = 'app_clicked'
    ) as did_click_to_app,
    (coalesce(o.member_id, ua.member_id) is not null) as did_create_account,
    a.utm_source,
    a.utm_medium,
    a.utm_campaign,
    a.utm_content,
    a.utm_term,
    (a.fbclid is not null or a.ttclid is not null or a.gclid is not null) as had_ad_click,
    a.geo_country,
    a.geo_region,
    a.geo_city,
    src.partner_name,
    src.location_name,
    src.location_city,
    src.location_region,
    src.location_country
  from public_entry_sessions s
  left join public_entry_sources src on src.code = s.source_code
  left join member_public_entry_origin o on o.session_id = s.id
  left join user_acquisition ua on ua.session_id = s.id
  left join profiles p on p.id = coalesce(o.member_id, ua.member_id)
  left join public_entry_attribution a on a.session_id = s.id and a.touch = 'first';

comment on view public_entry_funnel is
  'One row per public arrival with every funnel step already resolved to a
   boolean, is_test already settled, its first-touch attribution and its
   partner''s physical location alongside. Since migration 201 the account
   is resolved from the browser bind (member_public_entry_origin) OR from
   the account''s own attribution row (user_acquisition.session_id, which is
   unique), so an account created on a different device than the arrival
   still resolves. Read this, not the raw tables, and never omit
   `where is_test = false` on a number anyone will act on.';

-- ---------------------------------------------------------------------
-- 3. One row per subject, which is what a funnel report reads
-- ---------------------------------------------------------------------
--
-- TWO LEGS, AND THE SECOND ONE IS THE HONEST PART.
--
--   'visit'   every arrival at the public entry experience, with its
--             attribution, its partner's physical place, its account and
--             that account's paid conversion.
--   'account' every account that has NO arrival in the first leg: either it
--             never took the public experience at all, or the arrival it
--             took has since been purged. It carries whatever attribution
--             its own user_acquisition row holds, and nothing when it holds
--             none.
--
-- WHY THE SECOND LEG CONTRIBUTES TO THE LAST TWO COLUMNS ONLY. Its visit,
-- start, completion and lead are either already counted in the first leg or
-- no longer exist as rows anywhere. Counting them again from the account's
-- copy would double count a funnel, so those four columns are null here by
-- construction rather than by a reader remembering. An account with no
-- arrival is a real account and an unreal visit, and this view says exactly
-- that.
--
-- WHAT anchor_at IS FOR. Every column of the report follows the same
-- people: the arrivals that landed inside the window being looked at,
-- wherever they got to afterwards. That is the only reading under which a
-- stage to stage conversion rate means anything. An account with no arrival
-- has no landing time, so it is anchored by the day the account was
-- created, and it can only ever appear in the last two columns anyway.

create view acquisition_report_rows
  with (security_invoker = true) as
  select
    'visit'::text as row_kind,
    f.session_id,
    f.member_id,
    f.source_code,
    f.source_raw,
    f.source_channel,
    f.utm_source,
    f.utm_medium,
    f.utm_campaign,
    f.utm_content,
    f.utm_term,
    f.had_ad_click,
    f.geo_country,
    f.geo_region,
    f.geo_city,
    f.partner_name,
    f.location_name,
    f.location_city,
    f.location_region,
    f.location_country,
    f.is_test,
    f.first_seen_at as anchor_at,
    f.first_seen_at as landed_at,
    f.started_at,
    f.completed_at,
    f.lead_captured_at,
    p.created_at as account_created_at,
    pc.paid_at
  from public_entry_funnel f
  left join profiles p on p.id = f.member_id
  left join member_paid_conversion pc on pc.member_id = f.member_id

  union all

  select
    'account'::text as row_kind,
    null::uuid as session_id,
    p.id as member_id,
    ua.source_code,
    ua.source_raw,
    src.channel as source_channel,
    ua.utm_source,
    ua.utm_medium,
    ua.utm_campaign,
    ua.utm_content,
    ua.utm_term,
    (ua.fbclid is not null or ua.ttclid is not null or ua.gclid is not null) as had_ad_click,
    ua.geo_country,
    ua.geo_region,
    ua.geo_city,
    src.partner_name,
    src.location_name,
    src.location_city,
    src.location_region,
    src.location_country,
    coalesce(src.is_test, false) or coalesce(p.is_test, false) as is_test,
    coalesce(ua.landed_at, p.created_at) as anchor_at,
    ua.landed_at,
    null::timestamptz as started_at,
    null::timestamptz as completed_at,
    null::timestamptz as lead_captured_at,
    p.created_at as account_created_at,
    pc.paid_at
  from profiles p
  left join user_acquisition ua on ua.member_id = p.id
  left join public_entry_sources src on src.code = ua.source_code
  left join member_paid_conversion pc on pc.member_id = p.id
  where not exists (
    select 1 from member_public_entry_origin o where o.member_id = p.id
  )
  and not exists (
    select 1
      from user_acquisition ua2
      join public_entry_sessions s2 on s2.id = ua2.session_id
     where ua2.member_id = p.id
  );

comment on view acquisition_report_rows is
  'One row per acquisition subject: every public arrival, plus every account
   that has no arrival left to sit on. Behavioural columns only, no answer
   and no pattern key. The account leg carries null for the visit, start,
   completion and lead columns on purpose, because those are either already
   counted on the arrival leg or no longer exist as rows at all. Read by
   lib/acquisition/reportData.ts. Never omit `where is_test = false` on a
   number anyone will act on.';

-- ---------------------------------------------------------------------
-- 4. Cross device backfill: the accounts that arrived untracked
-- ---------------------------------------------------------------------
--
-- WHAT THIS FIXES, ONCE. Every account created before the email match
-- existed, which left an email on the public entry experience in one
-- browser and was created in another. The runtime fix is in
-- lib/acquisition/data.ts's attachUserAcquisitionFromLead, called by the
-- signup action; this catches everybody who signed up before it shipped.
--
-- THE SAME THREE RULES THE RUNTIME PATH FOLLOWS.
--
--   Attach once. Only an account with NO user_acquisition row at all is
--   touched, so a browser-carried attribution is never overwritten. The
--   database refuses an update to this table anyway; this is what stops
--   the attempt.
--
--   The most recent matching lead wins. `distinct on (u.id)` ordered by the
--   lead's own created_at, which is the same rule the runtime path uses.
--
--   The original timestamps are carried across unchanged, exactly as the
--   browser path does. landed_at is the arrival's, lead_captured_at is when
--   she left the email, account_created_at is when the account was made.
--   Only attributed_at describes this row rather than her journey.
--
-- THE SESSION IS ONLY CLAIMED WHEN IT IS FREE. user_acquisition.session_id
-- is unique, so an arrival can back at most one account. If the lead's
-- session is gone, or already belongs to another account, this writes null
-- there and keeps everything else: the attribution is a copy and does not
-- depend on the session existing, which is why migration 200 made it a copy.
--
-- WHAT IT DELIBERATELY DOES NOT WRITE. member_public_entry_origin. That row
-- is the bind that lets Root show a member her own first impression back to
-- her, and an email match is not consent to show somebody the answers
-- attached to an address. Attribution is behavioural and this backfill
-- stays behavioural.

create index if not exists captured_leads_email_lower_idx on captured_leads (lower(email));

insert into user_acquisition (
  member_id, session_id, captured_lead_id, experience_key,
  utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  source_code, source_raw, fbclid, ttclid, gclid,
  landing_path, referrer_host, geo_country, geo_region, geo_city,
  landed_at, lead_captured_at, account_created_at
)
select
  m.member_id,
  -- One arrival can back at most one account, so the session is claimed by
  -- the earliest account that matched it and left null on every other. The
  -- window function settles that inside this one statement, because a
  -- unique violation here would have thrown away the whole row and with it
  -- the attribution that does not need a session at all.
  case when m.session_free and m.session_rank = 1 then m.session_id else null end,
  m.captured_lead_id,
  m.experience_key,
  m.utm_source, m.utm_medium, m.utm_campaign, m.utm_content, m.utm_term,
  m.source_code, m.source_raw, m.fbclid, m.ttclid, m.gclid,
  m.landing_path, m.referrer_host, m.geo_country, m.geo_region, m.geo_city,
  m.landed_at, m.lead_captured_at, m.account_created_at
from (
  select
    matched.*,
    row_number() over (
      partition by matched.session_id order by matched.account_created_at, matched.member_id
    ) as session_rank
  from (
    select distinct on (u.id)
      u.id as member_id,
      cla.session_id,
      (
        cla.session_id is not null
        and exists (select 1 from public_entry_sessions s2 where s2.id = cla.session_id)
        and not exists (select 1 from user_acquisition ua2 where ua2.session_id = cla.session_id)
      ) as session_free,
      cla.captured_lead_id,
      coalesce(s.experience_key, 'energy_map') as experience_key,
      cla.utm_source, cla.utm_medium, cla.utm_campaign, cla.utm_content, cla.utm_term,
      cla.source_code, cla.source_raw, cla.fbclid, cla.ttclid, cla.gclid,
      cla.landing_path, cla.referrer_host, cla.geo_country, cla.geo_region, cla.geo_city,
      cla.landed_at,
      cla.lead_captured_at,
      u.created_at as account_created_at
    from auth.users u
    join captured_leads cl on lower(cl.email) = lower(u.email)
    join captured_lead_acquisition cla on cla.captured_lead_id = cl.id
    left join public_entry_sessions s on s.id = cla.session_id
    where u.email is not null
      and not exists (select 1 from user_acquisition ua where ua.member_id = u.id)
    order by u.id, cl.created_at desc, cla.lead_captured_at desc
  ) matched
) m
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 5. The email match itself, as one exact question
-- ---------------------------------------------------------------------
--
-- WHY A FUNCTION AND NOT A FILTER FROM THE APPLICATION. The match has to be
-- case insensitive, and case insensitive matching from PostgREST means
-- `ilike`, whose SQL wildcards include the underscore. An underscore is an
-- ordinary character in an email address, so `a_b@example.com` would have
-- matched `axb@example.com` and attached one stranger's origin to another
-- person's account. `lower(x) = lower(y)` is the only version of this
-- question that is exact, and it belongs next to the index that serves it.
--
-- SECURITY INVOKER, so the caller's own policies still decide what it can
-- see. Only the signup action calls it, with the service role, at the one
-- moment an account has just been created for that address.

create or replace function public.lead_acquisition_for_email(p_email text)
returns table (
  captured_lead_id uuid,
  session_id uuid,
  experience_key text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  source_code text,
  source_raw text,
  fbclid text,
  ttclid text,
  gclid text,
  landing_path text,
  referrer_host text,
  geo_country text,
  geo_region text,
  geo_city text,
  landed_at timestamptz,
  lead_captured_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    cla.captured_lead_id,
    cla.session_id,
    coalesce(s.experience_key, 'energy_map'),
    cla.utm_source, cla.utm_medium, cla.utm_campaign, cla.utm_content, cla.utm_term,
    cla.source_code, cla.source_raw, cla.fbclid, cla.ttclid, cla.gclid,
    cla.landing_path, cla.referrer_host, cla.geo_country, cla.geo_region, cla.geo_city,
    cla.landed_at,
    cla.lead_captured_at
  from captured_leads cl
  join captured_lead_acquisition cla on cla.captured_lead_id = cl.id
  left join public_entry_sessions s on s.id = cla.session_id
  where cl.email is not null
    and lower(cl.email) = lower(btrim(p_email))
  order by cl.created_at desc, cla.lead_captured_at desc
  limit 1;
$$;

comment on function public.lead_acquisition_for_email(text) is
  'The attribution of the most recent captured lead left at this email
   address, or no rows. The cross device half of acquisition attribution:
   somebody who answers on a phone and signs up on a laptop carries no
   visitor token, and her email address is the only join left.';
