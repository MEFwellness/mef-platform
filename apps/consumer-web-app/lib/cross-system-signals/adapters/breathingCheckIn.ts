/**
 * The Breathing Pattern Check-In, as signals.
 *
 * THE TOTAL, AND THE NOTABLE ITEMS. Her score out of the instrument's own
 * maximum is one signal with its own timeline, and an item she answered
 * Often or Very often is another, plus any item signal she already has,
 * so one that has settled can be seen to have settled.
 *
 * THE INSTRUMENT IS NOT TOUCHED AND NOT REINTERPRETED. Everything below
 * reads the stored BpcResults that scoreBpcAnswers already produced: the
 * total, the maximum and the per item points. Nothing here re-weights,
 * re-bands or re-thresholds anything, and nothing here imports the
 * instrument's own reference threshold, because a reference figure is a
 * reading and this library stores what was answered.
 *
 * WHAT "NOTABLE" MEANS HERE is the top two of the five responses, which
 * this file derives from the scale itself (the two highest point values)
 * rather than from a number typed in. Adding a sixth response to the
 * instrument would move the line correctly, and a test asserts it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BPC_ITEMS,
  BPC_MAX_ITEM_POINTS,
  BPC_SCALE,
  bpcOption,
  type BpcAnswers,
  type BpcResults,
} from '@/lib/breathing-check-in/instrument';
import { listBpcSessions } from '@/lib/breathing-check-in/data';
import { SOURCE_BREATHING_CHECK_IN } from '../constants';
import { resolveMapped, sourceLabel } from '../library';
import { fingerprint, type BuildContext, type IngestibleSitting, type SignalAdapter } from '../registry';
import type { SignalDraft } from '../types';

export type BreathingAdapterInput = {
  sittingId: string;
  completedAt: string;
  answers: BpcAnswers;
  results: BpcResults;
};

/**
 * The lowest point value that counts as notable: the second highest the
 * scale offers. Derived, so the instrument and this line can never drift.
 */
export const BPC_NOTABLE_MIN_POINTS = (() => {
  const points = [...new Set(BPC_SCALE.map((option) => option.points))].sort((a, b) => b - a);
  return points[1] ?? BPC_MAX_ITEM_POINTS;
})();

export function buildBreathingSignals(
  input: BreathingAdapterInput,
  context: BuildContext
): SignalDraft[] {
  const { library, capturedOn, knownSlugs } = context;
  const label = sourceLabel(library, SOURCE_BREATHING_CHECK_IN);
  const drafts: SignalDraft[] = [];

  const total = resolveMapped(library, SOURCE_BREATHING_CHECK_IN, 'metric', 'total_score');
  if (total) {
    drafts.push({
      ...total,
      side: null,
      valueKind: 'score',
      valueLabel: `${input.results.totalScore} of ${input.results.maxScore}`,
      valueKey: null,
      valueNumeric: input.results.totalScore,
      sourceKey: SOURCE_BREATHING_CHECK_IN,
      sourceLabel: label,
      sourceSessionId: input.sittingId,
      sourceQuestionRef: 'total_score',
      sourceQuestionPrompt: `${input.results.answeredCount} of ${BPC_ITEMS.length} questions answered`,
      sourceRecordId: null,
      capturedOn,
      capturedAt: input.completedAt,
      note: null,
      ingestFingerprint: fingerprint(SOURCE_BREATHING_CHECK_IN, input.sittingId, 'metric:total_score'),
    });
  }

  for (const item of BPC_ITEMS) {
    const option = bpcOption(input.answers[item.itemId]);
    if (!option) continue;
    const resolved = resolveMapped(library, SOURCE_BREATHING_CHECK_IN, 'item', item.itemId);
    if (!resolved) continue;
    if (option.points < BPC_NOTABLE_MIN_POINTS && !knownSlugs.has(resolved.signalSlug)) continue;

    drafts.push({
      ...resolved,
      side: null,
      valueKind: 'scale',
      valueLabel: option.label,
      valueKey: option.valueKey,
      valueNumeric: option.points,
      sourceKey: SOURCE_BREATHING_CHECK_IN,
      sourceLabel: label,
      sourceSessionId: input.sittingId,
      sourceQuestionRef: item.itemId,
      sourceQuestionPrompt: item.prompt,
      sourceRecordId: null,
      capturedOn,
      capturedAt: input.completedAt,
      note: null,
      ingestFingerprint: fingerprint(
        SOURCE_BREATHING_CHECK_IN,
        input.sittingId,
        `item:${item.itemId}`
      ),
    });
  }

  return drafts;
}

export const breathingCheckInAdapter: SignalAdapter<BreathingAdapterInput> = {
  sourceKey: SOURCE_BREATHING_CHECK_IN,
  description: 'Breathing Pattern Check-In total score and notable item responses',

  async listCompleted(supabase: SupabaseClient, memberId: string): Promise<IngestibleSitting[]> {
    const read = await listBpcSessions(supabase, memberId, 50);
    if (!read.ok) return [];
    return read.records
      .filter((record) => record.completedAt !== null && record.results !== null)
      .map((record) => ({ id: record.id, completedAt: record.completedAt as string }));
  },

  async load(supabase, memberId, sittingId) {
    const read = await listBpcSessions(supabase, memberId, 50);
    if (!read.ok) return null;
    const record = read.records.find((candidate) => candidate.id === sittingId);
    if (!record || !record.completedAt || !record.results) return null;
    return {
      sittingId: record.id,
      completedAt: record.completedAt,
      answers: record.answers,
      results: record.results,
    };
  },

  build: buildBreathingSignals,
};
