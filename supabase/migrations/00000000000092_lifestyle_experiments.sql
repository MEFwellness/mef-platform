-- Lifestyle Experiments (Prompt 11; Method §8) — the Method's "unit of
-- doing," as opposed to investigating or reflecting: a small, time-boxed,
-- single-domain behavior change with a start date, a duration, and a
-- member-reported outcome that itself becomes a new signal. Confirmed
-- genuinely greenfield: no existing table has anything resembling this
-- shape. The closest real precedent, prescription_intelligence_engine
-- (migration 83), is a coach-gated, movement-only, exercise-selection
-- system with no start_date/duration/completion/reflection/outcome fields
-- at all and materializes into the Program Builder rather than being
-- tracked in place — deliberately NOT generalized here, this is its own
-- schema.
--
-- Scope, deliberately minimal per this prompt: every experiment is
-- system-generated, sourced verbatim from the title/explanation of the
-- member_recommendations row (migration 91) that produced it — no
-- coach-authoring path or content-authoring system ships here (the
-- architecture docs themselves flag "decide ownership of Experiment
-- templates" as an open, unresolved product decision). recommendation_id
-- stays nullable specifically to leave room for that future path without
-- a schema change, not because a member can start one from nothing today
-- (the app layer enforces that a source recommendation of category
-- 'lifestyle_experiment' must exist).
create table lifestyle_experiments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid references member_recommendations(id) on delete set null,

  -- Copied verbatim from the triggering recommendation at start time —
  -- never freeform/invented content.
  title text not null,
  protocol text not null,

  start_date date not null,
  duration_days int not null check (duration_days > 0),

  -- 'expired_no_reflection' is never written by this migration's own
  -- policies or any server-side job — it's derived at read time only
  -- (lib/lifestyle-experiments/lifecycle.ts), the same "recompute on read,
  -- never a background job" discipline Root Score/Root Map already
  -- established. It's a legal status value here so a member closing a
  -- long-overdue experiment can still transition straight to
  -- completed/abandoned.
  status text not null default 'active' check (status in (
    'active', 'completed', 'abandoned', 'expired_no_reflection'
  )),

  reflection_text text,
  outcome text check (outcome in ('worked', 'partially_worked', 'didnt_work', 'inconclusive')),
  closed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lifestyle_experiments_member_idx on lifestyle_experiments (member_id, created_at desc);
create index lifestyle_experiments_status_idx on lifestyle_experiments (status);

alter table lifestyle_experiments enable row level security;

create policy member_read_own_lifestyle_experiments on lifestyle_experiments
  for select
  using (member_id = auth.uid());

create policy coach_read_assigned_lifestyle_experiments on lifestyle_experiments
  for select
  using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

-- The member is the real writer for both starting and closing their own
-- experiment. No coach insert/update policy exists in this migration —
-- coach-authored experiments are explicitly out of scope for this prompt
-- (see header comment); a coach can only ever read.
create policy member_insert_own_lifestyle_experiments on lifestyle_experiments
  for insert
  with check (member_id = auth.uid());

create policy member_update_own_lifestyle_experiments on lifestyle_experiments
  for update
  using (member_id = auth.uid())
  with check (member_id = auth.uid());

create policy platform_admin_all_lifestyle_experiments on lifestyle_experiments
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));
