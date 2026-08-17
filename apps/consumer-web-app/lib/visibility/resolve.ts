/**
 * The Visibility Layer — the resolver.
 *
 * One pure function turns "the catalog", "what is true about her" and
 * "what has already been decided and stored" into one answer per feature.
 * No I/O, so every rule in this build's test file drives the real resolver
 * rather than a stand-in.
 *
 * THE PRECEDENCE, top down. Each step is a rule from the brief, in the
 * order that makes the others safe.
 *
 *   1. Safety, in both directions. A safety-critical feature is visible to
 *      everyone, always, and neither a rule, nor a coach, nor the member
 *      may take it away. This is checked first so that nothing below can
 *      reach it.
 *   2. A coach override. A coach may reveal or hide anything for anyone and
 *      that decision wins over every rule.
 *   3. The member hid it herself.
 *   4. She has touched it. Started, completed, or logged data in. Rule 2:
 *      grandfather everything touched, hiding applies only to the untouched.
 *   5. It was revealed before. Rule 3: revealed stays revealed, so nothing
 *      flickers in and out as her data moves.
 *   6. A reveal rule fires now.
 *   7. Otherwise hidden. Rule 1: the default is hidden.
 */

import { VISIBILITY_CATALOG } from './catalog';
import { describeRule, evaluateReveal, hasTouched, type VisibilityContext } from './rules';
import type {
  FeatureDefinition,
  FeatureKey,
  FeatureVisibility,
  MemberVisibility,
  VisibilitySource,
  VisibilityState,
} from './types';

/** One row of `member_feature_visibility`, in application shape. */
export type StoredVisibility = {
  featureKey: FeatureKey;
  state: VisibilityState;
  source: VisibilitySource;
  ruleKind: string | null;
  reason: string | null;
  revealedAt: string | null;
  /** When the member was shown the plain sentence. Null means she has not seen it. */
  acknowledgedAt: string | null;
};

export type ResolveInput = {
  context: VisibilityContext;
  stored: Map<FeatureKey, StoredVisibility>;
  /** Defaults to the real catalog; overridable so a test can drive a small one. */
  catalog?: FeatureDefinition[];
};

function decideOne(
  definition: FeatureDefinition,
  input: ResolveInput
): FeatureVisibility {
  const { context, stored } = input;
  const row = stored.get(definition.key);
  const base = {
    key: definition.key,
    label: definition.label,
    kind: definition.kind,
    surface: definition.surface,
  };

  // 1. Safety, in both directions.
  if (definition.safetyCritical) {
    return {
      ...base,
      visible: true,
      source: 'safety',
      ruleKind: 'safety',
      revealSentence: null,
      coachExplanation:
        'Safety. This is visible to every member and cannot be hidden by a rule, by a coach, or by the member.',
      grandfathered: false,
      newlyRevealed: false,
      revealedAt: row?.revealedAt ?? null,
    };
  }

  // 2. A coach override wins over every rule, in either direction.
  if (row?.source === 'coach') {
    return {
      ...base,
      visible: row.state === 'revealed',
      source: 'coach',
      ruleKind: null,
      revealSentence: row.state === 'revealed' && !row.acknowledgedAt ? definition.revealSentence : null,
      coachExplanation:
        row.state === 'revealed'
          ? 'A coach turned this on for her by hand. That decision overrides every rule.'
          : 'A coach turned this off for her by hand. That decision overrides every rule.',
      grandfathered: false,
      newlyRevealed: row.state === 'revealed' && !row.acknowledgedAt && definition.revealSentence !== null,
      revealedAt: row.revealedAt,
    };
  }

  // 3. She hid it herself.
  if (row?.source === 'member' && row.state === 'hidden') {
    return {
      ...base,
      visible: false,
      source: 'member',
      ruleKind: null,
      revealSentence: null,
      coachExplanation: 'She turned this off herself.',
      grandfathered: false,
      newlyRevealed: false,
      revealedAt: row.revealedAt,
    };
  }

  // 4. Grandfathering. Anything she has touched stays, whatever the rules say.
  const touched = hasTouched(definition.touchedBy, context);
  if (touched) {
    return {
      ...base,
      visible: true,
      source: row?.source === 'migration' ? 'migration' : 'grandfathered',
      ruleKind: null,
      revealSentence: null,
      coachExplanation:
        'She has already started, completed or logged data here, so it stays whatever the rules would say.',
      grandfathered: true,
      newlyRevealed: false,
      revealedAt: row?.revealedAt ?? null,
    };
  }

  const outcome = evaluateReveal(definition, context);

  // 5. Revealed stays revealed. A stored reveal is never re-litigated
  //    against today's data, which is what stops a card blinking out on a
  //    quiet week and back in on a bad one.
  if (row?.state === 'revealed') {
    return {
      ...base,
      visible: true,
      source: row.source,
      ruleKind: (row.ruleKind as FeatureVisibility['ruleKind']) ?? outcome.firedRule?.kind ?? null,
      revealSentence: row.acknowledgedAt ? null : definition.revealSentence,
      coachExplanation: row.reason
        ? `Revealed on ${row.revealedAt?.slice(0, 10) ?? 'an earlier day'}: ${row.reason}`
        : 'Revealed earlier and kept, because a revealed feature stays revealed.',
      grandfathered: false,
      newlyRevealed: !row.acknowledgedAt && definition.revealSentence !== null,
      revealedAt: row.revealedAt,
    };
  }

  // 6. A rule fires now.
  if (outcome.satisfied && outcome.firedRule) {
    return {
      ...base,
      visible: true,
      source: 'rule',
      ruleKind: outcome.firedRule.kind,
      revealSentence: definition.revealSentence,
      coachExplanation: describeRule(outcome.firedRule),
      grandfathered: false,
      newlyRevealed: definition.revealSentence !== null,
      revealedAt: row?.revealedAt ?? null,
    };
  }

  // 7. Hidden. The default.
  return {
    ...base,
    visible: false,
    source: 'rule',
    ruleKind: null,
    revealSentence: null,
    coachExplanation:
      definition.revealWhen.length === 0
        ? 'Nothing can reveal this. It is retired or has no audience yet.'
        : 'No rule for this has fired for her yet, so it is not being shown.',
    grandfathered: false,
    newlyRevealed: false,
    revealedAt: null,
  };
}

export function resolveVisibility(input: ResolveInput): MemberVisibility {
  const catalog = input.catalog ?? VISIBILITY_CATALOG;
  const features = catalog.map((definition) => decideOne(definition, input));
  return {
    features,
    byKey: new Map(features.map((f) => [f.key, f] as const)),
    newlyRevealed: features.filter((f) => f.newlyRevealed && f.revealSentence !== null),
    safetyActive: input.context.safetyActive,
  };
}

/**
 * Which reveals need writing back, so that "revealed stays revealed" is a
 * fact in the database rather than a promise a render makes to itself.
 * Everything the resolver decided is visible and does not already have a
 * revealed row.
 */
export function pendingReveals(
  visibility: MemberVisibility,
  stored: Map<FeatureKey, StoredVisibility>
): FeatureVisibility[] {
  return visibility.features.filter((f) => {
    if (!f.visible) return false;
    if (f.source === 'safety') return false; // never stored: it is not a decision
    const row = stored.get(f.key);
    return !row || row.state !== 'revealed';
  });
}
