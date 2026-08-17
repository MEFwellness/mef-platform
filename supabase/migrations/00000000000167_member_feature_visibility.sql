-- ---------------------------------------------------------------------
-- The Visibility Layer — one row per member per feature.
-- ---------------------------------------------------------------------
--
-- Before this, exactly one feature in the whole app changed what a member
-- saw based on something she said: water tracking, gated on
-- profiles.hydration_focus (migration 163). Everything else was shown to
-- everyone on rules that never consulted her answers, her behaviour, or
-- her patterns.
--
-- This table is the general form of that one flag. Water proved the shape;
-- what it could not do is scale, because the eightieth feature would have
-- needed the eightieth column on profiles. One row per (member, feature)
-- instead, so adding a feature adds rows and never schema.
--
-- WHAT IT STORES, AND WHAT IT DELIBERATELY DOES NOT. It stores DECISIONS,
-- not data. Whether a reveal rule fires is recomputed from her real
-- findings and answers on every read, by lib/visibility/rules.ts, so a
-- stale row can never contradict what her app actually knows. What is
-- stored here is the three things a recomputation cannot know on its own:
--
--   1. That something was ALREADY revealed. A revealed feature stays
--      revealed (rule 3), so a card cannot blink out on a quiet week and
--      back in on a bad one. Without a stored row, "revealed" would be a
--      fresh opinion every render.
--   2. That a COACH decided by hand. A coach may reveal or hide anything
--      for anyone, and that decision beats every rule.
--   3. That the member has SEEN the one plain sentence explaining a new
--      reveal, so it is said once and not on every page load.
--
-- NOTHING IS EVER HIDDEN THAT SHE HAS TOUCHED. Grandfathering is not
-- stored here at all: it is recomputed from her real rows (a completed
-- assessment, a logged day, a food entry) on every read, precisely so that
-- it cannot be lost by a bad write to this table. Hiding is presentation
-- only. No member data is deleted, moved or altered by this migration or
-- by anything that writes to this table.
-- ---------------------------------------------------------------------

create table member_feature_visibility (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The catalog key, e.g. 'tracker.water', 'assessment.four-doctors',
  -- 'questions.sleep'. Deliberately text and not an enum: the catalog
  -- lives in lib/visibility/catalog.ts where it can be read alongside the
  -- reason each rule exists, and a database enum would mean a migration
  -- every time a card is added.
  feature_key text not null,

  state text not null check (state in ('revealed', 'hidden')),

  -- WHY it is in that state. Read by the coach's visibility screen.
  --   rule           a reveal rule fired
  --   coach          a coach decided by hand. Beats every rule.
  --   member         she turned it off herself
  --   grandfathered  she had already touched it
  --   migration      the existing-member backfill resolved it
  source text not null check (source in ('rule', 'coach', 'member', 'grandfathered', 'migration')),

  -- Which kind of rule fired, when one did ('intake_answer', 'behavior',
  -- 'finding_tier', 'completed_assessment', 'coach_assigned', 'always').
  -- Never rendered to a member.
  rule_kind text,

  -- The plain-language reason, for the coach's screen. Never diagnostic,
  -- never the member's own words about her health.
  reason text,

  revealed_at timestamptz,
  hidden_at timestamptz,

  -- When the member was shown the one plain sentence about why this
  -- appeared. Null means she has not seen it yet. This is what makes the
  -- sentence appear once rather than every morning.
  acknowledged_at timestamptz,

  -- Who made the decision, when a person did. Null for rule and migration.
  set_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (member_id, feature_key)
);

comment on table member_feature_visibility is
  'One row per member per feature: whether it has been revealed to her, why, and whether she has been told. Decisions only. Whether a rule fires is recomputed live from her findings and answers on every read; grandfathering is recomputed from her real rows and is never stored, so it cannot be lost. Hiding is presentation only and deletes nothing.';

comment on column member_feature_visibility.source is
  'Why this row exists. A coach override beats every rule. A member hiding it beats every rule except safety, and safety-critical features are never written here at all because they are not a decision anybody may make.';

create index member_feature_visibility_member_idx
  on member_feature_visibility (member_id, feature_key);

-- "Which reveals has this member not been told about yet" is asked on
-- every Home render, so it gets its own partial index rather than a scan.
create index member_feature_visibility_unacknowledged_idx
  on member_feature_visibility (member_id)
  where state = 'revealed' and acknowledged_at is null;

alter table member_feature_visibility enable row level security;

-- The member reads her own, inserts her own (the app records a reveal
-- under her own session as it renders), and updates her own (which is how
-- acknowledging the sentence, and hiding something herself, are written).
create policy member_read_own_feature_visibility on member_feature_visibility
  for select using (member_id = auth.uid());

create policy member_insert_own_feature_visibility on member_feature_visibility
  for insert with check (member_id = auth.uid());

create policy member_update_own_feature_visibility on member_feature_visibility
  for update using (member_id = auth.uid());

-- A coach may READ her assigned clients' rows directly, because the
-- visibility screen is a read. She may not write them directly: see the
-- function below for why.
create policy coach_read_assigned_feature_visibility on member_feature_visibility
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_feature_visibility on member_feature_visibility
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- ---------------------------------------------------------------------
-- The coach's override, as a function rather than as a wider policy.
-- ---------------------------------------------------------------------
-- Exactly the shape migration 163 established for the hydration flag, and
-- for the same reason: row level security can say WHO may write a row, it
-- cannot say WHAT they may write into it. A coach UPDATE policy on this
-- table would let a coach write any source value on any row, including
-- 'member', which would make "she turned this off herself" forgeable.
--
-- This function always writes source = 'coach' and always records who did
-- it, so a coach decision is always identifiable as one.
create or replace function public.set_member_feature_visibility(
  p_member uuid,
  p_feature_key text,
  p_state text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_state not in ('revealed', 'hidden') then
    raise exception 'Unknown visibility state: %', p_state;
  end if;

  if not (
    public.has_active_role(auth.uid(), 'coach') and public.is_active_coach_for(auth.uid(), p_member)
    or public.has_active_role(auth.uid(), 'platform_administrator')
  ) then
    raise exception 'Not allowed to set feature visibility for this member'
      using errcode = '42501';
  end if;

  insert into member_feature_visibility
    (member_id, feature_key, state, source, reason, revealed_at, hidden_at, set_by, acknowledged_at)
  values (
    p_member,
    p_feature_key,
    p_state,
    'coach',
    p_reason,
    case when p_state = 'revealed' then now() else null end,
    case when p_state = 'hidden' then now() else null end,
    auth.uid(),
    -- A coach revealing something still owes the member the one plain
    -- sentence, so this is left null on a reveal and set on a hide (there
    -- is nothing to explain about something she cannot see).
    case when p_state = 'hidden' then now() else null end
  )
  on conflict (member_id, feature_key) do update
    set state = excluded.state,
        source = 'coach',
        reason = excluded.reason,
        revealed_at = case when excluded.state = 'revealed'
                        then coalesce(member_feature_visibility.revealed_at, now())
                        else member_feature_visibility.revealed_at end,
        hidden_at = case when excluded.state = 'hidden' then now() else null end,
        acknowledged_at = case when excluded.state = 'hidden'
                            then now()
                            else member_feature_visibility.acknowledged_at end,
        set_by = auth.uid(),
        updated_at = now();
end;
$$;

comment on function public.set_member_feature_visibility(uuid, text, text, text) is
  'The only write path for a coach or administrator override. Always writes source = coach and records who did it, so a coach decision can never be mistaken for the member''s own.';

grant execute on function public.set_member_feature_visibility(uuid, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Test-account-only delete, exactly the shape of migrations 151 and 156.
-- ---------------------------------------------------------------------
-- The throwaway test member exists so intake can be run repeatedly with
-- different answers and the app watched changing shape. That is only
-- possible if her visibility rows can be cleared back to nothing between
-- runs. The restriction to test accounts lives in the database as well as
-- in the route handler, so it survives someone forgetting it at a call
-- site. No real member's rows can be deleted by any session.
create policy test_member_delete_own_feature_visibility on member_feature_visibility
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );
