-- Cinematic welcome intro rebuild: the first 7 auto-advancing pages
-- (logo/welcome, story, "your health is connected", 4 benefit cards) are a
-- "play once" sequence. A returning member who was interrupted mid-flow (or
-- who already sat through it once) should land directly on the goal-
-- selection page instead of rewatching it. Deliberately a separate column
-- from welcome_flow_completed_at (migration 85): completed_at means the
-- whole flow (including goal selection and the final screen) is done and
-- the member never sees /welcome again; this column only means the
-- cinematic intro portion has been seen once, while the interactive pages
-- after it can still be outstanding. Same nullable-timestamptz,
-- presence-is-the-signal pattern as evening_reflection_reminder_shown_at
-- (migration 87).
alter table profiles
  add column welcome_intro_seen_at timestamptz;

comment on column profiles.welcome_intro_seen_at is
  'Null until the member has sat through (or skipped) the welcome flow''s
   cinematic intro pages (logo/welcome through the four benefit cards). Set
   once, never cleared, so a returning or interrupted member lands directly
   on the "What brought you here today?" page instead of rewatching the
   intro. Independent of welcome_flow_completed_at (migration 85), which
   covers the whole flow including the interactive pages after the intro.';

-- No RLS change: member_read_own_profile / member_update_own_profile
-- (migration 16) already cover this column the same as every other
-- profiles column.
