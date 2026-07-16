-- Activates the AI Coaching Engine Foundation in production.
--
-- ai_agents/ai_rules have held real rows only in supabase/seed/04_ai_agents_and_rules.sql
-- since the milestone that built them — but per docs/DEPLOYMENT.md, seed/*.sql
-- is deliberately never run against production ("Do not run supabase/seed/*.sql
-- against production — that seed data creates synthetic test users").
-- lib/ai/dispatcher.ts's dispatchEvent() filters every event through
-- getEnabledAgents(supabase) (a live query against ai_agents), so with an
-- empty ai_agents table in production, every agent — proactive_coach,
-- accountability, wellness_analysis, member_engagement, coach_assistant,
-- education, body_assessment — silently does nothing, and every ai_rules
-- match (the deterministic rules engine, lib/ai/rules/engine.ts) never
-- fires either. This has been true since that milestone shipped.
--
-- This migration inserts the exact same rows as the seed file (agent
-- metadata + the three original example rules) directly into a migration,
-- so `supabase db push` actually carries them to production. Idempotent
-- via ON CONFLICT so re-running (or the seed file still running locally)
-- never duplicates a row.

insert into ai_agents (agent_key, name, category, description, responsibilities, config) values
  (
    'member_engagement',
    'Member Engagement Agent',
    'engagement',
    'Keeps members motivated and reduces drop-off through encouragement and recognition — never diagnostic, never medical.',
    '["Daily encouragement","Celebrate milestones","Recognize consistency","Detect inactivity","Encourage habit formation","Reduce member drop-off"]'::jsonb,
    '{}'::jsonb
  ),
  (
    'wellness_analysis',
    'Wellness Analysis Agent',
    'analysis',
    'Analyzes onboarding, reassessments, and check-ins for real, data-backed wellness patterns and coaching priorities.',
    '["Analyze onboarding","Analyze reassessments","Analyze daily check-ins","Detect improving trends","Detect declining trends","Calculate coaching priorities","Detect possible burnout","Detect recovery needs","Identify wellness patterns"]'::jsonb,
    '{}'::jsonb
  ),
  (
    'coach_assistant',
    'Coach Assistant Agent',
    'coaching',
    'Prepares client summaries and surfaces coaching insights for a human coach — assists judgment, never replaces it.',
    '["Prepare client summaries","Generate coaching insights","Suggest coaching questions","Suggest reassessments","Highlight important changes","Never replace coach judgment"]'::jsonb,
    '{}'::jsonb
  ),
  (
    'education',
    'Education Agent',
    'education',
    'Matches educational content to a member''s weakest real wellness area and explains why it was chosen.',
    '["Recommend educational content","Explain why recommendations matter","Match education to weakest wellness areas","Reinforce healthy habits"]'::jsonb,
    '{}'::jsonb
  ),
  (
    'accountability',
    'Accountability Agent',
    'accountability',
    'Tracks streaks, missed check-ins, and habit consistency to support long-term follow-through.',
    '["Track streaks","Track missed check-ins","Monitor habits","Schedule reminders","Celebrate milestones","Encourage long-term consistency"]'::jsonb,
    '{}'::jsonb
  ),
  (
    'body_assessment',
    'Body Assessment Agent',
    'movement',
    'Turns completed guided body assessments into member-facing bookkeeping (new findings ready for review) — never interprets or diagnoses a finding itself.',
    '["Acknowledge a completed assessment","Surface a count of new findings awaiting coach review","Never interpret or diagnose a finding"]'::jsonb,
    '{}'::jsonb
  ),
  (
    'proactive_coach',
    'Proactive Coach Agent',
    'engagement',
    'Observes real wearable-derived patterns (HRV, sleep, recovery, activity, stress) and reaches out first, in a calm, encouraging, never-alarming voice — never diagnoses, never interprets raw data itself.',
    '["Detect HRV/sleep/activity/stress trends already computed from wearable data","Recognize excellent recovery","Deliver one calm, on-voice proactive message per real pattern","Never repeat the same nudge before its cooldown window passes"]'::jsonb,
    '{}'::jsonb
  )
on conflict (agent_key) do nothing;

insert into ai_rules (rule_key, agent_key, name, description, trigger_event_types, conditions, produces) values
(
  'recovery_needed_stress_sleep',
  'wellness_analysis',
  'Rising stress with declining sleep',
  'Stress increasing for 3+ consecutive days alongside a declining sleep trend often signals a need for recovery.',
  '["member_completed_checkin"]'::jsonb,
  '{
    "all": [
      { "fact": "stressConsecutiveIncreaseDays", "operator": "gte", "value": 3 },
      { "fact": "sleepTrend", "operator": "eq", "value": "declining" }
    ]
  }'::jsonb,
  '{
    "insightType": "recovery_needed",
    "actionType": "risk_alert",
    "title": "Rising stress with declining sleep",
    "descriptionTemplate": "Stress has increased for {{stressConsecutiveIncreaseDays}} consecutive days while sleep quality has been declining — this combination often signals a need for recovery.",
    "confidence": 0.75,
    "requiresCoachApproval": false
  }'::jsonb
),
(
  'celebrate_pain_movement_progress',
  'member_engagement',
  'Pain easing, movement increasing',
  'A decreasing pain trend together with an increasing movement trend is genuine, real progress worth celebrating.',
  '["member_completed_checkin"]'::jsonb,
  '{
    "all": [
      { "fact": "painTrend", "operator": "eq", "value": "improving" },
      { "fact": "movementTrend", "operator": "eq", "value": "improving" }
    ]
  }'::jsonb,
  '{
    "insightType": "progress_worth_celebrating",
    "actionType": "progress_milestone",
    "title": "Pain easing, movement increasing",
    "descriptionTemplate": "Pain has been easing while movement has been increasing over recent check-ins — real, measurable progress worth recognizing.",
    "confidence": 0.8,
    "requiresCoachApproval": false
  }'::jsonb
),
(
  'missed_checkins_accountability',
  'accountability',
  'Missed check-ins',
  'Five or more days without a check-in warrants an accountability reminder.',
  '["member_completed_checkin", "coach_added_notes"]'::jsonb,
  '{
    "all": [
      { "fact": "daysSinceLastCheckin", "operator": "gte", "value": 5 }
    ]
  }'::jsonb,
  '{
    "insightType": "missed_checkins",
    "actionType": "reminder_recommendation",
    "title": "Check-ins have lapsed",
    "descriptionTemplate": "It has been {{daysSinceLastCheckin}} days since the last check-in.",
    "confidence": 0.9,
    "requiresCoachApproval": false
  }'::jsonb
)
on conflict (rule_key) do nothing;
