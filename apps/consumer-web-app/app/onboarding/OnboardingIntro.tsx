import Image from 'next/image';
import { Clock, ListChecks, Sparkles } from 'lucide-react';
import { EXPECTATIONS_COPY } from '@/lib/onboarding/coachCopy';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]';

const INFO_ROWS = [
  { Icon: ListChecks, text: `${EXPECTATIONS_COPY.questionCount} short, guided questions` },
  { Icon: Clock, text: `About ${EXPECTATIONS_COPY.minutes} minutes of your time` },
  { Icon: Sparkles, text: EXPECTATIONS_COPY.observationPromise },
] as const;

/**
 * Shown once, before the first onboarding question — the member's (or
 * guest's) first real impression of Rooted Reset. Sets the emotional stage
 * (what they'll receive, not just what they have to do) and expectations
 * (question count, time, what happens at the end) so the assessment opens
 * like a coach setting the stage for a conversation rather than dropping
 * the member straight into a form. Purely presentational — no auth,
 * routing, branching, or question-flow logic lives here;
 * OnboardingFlow.tsx owns the "start" transition and is what decides
 * guest vs. member mode upstream of this component.
 */
export function OnboardingIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="mef-animate-in relative flex min-h-[70vh] flex-col justify-center py-6">
      {/* A quiet warmth behind the mark — not a decoration to notice, just
          a reason the page doesn't feel clinical. Purely visual, so it's
          hidden from assistive tech and never affects layout (absolute +
          pointer-events-none). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-72 -translate-x-1/2 -translate-y-1/4 rounded-full bg-[#F5B700]/[0.07] blur-3xl"
      />

      <div className="flex flex-col items-center text-center">
        <Image
          src="/images/rooted-reset-logo.png"
          alt="Rooted Reset"
          width={34}
          height={34}
          style={{ objectFit: 'contain', borderRadius: '8px' }}
        />
        <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6B7A72]">
          by MEF Wellness
        </span>
      </div>

      <p className="mt-7 text-center text-xs font-semibold uppercase tracking-[0.14em] text-[#1B3A2D]/45">
        {EXPECTATIONS_COPY.eyebrow}
      </p>

      <h1 className={`${HEADING} mt-2 text-center`}>{EXPECTATIONS_COPY.title}</h1>
      <p className="mx-auto mt-3 max-w-md text-center text-[15px] leading-relaxed text-[#6B7A72]">
        {EXPECTATIONS_COPY.purpose}
      </p>

      <div className={`${CARD} mt-8 p-6 md:p-7`}>
        {INFO_ROWS.map(({ Icon, text }, index) => (
          <div key={text} className={`flex items-start gap-3.5 ${index > 0 ? 'mt-4' : ''}`}>
            <Icon
              className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="text-[15px] leading-relaxed text-[#1B3A2D]">{text}</p>
          </div>
        ))}
        <p className="mt-5 border-t border-[#1B3A2D]/10 pt-4 text-[15px] leading-relaxed text-[#6B7A72]">
          {EXPECTATIONS_COPY.reassurance}
        </p>
      </div>

      <button
        type="button"
        onClick={onStart}
        className="mef-focus-ring mt-8 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
      >
        {EXPECTATIONS_COPY.cta}
      </button>
    </div>
  );
}
