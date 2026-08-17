-- Trust cleanup: a coaching focus that has been replaced must retire.
--
-- member_recommendations (migration 91) already had four lifecycle states:
-- 'shown', 'completed' (the member marked it done), 'ignored' (the member
-- marked it not helpful) and 'expired' (derived at read time from age).
-- None of them describes the case that was actually breaking the
-- Recommendations screen: the daily coaching focus is rewritten every time
-- the engine runs, and the previous one was left sitting at 'shown'
-- forever. Its recommendation_key includes the focus label, so
-- "Today's coaching focus: Stress" and "Today's coaching focus: Hydration"
-- are different keys, the partial unique index on (member, key) where
-- status = 'shown' never collided, and both rows rendered as today's
-- focus, side by side, both saying "today".
--
-- 'superseded' is that missing state: this row was replaced by a newer one
-- of the same kind. It is deliberately not 'expired' (which means "nobody
-- touched this for 30 days") and deliberately not 'ignored' (which means
-- "the member told us it wasn't helpful", a member decision the engine
-- must never fake on her behalf, and one that outcomeHistory reads as real
-- negative feedback).
--
-- Nothing is deleted. A superseded row keeps every column it had; it
-- simply falls outside the 'shown' reads the member's screens make, and
-- outside the partial unique index, exactly as completed/ignored/expired
-- already do.

alter table member_recommendations
  drop constraint if exists member_recommendations_status_check;

alter table member_recommendations
  add constraint member_recommendations_status_check
  check (status in ('shown', 'completed', 'ignored', 'expired', 'superseded'));
