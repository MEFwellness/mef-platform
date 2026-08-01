import { getMyNarrative } from '@/app/actions/narrative';
import { CVS_CARD, CVS_DISPLAY_FONT } from './theme';

/**
 * "What Root Knows So Far" — reuses the existing Member Health Narrative
 * system (lib/narrative/, migration 29) end to end: reads through the
 * already-existing getMyNarrative() action, no new table, no new query
 * layer. Only new here is this small presentational card, since no
 * member-facing "Root's narrative" card exists elsewhere yet to reuse
 * outright. `notes` defaults to Core Values Snapshot's own note only
 * (unchanged existing behavior: matched to this exact sessionId). Life
 * Signal Check's closing/results screens pass both notes so the card
 * grows across experiences instead of replacing Experience 1's own
 * entries — with more than one note, matching is by note alone (not
 * scoped to sessionId), since a second experience's entries were never
 * written against this session's id in the first place, and every
 * narrative write here already dedupes to one active row per
 * category+title (findActiveItem/supersedeNarrativeItem), so "by note"
 * always resolves to the member's current understanding, not stale
 * history.
 */
export async function WhatRootKnowsCard({
  sessionId,
  notes = ['core-values-snapshot'],
}: {
  sessionId: string;
  notes?: string[];
}) {
  const items = await getMyNarrative();
  const mine = items.filter((item) =>
    notes.length > 1
      ? item.source_refs?.some((ref) => ref.note && notes.includes(ref.note))
      : item.source_refs?.some((ref) => ref.id === sessionId && ref.note && notes.includes(ref.note))
  );

  if (mine.length === 0) return null;

  return (
    <div className={`${CVS_CARD} mef-animate-in p-7`}>
      <p className={`${CVS_DISPLAY_FONT} text-xl text-[#1B3A2D]`}>What Root knows so far</p>
      <ul className="mt-4 space-y-4">
        {mine.map((item) => (
          <li key={item.id}>
            <p className="text-sm font-medium text-[#1B3A2D]">{item.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-[#6B7A72]">{item.summary}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
