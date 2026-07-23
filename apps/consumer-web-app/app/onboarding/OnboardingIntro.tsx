import { Clock, ListChecks } from 'lucide-react';
import { EXPECTATIONS_COPY } from '@/lib/onboarding/coachCopy';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]';

/**
 * Shown once, before the first onboarding question — sets expectations
 * (how many questions, how long, that there's no right answer) so the
 * assessment opens like a coach setting the stage for a conversation
 * rather than dropping the member straight into a form. Purely
 * presentational; OnboardingFlow.tsx owns the "start" transition.
 */
export function OnboardingIntro({ onStart }: { onStart: () => void }) {
  return (
    <div>
      <h1 className={HEADING}>{EXPECTATIONS_COPY.title}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[#6B7A72]">
        {EXPECTATIONS_COPY.purpose}
      </p>

      <div className={`${CARD} mt-7 p-6`}>
        <div className="flex items-start gap-3">
          <ListChecks
            className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-[15px] leading-relaxed text-[#1B3A2D]">
            About {EXPECTATIONS_COPY.questionCount} questions
          </p>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <Clock
            className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <p className="text-[15px] leading-relaxed text-[#1B3A2D]">
            About {EXPECTATIONS_COPY.minutes} minutes
          </p>
        </div>
        <p className="mt-4 border-t border-[#1B3A2D]/10 pt-4 text-[15px] leading-relaxed text-[#6B7A72]">
          {EXPECTATIONS_COPY.reassurance} Just answer honestly, based on how things have actually
          been for you lately.
        </p>
      </div>

      <button
        type="button"
        onClick={onStart}
        className="mt-7 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
      >
        {EXPECTATIONS_COPY.cta}
      </button>
    </div>
  );
}
