-- Lead Capture Agent — a separate, public-facing prospect-intake chat
-- embedded on external Leadpages landing pages (app/api/lead-capture,
-- lib/lead-capture/*, public/lead-widget.js). Entirely independent of the
-- member-facing Conversation Coach / Root (migration 33's
-- conversation_sessions/conversation_messages): a lead is anonymous, has
-- no auth.users row, and this feature must never read or write any of
-- Root's tables.
--
-- Every write to these three tables happens server-side through
-- app/api/lead-capture/route.ts using the service-role client (there is
-- no authenticated "lead" to write RLS policies for — see
-- conversation_coach's own docblock precedent at migration 33, and this
-- repo's one prior public-facing surface, guest onboarding, which never
-- writes to Postgres while anonymous at all). RLS is therefore enabled
-- with NO public/anon policies whatsoever (the service role bypasses RLS
-- by design) — only a coach/platform-admin READ policy, so a future
-- coach-facing "Leads" view can query these tables directly without its
-- own proxy route.

create table lead_conversations (
  id uuid primary key default gen_random_uuid(),
  -- Opaque token the widget stores in sessionStorage to resume its own
  -- conversation across messages within one visit. Never derived from or
  -- linked to any auth.users id.
  session_token text not null unique,
  topic text check (topic in ('pain', 'energy', 'sleep', 'stress', 'general')),
  stage text not null default 'opening' check (
    stage in (
      'opening',
      'follow_up_1',
      'follow_up_2',
      'follow_up_3',
      'follow_up_4',
      'insight_capture',
      'routed'
    )
  ),
  retry_count int not null default 0,
  lead_temperature text check (lead_temperature in ('hot', 'warm')),
  routed_to text check (routed_to in ('discovery_call', 'quiz_guide')),
  -- Assigned once the follow-up questions are answered (lib/lead-capture/
  -- pattern.ts's determinePatternName), before the insight+email-ask turn
  -- is sent — the two-part insight names this same pattern in both its
  -- opening (loop-opening) and closing (completion) messages, and it's
  -- copied onto captured_leads below so it shows up in the coach
  -- notification too.
  pattern_name text check (
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
  ),
  -- Landing page the widget was embedded on (document.referrer), for
  -- attribution — not required, purely informational.
  source_url text,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lead_conversations_last_message_idx on lead_conversations (last_message_at desc);

create table lead_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references lead_conversations(id) on delete cascade,
  role text not null check (role in ('lead', 'agent')),
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default now()
);

create index lead_messages_conversation_idx on lead_messages (conversation_id, created_at asc);

create table captured_leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references lead_conversations(id) on delete cascade,
  first_name text,
  email text not null,
  topic text check (topic in ('pain', 'energy', 'sleep', 'stress', 'general')),
  lead_temperature text check (lead_temperature in ('hot', 'warm')),
  routed_to text check (routed_to in ('discovery_call', 'quiz_guide')),
  -- Copied from lead_conversations.pattern_name at capture time, so the
  -- coach can see the assigned pattern directly on the lead record (and in
  -- the notification built from it) without a join back to the
  -- conversation.
  pattern_name text check (
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
  ),
  -- Set once the coach-notification insert (lib/lead-capture/notify.ts)
  -- succeeds, so a retried/duplicate notification attempt is avoidable.
  notified_at timestamptz,
  created_at timestamptz not null default now()
);

create index captured_leads_created_idx on captured_leads (created_at desc);
create index captured_leads_email_idx on captured_leads (email);

alter table lead_conversations enable row level security;
alter table lead_messages enable row level security;
alter table captured_leads enable row level security;

create policy coach_read_lead_conversations on lead_conversations
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_all_lead_conversations on lead_conversations
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_lead_messages on lead_messages
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_all_lead_messages on lead_messages
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

create policy coach_read_captured_leads on captured_leads
  for select using (public.has_active_role(auth.uid(), 'coach'));
create policy platform_admin_all_captured_leads on captured_leads
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Extends the generic in-app notifications table (migration 39, already
-- extended by migration 45 for the same reason) so a captured lead can
-- notify every active coach through the one existing notification
-- channel rather than a new table.
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in (
    'assessment_report_published',
    'proactive_coach_message',
    'morning_brief_ready',
    'weekly_summary',
    'new_lead_captured'
  ));
