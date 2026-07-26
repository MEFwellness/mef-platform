/**
 * Cross-assessment correlation patterns — replaces the old
 * crossAssessmentCorrelations.ts, whose "five hand-written pairings"
 * fired on a canned rule ("both sides present -> print a sentence") with
 * no statistical calculation behind them. Every correlation surfaced here
 * has instead already passed the real evidence gates (21 paired
 * observations, 21-day span, an effect-size floor, split-window
 * stability — lib/correlation-engine/evidence.ts) and been through the
 * same occurrence/tier progression every other longitudinal signal uses,
 * on a schedule (app/api/cron/correlation-engine), not on this read.
 *
 * Only tier 2+ signals surface as a pattern — a lone one-time observation
 * is too weak to present as "a pattern," the same bar every other
 * three-tier signal already has to clear before it reads as more than "we
 * noticed this once" (lib/longitudinal-intelligence/copy.ts).
 */

import { describeSignalForCoach } from '../longitudinal-intelligence/copy';
import type { LongitudinalSignal } from '../longitudinal-intelligence/types';
import type { PatternInsight } from './types';

export function buildCorrelationPatternInsights(
  correlationSignals: LongitudinalSignal[]
): PatternInsight[] {
  return correlationSignals
    .filter((signal) => signal.tier !== null && signal.tier >= 2)
    .map((signal) => ({
      key: `correlation_${signal.signalKey}`,
      kind: 'cross_assessment_correlation' as const,
      label: signal.signalLabel,
      description: describeSignalForCoach(signal),
      confidence: signal.confidence,
      evidenceRefs: [{ type: 'member_pattern_state', id: signal.signalKey }],
      sourceInsightId: null,
    }));
}
