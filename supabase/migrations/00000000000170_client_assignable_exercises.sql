-- Catalog safety: what is actually deliverable to a member, and who may
-- read the catalog at all.
--
-- THE ONE RULE. An exercise may be assigned into a member-facing program
-- only if a member would be shown how to do it, and today the only thing
-- that shows her is a video. `exercise_catalog.is_client_assignable` is a
-- STORED generated column, so that rule is expressed exactly once, in the
-- database, and every reader of the catalog gets the same answer without
-- re-deriving it. Nothing in application code is allowed to restate it.
--
-- WHY THE RULE IS `has_video`, NOT `has_video AND provider = 'your_move'`.
-- The two are the same set today: all 824 video-backed rows are Your Move
-- rows, and all 28 mef_custom rows have has_video = false (asserted below,
-- so this claim fails the migration rather than ageing quietly into a
-- comment that is no longer true). They stop being the same set on the
-- day MEF records its own videos for its own 28 corrective exercises,
-- which is precisely the day those exercises must become assignable with
-- no code change. A provider clause would have kept them permanently
-- unassignable no matter what video they were given, which is the exact
-- opposite of what is wanted. So the rule is the honest one: does this
-- exercise have a video.
--
-- The assertion below records the tension rather than hiding it: it
-- proves the two formulations currently agree, and it will go red the day
-- a mef_custom row gets has_video = true. That is deliberate. Playback
-- today resolves through Your Move's own API by external id
-- (lib/your-move/videoPlayback.ts), so a self-hosted MEF video needs a
-- playback path before it can be played, and the failing assertion is the
-- reminder to build one. Assignability and playability are separate
-- questions and this column only answers the first.
--
-- HISTORY IS NEVER TOUCHED. Existing assigned workouts are read and
-- reported on, never edited. A member's program is a record of what her
-- coach gave her, and a rule introduced today does not get to rewrite it.
-- Anything found is raised as a NOTICE for coach review, never as an
-- exception, because an old assignment containing an exercise that would
-- not be picked today is a thing to look at, not a reason to refuse to
-- deploy.
--
-- THE CATALOG LEAK. Until now every signed-in account could read the
-- entire 853-row catalog and every row of the MEF curation layer with the
-- anon key, including contraindications and coach_notes, which are
-- clinical judgement written by a coach for a coach. The Exercise Library
-- screens themselves were made staff-only earlier; the data underneath
-- them was not. Both tables now answer only to staff, plus exactly the
-- rows a member's own screens genuinely need:
--
--   * every exercise in a published Root Movement session, because the
--     session player renders its name and its cues;
--   * every exercise in one of her own published assigned workouts.
--
-- Contraindications and coach_notes are put out of a member's reach
-- structurally rather than by policy: mef_exercise_metadata becomes
-- staff-only outright, and the member player reads a view that carries
-- three columns and no others. A row policy cannot hide a column, so a
-- column that must never be read is not exposed at all.

-- ============================================================================
-- 1) is_client_assignable — the one place the rule lives.
-- ============================================================================
alter table exercise_catalog
  add column is_client_assignable boolean
  generated always as (has_video) stored;

comment on column exercise_catalog.is_client_assignable is
  'Whether this exercise may be selected into a member-facing program. Generated, never written: an exercise is assignable exactly when it has a video, because a video is the only thing that currently shows a member how to perform it. Coach and admin tooling still sees every exercise, assignable or not, for planning.';

create index exercise_catalog_client_assignable_idx
  on exercise_catalog (is_client_assignable);

-- ============================================================================
-- 2) Internal consistency, asserted at migration time (style: migration 153).
-- ============================================================================
do $$
declare
  v_disagree    integer;
  v_assignable  integer;
  v_mef_video   integer;
  v_violations  integer;
  v_row         record;
begin
  -- The generated rule and the provider-qualified rule agree on every row.
  select count(*) into v_disagree
  from exercise_catalog
  where is_client_assignable <> (has_video and provider = 'your_move');
  if v_disagree > 0 then
    raise exception
      'is_client_assignable: % row(s) where has_video disagrees with has_video AND provider = your_move. Read this migration''s header: a mef_custom row with a video is expected eventually, and needs a playback path before it is assignable in practice.',
      v_disagree;
  end if;

  -- The column is not vacuous in either direction.
  select count(*) into v_assignable from exercise_catalog where is_client_assignable;
  if v_assignable = 0 then
    raise exception 'is_client_assignable: no exercise is assignable, which cannot be right';
  end if;
  if v_assignable = (select count(*) from exercise_catalog) then
    raise exception 'is_client_assignable: every exercise is assignable, so the column is filtering nothing';
  end if;

  -- The 28 MEF-authored exercises are the ones held back, and they are
  -- held back by having no video rather than by being MEF's.
  select count(*) into v_mef_video
  from exercise_catalog
  where provider = 'mef_custom' and has_video;
  if v_mef_video > 0 then
    raise notice
      'is_client_assignable: % mef_custom exercise(s) now carry a video and are assignable. Confirm playback resolves for them.',
      v_mef_video;
  end if;

  raise notice 'is_client_assignable: % of % catalog exercises are assignable',
    v_assignable, (select count(*) from exercise_catalog);

  -- ------------------------------------------------------------------
  -- Existing published assigned workouts, reported and never touched.
  -- ------------------------------------------------------------------
  select count(*) into v_violations
  from coach_assigned_workout_exercises e
  join coach_assigned_workouts w on w.id = e.assigned_workout_id
  left join exercise_catalog c
    on c.provider = e.provider and c.external_id = e.external_id
  where w.published_at is not null
    and (c.id is null or c.is_client_assignable = false);

  if v_violations = 0 then
    raise notice 'assigned-workout audit: no published assignment contains a non-assignable exercise';
  else
    raise notice 'assigned-workout audit: % exercise row(s) in published assignments are not client-assignable. Listed below for coach review. NOTHING HAS BEEN CHANGED.', v_violations;
    for v_row in
      select w.member_id, w.scheduled_date, w.template_name,
             e.exercise_name, e.provider, e.external_id,
             case when c.id is null then 'not in catalog' else 'no video' end as reason
      from coach_assigned_workout_exercises e
      join coach_assigned_workouts w on w.id = e.assigned_workout_id
      left join exercise_catalog c
        on c.provider = e.provider and c.external_id = e.external_id
      where w.published_at is not null
        and (c.id is null or c.is_client_assignable = false)
      order by w.scheduled_date, e.exercise_name
    loop
      raise notice '  member % | % | % | % (%/%) | %',
        v_row.member_id, v_row.scheduled_date, v_row.template_name,
        v_row.exercise_name, v_row.provider, v_row.external_id, v_row.reason;
    end loop;
  end if;
end
$$;

-- ============================================================================
-- 3) Which exercises a member's own screens genuinely need.
--
-- SECURITY DEFINER so the policy below never depends on the caller's own
-- read access to the tables it consults, and so a future policy change on
-- those tables can never silently widen or narrow this one.
-- ============================================================================
create or replace function public.member_may_read_exercise(
  p_provider text,
  p_external_id text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- A session is required for either branch. The Root Movement branch
    -- below is not member-specific (those six sessions are offered to
    -- everybody), so without this line a signed-out visitor holding only
    -- the public anon key could read all 39 of their exercises. Caught by
    -- tests/exercise-catalog-member-access.test.ts, not reasoned about.
    auth.uid() is not null
  and (
    -- In a published Root Movement session.
    exists (
      select 1
      from movement_session_template_slots s
      join movement_session_templates t on t.id = s.template_id
      where t.is_active
        and s.provider = p_provider
        and s.external_id = p_external_id
    )
    -- Or in one of this member's own published assigned workouts.
    or exists (
      select 1
      from coach_assigned_workout_exercises e
      join coach_assigned_workouts w on w.id = e.assigned_workout_id
      where w.member_id = auth.uid()
        and w.published_at is not null
        and e.provider = p_provider
        and e.external_id = p_external_id
    )
  );
$$;

comment on function public.member_may_read_exercise(text, text) is
  'The exercises one member may read from the catalog: those in a published Root Movement session, and those in her own published assigned workouts. Nothing else.';

revoke all on function public.member_may_read_exercise(text, text) from public;
grant execute on function public.member_may_read_exercise(text, text) to authenticated;

-- ============================================================================
-- 4) exercise_catalog — staff read everything, a member reads her own.
--
-- The two staff checks are written as scalar subqueries so Postgres
-- evaluates each once per statement rather than once per row; the
-- per-row function is only reached for a caller who is not staff, and
-- a member never scans the catalog (her screens always query a handful
-- of external ids).
-- ============================================================================
drop policy authenticated_read_exercise_catalog on exercise_catalog;

create policy staff_or_own_read_exercise_catalog on exercise_catalog
  for select
  using (
    (select public.has_active_role(auth.uid(), 'coach'))
    or (select public.has_active_role(auth.uid(), 'platform_administrator'))
    or public.member_may_read_exercise(provider, external_id)
  );

-- ============================================================================
-- 5) mef_exercise_metadata — staff only, outright.
--
-- This table holds contraindications and coach_notes. A row-level policy
-- cannot withhold a column, so a member is given no row at all here, and
-- reads the three fields her player needs through the view below.
-- ============================================================================
drop policy authenticated_read_mef_exercise_metadata on mef_exercise_metadata;

create policy staff_read_mef_exercise_metadata on mef_exercise_metadata
  for select
  using (
    (select public.has_active_role(auth.uid(), 'coach'))
    or (select public.has_active_role(auth.uid(), 'platform_administrator'))
  );

-- ============================================================================
-- 6) The three columns a member's session player actually renders.
--
-- Owner-rights view (the Postgres default), so it reads past the
-- staff-only policy above; its own WHERE clause is the gate, and it
-- selects three columns, so contraindications and coach_notes have no
-- path to a member at all rather than merely no policy permitting them.
-- ============================================================================
create view public.member_exercise_cues as
  select m.provider, m.external_id, m.coaching_cues
  from mef_exercise_metadata m
  where public.member_may_read_exercise(m.provider, m.external_id);

comment on view public.member_exercise_cues is
  'Coaching cues for the exercises one member may read, and nothing else. The member-facing half of mef_exercise_metadata: three columns, never contraindications, never coach_notes.';

revoke all on public.member_exercise_cues from public;
grant select on public.member_exercise_cues to authenticated;
