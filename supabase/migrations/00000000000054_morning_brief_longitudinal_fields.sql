-- Adds two fields to coach_morning_briefs so the brief can carry a real,
-- longitudinal "notable pattern" (drawn from the Personal Wellness
-- Intelligence Engine's already-computed wellness_insights — see
-- lib/intelligence/trendEngine.ts) and a real "incomplete recommendation"
-- callout (drawn from lib/feed/continuity.ts's buildContinuitySentence,
-- the same function Today's "A Note from Root" already uses) — additive,
-- both nullable, same "say nothing rather than fabricate" discipline as
-- every other column on this table.

alter table coach_morning_briefs
  add column notable_pattern_title text,
  add column notable_pattern_summary text,
  add column incomplete_recommendation text;
