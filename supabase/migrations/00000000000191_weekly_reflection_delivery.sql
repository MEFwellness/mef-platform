-- The Weekly Reflection's delivery receipt.
--
-- WHAT THE COACH COULD NOT TELL APART, before this. The panel on the
-- client screen showed completed answers and nothing else, so a blank
-- panel on a Sunday meant one of two opposite things: she was shown the
-- reflection and chose not to write it, or she never opened the app at
-- all. Those call for different conversations, and there was no record
-- that could separate them.
--
-- WHY A SEPARATE TABLE AND NOT A COLUMN ON member_weekly_reflections.
-- Migration 189 is explicit that no row exists in that table until she
-- FINISHES: the recap is recomputed on every render and the only write in
-- the feature is the button she presses. A delivered_at column there would
-- force a row into existence on a render, which is exactly the standing
-- rule against render-time writes, and it would put a half-row in front of
-- every read that asks "has she completed this week" (the pop-up chain,
-- Home, the route and the submit action all ask it). So delivery is its
-- own record: a receipt that something reached her, never a reflection
-- attempt and never a draft.
--
-- ONCE PER WEEK, ENFORCED BY THE DATABASE. unique (member_id, week_start)
-- IS the once-per-week rule, the same way it is in migration 189. Home can
-- render the pop-up and the persistent card in one pass, and she can
-- reopen the app on Saturday after seeing it on Friday: all of those are
-- the same week, so all of them resolve to one row with the first
-- delivered_at, never a second row and never an overwrite.
--
-- week_start is her OWN local Friday, resolved from her stored profile
-- timezone by lib/weekly-reflection/week.ts. The same key migration 189
-- uses, so a receipt and a reflection for one week are joinable on the
-- value both of them already carry.
--
-- WHO WRITES IT. Only she does, from her own session, through a beacon
-- fired by a mounted effect on the surface that actually displayed it
-- (app/api/analytics/track/route.ts). There is no coach write and no
-- service write: the insert policy below only ever accepts the signed in
-- member's own id, so no staff render and no other member's session can
-- manufacture a receipt.
--
-- TEST ACCOUNTS. A receipt for a seeded account is fine and is written
-- normally, because the whole point of the fixture is to walk the real
-- experience. Nothing in lib/analytics-service/ reads this table, so no
-- figure counts it.

create table member_weekly_reflection_deliveries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- The member's own local Friday, YYYY-MM-DD. Same key as
  -- member_weekly_reflections.week_start.
  week_start date not null,

  -- The first moment it genuinely reached her screen. Never updated: the
  -- claim below is an insert-if-absent, so a second showing in the same
  -- week is a no-op rather than a newer timestamp.
  delivered_at timestamptz not null default now(),

  -- Which surface got there first. 'popup' is the Root pop-up chain,
  -- 'home_card' is the persistent card on Home that stays for the rest of
  -- the window. Both are a real display to the member; the column exists
  -- so the coach panel's status line could later say which one, and so
  -- this stays honest about what "delivered" was.
  presentation text not null check (presentation in ('popup', 'home_card')),

  created_at timestamptz not null default now(),

  unique (member_id, week_start)
);

create index member_weekly_reflection_deliveries_member_week_idx
  on member_weekly_reflection_deliveries (member_id, week_start desc);

alter table member_weekly_reflection_deliveries enable row level security;

create policy member_read_own_reflection_deliveries on member_weekly_reflection_deliveries
  for select using (member_id = auth.uid());

create policy member_insert_own_reflection_deliveries on member_weekly_reflection_deliveries
  for insert with check (member_id = auth.uid());

-- Deliberately no member update policy. A receipt records a moment that
-- already happened, and nothing in the app has a reason to move it.

-- The same narrow test-account escape hatch migrations 151 and 189 give
-- their own tables, and for the same reason: a verification pass has to be
-- able to see delivery happen more than once in a week. Restricted to
-- seeded test accounts in the database itself, not only at the call site.
create policy test_member_delete_own_reflection_deliveries on member_weekly_reflection_deliveries
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy coach_read_assigned_reflection_deliveries on member_weekly_reflection_deliveries
  for select using (
    public.has_active_role(auth.uid(), 'coach')
    and public.is_active_coach_for(auth.uid(), member_id)
  );

create policy platform_admin_all_reflection_deliveries on member_weekly_reflection_deliveries
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));
