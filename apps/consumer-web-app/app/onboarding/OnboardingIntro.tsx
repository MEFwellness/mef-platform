import Image from 'next/image';
import { EXPECTATIONS_COPY, ONBOARDING_JOURNEY_STEPS } from '@/lib/onboarding/coachCopy';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-[2.15rem] leading-[1.15] text-[#1B3A2D] md:text-[2.75rem]';

/**
 * Shown once, before the first onboarding question — the member's (or
 * guest's) first real impression of Rooted Reset, and per the product
 * brief, meant to be "the most memorable first five minutes in digital
 * wellness," not just a clean expectations screen. Leads with outcome and
 * journey psychology (ONBOARDING_JOURNEY_STEPS, coachCopy.ts) instead of a
 * bare question-count/time checklist — the member should feel like they're
 * beginning something, not about to fill out a form. Deliberately no
 * min-height/vertical-centering trick: the page's own content (the journey
 * card especially) now fills the space honestly, rather than forcing extra
 * whitespace to hit a fixed viewport fraction. Purely presentational — no
 * auth, routing, branching, or question-flow logic lives here;
 * OnboardingFlow.tsx owns the "start" transition and is what decides guest
 * vs. member mode upstream of this component.
 */
export function OnboardingIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative flex flex-col pb-4 pt-2">
      {/* Quiet warmth behind the mark — not decoration to notice, just why
          the page doesn't feel clinical. Hidden from assistive tech and
          never affects layout. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-80 w-80 -translate-x-1/2 -translate-y-1/3 rounded-full bg-[#F5B700]/[0.08] blur-3xl"
      />

      <div className="mef-animate-in flex flex-col items-center text-center">
        <Image
          src="/images/rooted-reset-logo.png"
          alt="Rooted Reset"
          width={40}
          height={40}
          style={{ objectFit: 'contain', borderRadius: '9px' }}
        />
        <span className="mt-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7A72]">
          by MEF Wellness
        </span>
      </div>

      <div
        className="mef-animate-in mt-7 flex flex-col items-center text-center"
        style={{ animationDelay: '80ms' }}
      >
        <span className="rounded-full bg-[#1B3A2D]/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1B3A2D]/70">
          {EXPECTATIONS_COPY.eyebrow}
        </span>
        <h1 className={`${HEADING} mt-4 max-w-[19rem] md:max-w-sm`}>{EXPECTATIONS_COPY.title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[#6B7A72]">
          {EXPECTATIONS_COPY.purpose}
        </p>
      </div>

      <div className={`${CARD} mef-animate-in mt-8 p-6 md:p-7`} style={{ animationDelay: '160ms' }}>
        {ONBOARDING_JOURNEY_STEPS.map((step, index) => {
          const isCurrent = index === 0;
          return (
            <div key={step.title} className={`flex items-start gap-3.5 ${index > 0 ? 'mt-4' : ''}`}>
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  isCurrent
                    ? 'bg-[#1B3A2D] text-white shadow-[0_2px_8px_-2px_rgba(27,58,45,0.5)]'
                    : 'border border-[#1B3A2D]/15 text-[#1B3A2D]/40'
                }`}
              >
                {index + 1}
              </span>
              <div>
                <p
                  className={`text-[15px] font-semibold leading-snug ${
                    isCurrent ? 'text-[#1B3A2D]' : 'text-[#1B3A2D]/60'
                  }`}
                >
                  {step.title}
                </p>
                <p
                  className={`mt-0.5 text-[13.5px] leading-relaxed ${
                    isCurrent ? 'text-[#6B7A72]' : 'text-[#6B7A72]/75'
                  }`}
                >
                  {step.body}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <p
        className="mef-animate-in mt-5 text-center text-[13px] text-[#6B7A72]/80"
        style={{ animationDelay: '220ms' }}
      >
        {EXPECTATIONS_COPY.timeCaption}
      </p>

      <button
        type="button"
        onClick={onStart}
        className="mef-animate-in mef-focus-ring mt-4 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110"
        style={{ animationDelay: '260ms' }}
      >
        {EXPECTATIONS_COPY.cta}
      </button>
    </div>
  );
}
