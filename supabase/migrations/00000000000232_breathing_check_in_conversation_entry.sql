-- The Breathing Pattern Check-In's results screen opens a Root
-- conversation.
--
-- WHAT THIS ADDS, AND NOTHING ELSE. One more allowed value on
-- conversation_sessions.entry_point, so a thread started from her own
-- breathing results is recorded as having started there rather than as
-- 'nav'. Same additive drop and re-add pattern migrations 35, 37, 55 and
-- 58 used for their own entry points, and every existing value stays
-- valid.
--
-- IT TOUCHES THE INSTRUMENT NOT AT ALL. Migration 231's table, its
-- policies, the sixteen questions, the point map and the sixty four point
-- maximum are all untouched. Nothing here stores a score, and the entry
-- point carries none: the conversation page reads the member's own stored
-- sitting under her own RLS.

alter table conversation_sessions drop constraint conversation_sessions_entry_point_check;
alter table conversation_sessions add constraint conversation_sessions_entry_point_check
  check (entry_point in (
    'nav',
    'today_focus',
    'today_easier_option',
    'today_why',
    'today_completed',
    'progress_pattern',
    'progress_improved',
    'progress_focus',
    'checkin_explain',
    'checkin_feeling',
    'dashboard',
    'profile',
    'assessment',
    'body_assessment',
    'food_lens',
    'movement',
    'breathing_check_in'
  ));
