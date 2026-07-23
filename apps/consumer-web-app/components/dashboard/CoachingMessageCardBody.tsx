'use client';

/**
 * Root Coaching Conversation Engine — dashboard card interaction (Prompt 13).
 * Same "tap to reveal more" convention as CoachingInsightCard.tsx: the
 * 1-sentence dashboardLine is always visible; tapping reveals the fuller
 * coachingCard (Observation -> Explanation -> Action -> Encouragement,
 * already capped at 120 words by the composer). No new copy is generated
 * here — both strings are already-composed props.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function CoachingMessageCardBody({
  dashboardLine,
  coachingCard,
}: {
  dashboardLine: string;
  coachingCard: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = coachingCard.trim() !== dashboardLine.trim();

  return (
    <div className="mt-2">
      <p className="text-sm leading-relaxed text-[#1B3A2D]">{expanded && hasMore ? coachingCard : dashboardLine}</p>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#6B7A72] underline underline-offset-2 hover:text-[#1B3A2D]"
          aria-expanded={expanded}
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {expanded ? 'Show less' : 'Tell me more'}
        </button>
      )}
    </div>
  );
}
