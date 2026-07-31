import { getMyNarrative } from '@/app/actions/narrative';
import { CVS_CARD, CVS_DISPLAY_FONT } from './theme';

/**
 * "What Root Knows So Far" — reuses the existing Member Health Narrative
 * system (lib/narrative/, migration 29) end to end: reads through the
 * already-existing getMyNarrative() action, no new table, no new query
 * layer. Only new here is this small presentational card, since no
 * member-facing "Root's narrative" card exists elsewhere yet to reuse
 * outright. Filters to entries this Core Values Snapshot completion just
 * wrote (source_refs note === 'core-values-snapshot').
 */
export async function WhatRootKnowsCard({ sessionId }: { sessionId: string }) {
  const items = await getMyNarrative();
  const mine = items.filter((item) => item.source_refs?.some((ref) => ref.id === sessionId && ref.note === 'core-values-snapshot'));

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
