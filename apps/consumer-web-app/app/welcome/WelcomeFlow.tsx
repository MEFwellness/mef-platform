'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Activity, Check, ClipboardList, Compass, TrendingUp } from 'lucide-react';
import { completeWelcomeFlow } from '../actions/welcome';
import { WELCOME_GOALS, SOMETHING_ELSE_KEY } from '@/lib/welcome/goals';

const SHELL =
  'min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]';
const CONTAINER =
  'mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8 sm:px-6 md:max-w-2xl md:px-10';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-[2.5rem]';
const BODY = 'mt-4 space-y-3 text-[15px] leading-relaxed text-[#6B7A72]';
const PRIMARY_BUTTON =
  'mt-10 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-60';
const ERROR_BANNER = 'mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700';
const TOTAL_STEPS = 4;

const HEALTH_CARDS = [
  { Icon: Activity, label: 'Understand your current health' },
  { Icon: TrendingUp, label: 'Identify meaningful patterns' },
  { Icon: ClipboardList, label: 'Build your wellness profile' },
  { Icon: Compass, label: 'Receive personalized next steps' },
] as const;

/**
 * The four-screen premium welcome experience, gated to eligible new
 * members by app/welcome/page.tsx before this ever renders. All navigation
 * between screens is local component state, not a URL step param, so a hard
 * refresh mid-flow simply re-enters at Screen 1 (the parent page's
 * eligibility check still passes, since nothing is marked complete until
 * Screen 4's final button), the same "no persisted mid-flow step" choice
 * already used by the Body Assessment wizard (AssessmentWizard.tsx).
 */
export function WelcomeFlow() {
  const [step, setStep] = useState(1);
  const [goals, setGoals] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function toggleGoal(key: string) {
    setGoals((current) =>
      current.includes(key) ? current.filter((goal) => goal !== key) : [...current, key]
    );
  }

  function goNext() {
    if (step === 3 && goals.length === 0) {
      setError('Please select at least one area to continue.');
      return;
    }
    setError('');
    setStep((current) => Math.min(current + 1, TOTAL_STEPS));
  }

  function goBack() {
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
      <main className={CONTAINER}>
        <Progress step={step} />

        <div key={step} className="mef-animate-in mt-8 flex flex-1 flex-col">
          {step === 1 && <ScreenOne onNext={goNext} />}
          {step === 2 && <ScreenTwo onNext={goNext} />}
          {step === 3 && (
            <ScreenThree
              goals={goals}
              otherText={otherText}
              onToggleGoal={toggleGoal}
              onOtherTextChange={setOtherText}
              onNext={goNext}
              error={error}
            />
          )}
          {step === 4 && (
            <ScreenFour onFinish={handleFinish} submitting={submitting} error={error} />
          )}
        </div>

        {step > 1 && (
          <button
            type="button"
            onClick={goBack}
            className="mef-focus-ring mt-6 self-start rounded-full px-2 py-2 text-sm font-medium text-[#6B7A72] underline underline-offset-2"
          >
            Back
          </button>
        )}
      </main>
    </div>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={step}
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
      aria-label={`Step ${step} of ${TOTAL_STEPS}`}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1).map((dot) => (
        <span
          key={dot}
          aria-hidden="true"
          className={`h-1.5 w-8 rounded-full transition-colors ${
            dot <= step ? 'bg-[#1B3A2D]' : 'bg-[#1B3A2D]/10'
          }`}
        />
      ))}
    </div>
  );
}

function ScreenOne({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center text-center">
      <div className="mx-auto mb-2">
        <Image
          src="/images/rooted-reset-logo.png"
          alt="Rooted Reset by MEF Wellness"
          width={44}
          height={44}
          style={{ objectFit: 'contain', borderRadius: '10px' }}
        />
      </div>
      <h1 className={HEADING}>Welcome to MEF Wellness</h1>
      <div className={BODY}>
        <p>Every person has a unique story.</p>
        <p>
          Our goal is to understand how your movement, sleep, stress, nutrition, pain, energy, and
          daily habits work together so we can personalize your experience over time.
        </p>
      </div>
      <button type="button" onClick={onNext} className={`mef-focus-ring ${PRIMARY_BUTTON}`}>
        Get Started
      </button>
    </div>
  );
}

function ScreenTwo({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <h1 className={HEADING}>Your health is connected</h1>
      <div className={BODY}>
        <p>Many health concerns do not exist in isolation.</p>
        <p>
          MEF Wellness helps you understand how different areas of your health may influence one
          another so you can make more informed decisions about your wellness.
        </p>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3">
        {HEALTH_CARDS.map(({ Icon, label }) => (
          <div
            key={label}
            className="rounded-2xl bg-white p-4 text-center shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]"
          >
            <Icon className="mx-auto h-6 w-6 text-[#1B3A2D]" strokeWidth={1.5} aria-hidden="true" />
            <p className="mt-2 text-xs font-semibold leading-snug text-[#1B3A2D]">{label}</p>
          </div>
        ))}
      </div>
      <button type="button" onClick={onNext} className={`mef-focus-ring ${PRIMARY_BUTTON}`}>
        Continue
      </button>
    </div>
  );
}

function ScreenThree({
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
      <h1 className={HEADING}>What brought you here today?</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[#6B7A72]">
        Select every area you would like help with.
      </p>

      <div
        role="group"
        aria-label="Areas you would like help with"
        className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3"
      >
        {WELCOME_GOALS.map(({ key, label }) => {
          const isSelected = goals.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggleGoal(key)}
              className={`mef-focus-ring flex items-center justify-between gap-2 rounded-2xl border px-4 py-4 text-left text-sm font-semibold transition-colors ${
                isSelected
                  ? 'border-[#1B3A2D] bg-[#1B3A2D] text-white'
                  : 'border-[#1B3A2D]/12 bg-white text-[#1B3A2D]/70 hover:border-[#1B3A2D]/30'
              }`}
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
            className="mef-focus-ring mt-2 w-full rounded-2xl border border-[#1B3A2D]/10 p-3 text-sm text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
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

function ScreenFour({
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
