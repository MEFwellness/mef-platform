/**
 * Coaching Intelligence Engine — Progress history data source. Reads
 * root_score_snapshots (lib/scoring/data.ts's listSnapshotHistory) — the
 * platform's own already-computed longitudinal progress signal (Root
 * Score / Momentum / Resilience). This source deliberately reuses the
 * Root Score system's own momentum_state classification rather than
 * re-deriving a trend from raw scores itself: that state is already a
 * real, reviewed computation (lib/scoring/momentum.ts), so re-judging it
 * here would risk disagreeing with what the member sees on their own
 * Root Score card.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listSnapshotHistory } from '@/lib/scoring/data';
import type { ScoreConfidenceLevel } from '@mef/shared-types-contracts';
import type {
  CoachingDataSourceProvider,
  CoachingDateRange,
  CoachingObservation,
  CoachingObservationDirection,
} from '../types';

function momentumDirection(state: string): CoachingObservationDirection | null {
  if (state === 'improving') return 'positive';
  if (state === 'declining') return 'negative';
  if (state === 'stable') return 'neutral';
  return null; // 'insufficient_data' — not real evidence, emit nothing
}

function confidenceFor(level: ScoreConfidenceLevel): number {
  switch (level) {
    case 'high':
      return 1;
    case 'moderate':
      return 0.7;
    case 'low':
      return 0.4;
    case 'building':
      return 0.2;
  }
}

async function fetchObservations(
  supabase: SupabaseClient,
  memberId: string,
  range: CoachingDateRange
): Promise<CoachingObservation[]> {
  const spanDays =
    Math.ceil((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000) + 1;
  const snapshots = await listSnapshotHistory(supabase, memberId, spanDays);

  const observations: CoachingObservation[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.local_date < range.from || snapshot.local_date > range.to) continue;

    const direction = momentumDirection(snapshot.momentum_state);
    if (direction && snapshot.momentum_score !== null) {
      observations.push({
        sourceId: 'progress_history',
        localDate: snapshot.local_date,
        metric: 'momentum_state',
        direction,
        value: snapshot.momentum_score,
        confidence: confidenceFor(snapshot.momentum_confidence_level),
        sourceRecordId: snapshot.id,
      });
    }
  }

  return observations;
}

export const progressSourceProvider: CoachingDataSourceProvider = {
  id: 'progress_history',
  fetchObservations,
};
