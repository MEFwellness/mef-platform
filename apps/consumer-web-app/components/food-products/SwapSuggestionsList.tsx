import { ArrowRightLeft } from 'lucide-react';
import type { SwapSuggestion } from '@/lib/food-products/swaps';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

/** Part 7 — practical alternatives, never a bare "avoid this." Each suggestion is paired with the specific reason it was surfaced. */
export function SwapSuggestionsList({ suggestions }: { suggestions: SwapSuggestion[] }) {
  if (suggestions.length === 0) return null;

  return (
    <div className={`${CARD} p-6`}>
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="h-4 w-4 text-[#1B3A2D]" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
          Possible Swaps
        </p>
      </div>
      <div className="mt-3 space-y-3.5">
        {suggestions.map((s, i) => (
          <div key={i}>
            <p className="text-sm leading-relaxed text-[#1B3A2D]">{s.suggestion}</p>
            <p className="mt-0.5 text-xs text-[#9AA79F]">{s.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
