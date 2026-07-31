-- Corrective-role metadata layer — schema only, no data.
--
-- Extends mef_exercise_metadata (migration 80) rather than creating a new
-- table: it already sits on top of exercise_catalog keyed by
-- (provider, external_id), already has an `equipment text[]` column that
-- covers this task's "equipment_needed" requirement, and already has a
-- row for all 825 catalog exercises (populated by the Phase 4 cue-
-- generation script) — a second table keyed the same way would just be a
-- join away from this one for no benefit.
--
-- This is a pure data foundation for a future AI corrective program
-- generator — no generator, no UI reads these columns yet.
--
--   corrective_roles      One or more of: release, stretch, mobility,
--                          stability, strength, power, core_stability.
--                          See apps/consumer-web-app/lib/exercise-library/
--                          correctiveClassification.ts for the rules that
--                          assign these from each exercise's existing
--                          Your Move tags/muscles/instructions.
--   muscles_stretched /
--   muscles_strengthened   Which muscles this exercise lengthens vs. loads
--                          (canonical corrective-blueprint muscle names,
--                          distinct from primary_muscle/secondary_muscles'
--                          raw Your Move vocabulary). Mutually exclusive
--                          per row by construction in the classifier — a
--                          muscle is never listed in both on the same
--                          exercise — enforced here too via the check
--                          constraint below as a second line of defense.
--   strain_level           low / moderate / high — how taxing the movement
--                          is, independent of skill difficulty.
--   spinal_flexion_core    True for crunch/sit-up-type movements. These are
--                          real strength exercises for general library
--                          purposes but must never be selected into a
--                          corrective program, and (enforced below) never
--                          carry the stability or core_stability role.
--
-- migration 128 (generated from scripts/exercise-media/
-- generate-corrective-metadata.ts's output) populates every row.

alter table mef_exercise_metadata
  add column corrective_roles text[] not null default '{}',
  add column muscles_stretched text[] not null default '{}',
  add column muscles_strengthened text[] not null default '{}',
  add column strain_level text check (strain_level in ('low', 'moderate', 'high')),
  add column spinal_flexion_core boolean not null default false;

alter table mef_exercise_metadata
  add constraint mef_exercise_metadata_corrective_roles_check
  check (corrective_roles <@ array[
    'release', 'stretch', 'mobility', 'stability', 'strength', 'power', 'core_stability'
  ]::text[]);

-- Spinal-flexion movements are excluded from corrective programs by the
-- flag itself, but they must also never carry a role that would make an
-- automated corrective-program generator select them as a stability
-- exercise — enforced at the database level, not just in application code.
alter table mef_exercise_metadata
  add constraint mef_exercise_metadata_spinal_flexion_not_stability_check
  check (
    not spinal_flexion_core
    or not (corrective_roles && array['stability', 'core_stability']::text[])
  );

-- A muscle must never be listed as both stretched and strengthened on the
-- same exercise — the classifier guarantees this by construction, this is
-- the database-level backstop.
alter table mef_exercise_metadata
  add constraint mef_exercise_metadata_no_muscle_overlap_check
  check (not (muscles_stretched && muscles_strengthened));

create index mef_exercise_metadata_corrective_roles_idx on mef_exercise_metadata using gin (corrective_roles);
create index mef_exercise_metadata_muscles_stretched_idx on mef_exercise_metadata using gin (muscles_stretched);
create index mef_exercise_metadata_muscles_strengthened_idx on mef_exercise_metadata using gin (muscles_strengthened);
create index mef_exercise_metadata_strain_level_idx on mef_exercise_metadata (strain_level);
create index mef_exercise_metadata_spinal_flexion_core_idx on mef_exercise_metadata (spinal_flexion_core);
