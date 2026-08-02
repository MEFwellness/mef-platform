/**
 * Life Signal Check — "What Root Knows So Far" entries. Pure draft
 * builder; the actual dedup-and-write happens in
 * app/actions/lifeSignalCheck.ts against the existing narrative_items
 * system (lib/narrative/data.ts), same as Core Values Snapshot's own
 * lib/core-values-snapshot/narrative.ts. No new table. The first entry's
 * title, "How your body is responding," is the exact item the build
 * brief asks the closing "What Root Knows So Far" card to add alongside
 * Core Values Snapshot's own earlier entries.
 */

import { SIGNAL_LABEL } from './constants';
import { buildLscEchoLine, LSC_SURPRISE_LINE } from './copy';
import type { LscScoring } from './types';
import type { NarrativeItemDraft } from '@/lib/narrative/types';

export function buildLscNarrativeDrafts(sessionId: string, scoring: LscScoring): NarrativeItemDraft[] {
  const chosen = SIGNAL_LABEL[scoring.chosenSignal];
  const sourceRefs = [{ type: 'unified_assessment_session', id: sessionId, note: 'life-signal-check' }];

  const drafts: NarrativeItemDraft[] = [
    {
      category: 'recurring_patterns',
      title: 'How your body is responding',
      summary: `${chosen} was the loudest signal this week, at ${scoring.scores[scoring.chosenSignal]} out of 3.`,
      provenance: 'member_reported',
      confidence: 0.8,
      memberVisible: true,
      sourceRefs,
    },
    {
      category: 'unresolved_concerns',
      title: `What's behind ${chosen}?`,
      // Deliberately not "I don't know yet" — an honest unknown reads as
      // the next chapter, not a blank (item 13 of the closing-screen
      // redesign). Same honesty, just not left empty. The closing
      // screen's own card-building (LscCloseScreen.tsx) also renders this
      // exact framing for any pre-existing narrative item matching this
      // title, so a member whose row was written before this copy change
      // still sees the intentional version, not the old blank one.
      summary: `What's driving ${chosen}? That's exactly what our next conversation finds out.`,
      provenance: 'system_observed',
      confidence: null,
      memberVisible: true,
      sourceRefs,
    },
  ];

  if (scoring.echoFires) {
    drafts.push({
      category: 'recurring_patterns',
      title: 'Values and body pointing the same way',
      summary: buildLscEchoLine(scoring),
      provenance: 'inferred',
      confidence: 0.5,
      memberVisible: true,
      sourceRefs,
    });
  }

  if (scoring.surpriseFires) {
    drafts.push({
      category: 'unresolved_concerns',
      title: 'A gap between the summary and what showed up',
      summary: LSC_SURPRISE_LINE,
      provenance: 'inferred',
      confidence: 0.6,
      memberVisible: true,
      sourceRefs,
    });
  }

  return drafts;
}
