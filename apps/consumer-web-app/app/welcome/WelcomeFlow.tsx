'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import Image from 'next/image';
import { Activity, ArrowLeft, Check, ClipboardList, Compass, TrendingUp } from 'lucide-react';
import { completeWelcomeFlow, markWelcomeIntroSeen } from '../actions/welcome';
import { WELCOME_GOALS, SOMETHING_ELSE_KEY } from '@/lib/welcome/goals';

const SHELL =
  'min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]';
const CONTAINER =
  'relative mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8 sm:px-6 md:max-w-2xl md:px-10';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-[2.5rem]';
const DISPLAY_HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-4xl uppercase leading-tight tracking-wide text-[#1B3A2D] md:text-6xl';
const BODY = 'mt-4 space-y-3 text-[15px] leading-relaxed text-[#6B7A72]';
const PRIMARY_BUTTON =
  'mt-10 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-60';
const ERROR_BANNER = 'mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700';

/**
 * 9 pages total: 7 timed cinematic pages (logo/welcome, story, "your health
 * is connected", 4 benefit cards — no buttons, auto-advance) followed by 2
 * interactive pages (goal selection, then the existing final screen) that
 * behave exactly as the flow always has. GOAL_SELECTION_STEP is exported so
 * app/welcome/page.tsx can send a returning member straight there instead
 * of replaying the intro.
 */
export const GOAL_SELECTION_STEP = 8;
const FINAL_STEP = 9;
const TOTAL_STEPS = 9;

const HEALTH_CARDS = [
  { Icon: Activity, label: 'Understand your current health' },
  { Icon: TrendingUp, label: 'Identify meaningful patterns' },
  { Icon: ClipboardList, label: 'Build your wellness profile' },
  { Icon: Compass, label: 'Receive personalized next steps' },
] as const;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  return reduced;
}

/**
 * The four-screen premium welcome experience, gated to eligible new
 * members by app/welcome/page.tsx before this ever renders. All navigation
 * between screens is local component state, not a URL step param, so a hard
 * refresh mid-flow simply re-enters at Screen 1 (the parent page's
 * eligibility check still passes, since nothing is marked complete until
 * Screen 4's final button), the same "no persisted mid-flow step" choice
 * already used by the Body Assessment wizard (AssessmentWizard.tsx).
 *
 * initialStep lets app/welcome/page.tsx drop a returning member straight
 * onto GOAL_SELECTION_STEP once profiles.welcome_intro_seen_at is set, so
 * the cinematic Pages 1-7 only ever play once.
 */
export function WelcomeFlow({ initialStep = 1 }: { initialStep?: number }) {
  const [step, setStep] = useState(initialStep);
  const [goals, setGoals] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const reducedMotion = useReducedMotion();
  const introMarkedRef = useRef(false);

  useEffect(() => {
    if (step >= GOAL_SELECTION_STEP && !introMarkedRef.current) {
      introMarkedRef.current = true;
      void markWelcomeIntroSeen();
    }
  }, [step]);

  function toggleGoal(key: string) {
    setGoals((current) =>
      current.includes(key) ? current.filter((goal) => goal !== key) : [...current, key]
    );
  }

  function advance() {
    setStep((current) => Math.min(current + 1, TOTAL_STEPS));
  }

  function skipToGoals() {
    setError('');
    setStep(GOAL_SELECTION_STEP);
  }

  function goNext() {
    if (step === GOAL_SELECTION_STEP && goals.length === 0) {
      setError('Please select at least one area to continue.');
      return;
    }
    setError('');
    setStep((current) => Math.min(current + 1, TOTAL_STEPS));
  }

  /**
   * Used by every backward-navigation control in the flow: the "Back" text
   * link on Pages 8-9, and the small back arrow / swipe-right on Pages
   * 2-7 (passed down as `onBack`). Floors at 1 defensively, though nothing
   * ever actually calls it while on Page 1 — Page 1 renders no back
   * control of any kind.
   */
  function goBackOne() {
    setError('');
    setStep((current) => Math.max(current - 1, 1));
  }

  async function handleFinish() {
    setSubmitting(true);
    setError('');
    const result = await completeWelcomeFlow(goals, otherText || null);
    // Only reached on failure: success redirects from inside the action.
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <div className={SHELL}>
      {/* Page 1's deep-green title-card background. A sibling of <main>,
          not nested inside PageLogoWelcome, so it can cover the entire
          viewport (including the progress bar) rather than just the page's
          own content area. <main>'s own `relative` (see CONTAINER) is what
          lets it paint above this fixed layer — same DOM-order-among-
          positioned-siblings mechanism as HomeHero.tsx's hero chrome. */}
      {step === 1 && !reducedMotion && (
        <div aria-hidden="true" className="mef-hero-bg-fade pointer-events-none fixed inset-0" />
      )}
      <main className={CONTAINER}>
        <Progress step={step} />

        <div
          key={step}
          className={`mt-8 flex flex-1 flex-col ${step === FINAL_STEP ? 'mef-animate-in' : ''}`}
        >
          {/* Pages 1-7 are timed cinematic pages (own entrance sequence,
              auto-advance, tap-anywhere, swipe, Skip, and — from Page 2 on
              — a back control) rendered via CinematicPage. Pages 8-9 are
              unchanged, interactive, button-driven screens, so the wrapper
              only applies mef-animate-in for Page 9 to avoid double-
              animating Page 8's own internal staggered sequence. */}
          {step === 1 && (
            <PageLogoWelcome onAdvance={advance} onSkip={skipToGoals} reducedMotion={reducedMotion} />
          )}
          {step === 2 && (
            <PageStory
              onAdvance={advance}
              onBack={goBackOne}
              onSkip={skipToGoals}
              reducedMotion={reducedMotion}
            />
          )}
          {step === 3 && (
            <PageConnected
              onAdvance={advance}
              onBack={goBackOne}
              onSkip={skipToGoals}
              reducedMotion={reducedMotion}
            />
          )}
          {step >= 4 && step <= 7 && (
            // step is runtime-guarded to 4-7 above, so index 0-3 is always
            // in range; noUncheckedIndexedAccess still types it as possibly
            // undefined, hence the assertion.
            <PageBenefitCard
              card={HEALTH_CARDS[step - 4]!}
              onAdvance={advance}
              onBack={goBackOne}
              onSkip={skipToGoals}
              reducedMotion={reducedMotion}
            />
          )}
          {step === GOAL_SELECTION_STEP && (
            <PageGoalSelection
              goals={goals}
              otherText={otherText}
              onToggleGoal={toggleGoal}
              onOtherTextChange={setOtherText}
              onNext={goNext}
              error={error}
            />
          )}
          {step === FINAL_STEP && (
            <PageFinal onFinish={handleFinish} submitting={submitting} error={error} />
          )}
        </div>

        {(step === GOAL_SELECTION_STEP || step === FINAL_STEP) && (
          <button
            type="button"
            onClick={goBackOne}
            className="mef-focus-ring mt-6 self-start rounded-full px-2 py-2 text-sm font-medium text-[#6B7A72] underline underline-offset-2"
          >
            Back
          </button>
        )}
      </main>
    </div>
  );
}

/**
 * A thin fill bar rather than 9 discrete dots — a longer sequence reads
 * better as continuous progress than as a row of tiny marks.
 */
function Progress({ step }: { step: number }) {
  const percent = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
      aria-label={`Step ${step} of ${TOTAL_STEPS}`}
      className="h-1 w-full overflow-hidden rounded-full bg-[#1B3A2D]/10"
    >
      <div
        className="h-full rounded-full bg-[#1B3A2D] transition-all duration-500 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** Horizontal drag distance, in px, before a pointer gesture counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD_PX = 50;

/**
 * Shared shell for the 7 timed cinematic pages: arms an auto-advance timer
 * (skipped entirely under reduced motion), makes the whole page a
 * tap-or-swipe target, and renders the required Skip control plus — from
 * Page 2 on, when `onBack` is passed — a small back arrow. A single
 * pointerdown/pointerup pair (not a plain onClick) drives tap-to-advance
 * *and* swipe detection together: a short drag is a tap (advance), a long
 * enough horizontal drag is a swipe (right = back, left = advance),
 * whichever direction wins. Under reduced motion, none of that pointer
 * handling is attached at all — a visible Continue button (and, when
 * `onBack` exists, a "Back" link above it) replaces it entirely, per the
 * "show everything immediately, navigate manually" requirement.
 * `advancedRef` guards against two triggers firing for the same gesture
 * (e.g. the timer and a tap), and against back/advance both firing.
 */
function CinematicPage({
  durationMs,
  onAdvance,
  onBack,
  onSkip,
  reducedMotion,
  children,
}: {
  durationMs: number;
  onAdvance: () => void;
  onBack?: (() => void) | undefined;
  onSkip: () => void;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const advancedRef = useRef(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);

  function handleAdvance() {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onAdvance();
  }

  function handleBack() {
    if (advancedRef.current || !onBack) return;
    advancedRef.current = true;
    onBack();
  }

  useEffect(() => {
    if (reducedMotion) return undefined;
    const timer = setTimeout(() => {
      if (advancedRef.current) return;
      advancedRef.current = true;
      onAdvance();
    }, durationMs);
    return () => clearTimeout(timer);
  }, [reducedMotion, durationMs, onAdvance]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (!start) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) {
        handleBack();
      } else {
        handleAdvance();
      }
      return;
    }

    // Not a swipe — a plain tap anywhere else still advances.
    handleAdvance();
  }

  return (
    <div
      className={`relative flex flex-1 flex-col ${reducedMotion ? '' : 'cursor-pointer'}`}
      onPointerDown={reducedMotion ? undefined : handlePointerDown}
      onPointerUp={reducedMotion ? undefined : handlePointerUp}
    >
      {!reducedMotion && onBack && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            handleBack();
          }}
          aria-label="Back"
          className="mef-focus-ring absolute left-0 top-0 z-10 rounded-full p-2 text-[#1B3A2D]"
        >
          <ArrowLeft className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}

      <button
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onSkip();
        }}
        className="mef-focus-ring absolute right-0 top-0 z-10 rounded-full px-3 py-1.5 text-xs font-medium text-[#6B7A72]/70 underline underline-offset-2"
      >
        Skip
      </button>

      {children}

      {reducedMotion && (
        <>
          {onBack && (
            <button
              type="button"
              onClick={() => handleBack()}
              className="mef-focus-ring mt-10 self-start rounded-full px-2 py-2 text-sm font-medium text-[#6B7A72] underline underline-offset-2"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => handleAdvance()}
            className={`mef-focus-ring ${PRIMARY_BUTTON} ${onBack ? '!mt-4' : ''}`}
          >
            Continue
          </button>
        </>
      )}
    </div>
  );
}

type CinematicPageProps = {
  onAdvance: () => void;
  onBack?: (() => void) | undefined;
  onSkip: () => void;
  reducedMotion: boolean;
};

/**
 * The title card. No `onBack` (Page 1 never renders a back control of any
 * kind) — plain `CinematicPageProps` minus that field would still let a
 * caller pass one by mistake, so this destructures only what it uses.
 * Timing: logo 2000ms (the background fade, mef-hero-bg-fade in
 * globals.css, is timed to land inside the back half of that same window —
 * see WelcomeFlow's own render for the fixed background layer itself, not
 * here), then headline 1000ms, then a 2000ms hold — 5000ms total, at the
 * upper end of the requested "roughly 4-5 seconds" (a straight 2s + 1s +
 * literal 3s hold would have landed at 6s; shortened the hold instead of
 * the more specifically-numbered logo/headline durations, confirmed with
 * the user).
 */
function PageLogoWelcome({ onAdvance, onSkip, reducedMotion }: CinematicPageProps) {
  const logoMs = 2000;
  const headlineDelay = 2000;
  const headlineMs = 1000;
  const holdMs = 2000;
  const totalMs = headlineDelay + headlineMs + holdMs;

  return (
    <CinematicPage
      durationMs={totalMs}
      onAdvance={onAdvance}
      onSkip={onSkip}
      reducedMotion={reducedMotion}
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div
          className={`mb-4 ${reducedMotion ? '' : 'mef-title-logo-in'}`}
          style={reducedMotion ? undefined : { animationDuration: `${logoMs}ms` }}
        >
          <Image
            src="/images/rooted-reset-logo.png"
            alt="Rooted Reset by MEF Wellness"
            width={56}
            height={56}
            style={{ objectFit: 'contain', borderRadius: '12px' }}
          />
        </div>
        <h1
          className={`${HEADING} ${reducedMotion ? '' : 'mef-animate-in'}`}
          style={
            reducedMotion
              ? undefined
              : { animationDelay: `${headlineDelay}ms`, animationDuration: `${headlineMs}ms` }
          }
        >
          Welcome to MEF Wellness
        </h1>
      </div>
    </CinematicPage>
  );
}

const STORY_TEXT = 'Every person has a unique story.';
const STORY_PARAGRAPH =
  'Our goal is to understand how your movement, sleep, stress, nutrition, pain, energy, and daily habits work together so we can personalize your experience over time.';

function PageStory({ onAdvance, onBack, onSkip, reducedMotion }: CinematicPageProps) {
  const msPerChar = 60;
  const typewriterMs = STORY_TEXT.length * msPerChar;
  const pauseMs = 2000;
  const paragraphMs = 700;
  const holdMs = 5000;
  const totalMs = typewriterMs + pauseMs + paragraphMs + holdMs;

  const [charCount, setCharCount] = useState(reducedMotion ? STORY_TEXT.length : 0);
  const [showParagraph, setShowParagraph] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) return undefined;
    let count = 0;
    const interval = setInterval(() => {
      count += 1;
      setCharCount(count);
      if (count >= STORY_TEXT.length) clearInterval(interval);
    }, msPerChar);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return undefined;
    const timer = setTimeout(() => setShowParagraph(true), typewriterMs + pauseMs);
    return () => clearTimeout(timer);
  }, [reducedMotion, typewriterMs, pauseMs]);

  return (
    <CinematicPage
      durationMs={totalMs}
      onAdvance={onAdvance}
      onBack={onBack}
      onSkip={onSkip}
      reducedMotion={reducedMotion}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-2 text-center">
        <p className={`${HEADING} min-h-[2.5em]`}>
          {reducedMotion ? STORY_TEXT : STORY_TEXT.slice(0, charCount)}
          {!reducedMotion && charCount < STORY_TEXT.length && (
            <span className="mef-typewriter-caret" aria-hidden="true" />
          )}
        </p>
        {showParagraph && (
          <p
            className={`mt-6 max-w-sm text-[15px] leading-relaxed text-[#6B7A72] ${
              reducedMotion ? '' : 'mef-scale-fade-in'
            }`}
            style={reducedMotion ? undefined : { animationDuration: `${paragraphMs}ms` }}
          >
            {STORY_PARAGRAPH}
          </p>
        )}
      </div>
    </CinematicPage>
  );
}

function PageConnected({ onAdvance, onBack, onSkip, reducedMotion }: CinematicPageProps) {
  const revealMs = 1500;
  const holdMs = 3000;
  const totalMs = revealMs + holdMs;

  return (
    <CinematicPage
      durationMs={totalMs}
      onAdvance={onAdvance}
      onBack={onBack}
      onSkip={onSkip}
      reducedMotion={reducedMotion}
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1
          className={`${DISPLAY_HEADING} ${reducedMotion ? '' : 'mef-scale-fade-in'}`}
          style={reducedMotion ? undefined : { animationDuration: `${revealMs}ms` }}
        >
          Your health is connected
        </h1>
      </div>
    </CinematicPage>
  );
}

function PageBenefitCard({
  card,
  onAdvance,
  onBack,
  onSkip,
  reducedMotion,
}: CinematicPageProps & { card: (typeof HEALTH_CARDS)[number] }) {
  const revealMs = 600;
  const holdMs = 3000;
  const totalMs = revealMs + holdMs;
  const { Icon, label } = card;

  return (
    <CinematicPage
      durationMs={totalMs}
      onAdvance={onAdvance}
      onBack={onBack}
      onSkip={onSkip}
      reducedMotion={reducedMotion}
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div
          className={`flex flex-col items-center gap-4 rounded-3xl bg-white px-10 py-12 shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)] ${
            reducedMotion ? '' : 'mef-scale-fade-in'
          }`}
          style={reducedMotion ? undefined : { animationDuration: `${revealMs}ms` }}
        >
          <Icon className="h-12 w-12 text-[#1B3A2D]" strokeWidth={1.5} aria-hidden="true" />
          <p className={`${HEADING} text-2xl`}>{label}</p>
        </div>
      </div>
    </CinematicPage>
  );
}

function PageGoalSelection({
  goals,
  otherText,
  onToggleGoal,
  onOtherTextChange,
  onNext,
  error,
}: {
  goals: string[];
  otherText: string;
  onToggleGoal: (key: string) => void;
  onOtherTextChange: (value: string) => void;
  onNext: () => void;
  error: string;
}) {
  const showOtherField = goals.includes(SOMETHING_ELSE_KEY);

  return (
    <div className="flex flex-1 flex-col">
      <h1 className={`mef-fade-in ${HEADING}`}>What brought you here today?</h1>
      <p
        className="mef-fade-in mt-3 text-[15px] leading-relaxed text-[#6B7A72]"
        style={{ animationDelay: '150ms' }}
      >
        Select every area you would like help with.
      </p>

      <div
        role="group"
        aria-label="Areas you would like help with"
        className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3"
      >
        {WELCOME_GOALS.map(({ key, label }, index) => {
          const isSelected = goals.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggleGoal(key)}
              className={`mef-focus-ring mef-animate-in flex items-center justify-between gap-2 rounded-2xl border px-4 py-4 text-left text-sm font-semibold transition-colors ${
                isSelected
                  ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                  : 'border-[#1B3A2D]/12 bg-white text-[#1B3A2D]/70 hover:border-[#1B3A2D]/30'
              }`}
              style={{ animationDelay: `${300 + Math.min(index, 7) * 70}ms` }}
            >
              {label}
              {isSelected && (
                <Check className="h-4 w-4 shrink-0" strokeWidth={3} aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      {showOtherField && (
        <div className="mt-4">
          <label
            htmlFor="welcome-goal-other"
            className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]"
          >
            Tell us more (optional)
          </label>
          <input
            id="welcome-goal-other"
            type="text"
            value={otherText}
            onChange={(event) => onOtherTextChange(event.target.value)}
            className="mef-focus-ring mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
            placeholder="What else brought you here?"
          />
        </div>
      )}

      {error && (
        <p role="alert" className={ERROR_BANNER}>
          {error}
        </p>
      )}

      <button type="button" onClick={onNext} className={`mef-focus-ring ${PRIMARY_BUTTON}`}>
        Continue
      </button>
    </div>
  );
}

function PageFinal({
  onFinish,
  submitting,
  error,
}: {
  onFinish: () => void;
  submitting: boolean;
  error: string;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <h1 className={HEADING}>Let&apos;s Begin With Today</h1>
      <div className={BODY}>
        <p>Your first check-in helps establish your starting point.</p>
        <p>There are no perfect answers.</p>
        <p>Simply answer honestly based on how you feel today.</p>
        <p>
          As you continue using MEF Wellness, your check-ins, questionnaires, movement information,
          and daily habits will help create a more personalized experience.
        </p>
      </div>

      {error && (
        <p role="alert" className={ERROR_BANNER}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onFinish}
        disabled={submitting}
        className={`mef-focus-ring ${PRIMARY_BUTTON}`}
      >
        {submitting ? 'Saving...' : 'Start My First Check-In'}
      </button>
    </div>
  );
}
