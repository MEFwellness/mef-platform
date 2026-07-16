-- Root Proactive Coaching Engine — evolves Root from reactive chatbot to
-- a coach that observes, remembers, and reaches out first.
--
-- This migration is intentionally additive-only (new table, widened check
-- constraints, new ai_rules data rows), following the exact convention
-- migrations 43/44/45/47 already established for extending this schema:
--   - notifications.type gets two new values so a Morning Brief being
--     ready and a weekly summary can be represented distinctly from the
--     existing proactive_coach_message type.
--   - health_timeline_events.event_type gets new values so the coaching
--     engine (streak milestones, wearable connection, wellness trends)
--     can write into the same append-only timeline
--     apps/consumer-web-app/app/progress/timeline/page.tsx already
--     renders, per that table's own "future event sources plug in by
--     extending event_type's check constraint" design note.
--   - two new ai_rules rows complete the "missed check-ins"/"member gone
--     quiet" gap lib/ai/README.md documents as the one thing the
--     dispatcher can't do without a scheduled job — this milestone adds
--     that job (app/api/cron/daily-coaching-scan) and these are the rules
--     it triggers.

-- ---------------------------------------------------------------------
-- coach_morning_briefs — one generated brief per member per local_date.
-- Idempotent-by-day: apps/consumer-web-app/lib/coaching-engine/service.ts
-- generates this the same way lib/feed/service.ts's getOrCreateTodaysFeed
-- does for the Daily Coaching Feed — either a background cron pre-warms
-- it, or the member's own first page load that day creates it lazily.
-- Every field is a snapshot of what was actually composed that day (never
-- recomputed retroactively), so a member's brief from three days ago
-- reads exactly as it did that morning even if underlying data changes
-- later.
-- ---------------------------------------------------------------------
create table coach_morning_briefs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  local_date text not null,

  greeting_name text not null,
  focus_area text not null,
  focus_label text not null,

  recovery_summary text,
  sleep_summary text,
  stress_summary text,

  habit_to_prioritize text,
  coaching_recommendation text not null,
  encouraging_message text not null,

  -- Polymorphic pointers into whatever data actually backed this brief
  -- (a wellness_insights row, a habits row) — same evidence_refs
  -- convention used throughout (health_timeline_events, ai_insights).
  evidence_refs jsonb not null default '[]'::jsonb,

  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (member_id, local_date)
);

create index coach_morning_briefs_member_date_idx
  on coach_morning_briefs (member_id, local_date desc);

alter table coach_morning_briefs enable row level security;

create policy member_read_own_morning_briefs on coach_morning_briefs
  for select
  using (member_id = auth.uid());

-- Needed for the on-demand (lazy) generation path, which runs under the
-- member's own session the first time they open Dashboard/Today on a new
-- local_date — same reason migration 46 added member_insert_own_notifications
-- for the proactive coach's own member-session write path.
create policy member_insert_own_morning_briefs on coach_morning_briefs
  for insert
  with check (member_id = auth.uid());

create policy coach_read_assigned_morning_briefs on coach_morning_briefs
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_morning_briefs on coach_morning_briefs
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- notifications.type — widen for the Morning Brief and weekly/monthly
-- digest notifications (Smart Notifications, section 4).
-- ---------------------------------------------------------------------
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'assessment_report_published',
    'proactive_coach_message',
    'morning_brief_ready',
    'weekly_summary'
  ));

-- ---------------------------------------------------------------------
-- health_timeline_events.event_type — widen for Coach Timeline
-- (section 3): streak milestones, a wellness trend turning meaningfully
-- better/worse, and connecting a wearable for the first time.
-- ---------------------------------------------------------------------
alter table health_timeline_events drop constraint health_timeline_events_event_type_check;
alter table health_timeline_events add constraint health_timeline_events_event_type_check
  check (event_type in (
    'onboarding_completed', 'reassessment_completed', 'checkin_submitted',
    'assessment_published', 'wearable_synced',
    'streak_milestone', 'trend_improving', 'trend_declining', 'wearable_connected'
  ));

-- ---------------------------------------------------------------------
-- New deterministic rules for the two "absence" events that already
-- exist in the AiEventType enum and that accountabilityAgent already
-- subscribes to (respondsTo: member_missed_checkin, member_inactive) but
-- that nothing has ever emitted, per lib/ai/README.md's own documented
-- gap. app/api/cron/daily-coaching-scan/route.ts is the new scheduled job
-- that emits them; these rules are what turns that emission into an
-- actual member-facing nudge, same "rules are data, not code" posture as
-- the three original rules in migration 052.
-- ---------------------------------------------------------------------
insert into ai_rules (rule_key, agent_key, name, description, trigger_event_types, conditions, produces) values
(
  'missed_checkin_scheduled_nudge',
  'accountability',
  'Missed check-in (scheduled)',
  'Two or more days without a check-in, detected by the daily scheduled scan rather than only when the member next takes an action — a gentle, early nudge rather than waiting for the 5-day threshold.',
  '["member_missed_checkin"]'::jsonb,
  '{
    "all": [
      { "fact": "daysSinceLastCheckin", "operator": "gte", "value": 2 }
    ]
  }'::jsonb,
  '{
    "insightType": "missed_checkin_nudge",
    "actionType": "reminder_recommendation",
    "title": "It has been a couple of days",
    "descriptionTemplate": "It has been {{daysSinceLastCheckin}} days since the last check-in — a quick one today keeps things on track.",
    "confidence": 0.85,
    "requiresCoachApproval": false
  }'::jsonb
),
(
  'member_inactive_reengagement',
  'accountability',
  'Member gone quiet',
  'Ten or more days without a check-in warrants a warmer re-engagement message rather than a routine reminder.',
  '["member_inactive"]'::jsonb,
  '{
    "all": [
      { "fact": "daysSinceLastCheckin", "operator": "gte", "value": 10 }
    ]
  }'::jsonb,
  '{
    "insightType": "reengagement",
    "actionType": "member_encouragement",
    "title": "We have missed you",
    "descriptionTemplate": "It has been {{daysSinceLastCheckin}} days — whenever you are ready, your coach and Root are right here.",
    "confidence": 0.8,
    "requiresCoachApproval": false
  }'::jsonb
)
on conflict (rule_key) do nothing;
