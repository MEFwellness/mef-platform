-- Platform-wide voice + floating coach access (accessibility milestone).
--
-- Adds three new conversation_sessions.entry_point values so a session
-- started from the new floating "Ask Your MEF Coach" launcher can record
-- which of the three pages that don't already have a contextual entry
-- point (Dashboard, Profile, an Assessment/Reassessment result page)
-- actually started it — Today/Check-in/Progress already had entry points
-- from Milestone 7 and are reused as-is, no change needed for those.
--
-- Purely additive: every existing entry_point value stays valid, mirrors
-- the exact "extend this list" pattern already used for
-- safety_classifications.source_feature (migration 31) and
-- wellness_insights.time_window.

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
    'assessment'
  ));
