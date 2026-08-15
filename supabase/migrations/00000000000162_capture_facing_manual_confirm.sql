-- Records that a capture's facing check was confirmed by the member by
-- hand, rather than satisfied by the automatic detector.
--
-- WHY THIS EXISTS. The back-view step shipped with a facing check that
-- could never pass (it waited for a turned-away member's face landmarks to
-- stop being reported, which the pose model never does; see
-- apps/consumer-web-app/lib/body-assessment/facing.ts for the measured
-- numbers). That check is now fixed. This column is the belt-and-braces
-- answer to the more general problem it exposed: a capture step whose gate
-- cannot be satisfied gives the member no way out at all.
--
-- So when framing, distance and tilt have all been passing for 20 seconds
-- and ONLY the facing check is still refusing, the capture screen offers a
-- manual confirmation. Taking it sets this flag, so a coach reviewing the
-- capture can see that the member asserted their orientation rather than
-- the detector agreeing it. This is a fallback and is expected to stay
-- rare; a run of these on one member is a signal that facing detection is
-- struggling for that person, their clothing, or their room, and is worth
-- looking at rather than ignoring.
--
-- Nullable and additive, the same shape as migrations 51, 103 and 160. No
-- existing row needs a value, no existing insert breaks, and no RLS policy
-- change is needed: migration 37's per-table policies already govern the
-- full row. Null and false mean the same thing operationally (the facing
-- check was not manually confirmed); null simply distinguishes rows
-- written before this column existed.
alter table body_assessment_captures
  add column if not exists facing_manually_confirmed boolean;

comment on column body_assessment_captures.facing_manually_confirmed is
  'True when the member manually confirmed they were in the right orientation because the automatic facing check had not settled after 20 seconds of otherwise-passing framing, distance and tilt. Null or false means the facing check passed on its own, which is the normal path. A capture with this set is still a valid capture, but its orientation rests on the member''s word rather than on detection, which a reviewing coach should know.';
