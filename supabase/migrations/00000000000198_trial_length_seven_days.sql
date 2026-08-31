-- Migration 198: the Rooted Reset trial becomes 7 days, for new accounts only.
--
-- WHAT THIS CHANGES. One function body, public.member_trial_length_days(),
-- from 30 to 7. That function is read in exactly three places, all of them
-- written in migration 159:
--
--   1. handle_new_user(), which stamps the window at account creation.
--      This is the change: every account created from here on gets 7 days.
--   2. The one-off backfill, which ran once when 159 shipped and can never
--      run again. Redefining the function does not re-run it.
--   3. admin_set_member_access()'s "no row yet" insert, which is an
--      `on conflict (member_id) do nothing` for an account that somehow
--      missed the backfill. It cannot overwrite an existing window.
--
-- WHAT THIS DOES NOT CHANGE. Nothing already stored. There is deliberately
-- no UPDATE in this migration. `trial_ends_at` is a STAMPED VALUE, not a
-- derived one: it is written once, at signup, and from then on it is that
-- account's own date. Every account that already holds an expiry keeps it
-- exactly as it stands, which for accounts stamped before today means the
-- full 30 days they were given. Grandfathering here is not a rule anyone
-- has to remember, it is a property of the schema.
--
-- Anyone shortening or lengthening the trial again changes this function
-- and nothing else. Adding an UPDATE alongside it would silently rewrite
-- promises already made to real people.
--
-- Entitlement logic, tier definitions, the guard trigger, the admin panel's
-- extend-trial controls and the lock screen redirect are all untouched.
create or replace function public.member_trial_length_days()
returns integer
language sql
immutable
as $$ select 7; $$;

comment on function public.member_trial_length_days() is
  'How many days a NEW account''s free trial runs. Read only when a trial window is first stamped. Never used to recompute a window that already exists: 7 since migration 198, 30 before it, and both are still correct for the accounts that were stamped under them.';

grant execute on function public.member_trial_length_days() to authenticated;

