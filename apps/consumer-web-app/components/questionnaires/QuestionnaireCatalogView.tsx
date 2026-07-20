/**
 * Client-side filter chips over the Questionnaires catalog (Available,
 * Premium, Assigned, Completed). "All" shows every non-empty section
 * stacked, same as before; picking a chip narrows to just that section.
 * Locked/scheduled/reassessment-due/coming-soon never move a card out of
 * its section here — see CatalogQuestionnaireCard for how those render as
 * flags/badges instead.
 */

'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { QuestionnaireCatalog, CatalogCard } from '@/app/actions/questionnaireCatalog';
import { CatalogQuestionnaireCard } from './CatalogQuestionnaireCard';

type FilterKey = 'all' | 'available' | 'premium' | 'assigned' | 'completed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'premium', label: 'Premium' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'completed', label: 'Completed' },
];

function Section({
  title,
  subtitle,
  cards,
}: {
  title: string;
  subtitle?: string;
  cards: CatalogCard[];
}) {
  if (cards.length === 0) return null;
  return (
    <section className="mt-8">
      <p className="px-1 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">{title}</p>
      {subtitle && <p className="mt-1 px-1 text-xs text-[#6B7A72]">{subtitle}</p>}
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <CatalogQuestionnaireCard key={card.key} card={card} />
        ))}
      </div>
    </section>
  );
}

export function QuestionnaireCatalogView({ catalog }: { catalog: QuestionnaireCatalog }): ReactNode {
  const [filter, setFilter] = useState<FilterKey>('all');

  const counts: Record<FilterKey, number> = {
    all: catalog.assigned.length + catalog.completed.length + catalog.premium.length + catalog.available.length,
    assigned: catalog.assigned.length,
    completed: catalog.completed.length,
    premium: catalog.premium.length,
    available: catalog.available.length,
  };

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              filter === key
                ? 'bg-[#1B3A2D] text-white'
                : 'bg-white text-[#1B3A2D] shadow-[0_2px_12px_-4px_rgba(27,58,45,0.12)] hover:bg-[#F3F6F4]'
            }`}
          >
            {label}
            {key !== 'all' ? ` (${counts[key]})` : ''}
          </button>
        ))}
      </div>

      {counts.all === 0 && (
        <section className="mef-animate-in mt-8 rounded-[28px] bg-white p-7 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
          <p className="text-sm leading-relaxed text-[#6B7A72]">
            Nothing available right now. Check back soon.
          </p>
        </section>
      )}

      {(filter === 'all' || filter === 'available') && (
        <Section title="Available" cards={catalog.available} />
      )}

      {(filter === 'all' || filter === 'premium') && (
        <Section
          title="Premium"
          subtitle="See what unlocks with a Membership plan."
          cards={catalog.premium}
        />
      )}

      {(filter === 'all' || filter === 'assigned') && (
        <Section title="Assigned" cards={catalog.assigned} />
      )}

      {(filter === 'all' || filter === 'completed') && (
        <Section title="Completed" cards={catalog.completed} />
      )}
    </>
  );
}
