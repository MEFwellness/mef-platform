-- =====================================================================
-- 260. ROOT NOTICED: THE COACH BRIEFING'S REVIEW STATE.
--
-- The briefing is a presentation layer over what Root already reads. It
-- adds one thing that cannot be computed from a member's rows: what a
-- coach decided about a card, and the evidence she decided it at.
--
--   cross_system_root_briefing_reviews   one row per action, append only
--   cross_system_root_briefing_visits    when a coach last opened a
--                                        client's briefing
--
-- NOTHING MEMBER FACING, same shape as migrations 246 and 258. Neither
-- table carries a member policy of any kind, so a member session reads and
-- writes nothing here. A coach reads and appends her OWN rows only.
--
-- NOTHING HERE FEEDS BACK INTO ROOT. No function, view, trigger or policy
-- on the Association Map, the survey mapping or the findings reads these
-- tables. A review changes what one coach sees in her briefing.
--
-- A REVIEW IS HELD AT ONE EVIDENCE STATE. `evidence_state` is the card's
-- reported signals (points and active verdict) and supporting signals at
-- the moment of the action. The app compares it with the card's state now
-- (lib/cross-system-root/briefingRules.ts, isMaterialChange) and returns a
-- dismissed card to the briefing when it has materially changed.
-- =====================================================================

create table cross_system_root_briefing_reviews (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  -- The card: "group:<body area>:<symptom type>" or "signal:<slug>".
  target_key text not null check (char_length(target_key) between 1 and 200),
  action text not null check (action in ('discuss_next_session', 'reviewed', 'not_relevant')),
  evidence_state jsonb not null,
  evidence_fingerprint text not null check (char_length(evidence_fingerprint) between 1 and 4000),
  acted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index cross_system_root_briefing_reviews_coach_member_idx
  on cross_system_root_briefing_reviews (coach_id, member_id, acted_at, id);

alter table cross_system_root_briefing_reviews enable row level security;

-- A coach reads her own actions and appends her own, signed by herself.
-- There is no update or delete policy for a coach: a later action is a new
-- row, and the newest row for a card is the one that counts.
create policy coach_read_cross_system_root_briefing_reviews on cross_system_root_briefing_reviews
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and coach_id = auth.uid()
  );
create policy coach_insert_cross_system_root_briefing_reviews on cross_system_root_briefing_reviews
  for insert with check (
    public.has_active_role(auth.uid(), 'coach')
    and coach_id = auth.uid()
  );
create policy admin_all_cross_system_root_briefing_reviews on cross_system_root_briefing_reviews
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'))
  with check (
    public.has_active_role(auth.uid(), 'platform_administrator')
    and coach_id = auth.uid()
  );

comment on table cross_system_root_briefing_reviews is
  'Root Noticed coach briefing: one row per review action (discuss next session, reviewed, not relevant) with the evidence state it was taken at. Append only. COACH ONLY: no member policy exists and none may be added.';

create table cross_system_root_briefing_visits (
  coach_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (coach_id, member_id)
);

alter table cross_system_root_briefing_visits enable row level security;

create policy coach_read_cross_system_root_briefing_visits on cross_system_root_briefing_visits
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and coach_id = auth.uid()
  );
create policy coach_insert_cross_system_root_briefing_visits on cross_system_root_briefing_visits
  for insert with check (
    public.has_active_role(auth.uid(), 'coach')
    and coach_id = auth.uid()
  );
create policy coach_update_cross_system_root_briefing_visits on cross_system_root_briefing_visits
  for update using (
    public.has_active_role(auth.uid(), 'coach')
    and coach_id = auth.uid()
  )
  with check (
    public.has_active_role(auth.uid(), 'coach')
    and coach_id = auth.uid()
  );
create policy admin_all_cross_system_root_briefing_visits on cross_system_root_briefing_visits
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'))
  with check (
    public.has_active_role(auth.uid(), 'platform_administrator')
    and coach_id = auth.uid()
  );

comment on table cross_system_root_briefing_visits is
  'Root Noticed coach briefing: when a coach last opened a client''s briefing, written from a mounted effect, never a render. COACH ONLY: no member policy exists and none may be added.';

-- No grant to anon. Authenticated sessions pass through the policies above,
-- which name staff roles only.
revoke all on cross_system_root_briefing_reviews from anon;
revoke all on cross_system_root_briefing_visits from anon;
