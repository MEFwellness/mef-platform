-- Day 7 of the trial arc: "Your 7-Day Reset", as stored.
--
-- WHY THIS IS A SIBLING TABLE AND NOT A SECOND ROW ON member_trial_arc_recaps.
--
-- Migration 205 stores the day 6 recap and this migration copies its
-- discipline exactly: one immutable row per member, a PLAN of slugs and
-- numbers rather than prose, a sanitizer that runs in both directions, and
-- UPDATE revoked on the table and granted back on the few columns that are
-- genuinely allowed to change. It does not reuse its TABLE, for three
-- reasons, each of which would have needed a shipped rule bent:
--
--   1. member_trial_arc_recaps is `unique (member_id)`, and that constraint
--      IS the rule "her recap is composed once and never rewritten".
--      Putting the close on the same table means either relaxing it to
--      (member_id, something), which changes what that sentence means for
--      the recap, or letting one of the two statements overwrite the other.
--   2. The two vocabularies do not overlap. A recap holds cards: a value
--      area, a signal with six loudness scores, an experiment state, a
--      readiness stage. A close holds a completion branch, one focus and
--      its inputs, and the doors that were offered. A single sanitizer
--      accepting both is a sanitizer that accepts neither strictly, which
--      is the same argument migration 205 made against the Weekly Root
--      Review's own table.
--   3. The columns a member may update differ. On a recap it is opened_at
--      alone. On a close it is opened_at plus which door she tapped. Column
--      grants are per table, so sharing one would mean granting the recap's
--      row an UPDATE on columns it does not have.
--
-- ONE ROW PER MEMBER PER TRIAL, AND IMMUTABLE ONCE WRITTEN. `unique
-- (member_id)` is that rule. A trial happens once for an account, so the
-- member is the key. The plan column never changes after the insert: the
-- close Prompt 6's continuation screen reads is byte for byte the close she
-- read on day 7, with the same focus and the same numbers, whatever has
-- happened to her rows since.
--
-- WHAT THE PLAN HOLDS, AND WHAT IT MAY NEVER HOLD. Slugs from closed sets
-- declared in the codebase (a completion branch, a Life Signal Check
-- signal, a Readiness Pulse pattern, a public entry pattern key, a door
-- name) and finite numbers. Never a sentence, never a check-in answer,
-- never an assessment answer, never free text of any kind.
-- lib/trial-arc/closePlan.ts is the sanitizer, it runs in both directions,
-- and tests/trial-arc-close-guard.test.ts fails the build if its vocabulary
-- grows a free-text field.
--
-- WHAT THIS SCREEN NEVER SAYS, AND WHY IT MATTERS AT THE SCHEMA LEVEL. Day
-- 8 handling is a later prompt. There is no column here that could hold a
-- date access runs out on, a number of days left, or a limit on how long an
-- offer stands, because there is no shape on this table that such a claim
-- could be stored in and then rendered by accident.
--
-- WHY THE COMPLETION, THE FOCUS KIND AND THE LEAD DOOR ARE ALSO COLUMNS.
-- Prompt 6 asks "did she finish the week, what did Root pick, and which door
-- was she led toward" without wanting to parse jsonb, and all three are
-- useful in a plain SQL read during a verification run. They are DERIVED
-- FROM THE PLAN at write time, in one place (lib/trial-arc/closeData.ts),
-- and nothing renders from them: the screen renders from the plan only. So
-- the columns and the screen can never tell two different stories.
--
-- door_tapped IS THE HONEST RECORD OF WHAT SHE CHOSE, INCLUDING CHOOSING
-- NOTHING. 'conversation' and 'membership' are the two doors. 'home' is the
-- quiet exit, which is a fully respected outcome and is recorded as one
-- rather than left looking like an absence. NULL is a fourth, genuinely
-- different fact: she opened the close and left without pressing anything.
-- A row with opened_at null is a fifth: Root offered her the close and she
-- never opened it. The absence of a row is the sixth: she was never offered
-- one. Prompt 6 has to be able to tell all of them apart.
--
-- WHO WRITES IT. Only she does, from her own session, through the analytics
-- beacon route. There is no coach write, no service write and no cron.

create table member_trial_arc_closes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,

  -- 'full' when all three free conversations are genuinely finished,
  -- 'partial' otherwise. Partial is the ordinary case at the end of a free
  -- trial week and is never treated as a failure: see
  -- lib/trial-arc/closeCopy.ts, whose partial branch says the week opened
  -- the door and never counts what she did not do.
  completion text not null check (completion in ('full', 'partial')),

  -- 'signal' when Root could name a focus from her own loudest signal,
  -- 'thin' when she could not and says so instead of picking one anyway.
  focus_kind text not null check (focus_kind in ('signal', 'thin')),

  -- Which door the close leads with. Both doors are offered to everybody
  -- who can be offered them; readiness shapes emphasis, never availability.
  lead_door text not null check (lead_door in ('conversation', 'membership')),

  -- The stored plan: the completion branch, the focus and its inputs, the
  -- doors offered, the counts. Never prose.
  plan jsonb not null,

  -- Day 7, and only day 7. The close belongs to the last day of the week.
  -- A member who never opened the app that day has no close row, which is a
  -- different and honest fact from having ignored one.
  day_number int not null check (day_number = 7),

  -- Her own calendar day, resolved on the server from her stored profile
  -- timezone (lib/time/memberToday.ts), never the server's date.
  composed_local_date date not null,

  composed_at timestamptz not null default now(),

  -- When the close screen genuinely displayed, from a mounted effect on the
  -- screen itself. Null means offered and never opened.
  opened_at timestamptz,

  -- Which door she took, or 'home' for the quiet exit. Null means she
  -- pressed nothing at all.
  door_tapped text check (door_tapped in ('conversation', 'membership', 'home')),
  door_tapped_at timestamptz,

  created_at timestamptz not null default now(),

  unique (member_id)
);

alter table member_trial_arc_closes enable row level security;

create policy member_read_own_trial_arc_close on member_trial_arc_closes
  for select using (member_id = auth.uid());

create policy member_insert_own_trial_arc_close on member_trial_arc_closes
  for insert with check (member_id = auth.uid());

-- The open stamp and the door stamp. Scoped to her own row in both
-- directions so an update can never move a row onto another member, and
-- narrowed to three columns by the grant at the bottom of this file.
create policy member_stamp_own_trial_arc_close on member_trial_arc_closes
  for update using (member_id = auth.uid()) with check (member_id = auth.uid());

-- The same narrow test-account escape hatch migrations 151, 189, 191, 204
-- and 205 give their own tables, and for the same reason: a verification
-- pass has to be able to watch day 7 compose more than once. Restricted to
-- seeded test accounts in the database itself, not only at the call site.
create policy test_member_delete_own_trial_arc_close on member_trial_arc_closes
  for delete using (
    member_id = auth.uid()
    and exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_test = true
    )
  );

create policy platform_admin_all_trial_arc_closes on member_trial_arc_closes
  for all using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- IMMUTABLE EXCEPT FOR THE TWO STAMPS, AND THE DATABASE IS WHAT SAYS SO
-- rather than a convention in the data layer. Supabase's default privileges
-- grant every table privilege on a new public table to the authenticated
-- role; this takes UPDATE back and returns it on three columns. A hand
-- built request from a member's own session can therefore record that she
-- opened her close and which door she took, and can change nothing about
-- what the close says, which is the whole point of composing it once.
revoke update on member_trial_arc_closes from authenticated;
grant update (opened_at, door_tapped, door_tapped_at) on member_trial_arc_closes to authenticated;
