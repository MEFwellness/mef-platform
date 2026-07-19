/**
 * "Continue Your Journey" — navigation only, no recommendation logic.
 * Reads lib/assessments/four-doctors/premium/nextSteps.ts; an
 * `available` card is a real Link to a real, already-registered
 * assessment, a `coming_soon` card renders as a quiet, unlinked preview.
 * Adding a future assessment is one config entry plus an ICON mapping
 * below, never a rewrite of this component, same pattern already proven
 * in components/primal-pattern/results/NextStepsCards.tsx.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { Brain, ClipboardList, Footprints, Leaf, Moon } from 'lucide-react';
import {
  NEXT_STEP_CARDS,
  type NextStepCard,
} from '@/lib/assessments/four-doctors/premium/nextSteps';

const ICON: Record<string, typeof Moon> = {
  'primal-pattern': ClipboardList,
  stress: Brain,
  sleep: Moon,
  digestion: Leaf,
  movement: Footprints,
};

export function NextStepsCards() {
  return (
    <section>
      <p className="px-1 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        Continue Your Journey
      </p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {NEXT_STEP_CARDS.map((card) => (
          <NextStepCardItem key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}

function NextStepCardItem({ card }: { card: NextStepCard }) {
  const Icon = ICON[card.id] ?? ClipboardList;

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#EFF6F1] text-[#1B3A2D]">
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        {card.status === 'coming_soon' && (
          <span className="rounded-full bg-[#F3F6F4] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">
            Coming soon
          </span>
        )}
      </div>
      <p className="mt-4 font-[family-name:var(--font-cormorant-garamond)] text-xl text-[#1B3A2D]">
        {card.title}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">{card.description}</p>
    </>
  );

  if (card.status === 'available' && card.href) {
    return (
      <Link
        href={card.href as Route}
        className="mef-focus-ring block rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_32px_-8px_rgba(27,58,45,0.18)]"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-[28px] bg-white/70 p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.06)]">
      {content}
    </div>
  );
}
