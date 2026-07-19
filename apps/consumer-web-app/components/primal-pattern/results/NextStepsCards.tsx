/**
 * "Next Steps" — premium cards framing future assessments as a natural
 * continuation of the member's wellness journey, not a sales pitch.
 * Every card is 'coming_soon' today (none of these assessments exist
 * yet), so each renders as a quiet preview rather than a live link —
 * NEXT_STEP_CARDS' `status` field is what a future assessment launch
 * would flip to 'available', at which point this component would need a
 * real href, not a component rewrite.
 */

import { Brain, ClipboardList, Footprints, Leaf, Moon } from 'lucide-react';
import { NEXT_STEP_CARDS, type NextStepCard } from '@/lib/primal-pattern/premium/content';

const ICON: Record<string, typeof Moon> = {
  sleep: Moon,
  stress: Brain,
  digestion: Leaf,
  movement: Footprints,
  'health-history': ClipboardList,
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
  const Icon = ICON[card.id] ?? Moon;

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F3F6F4] text-[#1B3A2D]">
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
    </div>
  );
}
