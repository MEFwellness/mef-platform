-- Coach Review Dashboard support tables.
--
-- Adds the two pieces the AI Body Assessment Framework (migration 37) does
-- not yet have: a freeform coach scratchpad per assessment, and manual
-- coach-drawn annotations per capture. Both follow the exact same RLS shape
-- as migration 37 (has_active_role + is_active_coach_for).
--
--   body_assessment_notes        one freeform note per assessment. Unlike
--                                 body_assessment_coach_reviews this is NOT
--                                 append-only — it's a scratchpad a coach
--                                 edits over time (autosaved from the UI),
--                                 so it is genuinely updated in place.
--                                 Coach-only; members never see this.
--
--   body_assessment_annotations  one shape-set per capture — manual
--                                 line/arrow/circle/text/freedraw markup a
--                                 coach draws over a photo/video frame.
--                                 `shapes` is a jsonb array of
--                                 { id, type, points: {x,y}[] (normalized
--                                 [0,1], same convention as
--                                 body_landmark_sets.landmarks), color,
--                                 strokeWidth, text?, measurement?:
--                                 { angleDegrees, label } }. The points +
--                                 measurement fields are exactly what a
--                                 future angle-measurement tool needs;
--                                 nothing computes `measurement` yet, same
--                                 "structure before capability" discipline
--                                 as body_landmark_sets. Whole-array upsert
--                                 per save — one row per capture, not one
--                                 row per shape.

-- ============================================================
-- body_assessment_notes
-- ============================================================
create table body_assessment_notes (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null unique references body_assessments(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,

  content text not null default '',

  updated_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index body_assessment_notes_member_idx on body_assessment_notes (member_id);

alter table body_assessment_notes enable row level security;

create policy coach_read_assigned_body_assessment_notes on body_assessment_notes
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_body_assessment_notes on body_assessment_notes
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_body_assessment_notes on body_assessment_notes
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_body_assessment_notes on body_assessment_notes
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ============================================================
-- body_assessment_annotations
-- ============================================================
create table body_assessment_annotations (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null unique references body_assessment_captures(id) on delete cascade,
  assessment_id uuid not null references body_assessments(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,

  shapes jsonb not null default '[]'::jsonb,

  updated_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index body_assessment_annotations_assessment_idx
  on body_assessment_annotations (assessment_id);
create index body_assessment_annotations_member_idx on body_assessment_annotations (member_id);

alter table body_assessment_annotations enable row level security;

-- Members get read-only visibility (same "here is what we've noticed about
-- you" posture as body_assessment_findings) so a future client report can
-- show annotations — they never author their own.
create policy member_read_own_body_assessment_annotations on body_assessment_annotations
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_body_assessment_annotations on body_assessment_annotations
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_insert_assigned_body_assessment_annotations on body_assessment_annotations
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy coach_update_assigned_body_assessment_annotations on body_assessment_annotations
  for update
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_body_assessment_annotations on body_assessment_annotations
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
