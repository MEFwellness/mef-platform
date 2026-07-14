-- Extends intelligence_coach_alerts.alert_type for the Universal Registry
-- integration (see migration 40's own header and
-- apps/consumer-web-app/lib/intelligence-engine/registryFindings.ts) —
-- same additive-constraint-extension convention migration 39 already used
-- for ai_events.event_type. Without this, a significant-severity
-- registry_entries finding (e.g. a published, coach-confirmed body
-- assessment finding) can be built into a CoachAlertDraft by
-- buildRegistryCoachAlertDrafts but silently fails to persist via
-- upsertCoachAlert's insertAlert — the write is wrapped in the same
-- best-effort try/catch every other alert insert uses, so the failure
-- never surfaces to the caller, only to server logs.
alter table intelligence_coach_alerts drop constraint intelligence_coach_alerts_alert_type_check;
alter table intelligence_coach_alerts add constraint intelligence_coach_alerts_alert_type_check
  check (alert_type in (
    'needs_review',
    'burnout_risk',
    'assessment_overdue',
    'no_checkin',
    'symptoms_worsening',
    'rapid_improvement',
    'plateau',
    'recurring_barriers',
    'repeated_safety_flags',
    'medical_evaluation_recommended',
    'assessment_finding_requires_attention'
  ));
