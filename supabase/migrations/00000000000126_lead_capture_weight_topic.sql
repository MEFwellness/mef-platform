-- Adds "weight" as a 5th Lead Capture Agent topic, alongside pain/energy/
-- sleep/stress, plus its two new pattern names (stress_storage_pattern,
-- metabolic_adaptation_pattern — see docs/LEAD_AGENT_VOICE.md).
--
-- A new migration number, not an edit to 00000000000123 or 00000000000125:
-- this project's migration history tracks by version number only, so
-- editing an already-applied migration file is silently invisible to
-- future `supabase db push` runs (the exact lesson from this session's
-- prior two migrations). `drop constraint if exists` / idempotent
-- rebuilding throughout so this is safe to run regardless of exactly
-- which of 123/124/125 production actually picked up.

alter table lead_conversations drop constraint if exists lead_conversations_topic_check;
alter table lead_conversations add constraint lead_conversations_topic_check
  check (topic in ('pain', 'energy', 'sleep', 'stress', 'weight', 'general'));

alter table captured_leads drop constraint if exists captured_leads_topic_check;
alter table captured_leads add constraint captured_leads_topic_check
  check (topic in ('pain', 'energy', 'sleep', 'stress', 'weight', 'general'));

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
      'stress_loading_pattern',
      'stress_storage_pattern',
      'metabolic_adaptation_pattern'
    )
  );

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
      'stress_loading_pattern',
      'stress_storage_pattern',
      'metabolic_adaptation_pattern'
    )
  );

notify pgrst, 'reload schema';
