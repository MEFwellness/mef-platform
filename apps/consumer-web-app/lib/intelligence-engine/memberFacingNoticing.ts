/**
 * Member Experience — "What We're Noticing".
 *
 * MIGRATED to the Member Interpretation Layer (2026-08-17). This module no
 * longer reads registry rows and no longer decides anything. It reshapes
 * the layer's canonical findings into the sections this screen renders.
 *
 * The audit's finding, live on 2026-08-17: six bullets under WHAT WE'RE
 * NOTICING, then four of the same six repeated as bare labels under AREAS
 * WORTH PAYING ATTENTION TO. That happened because `noticing` mapped every
 * active finding to its narrative and `worthAttention` mapped the
 * moderate/significant subset to its label, and both rendered on one
 * screen. A moderate finding was therefore stated twice, in two different
 * forms, with nothing saying they were the same thing.
 *
 * `worthAttention` is GONE, and its removal is the fix rather than a
 * simplification. It could not carry information the first list did not
 * already have: it was a strict subset by construction. What it was
 * genuinely doing, marking which findings are urgent, is now a flag on the
 * finding itself, rendered in place. One finding, one line, one screen.
 *
 * There is no `nextSteps` field here, on purpose, and that is unchanged.
 */

import type { CanonicalFinding } from '../member-interpretation/types';

/** One finding as this screen renders it. */
export type MemberNoticingItem = {
  id: string;
  statement: string;
  tierLabel: string;
  /** "Also shown under Movement & Physical Capacity." Null when it lives in one place. */
  crossReferenceNote: string | null;
  /** Rendered as an inline marker, not as a second list. */
  needsAttention: boolean;
};

export type MemberNoticingView = {
  noticing: MemberNoticingItem[];
  improving: MemberNoticingItem[];
  educationalNotes: string[];
  /**
   * The honest sentence to show when the member has not logged enough for
   * any of this to be more than early. Null when the floor is met.
   */
  dataFloorNote: string | null;
};

/**
 * Educational notes, keyed on the coaching domain a finding is filed under
 * rather than on its registry domain.
 *
 * Keyed on the primary domain and deduplicated, so a member with three
 * findings that all live in one domain reads one note, not three.
 */
const EDUCATIONAL_NOTE_BY_DOMAIN: Record<string, string> = {
  sleep_circadian_rhythm:
    'Sleep quality and energy are closely linked. Small, consistent changes to a wind-down routine tend to help both.',
  recovery_energy_regulation:
    'Energy through the day usually tracks sleep, stress and food together, not any one of them on its own.',
  stress_nervous_system:
    'Stress often shows up in the body before it shows up in mood. Tracking it alongside sleep and digestion can be revealing.',
  emotional_resilience_mood:
    'Mood and stress load are related but not the same thing, which is why they are asked about separately.',
  nutrition_metabolic_health:
    'Digestion and nutrition often improve together when meal timing and food quality are addressed as one habit, not two.',
  digestion_gut_health:
    'Digestive comfort tends to respond to meal timing and consistency before it responds to what is on the plate.',
  movement_physical_capacity:
    'Movement noticed early is usually easiest to address with small, targeted adjustments.',
  pain_structural_integrity:
    'Discomfort often responds well to short, consistent daily mobility work, and it is always worth mentioning to your coach.',
};

function toItem(finding: CanonicalFinding): MemberNoticingItem {
  return {
    id: finding.id,
    statement: finding.statement,
    tierLabel: finding.tierLabel,
    crossReferenceNote: finding.crossReferenceNote,
    needsAttention: finding.verdict === 'needs_attention',
  };
}

export function buildMemberFacingNoticing(input: {
  findings: readonly CanonicalFinding[];
  /** Null when the member has logged enough for the layer to describe her. */
  dataFloorNote: string | null;
}): MemberNoticingView {
  const visible = input.findings.filter((f) => f.memberVisible);

  // Improving is a real, computed trend and nothing else. It used to also
  // count `severity === 'none'`, which is what printed "Packaged food scan
  // has been improving." off one barcode scan with no second data point.
  // The layer's verdict carries that rule now; this only sorts.
  const improving = visible.filter((f) => f.verdict === 'improving');
  const noticing = visible.filter((f) => f.verdict !== 'improving' && f.verdict !== 'resolved');

  const touchedDomains = new Set<string>();
  for (const f of noticing) if (f.primaryDomain) touchedDomains.add(f.primaryDomain);

  const educationalNotes = [...touchedDomains]
    .map((domain) => EDUCATIONAL_NOTE_BY_DOMAIN[domain])
    .filter((note): note is string => Boolean(note));

  return {
    noticing: noticing.map(toItem),
    improving: improving.map(toItem),
    educationalNotes,
    dataFloorNote: input.dataFloorNote,
  };
}
