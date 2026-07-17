import { Sparkles } from 'lucide-react';
import type { FoodCoachingResult } from '@mef/shared-types-contracts';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function Section({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{text}</p>
    </div>
  );
}

/** Root's coaching explanation of the rules engine's findings — product requirement §13's exact section structure. Root never re-derives the underlying facts here; this is presentation only. */
export function CoachingSections({ coaching }: { coaching: FoodCoachingResult }) {
  return (
    <div className={`${CARD} p-6`}>
      <div className="mb-4 flex items-center gap-2 text-[#6B7A72]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">Root&apos;s take</p>
      </div>
      <div className="space-y-4">
        <Section label="Supports you" text={coaching.supportsYou} />
        <Section label="Things to be mindful of" text={coaching.mindfulOf} />
        <Section label="Best fit" text={coaching.bestFit} />
        <Section label="Rooted Reset recommendation" text={coaching.recommendation} />
        <Section label="Missing information" text={coaching.missingInformation} />
      </div>
      <p className="mt-4 text-xs leading-relaxed text-[#9AA79F]">
        This reflects your own scan data and context — not a medical assessment.
      </p>
    </div>
  );
}
