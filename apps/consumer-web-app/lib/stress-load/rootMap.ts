/**
 * The Root Map feed. TWO dimensions, written as two rows, and never one.
 *
 * A completion publishes two registry_entries rows through the same
 * machinery every other assessment adapter uses (lib/registry/data.ts):
 *
 *   stress::stress_load_burden   what her life is asking of her
 *   stress::recovery_capacity    what is actually giving back
 *
 * lib/member-interpretation/domainMap.ts files the first under Stress &
 * Nervous System and the second under Recovery & Energy Regulation, each
 * with an EMPTY `alsoRelevant` list. That emptiness is the two-dimension
 * rule expressed where it can actually be enforced: a cross reference
 * between them would put one sitting's load answer on the recovery card
 * and the recovery answer on the load card, which is precisely the
 * blending this experience is not allowed to do.
 *
 * SEVERITY COMES FROM ONE SIDE ONLY. The load row's severity is a function
 * of the load band and nothing else. The recovery row's severity is a
 * function of the recovery band and nothing else. Neither function can see
 * the other side's value, because neither takes it as an argument. That is
 * why they are two functions over two bands rather than one function over
 * a reading.
 *
 * The words a member reads about these two findings are NOT written here.
 * The Member Interpretation Layer authors the sentence from the tier and
 * the verdict (lib/member-interpretation/findings.ts), and the NAME comes
 * from lib/naming/findingNames.ts. What this file supplies is severity,
 * provenance and a short coach-facing note.
 */

import type { RegistryEntrySeverity } from '@mef/shared-types-contracts';
import type { RegistryEntryDraft } from '../registry/types';
import { STRESS_LOAD_SOURCE_FEATURE } from './constants';
import type { LoadBand, RecoveryBand, StressLoadReading } from './patterns';

/** registry_entries.code for the load dimension. */
export const LOAD_FINDING_CODE = 'stress_load_burden';
/** registry_entries.code for the recovery dimension. */
export const RECOVERY_FINDING_CODE = 'recovery_capacity';

/** The registry domain both rows are filed in. The CODE is what decides the Coaching Domain, per lib/member-interpretation/domainMap.ts. */
export const STRESS_LOAD_REGISTRY_DOMAIN = 'stress' as const;

/** Load band -> severity. Reads the load band and nothing else. */
export function loadSeverity(band: LoadBand): RegistryEntrySeverity {
  switch (band) {
    case 'high':
      return 'significant';
    case 'moderate':
      return 'moderate';
    case 'light':
      return 'mild';
  }
}

/**
 * Recovery band -> severity. Reads the recovery band and nothing else.
 *
 * Solid recovery is 'mild' rather than 'none', deliberately. 'none' maps to
 * the verdict 'resolved' in lib/member-interpretation/findings.ts, and
 * "this looks like it has settled down since we first noticed it" is not
 * what a member with strong recovery should read about her own recovery.
 * 'mild' reads as noted, which is exactly right: it is real, it is on the
 * map, and nothing is being asked of her about it today.
 */
export function recoverySeverity(band: RecoveryBand): RegistryEntrySeverity {
  switch (band) {
    case 'thin':
      return 'significant';
    case 'partial':
      return 'moderate';
    case 'solid':
      return 'mild';
  }
}

/** The coach-facing note on the load row. Names the two numbers behind the band, so a coach can see how it was reached. */
function loadCoachContext(reading: StressLoadReading): string {
  const sources = reading.load.breadth === 1 ? 'source' : 'sources';
  return `Stress & Load Deep-Dive: reported load ${reading.load.weight} of 5 across ${reading.load.breadth} ${sources}.`;
}

/** The coach-facing note on the recovery row. Named separately, and it never mentions the load side. */
function recoveryCoachContext(reading: StressLoadReading): string {
  const support = reading.recovery.namesSupport ? 'named support' : 'no one named to lean on';
  return `Stress & Load Deep-Dive: recovery received ${reading.recovery.amountPoints} of 4 last week, ${support}.`;
}

/**
 * The two drafts, in a fixed order: load first, recovery second.
 *
 * `recordedAt` is passed in rather than read from the clock here so this
 * stays pure and so both rows carry the identical instant, which is what
 * makes them legible as one sitting later.
 */
export function buildStressLoadRegistryDrafts(input: {
  reading: StressLoadReading;
  sessionId: string;
  recordedAt: string;
}): RegistryEntryDraft[] {
  const { reading, sessionId, recordedAt } = input;
  const evidence = [{ type: 'stress_load_session', id: sessionId }];

  return [
    {
      entry_kind: 'finding',
      domain: STRESS_LOAD_REGISTRY_DOMAIN,
      code: LOAD_FINDING_CODE,
      label: 'What your life has been asking of you',
      severity: loadSeverity(reading.load.band),
      numeric_value: reading.load.loadPoints,
      unit: 'load_points',
      confidence: 0.7,
      narrative: null,
      evidence_refs: evidence,
      source_feature: STRESS_LOAD_SOURCE_FEATURE,
      source_record_id: sessionId,
      trend_status: null,
      member_visible: true,
      coach_context: loadCoachContext(reading),
      coach_reviewed_by: null,
      coach_reviewed_at: null,
      recorded_at: recordedAt,
    },
    {
      entry_kind: 'finding',
      domain: STRESS_LOAD_REGISTRY_DOMAIN,
      code: RECOVERY_FINDING_CODE,
      label: 'What has been giving back to you',
      severity: recoverySeverity(reading.recovery.band),
      numeric_value: reading.recovery.recoveryPoints,
      unit: 'recovery_points',
      confidence: 0.7,
      narrative: null,
      evidence_refs: evidence,
      source_feature: STRESS_LOAD_SOURCE_FEATURE,
      source_record_id: sessionId,
      trend_status: null,
      member_visible: true,
      coach_context: recoveryCoachContext(reading),
      coach_reviewed_by: null,
      coach_reviewed_at: null,
      recorded_at: recordedAt,
    },
  ];
}
