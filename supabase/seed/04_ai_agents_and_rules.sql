-- AI agent registry (metadata only — behavior lives in
-- apps/consumer-web-app/lib/ai/agents/*.ts, keyed by agent_key) and the
-- three example deterministic rules from the AI Coaching Engine
-- Foundation milestone brief. Real member data drives every one of
-- these; nothing here fabricates a recommendation.

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
  );

-- Rule 1 — the milestone brief's first worked example verbatim: 3
-- consecutive days of rising stress plus a declining sleep trend implies
-- a need for recovery, before any LLM is involved.
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
-- Rule 2 — the milestone brief's second worked example: pain easing while
-- movement increases is real, positive, worth celebrating.
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
-- Rule 3 — the milestone brief's third worked example: 5+ days without a
-- check-in warrants an accountability nudge. Full correctness needs a
-- scheduled job to evaluate this even when the member takes no action at
-- all (silence can't self-trigger an event) — not built this milestone,
-- see lib/ai/README.md. Wired to fire opportunistically whenever a
-- checkin/coach-note event gives the dispatcher a reason to load the
-- member's recent history anyway.
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
);
