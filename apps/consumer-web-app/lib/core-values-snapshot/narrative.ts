/**
 * Core Values Snapshot — "What Root Knows So Far" entries. Pure draft
 * builder; the actual dedup-and-write happens in
 * app/actions/coreValuesSnapshot.ts against the existing narrative_items
 * system (lib/narrative/data.ts) — the closest real "member's Root
 * knowledge/observation record" this codebase has (see lib/narrative/
 * types.ts's NarrativeCategory vocabulary). No new table.
 */

import { AREA_LABEL } from './constants';
import type { CvsScoring } from './types';
import type { NarrativeItemDraft } from '@/lib/narrative/types';

export function buildCvsNarrativeDrafts(sessionId: string, scoring: CvsScoring): NarrativeItemDraft[] {
  const top = AREA_LABEL[scoring.topValue];
  const runner = AREA_LABEL[scoring.runnerUpValue];
  const att = scoring.attention[scoring.topValue];
  const sourceRefs = [{ type: 'unified_assessment_session', id: sessionId, note: 'core-values-snapshot' }];

  const drafts: NarrativeItemDraft[] = [
    {
      category: 'primary_priorities',
      title: 'What matters most, from the Core Values Snapshot',
      summary: `${top} is your top value, based on everything you answered. ${runner} is the runner-up.`,
      provenance: 'member_reported',
      confidence: 0.8,
      memberVisible: true,
      sourceRefs,
    },
    {
      category: 'recurring_patterns',
      title: `Attention gap on ${top}`,
      summary:
        scoring.branch === 'aligned'
          ? `${top} rated ${att}/5 for attention: aligned, attention matches values.`
          : `${top} rated ${att}/5 for attention.`,
      provenance: 'inferred',
      confidence: 0.7,
      memberVisible: true,
      sourceRefs,
    },
    {
      category: 'unresolved_concerns',
      title: `What's pressing on ${top}?`,
      summary: `What's putting the pressure on ${top}? I don't know yet.`,
      provenance: 'system_observed',
      confidence: null,
      memberVisible: true,
      sourceRefs,
    },
  ];

  if (scoring.s1Fires) {
    const guiltAreaLabel = AREA_LABEL[scoring.guiltArea];
    drafts.push({
      category: 'unresolved_concerns',
      title: `Guilt about ${guiltAreaLabel} despite showing up`,
      summary: `Feels guilty about ${guiltAreaLabel} despite showing up for it (open question).`,
      provenance: 'inferred',
      confidence: 0.6,
      memberVisible: true,
      sourceRefs,
    });
  }

  return drafts;
}
