/**
 * Member-safe topic naming and domain-word matching — pure, no I/O. A
 * LongitudinalSignal's own signalLabel is either already human (registry
 * findings, e.g. "Elevated stress") or a bare WellnessMetricKey
 * (check-in metrics, e.g. "sleep") — this file turns the latter into a
 * short phrase, and extracts the same domain word both a signal's own
 * signalKey and a MemberRecommendationCategory already carry so the
 * adaptive selector can compare them without inventing a new taxonomy.
 */

import type { LongitudinalSignal } from '@/lib/longitudinal-intelligence';
import type { MemberRecommendationCategory } from '@/lib/recommendation-engine';

const WELLNESS_METRIC_TOPIC_LABEL: Record<string, string> = {
  sleep: 'your sleep',
  stress: 'your stress levels',
  mood: 'your mood',
  movement: 'your movement',
  energy: 'your energy levels',
  pain: 'your pain levels',
  digestion: 'your digestion',
};

/** Never a raw code or domain key — either the registry finding's own human label, or a short check-in-metric phrase. */
export function topicLabelForSignal(signal: LongitudinalSignal): string {
  if (signal.signalKind === 'checkin_metric') {
    return WELLNESS_METRIC_TOPIC_LABEL[signal.signalLabel] ?? 'this area';
  }
  const label = signal.signalLabel.trim();
  return label.length > 0 ? label.charAt(0).toLowerCase() + label.slice(1) : 'this area';
}

/**
 * The domain word a signal belongs to, parsed from its own signalKey
 * ("registry::<RegistryDomain>::<code>" or "checkin_metric::<WellnessMetricKey>")
 * — reused verbatim from the key longitudinal-intelligence already writes,
 * never a second domain classification.
 */
export function domainWordForSignal(signal: LongitudinalSignal): string | null {
  const parts = signal.signalKey.split('::');
  return parts[1] ?? null;
}

/**
 * Which domain word(s) a member's negative-history recommendation category
 * corresponds to, so "always ignores sleep recommendations" can be compared
 * against a signal's own domain word above. Deliberately approximate for
 * categories with no single matching registry/metric domain (e.g.
 * recovery_focus) — informational tie-breaking only, never a suppression.
 */
const CATEGORY_DOMAIN_WORDS: Partial<Record<MemberRecommendationCategory, string[]>> = {
  sleep_optimization: ['sleep'],
  stress_management: ['stress'],
  breathing_practice: ['breathing'],
  movement_focus: ['movement'],
  recovery_focus: ['energy', 'recovery'],
  nutrition_focus: ['nutrition'],
};

export function domainWordsForCategory(category: MemberRecommendationCategory): string[] {
  return CATEGORY_DOMAIN_WORDS[category] ?? [];
}
