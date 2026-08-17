/**
 * The Naming Standard, as code.
 *
 * docs/NAMING-STANDARD.md is the prose. This file is the enforceable half:
 * the banned vocabulary, the list of names this app used to use and may
 * never use again, and one function that checks a candidate name.
 *
 * The rule it enforces: a name describes what the member experiences or
 * what the check looks at. It never names a condition, a pathogen, an organ
 * dysfunction, or a deficiency. A member reading any name in this app must
 * not be able to conclude that the app found a disease.
 *
 * Voice is Case View's: plain, short, honest. No em dashes anywhere, ever,
 * in member copy or coach copy.
 */

/**
 * Words a name may not contain, grouped by why.
 *
 * Matched case-insensitively as whole words, so "immune" is banned and
 * "immunity" is too, but a longer word that merely contains a short banned
 * one is not caught by accident.
 */
export const BANNED_NAME_WORDS: Readonly<Record<string, readonly string[]>> = {
  /** Names a condition or a diagnosis. */
  condition: [
    'disruption',
    'dysfunction',
    'dysregulation',
    'insufficiency',
    'deficiency',
    'deficient',
    'disorder',
    'syndrome',
    'imbalance',
    'pathology',
    'pathological',
    'diagnosis',
    'diagnostic',
    'condition',
  ],
  /** Names a pathogen. */
  pathogen: ['fungal', 'fungus', 'parasite', 'parasites', 'candida', 'infection', 'bacterial'],
  /** Names an organ the member is meant to infer is at fault. */
  organ: [
    'adrenal',
    'adrenals',
    'thyroid',
    'liver',
    'hepatic',
    'kidney',
    'kidneys',
    'renal',
    'bladder',
    'endocrine',
    'pituitary',
  ],
  /** Names a clinical process rather than an experience. */
  clinical_process: [
    'detoxification',
    'detox',
    'metabolic',
    'circadian',
    'musculoskeletal',
    'cardiovascular',
    'neurological',
    'immune',
    'immunity',
    'inflammatory',
    'inflammation',
    'hormonal',
    'cognitive',
    'gastrointestinal',
    'circulatory',
    'dermatological',
    'reproductive',
    'respiratory',
    'oxygenation',
  ],
  /** Grades severity the way a clinician would. */
  clinical_grade: ['elevated', 'abnormal', 'chronic', 'acute', 'clinical', 'clinically'],
  /** Puts the fault on the member rather than on the thing. */
  blame: ['poor', 'failure', 'noncompliant', 'non-compliant', 'inadequate'],
};

/** Every banned word, flattened. */
export const ALL_BANNED_NAME_WORDS: readonly string[] = Object.values(BANNED_NAME_WORDS).flat();

/**
 * Names this app used to show, in the exact wording it showed them.
 *
 * A test asserts that none of these appears in any catalog, map, label
 * table or copy constant the app renders from. The list only ever grows:
 * once a name has been retired it may never come back, whoever forgets why.
 */
export const BANNED_NAMES: readonly string[] = [
  // Finding labels, member facing
  'Gut Fungal & Parasite Concerns',
  'Detoxification Load Concerns',
  'Movement Deficiency',
  'Circadian Rhythm Disruption',
  'Cardiovascular & Circulation Pattern',
  'Hormonal Balance Pattern',
  'Immune & Respiratory Pattern',
  'Musculoskeletal Discomfort Pattern',
  'Emotional Wellbeing Concern',
  'Elevated Stress',
  'Poor Sleep Quality',
  'Low Energy',
  'Digestive Complaints',
  'Digestive Wellness Concerns',
  'Nutrition Quality Concerns',
  'Diet Quality Concern',
  'Irregular Meal Timing',
  'Energy & Fatigue Pattern',
  'Sleep Quality Pattern',
  'Stress & Mood Pattern',
  'Cognitive Clarity Pattern',
  // The twelve coaching domain names, renamed for everybody 2026-08-17
  'Identity & Self-Concept',
  'Purpose & Motivation',
  'Stress & Nervous System Regulation',
  'Emotional Resilience & Mood',
  'Sleep & Circadian Rhythm',
  'Movement & Physical Capacity',
  'Recovery & Energy Regulation',
  'Pain & Structural Integrity',
  'Nutrition & Metabolic Health',
  'Digestion & Gut Health',
  'Relationships & Social Connection',
  'Environment & Daily Rhythm',
  // Whole-Body Systems Assessment section titles
  'Upper Digestive Function',
  'Lower Digestive & Elimination Function',
  'Blood Sugar & Energy Regulation',
  'Liver & Detoxification Support',
  'Immune & Inflammatory Patterns',
  'Respiratory & Oxygenation Patterns',
  'Circulation & Cardiovascular-Related Observations',
  'Kidney, Bladder & Fluid-Balance Patterns',
  'Thyroid & Metabolic-Related Observations',
  'Adrenal & Stress-Response Patterns',
  'Reproductive & Hormonal Patterns',
  'Neurological & Cognitive Patterns',
  'Musculoskeletal & Connective-Tissue Patterns',
  'Skin, Hair & Nail Observations',
  'Nutrient Insufficiency Patterns',
  'Recovery & Resilience Patterns',
];

export type NamingViolation = {
  /** The offending word or character. */
  found: string;
  /** Which rule it broke. */
  rule: string;
};

// Built from code points rather than written out, so this file can hold the
// rule about em dashes without tripping the guard that enforces it
// (tests/no-em-dash-guard.test.ts scans string literals in lib/).
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

/**
 * Check one candidate name against the standard.
 *
 * Returns every violation rather than the first, so the person fixing a name
 * sees the whole problem in one pass.
 */
export function checkNamingStandard(name: string): NamingViolation[] {
  const violations: NamingViolation[] = [];

  if (name.includes(EM_DASH)) violations.push({ found: EM_DASH, rule: 'no em dashes in app copy' });
  if (name.includes(EN_DASH)) violations.push({ found: EN_DASH, rule: 'no en dashes in app copy' });

  const lower = name.toLowerCase();
  for (const [rule, words] of Object.entries(BANNED_NAME_WORDS)) {
    for (const word of words) {
      // Whole-word match. A hyphen counts as a boundary so
      // "stress-response" is caught the same way "stress response" is.
      const pattern = new RegExp(`(^|[^a-z])${escapeRegExp(word)}([^a-z]|$)`, 'i');
      if (pattern.test(lower)) violations.push({ found: word, rule });
    }
  }

  for (const banned of BANNED_NAMES) {
    if (name.includes(banned)) {
      violations.push({ found: banned, rule: 'retired name, see docs/NAMING-STANDARD.md' });
    }
  }

  return violations;
}

/** True when a name is clean. The one-liner most call sites want. */
export function meetsNamingStandard(name: string): boolean {
  return checkNamingStandard(name).length === 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Names still carrying a decision. Empty, and it must stay that way.
 *
 * There were three. All three were answered on 2026-08-17 and all three
 * were applied:
 *
 *   coaching_domain_labels  one vocabulary. The twelve domains were renamed
 *                           for everybody in lib/investigation-engine/domains.ts,
 *                           and their old names are on BANNED_NAMES above.
 *   movement_score          removed. The tile does not render
 *                           (lib/movement/scoreDisplay.ts).
 *   unbuilt_placeholders    hidden. They do not enter the catalogue
 *                           (lib/naming/unbuiltPlaceholders.ts).
 *
 * This is not an exception list anybody may grant themselves an entry on.
 * `tests/naming-standard.test.ts` asserts it is empty, so a name cannot be
 * parked here to dodge the standard: an open question about a name belongs
 * in a report, not in the code that enforces the rule.
 */
export const NAMES_PENDING_DECISION: readonly string[] = [];
