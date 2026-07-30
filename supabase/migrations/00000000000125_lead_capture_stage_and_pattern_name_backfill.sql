-- Repairs production's lead_conversations/captured_leads to actually match
-- what migration 00000000000123 is supposed to create.
--
-- Root cause found by driving a real conversation against the live
-- production endpoint: the follow_up_4 -> insight_capture transition
-- failed in production with Postgres error 23514 ("new row ... violates
-- check constraint lead_conversations_stage_check") — a genuine, real
-- constraint violation, not a PostgREST cache-staleness symptom like the
-- earlier pattern_name error looked like. That means production's
-- lead_conversations table was built from an OLDER copy of migration 123
-- (one without follow_up_4 in the stage check, and, most likely, without
-- pattern_name either) — this project's migration history had already
-- recorded "00000000000123" as applied before this repo's follow_up_4 +
-- pattern_name edits landed in that same file, so every subsequent
-- `supabase db push` silently skipped re-running it: Supabase's CLI tracks
-- migrations by version number only, never by diffing file content, so an
-- edit to an already-applied migration is invisible to it forever. The
-- earlier 00000000000124 NOTIFY migration wasn't wrong to try, but it was
-- reloading PostgREST's cache for a schema that genuinely never got the
-- follow_up_4/pattern_name changes applied to Postgres in the first place.
--
-- Every statement below is written to be safe to run regardless of
-- production's actual current state (some projects may have gotten
-- pattern_name applied partially, most likely didn't) — `drop constraint
-- if exists` / `add column if not exists` make this idempotent.

alter table lead_conversations drop constraint if exists lead_conversations_stage_check;
alter table lead_conversations add constraint lead_conversations_stage_check
  check (
    stage in (
      'opening',
      'follow_up_1',
      'follow_up_2',
      'follow_up_3',
      'follow_up_4',
      'insight_capture',
      'routed'
    )
  );

alter table lead_conversations add column if not exists pattern_name text;
alter table lead_conversations drop constraint if exists lead_conversations_pattern_name_check;
alter table lead_conversations add constraint lead_conversations_pattern_name_check
  check (
    pattern_name in (
      'recovery_deficit',
      'compensation_pattern',
      'overload_pattern',
      'fuel_timing_pattern',
      'depletion_pattern',
      'wind_down_deficit',
      'rhythm_disruption',
      'stress_loading_pattern'
    )
  );

alter table captured_leads add column if not exists pattern_name text;
alter table captured_leads drop constraint if exists captured_leads_pattern_name_check;
alter table captured_leads add constraint captured_leads_pattern_name_check
  check (
    pattern_name in (
      'recovery_deficit',
      'compensation_pattern',
      'overload_pattern',
      'fuel_timing_pattern',
      'depletion_pattern',
      'wind_down_deficit',
      'rhythm_disruption',
      'stress_loading_pattern'
    )
  );

-- Belt-and-suspenders: force PostgREST to pick up the above immediately
-- rather than wait on its own reload cycle.
notify pgrst, 'reload schema';
