/**
 * Readiness Pulse — the readiness level and biggest-obstacle facts the
 * build brief asks to persist "readable by future conversations, Root
 * messages, and generators, and visible to the coach. Invisible to the
 * member." Written into the existing narrative_items system
 * (lib/narrative/data.ts) with member_visible: false — a real, database-
 * enforced boundary (narrative_items' own member_read_own_narrative RLS
 * policy requires member_visible = true, migration 29), not just a UI
 * filter, and picked up for free by every existing narrative_items reader
 * (the coach's own client narrative view, the coaching-style keyword
 * classifier's own narrative reads, any future generator), rather than a
 * bespoke one-off store only Readiness Pulse's own pages would know to
 * query. No new table.
 *
 * These are the only two Readiness Pulse narrative drafts — unlike Life
 * Signal Check and Core Values Snapshot, the closing screen's own
 * synthesis (the three "complete picture" cards) is built directly from
 * live-recomputed scoring/context, not from a member-visible "What Root
 * Knows So Far" narrative list, so there is no member-facing narrative
 * item to author here.
 */

import { RPL_OBSTACLE_LABEL } from './copy';
import { READINESS_PATTERN_LABEL } from './constants';
import type { RplScoring } from './types';
import type { NarrativeItemDraft } from '@/lib/narrative/types';

export function buildRplNarrativeDrafts(sessionId: string, scoring: RplScoring): NarrativeItemDraft[] {
  const sourceRefs = [{ type: 'unified_assessment_session', id: sessionId, note: 'readiness-pulse' }];
  const patternLabel = READINESS_PATTERN_LABEL[scoring.finalPattern];

  return [
    {
      category: 'motivation_patterns',
      title: 'Readiness, stated directly',
      summary: `She told us directly: ${patternLabel.toLowerCase()}.${scoring.pickDivergedFromDerived ? ` Her own pick outranked the derived read of ${READINESS_PATTERN_LABEL[scoring.derivedPattern].toLowerCase()}.` : ''}`,
      provenance: 'member_reported',
      confidence: 0.9,
      memberVisible: false,
      sourceRefs,
    },
    {
      category: 'barriers_to_adherence',
      title: 'What she says would sink this first',
      summary: `${RPL_OBSTACLE_LABEL[scoring.q6]}.`,
      provenance: 'member_reported',
      confidence: 0.8,
      memberVisible: false,
      sourceRefs,
    },
  ];
}
