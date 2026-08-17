-- Member Interpretation Layer — the canonical finding registry.
--
-- AUDIT-ADAPTIVE-REVEAL.md found nine systems each reading raw member data
-- and reaching their own verdict. lib/member-interpretation/ is now the one
-- place that decision is made, and this migration brings the stored rows
-- into line with it.
--
-- Three things, and nothing is deleted by any of them.
--
--   1. `canonical_source_key` records WHICH ANSWER a row describes, as
--      '<domain>::<code>'. That is the dedup key the layer uses at read
--      time: not the row id (a supersede chain has many rows for one
--      answer) and not the source feature (two producers can legitimately
--      report the same finding, and when they do it is still one finding).
--      Storing it makes the same grouping visible to a query, to a coach
--      reading the table, and to anything that comes later.
--
--   2. `evidence_tier` records the honest tier a row's real evidence earns.
--      It is an AUDIT column: the layer recomputes the tier from live
--      evidence on every read, so nothing renders from this column and it
--      cannot go stale in a way a member can see. It exists so the
--      migration's own re-tiering is inspectable rather than a claim.
--
--   3. `coach_verified_at` is the one thing a tier cannot be computed from.
--      A tier may only rise on member-provided evidence or on a coach
--      saying so, and this is where a coach says so. Deliberately a
--      timestamp written by a coach action, never a boolean any
--      calculation could set: a background run has no way to produce one.
--
-- Then it deduplicates. Where a member has more than one ACTIVE row for the
-- same answer, the newest is kept and the older ones are moved to
-- 'superseded' with their supersede pointer set. Superseded is a real
-- lifecycle state this table already has, it keeps the row and its history
-- intact, and it is deliberately not 'dismissed' (which means a person
-- decided it was wrong) and not a delete (member data is never deleted).

-- ---------------------------------------------------------------------
-- 1. The three columns
-- ---------------------------------------------------------------------

alter table registry_entries
  add column if not exists canonical_source_key text,
  add column if not exists evidence_tier text,
  add column if not exists coach_verified_at timestamptz;

alter table registry_entries
  drop constraint if exists registry_entries_evidence_tier_check;

alter table registry_entries
  add constraint registry_entries_evidence_tier_check
  check (
    evidence_tier is null
    or evidence_tier in (
      'early_indication',
      'emerging_pattern',
      'supported_by_checkins',
      'coach_verified'
    )
  );

comment on column registry_entries.canonical_source_key is
  'Which ANSWER this row describes, as ''<domain>::<code>''. The Member Interpretation Layer''s dedup key: one source answer produces exactly one canonical finding, however many producers report it and however many domains it is relevant to.';

comment on column registry_entries.evidence_tier is
  'Audit column. The honest evidence tier this row''s real evidence earns, recorded so the interpretation build''s re-tiering is inspectable. NOTHING RENDERS FROM THIS: the layer recomputes the tier from live evidence on every read, so it cannot go stale on a member''s screen.';

comment on column registry_entries.coach_verified_at is
  'When a coach confirmed this finding. The one input to an evidence tier that no calculation can produce: a tier may only rise on member-provided evidence or on a coach saying so, and this is where a coach says so. Written by a coach action only.';

-- ---------------------------------------------------------------------
-- 2. Backfill the source key for every row that has ever existed
-- ---------------------------------------------------------------------

update registry_entries
set canonical_source_key = domain || '::' || code
where canonical_source_key is null;

alter table registry_entries
  alter column canonical_source_key set default null;

create index if not exists registry_entries_member_canonical_key_idx
  on registry_entries (member_id, canonical_source_key)
  where status = 'active';

-- ---------------------------------------------------------------------
-- 3. Backfill an honest tier for every ACTIVE finding
-- ---------------------------------------------------------------------
--
-- The rule here is the same one lib/member-interpretation/tiers.ts applies,
-- expressed against what the database can actually see:
--
--   coach_verified        a coach has already reviewed this row
--                         (coach_reviewed_at is the pre-existing column
--                         that means exactly this, so no coach's existing
--                         confirmation is lost)
--   supported_by_checkins the member has logged at least 5 distinct
--                         check-in days in the 21 days up to the row's own
--                         recorded_at, AND this finding has a daily
--                         check-in question that can establish it
--   emerging_pattern      2 or more distinct member-provided evidence refs
--   early_indication      everything else
--
-- Note what is NOT in this: how many times anything was calculated. The old
-- root-confidence formula's history term counted cron runs, which is the
-- whole bug this build exists to make unrepresentable.

with checkin_days as (
  select
    r.id as entry_id,
    (
      select count(distinct c.local_date)
      from daily_checkins c
      where c.user_id = r.member_id
        and c.local_date > (r.recorded_at::date - interval '21 days')::date
        and c.local_date <= r.recorded_at::date
    ) as days
  from registry_entries r
  where r.entry_kind = 'finding'
),
member_evidence as (
  select
    r.id as entry_id,
    (
      select count(*)
      from jsonb_array_elements(coalesce(r.evidence_refs, '[]'::jsonb)) ref
      where ref ->> 'type' in (
        'onboarding_submission',
        'onboarding_answer',
        'questionnaire_submission',
        'assessment_submission',
        'unified_assessment_session',
        'body_assessment',
        'primal_pattern_result',
        'wbsa_submission',
        'daily_checkin',
        'daily_checkin_range',
        'movement_session',
        'member_food_log',
        'wearable_daily_metric'
      )
    ) as refs
  from registry_entries r
  where r.entry_kind = 'finding'
)
update registry_entries r
set evidence_tier = case
  when r.coach_reviewed_at is not null then 'coach_verified'
  when cd.days >= 5 and r.code in (
    'elevated_stress', 'stress_and_mood_pattern',
    'poor_sleep_quality', 'sleep_quality_pattern', 'circadian_disruption',
    'low_energy', 'energy_fatigue_pattern',
    'digestive_complaints', 'digestive_wellness_concern',
    'emotional_wellbeing_concern', 'movement_deficiency',
    'pain_neck', 'pain_shoulders', 'pain_upper_back',
    'pain_lower_back', 'pain_hips', 'pain_knees',
    'musculoskeletal_discomfort_pattern'
  ) then 'supported_by_checkins'
  when me.refs >= 2 then 'emerging_pattern'
  else 'early_indication'
end
from checkin_days cd, member_evidence me
where cd.entry_id = r.id
  and me.entry_id = r.id
  and r.entry_kind = 'finding'
  and r.evidence_tier is null;

-- ---------------------------------------------------------------------
-- 4. Deduplicate by source answer. Nothing is deleted.
-- ---------------------------------------------------------------------
--
-- Where a member has more than one ACTIVE row for the same answer, the
-- newest by recorded_at wins and the rest are superseded by it. The
-- supersede pointers are set in both directions so the chain reads
-- correctly from either end, exactly as insertRegistryEntry does at write
-- time.

with ranked as (
  select
    id,
    member_id,
    canonical_source_key,
    recorded_at,
    first_value(id) over (
      partition by member_id, canonical_source_key
      order by recorded_at desc, created_at desc, id
    ) as keeper_id,
    row_number() over (
      partition by member_id, canonical_source_key
      order by recorded_at desc, created_at desc, id
    ) as rank
  from registry_entries
  where status = 'active'
    and entry_kind = 'finding'
),
losers as (
  select id, keeper_id from ranked where rank > 1
)
update registry_entries r
set status = 'superseded',
    superseded_by_id = coalesce(r.superseded_by_id, l.keeper_id),
    updated_at = now()
from losers l
where r.id = l.id;

-- The keeper's own back-pointer, where it did not already have one.
with ranked as (
  select
    id,
    member_id,
    canonical_source_key,
    first_value(id) over (
      partition by member_id, canonical_source_key
      order by recorded_at desc, created_at desc, id
    ) as keeper_id,
    row_number() over (
      partition by member_id, canonical_source_key
      order by recorded_at desc, created_at desc, id
    ) as rank
  from registry_entries
  where entry_kind = 'finding'
    and (status = 'active' or status = 'superseded')
),
newest_loser as (
  select keeper_id, min(id::text)::uuid as loser_id
  from ranked
  where rank = 2
  group by keeper_id
)
update registry_entries r
set supersedes_id = nl.loser_id,
    updated_at = now()
from newest_loser nl
where r.id = nl.keeper_id
  and r.supersedes_id is null;
