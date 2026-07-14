-- Extends ai_events.event_type for the Wearables + Proactive AI Coach
-- milestone — same additive-constraint-extension convention migrations 37
-- and 39 already used for this exact table. Without this, every wearable-
-- driven proactive event (lib/wearables/detectProactiveEvents.ts,
-- lib/wearables/sync.ts) fails at the database with a check-constraint
-- violation the moment it's emitted — a gap the shared-types-contracts
-- AiEventType union alone can't catch, since nothing there is validated
-- against the live schema.
alter table ai_events drop constraint ai_events_event_type_check;
alter table ai_events add constraint ai_events_event_type_check
  check (event_type in (
    'member_completed_onboarding',
    'member_completed_checkin',
    'member_missed_checkin',
    'reassessment_completed',
    'pain_increased',
    'pain_decreased',
    'stress_increased',
    'stress_decreased',
    'sleep_declined',
    'movement_improved',
    'digestion_worsened',
    'coach_added_notes',
    'coach_completed_session',
    'member_inactive',
    'habit_streak_achieved',
    'wellness_index_changed_significantly',
    'body_assessment_completed',
    'assessment_submitted_for_coach_review',
    'wearable_synced',
    'hrv_declining',
    'recovery_excellent',
    'activity_declined'
  ));
