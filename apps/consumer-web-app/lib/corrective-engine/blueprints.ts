/**
 * The 4 corrective blueprints (Lower Cross, Upper Cross, Forward Head, Flat
 * Back) as structured data — tight muscles (release/stretch/mobility work)
 * and long muscles (stability/strengthening work), exactly as recorded in
 * docs/CORRECTIVE_BLUEPRINT_GAP_CHECK.md.
 *
 * This is the single source of truth for the blueprint muscle lists — both
 * the corrective program generator (sessionBuilder.ts) and
 * scripts/exercise-media/corrective-blueprint-gap-check.ts (the coverage
 * report generator built in the prior task) import from here, so the two
 * can never drift apart.
 */
import type { BlueprintKey, CorrectiveBlueprint } from './types';

export const CORRECTIVE_BLUEPRINTS: Record<BlueprintKey, CorrectiveBlueprint> = {
  lower_cross: {
    key: 'lower_cross',
    name: 'Lower Cross',
    tightMuscles: [
      { muscle: 'hip flexors', canonicalLabels: ['hip flexors'] },
      // Approved label fix (candidate 2 of
      // docs/CORRECTIVE_RECLASSIFICATION_CANDIDATES.md). "TFL" and
      // "tensor fasciae latae" are the same muscle written two ways, and
      // the split was not random: only the three unfilmable MEF rows use
      // "TFL", while the video-backed Your Move rows all spell it out. The
      // slot asked for a label that only unassignable exercises carry, so
      // it could never fill. Both spellings are canonical for this slot
      // now, which is what canonicalLabels is for.
      { muscle: 'TFL', canonicalLabels: ['TFL', 'tensor fasciae latae'] },
      { muscle: 'lumbar erectors', canonicalLabels: ['lumbar erectors'] },
    ],
    longMuscles: [
      { muscle: 'glutes', canonicalLabels: ['glutes'] },
      { muscle: 'hamstrings', canonicalLabels: ['hamstrings'] },
      { muscle: 'deep abdominals (TVA)', canonicalLabels: ['deep abdominals (TVA)'] },
    ],
    coreStabilityOnlySlots: ['deep abdominals (TVA)'],
  },
  upper_cross: {
    key: 'upper_cross',
    name: 'Upper Cross',
    tightMuscles: [
      { muscle: 'pecs', canonicalLabels: ['pecs'] },
      { muscle: 'upper traps', canonicalLabels: ['upper traps'] },
      { muscle: 'lats', canonicalLabels: ['lats'] },
      { muscle: 'levator scapulae', canonicalLabels: ['levator scapulae'] },
    ],
    longMuscles: [
      { muscle: 'deep neck flexors', canonicalLabels: ['deep neck flexors'] },
      { muscle: 'lower/mid traps', canonicalLabels: ['lower traps', 'mid traps'] },
      { muscle: 'rhomboids', canonicalLabels: ['rhomboids'] },
      { muscle: 'serratus anterior', canonicalLabels: ['serratus anterior'] },
    ],
  },
  forward_head: {
    key: 'forward_head',
    name: 'Forward Head',
    tightMuscles: [
      { muscle: 'suboccipitals', canonicalLabels: ['suboccipitals'] },
      { muscle: 'upper traps', canonicalLabels: ['upper traps'] },
      { muscle: 'SCM/scalenes', canonicalLabels: ['SCM', 'scalenes'] },
      { muscle: 'chest', canonicalLabels: ['pecs'] },
    ],
    longMuscles: [
      { muscle: 'deep neck flexors', canonicalLabels: ['deep neck flexors'] },
      { muscle: 'thoracic extensors', canonicalLabels: ['thoracic extensors'] },
    ],
  },
  flat_back: {
    key: 'flat_back',
    name: 'Flat Back',
    tightMuscles: [
      { muscle: 'hamstrings', canonicalLabels: ['hamstrings'] },
      { muscle: 'glutes', canonicalLabels: ['glutes'] },
      { muscle: 'abdominals', canonicalLabels: ['abdominals'] },
    ],
    longMuscles: [
      { muscle: 'hip flexors', canonicalLabels: ['hip flexors'] },
      { muscle: 'lumbar erectors', canonicalLabels: ['lumbar erectors'] },
    ],
  },
};

export const CORRECTIVE_BLUEPRINT_LIST: CorrectiveBlueprint[] = Object.values(CORRECTIVE_BLUEPRINTS);
