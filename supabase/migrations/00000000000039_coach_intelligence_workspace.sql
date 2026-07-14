-- Coach Intelligence Workspace.
--
-- The missing middle layer between "member submits an assessment" and "member
-- sees results": today a configured provider's body_assessment_findings are
-- shown to the member immediately and unreviewed. This migration adds a
-- generic, coach-gated AI-draft-review pipeline that sits in front of that —
-- built to generalize across every future assessment type (posture, gait,
-- breathing, questionnaires, nutrition, stress, sleep, ...), not just
-- body_assessments, by following the same polymorphic source_feature +
-- source_record_id pointer safety_classifications already uses (migration 28)
-- instead of a hard FK to body_assessments.
--
--   assessment_ai_analyses       one row per AI analysis "document" for a
--                                 submitted assessment. Created unconditionally
--                                 at submit time (application code) so
--                                 "pending coach review" is a guaranteed,
--                                 durable fact of submission — independent of
--                                 whether an AI provider is configured yet.
--                                 Coach-editable (ai_summary is the immutable
--                                 AI-authored text; coach_summary is the
--                                 coach's edit, same "override alongside, don't
--                                 mutate" posture as coach_override_notes on
--                                 body_assessment_findings).
--
--   assessment_ai_observations   every categorized AI-drafted item — this one
--                                 table covers all seven spec sections (key
--                                 observations, movement compensations, Four
--                                 Doctors considerations, education topics,
--                                 corrective exercise categories, coach
--                                 questions, red flags) via a `category`
--                                 discriminator, since they're all
--                                 structurally identical: AI text + optional
--                                 confidence/severity + coach accept/reject/
--                                 edit. Reuses the same evidence-refs jsonb
--                                 convention as body_assessment_findings.
--
--   assessment_report_exercises  coach-authored specific exercises (distinct
--                                 from the AI's suggested exercise
--                                 *categories* above) attached to the
--                                 published report.
--
--   notifications                generic in-app notification record — did
--                                 not exist anywhere in this codebase before
--                                 this migration. Starts with exactly one
--                                 type (assessment_report_published); extend
--                                 the check constraint for future types the
--                                 same way ai_events.event_type has been
--                                 extended by migrations 31/33/35/37.
--
-- RLS follows the established has_active_role/is_active_coach_for pattern
-- throughout, with one addition worth calling out: member SELECT on the three
-- assessment_ai_* tables is narrow, not blanket — mirroring wellness_insights
-- (migration 31), which hides status='dismissed' rows from members at the RLS
-- layer, not just in application code. Here a member can only ever read a
-- PUBLISHED analysis, and only ACCEPTED observations that aren't
-- coach-internal categories (red_flag, coach_question). This is the actual
-- enforcement of "do not expose AI findings directly to the member" — not an
-- app-layer filter a bug could bypass.

-- ============================================================
-- ai_events: extend event_type for the new submission-time event.
-- ============================================================
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
    'assessment_submitted_for_coach_review'
  ));

-- ============================================================
-- assessment_ai_analyses
-- ============================================================
create table assessment_ai_analyses (
  id uuid primary key default gen_random_uuid(),

  -- Polymorphic pointer, same convention as safety_classifications.
  -- source_feature in ('body_assessment') today; extend this check
  -- constraint (new migration) when a second assessment type wires in.
  source_feature text not null check (source_feature in ('body_assessment')),
  source_record_id uuid not null,
  member_id uuid not null references auth.users(id) on delete cascade,

  provider_name text,
  provider_status text not null default 'not_configured' check (provider_status in (
    'not_configured', 'pending', 'completed', 'failed'
  )),
  provider_error text,

  status text not null default 'pending_coach_review' check (status in (
    'pending_coach_review', 'draft_saved', 'published', 'archived'
  )),

  ai_summary text,
  coach_summary text,
  overall_confidence numeric check (overall_confidence >= 0 and overall_confidence <= 1),
  coach_personal_notes text,
  voice_message_url text,

  coach_reviewed_by uuid references auth.users(id) on delete set null,
  coach_reviewed_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source_feature, source_record_id)
);

create index assessment_ai_analyses_member_idx on assessment_ai_analyses (member_id);
create index assessment_ai_analyses_source_idx
  on assessment_ai_analyses (source_feature, source_record_id);

alter table assessment_ai_analyses enable row level security;

create policy coach_read_assigned_assessment_ai_analyses on assessment_ai_analyses
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Narrow member visibility: published only. This is the enforcement point.
create policy member_read_published_assessment_ai_analyses on assessment_ai_analyses
  for select
  using (member_id = auth.uid() and status = 'published');

create policy coach_insert_assigned_assessment_ai_analyses on assessment_ai_analyses
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- The analysis row is also inserted by the submitting member's own session
-- (submitAssessmentAction runs as the member, same as every other write path
-- in this app) — mirrors member_insert_own_body_assessments. WITH CHECK is
-- deliberately narrow, not just member_id = auth.uid(): a member's own
-- session may only ever create/keep a row in the pre-coach-review state,
-- with every coach-authored field null. Without this, a member could insert
-- (or update, see below) a row with status='published' directly and have it
-- render as a coach-approved report — the exact bypass this whole feature
-- exists to prevent.
create policy member_insert_own_assessment_ai_analyses on assessment_ai_analyses
  for insert
  with check (
    member_id = auth.uid()
    and status = 'pending_coach_review'
    and coach_summary is null
    and coach_personal_notes is null
    and coach_reviewed_by is null
    and published_by is null
    and published_at is null
  );

create policy coach_update_assigned_assessment_ai_analyses on assessment_ai_analyses
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- The member's own session also needs UPDATE for the same reason as INSERT
-- above — the best-effort analysis pipeline runs inline inside
-- submitAssessmentAction and writes provider_status/summary/etc. under the
-- member's session, not the coach's. Same narrow WITH CHECK as the INSERT
-- policy: a member's own session can only ever leave this row in the
-- pre-coach-review state. Postgres reuses USING as WITH CHECK when the
-- latter is omitted, which is NOT narrow enough here (it would only re-check
-- member_id, not status/coach fields) — this must be explicit.
create policy member_update_own_assessment_ai_analyses on assessment_ai_analyses
  for update
  using (member_id = auth.uid())
  with check (
    member_id = auth.uid()
    and status = 'pending_coach_review'
    and coach_summary is null
    and coach_personal_notes is null
    and coach_reviewed_by is null
    and published_by is null
    and published_at is null
  );

create policy platform_admin_all_assessment_ai_analyses on assessment_ai_analyses
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- assessment_ai_observations
-- ============================================================
create table assessment_ai_observations (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references assessment_ai_analyses(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,

  category text not null check (category in (
    'observation', 'compensation', 'four_doctors_consideration',
    'education_topic', 'corrective_exercise_category', 'coach_question', 'red_flag'
  )),
  ai_text text not null,
  coach_text text,
  confidence numeric check (confidence >= 0 and confidence <= 1),
  severity text check (severity in ('none', 'mild', 'moderate', 'significant', 'unknown')),
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'pending_review' check (status in (
    'pending_review', 'accepted', 'rejected'
  )),
  sort_order int not null default 0,

  coach_reviewed_by uuid references auth.users(id) on delete set null,
  coach_reviewed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assessment_ai_observations_analysis_idx
  on assessment_ai_observations (analysis_id, sort_order);
create index assessment_ai_observations_member_idx on assessment_ai_observations (member_id);

alter table assessment_ai_observations enable row level security;

create policy coach_read_assigned_assessment_ai_observations on assessment_ai_observations
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Narrow member visibility: only accepted, non-coach-internal categories, and
-- only once the parent analysis has been published.
create policy member_read_published_assessment_ai_observations on assessment_ai_observations
  for select
  using (
    member_id = auth.uid()
    and status = 'accepted'
    and category not in ('red_flag', 'coach_question')
    and exists (
      select 1 from assessment_ai_analyses a
      where a.id = analysis_id and a.status = 'published'
    )
  );

-- Observation rows are written by the best-effort analysis pipeline running
-- under the member's own session (see assessment_ai_analyses above), and
-- edited (accept/reject/edit-wording) by the assigned coach. WITH CHECK
-- forces every member-authored row into status='pending_review' with no
-- coach edit/review fields set — a member's own session can never insert a
-- pre-'accepted' observation for itself (there is deliberately no member
-- UPDATE policy on this table at all, so it can't flip status afterward
-- either; only coach_update_assigned_assessment_ai_observations can).
create policy member_insert_own_assessment_ai_observations on assessment_ai_observations
  for insert
  with check (
    member_id = auth.uid()
    and status = 'pending_review'
    and coach_text is null
    and coach_reviewed_by is null
    and coach_reviewed_at is null
  );

create policy coach_insert_assigned_assessment_ai_observations on assessment_ai_observations
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_assessment_ai_observations on assessment_ai_observations
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_assessment_ai_observations on assessment_ai_observations
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- assessment_report_exercises
-- ============================================================
create table assessment_report_exercises (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references assessment_ai_analyses(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,

  name text not null,
  description text,
  category text,
  sort_order int not null default 0,

  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index assessment_report_exercises_analysis_idx
  on assessment_report_exercises (analysis_id, sort_order);

alter table assessment_report_exercises enable row level security;

create policy coach_all_assigned_assessment_report_exercises on assessment_report_exercises
  for all
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  )
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Exercises are meant for the member once the report is published — no
-- accept/reject gate needed on this table (a coach only adds what they intend
-- to send), just the same publish gate as the observations above.
create policy member_read_published_assessment_report_exercises on assessment_report_exercises
  for select
  using (
    member_id = auth.uid()
    and exists (
      select 1 from assessment_ai_analyses a
      where a.id = analysis_id and a.status = 'published'
    )
  );

create policy platform_admin_all_assessment_report_exercises on assessment_report_exercises
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- notifications
-- ============================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  type text not null check (type in ('assessment_report_published')),
  title text not null,
  body text,
  source_feature text,
  source_record_id uuid,

  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_member_idx on notifications (member_id, created_at desc);

alter table notifications enable row level security;

create policy member_read_own_notifications on notifications
  for select
  using (member_id = auth.uid());

create policy member_update_own_notifications on notifications
  for update
  using (member_id = auth.uid());

create policy coach_insert_assigned_notifications on notifications
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_notifications on notifications
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
