-- MEF-owned custom exercises — schema only, no data.
--
-- Widens exercise_catalog's provider check constraint (migration 119) from
-- exactly 'your_move' to also allow 'mef_custom': cue-only corrective
-- exercises MEF authors directly (no Your Move video, no vendor content)
-- to fill gaps the Your Move catalog has no exercise for at all — see
-- docs/CORRECTIVE_BLUEPRINT_GAP_CHECK.md. Migration 130 (generated from
-- docs/exercise-media/mef-custom-corrective-exercises.json) inserts the
-- actual rows.
--
-- Ownership is carried entirely by the existing (provider, external_id)
-- natural key every other table in this schema already uses — no new
-- column, no new table. This is deliberate: it means every existing
-- lookup already keyed by provider (favorites, completions, recent views,
-- coach program/prescription exercises) automatically distinguishes
-- MEF-owned rows from vendor rows with zero additional schema, and the
-- Your Move subscription-lapse purge (scripts/exercise-media/
-- purge-your-move-media.ts) can — and now does — scope its
-- exercise_catalog writes to `provider = 'your_move'` so a mef_custom row
-- is structurally unreachable by that cleanup, not just accidentally
-- unaffected because it never had a video_url to clear.
--
-- mef_exercise_metadata.provider already accepts any text value (no check
-- constraint there, see migration 80) so no schema change is needed on
-- that table for this.

alter table exercise_catalog drop constraint exercise_catalog_provider_check;
alter table exercise_catalog add constraint exercise_catalog_provider_check
  check (provider in ('your_move', 'mef_custom'));
