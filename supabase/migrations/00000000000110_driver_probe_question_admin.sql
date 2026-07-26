-- Coach question-bank management (driver_probe_questions, migrations
-- 106/109) — lets a coach add/edit/retire the 88 daily check-in
-- questions without a deploy, and keeps a revision trail so a strange
-- pattern months from now can be checked against whether a question's
-- wording changed mid-stream.
--
-- 1. driver_probe_questions previously had only platform_admin write
--    access (migration 106) — any coach could read it (for their own
--    reference) but none could edit it. Adds insert/update (never
--    delete — "retire" is a plain `active = false` update, enforced at
--    the application layer in lib/driver-probe-admin/data.ts, which
--    never issues a DELETE) for any active coach. `replaces_question_key`
--    links a "retire and replace" pair (old question_id -> new) so an
--    already-answered question's response_type/options can be changed
--    without corrupting its historical answers: a coach retires the old
--    row and creates a fresh one instead of mutating the old row's shape
--    in place.
-- 2. driver_probe_question_revisions — one row per change (created /
--    updated / retired / restored), storing the full before/after row so
--    "was this reworded partway through" is a real, queryable answer
--    instead of a guess. Written by the same server actions that write
--    driver_probe_questions, under the acting coach's own RLS-scoped
--    session (not a service-role client), so `changed_by` is always a
--    real, RLS-verified auth.uid() — never a client-supplied value.
create table driver_probe_question_revisions (
  id uuid primary key default gen_random_uuid(),
  question_key text not null references driver_probe_questions(question_key) on delete cascade,
  change_type text not null check (change_type in ('created', 'updated', 'retired', 'restored')),
  before jsonb,
  after jsonb,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create index driver_probe_question_revisions_question_idx
  on driver_probe_question_revisions (question_key, changed_at desc);

alter table driver_probe_question_revisions enable row level security;

create policy authenticated_read_driver_probe_question_revisions on driver_probe_question_revisions
  for select
  using (auth.role() = 'authenticated');

create policy coach_insert_driver_probe_question_revisions on driver_probe_question_revisions
  for insert
  with check (public.has_active_role(auth.uid(), 'coach') and changed_by = auth.uid());

create policy platform_admin_all_driver_probe_question_revisions on driver_probe_question_revisions
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

alter table driver_probe_questions
  add column replaces_question_key text references driver_probe_questions(question_key);

create policy coach_insert_driver_probe_questions on driver_probe_questions
  for insert
  with check (public.has_active_role(auth.uid(), 'coach'));

create policy coach_update_driver_probe_questions on driver_probe_questions
  for update
  using (public.has_active_role(auth.uid(), 'coach'))
  with check (public.has_active_role(auth.uid(), 'coach'));

comment on table driver_probe_question_revisions is
  'Audit trail for driver_probe_questions edits, written by
   lib/driver-probe-admin/data.ts. Never written to directly by the
   member-facing check-in — only by the coach question-bank screen
   (app/coach/questions).';

comment on column driver_probe_questions.replaces_question_key is
  'Set only by "retire and replace" (lib/driver-probe-admin/data.ts) — the
   OLD question_key this row supersedes, when a coach needed to change a
   response_type/options on a question that already has recorded member
   answers. Null for every ordinary question.';
