-- Core Values Snapshot — Experience 1 of the free-tier lineup, built
-- entirely on the Unified Adaptive Assessment Foundation/Runtime
-- (migrations 98-99), exactly the pattern WBSA established (migrations
-- 100-101): a catalog row (assessment_definitions), a content definition
-- (unified_assessment_definitions/sections/questions), and nothing new in
-- the runtime itself. Also adds the small amount of genuinely new storage
-- this experience needs that no existing table covers — daily taps for the
-- Weekly Experiment — and extends the Root Coaching Conversation Engine's
-- fixed conversation_type vocabulary (migration 96) for its day-3/day-7
-- follow-ups, the same additive drop/re-add pattern migration 99 already
-- used for registry_entries.source_feature.

-- 1) Catalog row — same two-insert shape as migration 100's WBSA addition.
insert into assessment_definitions (id, key, display_name, category) values
  ('f852e76a-75cc-441c-9c76-252f5c881a86', 'core-values-snapshot', 'Core Values Snapshot', 'values_alignment');

insert into assessment_definition_versions (assessment_definition_id, version, notes)
values ('f852e76a-75cc-441c-9c76-252f5c881a86', 1, 'Initial Core Values Snapshot release on the Unified Adaptive Assessment Runtime.');

-- 2) Content — definition, 3 sections, 12 questions. Q12's answer_options
-- is deliberately null: its two options are generated at take-time from
-- the member's own Q1-Q4 answers (lib/core-values-snapshot/q12.ts), not
-- fixed content. No question here sets concern_category/severity_tags/
-- validation — this is a values/preference instrument, not a symptom
-- instrument, so it deliberately produces zero Universal Registry
-- findings (a valid, documented scope decision, same as Primal Pattern's
-- own classification-only posture).
with def as (
  insert into unified_assessment_definitions (
    key, catalog_definition_id, title, description, assessment_type,
    estimated_completion_time_minutes, adaptive_enabled, reassessment_enabled,
    safety_enabled, version, active
  ) values (
    'core-values-snapshot',
    'f852e76a-75cc-441c-9c76-252f5c881a86',
    'Core Values Snapshot',
    'Twelve questions that surface which of six value areas matters most to a member right now, and whether their last two weeks actually protected it.',
    'values_snapshot',
    7, false, true, false, 1, true
  )
  returning id
),
sections as (
  insert into unified_assessment_sections (assessment_definition_id, title, subtitle, display_order)
  select def.id, v.title, v.subtitle, v.display_order
  from def, (values
    ('What Matters', null, 1),
    ('Where Your Time Goes', 'That was what matters. Now — what''s actually been getting your time? For each of these, be honest about the last two weeks. Not your intentions. Your calendar.', 2),
    ('The Choice', null, 3)
  ) as v(title, subtitle, display_order)
  returning id, title
)
insert into unified_assessment_questions (
  assessment_definition_id, section_id, question_key, display_order, prompt, description, answer_type, answer_options
)
select def.id, sections.id, q.question_key, q.display_order, q.prompt, q.description, q.answer_type, q.answer_options
from def, sections, (values
  ('What Matters', 'cvs_q1', 1,
   'If tomorrow had a 25th hour that nobody could claim but you — no work, no obligations — what would you actually spend it on?',
   null::text, 'single_select',
   '[{"value":"health","label":"Moving my body — training, walking, stretching, breathing"},{"value":"relationships","label":"Uninterrupted time with someone I love"},{"value":"growth","label":"Learning or working on something I keep putting off"},{"value":"purpose","label":"Making progress on work that actually matters to me"},{"value":"freedom","label":"Something purely for fun — no goal attached"},{"value":"peace","label":"Absolutely nothing. Quiet."}]'::jsonb),
  ('What Matters', 'cvs_q2', 2,
   'When life gets loud and busy, what disappears first — the thing you quietly miss the most?',
   null, 'single_select',
   '[{"value":"health","label":"Exercise and taking care of my body"},{"value":"relationships","label":"Real time with the people closest to me"},{"value":"growth","label":"Reading, learning, working on myself"},{"value":"purpose","label":"The work I care about, buried under the work I have to do"},{"value":"freedom","label":"Fun, play, anything spontaneous"},{"value":"peace","label":"Stillness — a moment that belongs to no one"}]'::jsonb),
  ('What Matters', 'cvs_q3', 3,
   'Finish this sentence honestly: "I feel guilty that I don''t ______ enough."',
   null, 'single_select',
   '[{"value":"health","label":"take care of my health"},{"value":"relationships","label":"show up for the people I love"},{"value":"growth","label":"invest in growing"},{"value":"purpose","label":"pursue what I''m actually here to do"},{"value":"freedom","label":"enjoy my own life"},{"value":"peace","label":"rest"}]'::jsonb),
  ('What Matters', 'cvs_q4', 4,
   'Picture yourself ten years from now, looking back at this exact season of your life. What would that older, wiser you beg you to protect?',
   null, 'single_select',
   '[{"value":"health","label":"Your body — it carries everything else"},{"value":"relationships","label":"The relationships that won''t wait forever"},{"value":"growth","label":"Your growth — who you were becoming"},{"value":"purpose","label":"The work only you could do"},{"value":"freedom","label":"The adventures you kept postponing"},{"value":"peace","label":"Your peace — you were allowed to rest"}]'::jsonb),

  ('Where Your Time Goes', 'cvs_q5', 5, 'Your body and energy', '1 = none at all · 3 = scraps · 5 = real, protected time', 'scale_1_5',
   '[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3","label":"3"},{"value":"4","label":"4"},{"value":"5","label":"5"}]'::jsonb),
  ('Where Your Time Goes', 'cvs_q6', 6, 'The people closest to you', '1 = none at all · 3 = scraps · 5 = real, protected time', 'scale_1_5',
   '[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3","label":"3"},{"value":"4","label":"4"},{"value":"5","label":"5"}]'::jsonb),
  ('Where Your Time Goes', 'cvs_q7', 7, 'Learning and growing', '1 = none at all · 3 = scraps · 5 = real, protected time', 'scale_1_5',
   '[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3","label":"3"},{"value":"4","label":"4"},{"value":"5","label":"5"}]'::jsonb),
  ('Where Your Time Goes', 'cvs_q8', 8, 'Work that feels meaningful (not just busy)', '1 = none at all · 3 = scraps · 5 = real, protected time', 'scale_1_5',
   '[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3","label":"3"},{"value":"4","label":"4"},{"value":"5","label":"5"}]'::jsonb),
  ('Where Your Time Goes', 'cvs_q9', 9, 'Fun and play', '1 = none at all · 3 = scraps · 5 = real, protected time', 'scale_1_5',
   '[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3","label":"3"},{"value":"4","label":"4"},{"value":"5","label":"5"}]'::jsonb),
  ('Where Your Time Goes', 'cvs_q10', 10, 'Rest and stillness', '1 = none at all · 3 = scraps · 5 = real, protected time', 'scale_1_5',
   '[{"value":"1","label":"1"},{"value":"2","label":"2"},{"value":"3","label":"3"},{"value":"4","label":"4"},{"value":"5","label":"5"}]'::jsonb),

  ('The Choice', 'cvs_q11', 11,
   'If the next 90 days could only transform ONE of these, which would change your life the most right now?',
   null, 'single_select',
   '[{"value":"health","label":"Health & Energy"},{"value":"relationships","label":"Close Relationships"},{"value":"growth","label":"Growth & Learning"},{"value":"purpose","label":"Purpose & Meaningful Work"},{"value":"freedom","label":"Freedom & Play"},{"value":"peace","label":"Peace & Calm"}]'::jsonb),
  ('The Choice', 'cvs_q12', 12,
   'Last one. Don''t think — choose. If today forced you to pick:',
   'Options generated live from your own answers above.', 'single_select', null)
) as q(section_title, question_key, display_order, prompt, description, answer_type, answer_options)
where sections.title = q.section_title;

-- 2b) lifestyle_experiments gets one new, nullable, purely additive column
-- so a Core Values Snapshot completion can be traced forward to the exact
-- experiment it started (needed for accurate per-completion coach
-- visibility and for the member's own experiment page after a retake).
-- Every existing row/caller is unaffected — nothing else ever sets this.
alter table lifestyle_experiments add column source_session_id uuid references unified_assessment_sessions(id) on delete set null;

-- 3) Weekly Experiment daily taps — the one genuinely new table this
-- experience needs. The experiment record itself reuses
-- lifestyle_experiments (migration 92) as-is (title = the protected
-- area's display label, protocol = the theory/experiment text,
-- recommendation_id left null since this experiment isn't sourced from
-- the Recommendation Engine like every other lifestyle_experiments row
-- today — the only member-facing consequence is this table's own row,
-- not a change to lifestyle_experiments' schema or behavior). One row per
-- calendar day: the evening Yes/Not-today tap (`completed`) and, on day
-- 3's own date, the qualitative check-in response (`day3_response`) live
-- on the same row rather than a third table, since both are keyed to a
-- specific date within the same 7-day run.
create table cvs_experiment_daily_logs (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references lifestyle_experiments(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,

  local_date date not null,
  completed boolean,
  day3_response text check (day3_response in ('going_well', 'mixed', 'not_started')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (experiment_id, local_date)
);

create index cvs_experiment_daily_logs_experiment_idx on cvs_experiment_daily_logs (experiment_id, local_date);

alter table cvs_experiment_daily_logs enable row level security;

create policy member_read_own_cvs_experiment_daily_logs on cvs_experiment_daily_logs
  for select
  using (member_id = auth.uid());

create policy member_insert_own_cvs_experiment_daily_logs on cvs_experiment_daily_logs
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_cvs_experiment_daily_logs on cvs_experiment_daily_logs
  for update
  using (member_id = auth.uid());

create policy coach_read_assigned_cvs_experiment_daily_logs on cvs_experiment_daily_logs
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_cvs_experiment_daily_logs on cvs_experiment_daily_logs
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- 4) Root Coaching Conversation Engine — two new topic types for the
-- Weekly Experiment's day-3/day-7 follow-ups, delivered through the
-- existing "From Root" dashboard surface and member_coaching_messages
-- ledger (migration 96), same additive drop/re-add pattern migration 99
-- used for registry_entries.source_feature. Nothing else about that
-- table changes.
alter table member_coaching_messages drop constraint member_coaching_messages_conversation_type_check;
alter table member_coaching_messages add constraint member_coaching_messages_conversation_type_check
  check (conversation_type in (
    'first_observation', 'repeated_signal', 'improving_trend', 'worsening_trend',
    'conflicting_information', 'new_assessment_available', 'reassessment',
    'experiment_follow_up', 'experiment_success', 'experiment_unsuccessful',
    'cvs_day3_checkin', 'cvs_day7_result'
  ));
