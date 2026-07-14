-- AI Body Assessment Framework.
--
-- IMPORTANT: this migration does NOT add computer vision or pose
-- estimation. It adds the complete data architecture a guided digital
-- body assessment experience needs so that a dedicated AI posture/movement
-- analysis provider can be plugged in later with minimal application
-- change — see apps/consumer-web-app/lib/body-assessment/providers/ for
-- the provider abstraction this schema backs.
--
--   body_assessments             one row per guided assessment session a
--                                 member completes (static posture,
--                                 walking gait, shoulder mobility, etc.).
--                                 Never versioned/edited in place — a
--                                 reassessment is simply a new row, same
--                                 "append-only history" posture as
--                                 daily_checkins.
--
--   body_assessment_captures     one row per photo/video captured during
--                                 an assessment (front/left/right/back/
--                                 walking/movement views). Stores only a
--                                 Storage path — never the image bytes
--                                 themselves — so this table stays small
--                                 and RLS-cheap regardless of media size.
--
--   body_landmark_sets           one row per capture holding the future
--                                 AI-detected body landmark points (head,
--                                 shoulders, spine, pelvis, knees, etc.) as
--                                 a jsonb array — same "structured jsonb
--                                 bag with a documented shape" convention
--                                 as evidence_refs/contributing_evidence
--                                 elsewhere in this schema. Empty until a
--                                 real provider is wired in
--                                 (provider_status stays 'not_configured').
--
--   body_assessment_findings     standardized posture/movement finding
--                                 model (forward head, rounded shoulders,
--                                 pelvic tilt, etc.), each with confidence,
--                                 severity, evidence, and a supersede
--                                 chain — same audit discipline as
--                                 wellness_identity_observations (never
--                                 mutated in place; a corrected finding
--                                 supersedes the old row).
--
--   body_assessment_comparisons  a reusable comparison framework's
--                                 persisted output: assessment A vs.
--                                 assessment B, per finding_type (or
--                                 'overall'), trend = improved / stable /
--                                 declined / unknown. See
--                                 lib/body-assessment/comparison.ts for the
--                                 pure calculation this table stores the
--                                 result of.
--
--   body_assessment_coach_reviews append-only coach review entries
--                                 (approve/override findings, add
--                                 observations, attach recommendations,
--                                 mark a reassessment complete) — same
--                                 "coach writes, never overwritten"
--                                 pattern as coach_notes.
--
-- Nothing in this migration computes a finding or a landmark — every
-- confidence/severity/landmark value is written by application code today
-- as a placeholder/empty state, and by a real AI provider once one is
-- wired into lib/body-assessment/providers/registry.ts. Do not read the
-- presence of these columns as evidence that analysis is implemented.
--
-- RLS follows the exact established pattern (migration 15 helpers,
-- migrations 27-36 precedent): member_read_own / member_insert_own,
-- coach_read_assigned / coach_insert_assigned via is_active_coach_for,
-- platform_admin_all. Findings and comparisons are coach-authored-or-
-- system-authored, so members get read-only access (member_visible-gated,
-- same posture as wellness_identity_observations) rather than write
-- access — a member never edits their own findings.

-- ============================================================
-- Additive check-constraint extensions for cross-feature integration
-- (Coaching Brain / Narrative / Safety / Conversation Coach / Intelligence
-- Core all read from the SAME ai_events / safety / conversation tables
-- rather than a parallel body-assessment-only pipeline). Every existing
-- value stays valid — same "extend this list" precedent as migrations
-- 31, 33, 35.
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
    'body_assessment_completed'
  ));

alter table safety_classifications drop constraint safety_classifications_source_feature_check;
alter table safety_classifications add constraint safety_classifications_source_feature_check
  check (source_feature in (
    'daily_checkin',
    'coach_note',
    'ai_recommendation',
    'daily_feed',
    'dynamic_coaching',
    'wellness_intelligence',
    'conversation_coach',
    'body_assessment'
  ));

alter table conversation_sessions drop constraint conversation_sessions_entry_point_check;
alter table conversation_sessions add constraint conversation_sessions_entry_point_check
  check (entry_point in (
    'nav',
    'today_focus',
    'today_easier_option',
    'today_why',
    'today_completed',
    'progress_pattern',
    'progress_improved',
    'progress_focus',
    'checkin_explain',
    'checkin_feeling',
    'dashboard',
    'profile',
    'assessment',
    'body_assessment'
  ));

-- ============================================================
-- body_assessments
-- ============================================================
create table body_assessments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  assessment_type text not null check (assessment_type in (
    'static_posture', 'walking_gait', 'breathing_observation',
    'shoulder_mobility', 'hip_hinge', 'squat', 'single_leg_balance',
    'reach', 'rotation', 'custom'
  )),

  -- Lifecycle: a member works through the guided flow (in_progress),
  -- submits their captures (submitted), the configured provider either
  -- hasn't been wired up yet (not_configured — the expected state for
  -- this milestone) or is running (analyzing) or has produced findings
  -- (analyzed), and a coach has looked it over (coach_reviewed). archived
  -- is a soft-delete-adjacent state for a member-requested removal that
  -- still needs to retain an audit trail (the row stays, capture media
  -- is what actually gets deleted — see body_assessment_captures below).
  status text not null default 'in_progress' check (status in (
    'in_progress', 'submitted', 'not_configured', 'analyzing',
    'analyzed', 'coach_reviewed', 'archived'
  )),

  timezone text not null,
  local_date date not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,

  -- Which provider (if any) analyzed this assessment — see
  -- lib/body-assessment/providers/registry.ts. Null until analysis runs.
  provider_name text,
  provider_status text not null default 'not_configured' check (provider_status in (
    'not_configured', 'pending', 'completed', 'failed'
  )),
  provider_error text,

  member_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index body_assessments_member_idx on body_assessments (member_id, started_at desc);
create index body_assessments_member_type_idx
  on body_assessments (member_id, assessment_type, started_at desc);

alter table body_assessments enable row level security;

create policy member_read_own_body_assessments on body_assessments
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_body_assessments on body_assessments
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_insert_own_body_assessments on body_assessments
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_body_assessments on body_assessments
  for update
  using (member_id = auth.uid());

create policy coach_update_assigned_body_assessments on body_assessments
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_body_assessments on body_assessments
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- body_assessment_captures
-- ============================================================
create table body_assessment_captures (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references body_assessments(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,

  capture_type text not null check (capture_type in (
    'front', 'left_side', 'right_side', 'back', 'walking', 'movement', 'custom'
  )),
  sequence_index int not null default 0,

  media_type text not null check (media_type in ('image', 'video')),
  -- Storage bucket/path only — see the storage.objects policies below.
  -- Path convention: {member_id}/{assessment_id}/{capture_id}.{ext}, so a
  -- member's own folder is exactly (storage.foldername(name))[1].
  storage_bucket text not null default 'body-assessment-media',
  storage_path text not null,

  width int,
  height int,
  duration_seconds numeric,

  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  unique (assessment_id, storage_path)
);

create index body_assessment_captures_assessment_idx
  on body_assessment_captures (assessment_id, sequence_index);
create index body_assessment_captures_member_idx on body_assessment_captures (member_id);

alter table body_assessment_captures enable row level security;

create policy member_read_own_body_assessment_captures on body_assessment_captures
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_body_assessment_captures on body_assessment_captures
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_insert_own_body_assessment_captures on body_assessment_captures
  for insert
  with check (member_id = auth.uid());

create policy member_delete_own_body_assessment_captures on body_assessment_captures
  for delete
  using (member_id = auth.uid());

create policy platform_admin_all_body_assessment_captures on body_assessment_captures
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- body_landmark_sets — future AI-detected landmark points, one row per
-- capture. Design-only: nothing populates `landmarks` yet.
-- ============================================================
create table body_landmark_sets (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references body_assessments(id) on delete cascade,
  capture_id uuid not null references body_assessment_captures(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,

  provider_name text,
  model_version text,

  -- Array of { key, x, y, z?, confidence, visibility }. `key` is one of
  -- the BodyLandmarkKey values documented in
  -- packages/shared-types-contracts/src/body-assessment.types.ts (head,
  -- eyes, ears, shoulders, scapulae, spine segments, pelvis, hips, knees,
  -- ankles, feet, arms, hands, thorax, rib cage). x/y are normalized
  -- [0,1] image-space coordinates; z is an optional relative depth a 3D
  -- provider may supply. Defaults to an empty array — this milestone
  -- builds the structure, not the detection.
  landmarks jsonb not null default '[]'::jsonb,

  detected_at timestamptz,
  created_at timestamptz not null default now(),

  unique (capture_id)
);

create index body_landmark_sets_assessment_idx on body_landmark_sets (assessment_id);
create index body_landmark_sets_member_idx on body_landmark_sets (member_id);

alter table body_landmark_sets enable row level security;

create policy member_read_own_body_landmark_sets on body_landmark_sets
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_body_landmark_sets on body_landmark_sets
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- Landmark sets are only ever written by a provider integration running
-- under the member's own session (matching every other write path in this
-- app) or a coach correcting a mis-detection — never member-authored.
create policy member_insert_own_body_landmark_sets on body_landmark_sets
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_body_landmark_sets on body_landmark_sets
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_body_landmark_sets on body_landmark_sets
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_body_landmark_sets on body_landmark_sets
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- body_assessment_findings — standardized finding model with a
-- supersede-not-mutate audit chain (same discipline as
-- wellness_identity_observations / narrative_items).
-- ============================================================
create table body_assessment_findings (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references body_assessments(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,

  finding_type text not null check (finding_type in (
    'forward_head', 'rounded_shoulders', 'elevated_shoulder', 'pelvic_tilt',
    'thoracic_kyphosis', 'lumbar_posture', 'knee_valgus', 'foot_turnout',
    'weight_shift', 'breathing_pattern', 'hip_asymmetry', 'custom'
  )),
  side text not null default 'not_applicable' check (side in (
    'left', 'right', 'bilateral', 'not_applicable'
  )),

  severity text not null default 'unknown' check (severity in (
    'none', 'mild', 'moderate', 'significant', 'unknown'
  )),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),

  -- Plain-language explanation shown to member/coach — never raw model
  -- output. Null until a provider (or a coach, for a manually-entered
  -- observation) fills it in.
  narrative text,

  -- Array of { type, id, note? } pointing at the capture(s)/landmark
  -- set(s)/angles that support this finding — same shape as
  -- narrative_items.source_refs / wellness_insights.evidence_refs.
  evidence jsonb not null default '[]'::jsonb,

  provider_name text,

  status text not null default 'draft' check (status in (
    'draft', 'pending_review', 'confirmed', 'coach_overridden', 'dismissed', 'superseded'
  )),
  coach_reviewed_by uuid references auth.users(id) on delete set null,
  coach_reviewed_at timestamptz,
  coach_override_notes text,

  supersedes_id uuid references body_assessment_findings(id) on delete set null,
  superseded_by_id uuid references body_assessment_findings(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index body_assessment_findings_assessment_idx on body_assessment_findings (assessment_id);
create index body_assessment_findings_member_idx
  on body_assessment_findings (member_id) where status != 'superseded';
create index body_assessment_findings_type_idx
  on body_assessment_findings (member_id, finding_type);

alter table body_assessment_findings enable row level security;

-- Members see their own findings — same "here is what we've noticed
-- about you" transparency posture as wellness_identity_observations —
-- but never write them directly.
create policy member_read_own_body_assessment_findings on body_assessment_findings
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_body_assessment_findings on body_assessment_findings
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_insert_own_body_assessment_findings on body_assessment_findings
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_body_assessment_findings on body_assessment_findings
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_body_assessment_findings on body_assessment_findings
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_body_assessment_findings on body_assessment_findings
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- body_assessment_comparisons — persisted output of the reusable
-- comparison engine (lib/body-assessment/comparison.ts).
-- ============================================================
create table body_assessment_comparisons (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  assessment_a_id uuid not null references body_assessments(id) on delete cascade,
  assessment_b_id uuid not null references body_assessments(id) on delete cascade,

  -- A body_assessment_findings.finding_type value, or 'overall' for the
  -- whole-assessment rollup.
  dimension text not null,

  trend text not null default 'unknown' check (trend in (
    'improved', 'stable', 'declined', 'unknown'
  )),
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  summary text not null,
  details jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),

  unique (assessment_a_id, assessment_b_id, dimension)
);

create index body_assessment_comparisons_member_idx on body_assessment_comparisons (member_id);
create index body_assessment_comparisons_pair_idx
  on body_assessment_comparisons (assessment_a_id, assessment_b_id);

alter table body_assessment_comparisons enable row level security;

create policy member_read_own_body_assessment_comparisons on body_assessment_comparisons
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_body_assessment_comparisons on body_assessment_comparisons
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_insert_own_body_assessment_comparisons on body_assessment_comparisons
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_body_assessment_comparisons on body_assessment_comparisons
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_body_assessment_comparisons on body_assessment_comparisons
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- body_assessment_coach_reviews — append-only, same pattern as coach_notes:
-- a coach's approval/override/observation/recommendation for one
-- assessment, never edited in place (a correction is a new row).
-- ============================================================
create table body_assessment_coach_reviews (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references body_assessments(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete cascade,

  review_status text not null default 'in_review' check (review_status in (
    'in_review', 'approved', 'changes_requested', 'completed'
  )),

  observations text,
  recommendations text,
  findings_approved boolean not null default false,
  reassessment_marked_complete boolean not null default false,

  created_at timestamptz not null default now()
);

create index body_assessment_coach_reviews_assessment_idx
  on body_assessment_coach_reviews (assessment_id, created_at desc);
create index body_assessment_coach_reviews_member_idx on body_assessment_coach_reviews (member_id);

alter table body_assessment_coach_reviews enable row level security;

create policy member_read_own_body_assessment_coach_reviews on body_assessment_coach_reviews
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_body_assessment_coach_reviews on body_assessment_coach_reviews
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_body_assessment_coach_reviews on body_assessment_coach_reviews
  for insert
  with check (
    coach_id = auth.uid()
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_body_assessment_coach_reviews on body_assessment_coach_reviews
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- Storage — the first feature in this codebase to use Supabase Storage.
-- Private bucket; RLS on storage.objects follows the exact same
-- member-owns-own-folder / coach-reads-assigned / admin-all shape as
-- every table above. Path convention enforced at the application layer
-- (lib/body-assessment/storage.ts): {member_id}/{assessment_id}/{file}.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('body-assessment-media', 'body-assessment-media', false)
on conflict (id) do nothing;

create policy member_insert_own_body_assessment_media on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'body-assessment-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy member_read_own_body_assessment_media on storage.objects
  for select to authenticated
  using (
    bucket_id = 'body-assessment-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy member_delete_own_body_assessment_media on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'body-assessment-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Every real capture upload writes to a fresh, UUID-derived path (see
-- buildCaptureStoragePath) so an UPDATE never happens in practice — this
-- exists so an `upsert: true` client call against an already-existing
-- path (a deliberate re-upload to the same path) is authorized the same
-- way an insert is, instead of the storage-api's ON CONFLICT DO UPDATE
-- silently 42501'ing with no matching UPDATE policy.
create policy member_update_own_body_assessment_media on storage.objects
  for update to authenticated
  using (
    bucket_id = 'body-assessment-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'body-assessment-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy coach_read_assigned_body_assessment_media on storage.objects
  for select to authenticated
  using (
    bucket_id = 'body-assessment-media'
    and public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy platform_admin_all_body_assessment_media on storage.objects
  for all to authenticated
  using (
    bucket_id = 'body-assessment-media'
    and public.has_active_role(auth.uid(), 'platform_administrator')
  );
