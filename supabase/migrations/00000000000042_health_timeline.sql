-- Personal Health Timeline — architecture only, no UI yet.
--
-- health_timeline_events is the append-only chronological record a future
-- timeline UI will read — the milestone's requirement is to build the
-- architecture that records the member's health journey now, so that UI
-- can be built later "without modifying the architecture." Every
-- significant event this milestone can actually wire up today
-- (onboarding, reassessment, check-ins, a coach-published assessment
-- report) writes a row here; future event sources (wearables, labs) plug
-- in by extending event_type's check constraint, same additive convention
-- ai_events.event_type already follows (extended by migrations 31/33/35/37).
--
-- Deliberately plain: no supersede chain (a timeline entry records that
-- something happened, which is never revised), no dedup RPC, no update
-- policy at all for member or coach — true append-only, same posture as
-- notifications (migration 39). source_feature/source_record_id is the
-- same polymorphic pointer convention used throughout (safety_classifications,
-- assessment_ai_analyses, registry_entries).

create table health_timeline_events (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  event_type text not null check (event_type in (
    'onboarding_completed', 'reassessment_completed', 'checkin_submitted',
    'assessment_published'
  )),

  local_date text not null,
  occurred_at timestamptz not null default now(),

  title text not null,
  detail text,
  source_feature text,
  source_record_id uuid,
  -- {type, id, note?} pointers into whatever produced this event (e.g. a
  -- registry_entries row) — same convention as every other evidence_refs
  -- column in this codebase.
  evidence_refs jsonb not null default '[]'::jsonb,

  member_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index health_timeline_events_member_date_idx on health_timeline_events (member_id, local_date desc);

alter table health_timeline_events enable row level security;

create policy member_read_own_timeline_events on health_timeline_events
  for select
  using (member_id = auth.uid() and member_visible);

create policy coach_read_assigned_timeline_events on health_timeline_events
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy member_insert_own_timeline_events on health_timeline_events
  for insert
  with check (member_id = auth.uid());

create policy coach_insert_assigned_timeline_events on health_timeline_events
  for insert
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_timeline_events on health_timeline_events
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
