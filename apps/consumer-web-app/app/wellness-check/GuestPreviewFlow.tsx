'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { buildGuestPreviewInsight, type GuestPreviewInsight } from '@/lib/guest-preview/insights';
import {
  getGuestPreviewState,
  getOrCreateGuestVisitorToken,
  setGuestAnswer,
  setGuestStep,
  markGuestQuizComplete,
} from '@/lib/guest-preview/storage';
import { complete, saveAnswers, start } from '@/lib/guest-preview/client';
import {
  GUEST_WELLNESS_CHECK_QUESTIONS,
  toAnswerSlug,
  toAnswerSlugs,
} from '@/lib/guest-preview/questions';
import {
  EMPTY_GUEST_PREVIEW_ANSWERS,
  GUEST_PREVIEW_QUESTION_ORDER,
  type GuestPreviewAnswers,
} from '@/lib/guest-preview/types';
import { useBleedTap } from '@/lib/motion/useBleedTap';
import { triggerHaptic } from '@/lib/haptics';

const SHELL =
  'min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]';
const CONTAINER =
  'mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8 sm:px-6 md:max-w-2xl md:px-10';
const HEADING =
  'font-[family-name:var(--font-cormorant-garamond)] text-3xl leading-tight text-[#1B3A2D] md:text-[2.5rem]';
const BODY = 'mt-4 space-y-3 text-[15px] leading-relaxed text-[#4F645A]';
const PRIMARY_BUTTON =
  'mef-focus-ring mef-press mt-10 flex w-full items-center justify-center rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-60';
const SECONDARY_BUTTON =
  'mef-focus-ring mef-press mt-3 flex w-full items-center justify-center rounded-full border border-[#1B3A2D]/20 bg-white px-6 py-3.5 text-base font-semibold text-[#1B3A2D] transition hover:border-[#1B3A2D]/40';

type Screen = 'welcome' | 'quiz' | 'results' | 'cta';

/**
 * The pre-signup Quick Wellness Check, hosted at /wellness-check for
 * first-time visitors reached via marketing/campaign links (not the
 * default login route). Mirrors app/welcome/WelcomeFlow.tsx's visual
 * language (same style constants, same Progress-dots pattern) without
 * touching that file. Unlike WelcomeFlow, progress here is persisted to
 * localStorage on every answer (see lib/guest-preview/storage.ts), since
 * surviving a refresh mid-quiz is a hard requirement for guests who have
 * no account yet to fall back on.
 *
 * WHERE THE ANSWERS GO, SINCE 2026-09-04. Alongside the local copy, each
 * answer is written to guest_wellness_check_answers through
 * /api/guest-preview: a fenced table whose provenance is a check constraint
 * rather than a convention (migration 202). That is the whole destination.
 * These answers are never copied into a check-in, an onboarding submission,
 * an assessment or a scoring input, and there is no promotion path at all.
 * Until 2026-09-04 they were written straight into a real daily_checkins
 * row on the first page load after signup, which made a stranger's
 * pre-account guesses indistinguishable from a Daily Reset she had sat down
 * and completed.
 *
 * A FAILED WRITE NEVER STOPS HER. Every call in lib/guest-preview/client.ts
 * resolves rather than rejecting, and the screen runs entirely off its own
 * local state, so a guest with no network still finishes and still reads
 * her result. The token is minted when she starts the quiz, not when the
 * page loads, so somebody who reads the welcome screen and leaves creates
 * nothing anywhere.
 */
export function GuestPreviewFlow() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<GuestPreviewAnswers>(EMPTY_GUEST_PREVIEW_ANSWERS);
  const [insight, setInsight] = useState<GuestPreviewInsight | null>(null);
  const visitorToken = useRef<string | null>(null);

  useEffect(() => {
    const saved = getGuestPreviewState();
    if (!saved) return;

    setAnswers(saved.answers);
    if (saved.quizComplete) {
      setInsight(buildGuestPreviewInsight(saved.answers));
      setScreen('results');
    } else if (saved.step > 0) {
      setQuestionIndex(Math.min(saved.step, GUEST_PREVIEW_QUESTION_ORDER.length - 1));
      setScreen('quiz');
    }
  }, []);

  function startQuiz() {
    visitorToken.current = getOrCreateGuestVisitorToken();
    if (visitorToken.current) start(visitorToken.current);
    setScreen('quiz');
  }

  function answerQuestion(
    field: keyof GuestPreviewAnswers,
    value: GuestPreviewAnswers[typeof field]
  ) {
    const updatedAnswers = { ...answers, [field]: value };
    setAnswers(updatedAnswers);
    setGuestAnswer(field, value);

    // A refresh mid-quiz can resume without ever passing through the
    // welcome screen, so the token is read here too rather than assumed to
    // have been minted by startQuiz.
    const token = visitorToken.current ?? getOrCreateGuestVisitorToken();
    visitorToken.current = token;

    const nextIndex = questionIndex + 1;
    if (nextIndex >= GUEST_PREVIEW_QUESTION_ORDER.length) {
      markGuestQuizComplete();
      if (token) complete(token, toAnswerSlugs(updatedAnswers));
      setInsight(buildGuestPreviewInsight(updatedAnswers));
      setScreen('results');
    } else {
      if (token) saveAnswers(token, toAnswerSlug(field, value));
      setQuestionIndex(nextIndex);
      setGuestStep(nextIndex);
    }
  }

  return (
    <div className={SHELL}>
      <main className={CONTAINER}>
        {screen === 'welcome' && <WelcomeScreen onStart={startQuiz} />}
        {screen === 'quiz' && (
          <QuizScreen questionIndex={questionIndex} answers={answers} onAnswer={answerQuestion} />
        )}
        {screen === 'results' && insight && (
          <ResultsScreen insight={insight} onContinue={() => setScreen('cta')} />
        )}
        {screen === 'cta' && <CtaScreen />}
      </main>
    </div>
  );
}

function Progress({ step, total }: { step: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={step + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Question ${step + 1} of ${total}`}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: total }, (_, index) => index).map((dot) => (
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

function WelcomeScreen({ onStart }: { onStart: () => void }) {
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
      <h1 className={HEADING}>Welcome to Rooted Reset</h1>
      <div className={BODY}>
        <p>
          Rooted Reset helps you understand your energy, sleep, stress, movement, and more so you
          can see how your wellness fits together, day to day.
        </p>
        <p>Take a quick, no-account-needed wellness check to see how it works.</p>
      </div>
      <button type="button" onClick={onStart} className={PRIMARY_BUTTON}>
        Take a Quick Wellness Check
      </button>
      <Link href="/login" className={SECONDARY_BUTTON}>
        Log In
      </Link>
      <Link
        href="/signup"
        className="mef-focus-ring mef-press mt-4 text-sm font-medium text-[#6B7A72] underline underline-offset-2"
      >
        Create Account
      </Link>
    </div>
  );
}

/**
 * Micro-Interactions (Prompt 6): the quiz answer tile already had its own
 * press feedback (active:scale-95 / hover:scale-[1.03] / scale-105 when
 * selected) before this change — all kept exactly as-is. This retrofit
 * only layers on the app's one selection-ripple language (useBleedTap +
 * mef-bleed-fill, the same mechanics as TapBleedTile in
 * components/checkin/scales/shared.tsx) and a haptic tick on select,
 * extracted out of the .map() above since useBleedTap() can't be called
 * from inside a loop body.
 */
function GuestPreviewOptionTile({
  label,
  isSelected,
  onSelect,
}: {
  label: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { onPointerDown, bleedStyle } = useBleedTap();

  function handleClick() {
    triggerHaptic();
    onSelect();
  }

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onPointerDown={onPointerDown}
      onClick={handleClick}
      style={bleedStyle}
      className={`mef-focus-ring relative isolate overflow-hidden rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 ease-out active:scale-95 ${
        isSelected
          ? 'scale-105 border-transparent text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)]'
          : 'border-[#1B3A2D]/10 bg-white text-[#6B7A72] hover:scale-[1.03] hover:border-[#1B3A2D]/25 hover:text-[#1B3A2D]'
      } ${isSelected ? 'mef-bleed-active' : ''}`}
    >
      <span aria-hidden="true" className="mef-bleed-fill" style={{ backgroundColor: '#1B3A2D' }} />
      <span className="relative z-10">{label}</span>
    </button>
  );
}

function QuizScreen({
  questionIndex,
  answers,
  onAnswer,
}: {
  questionIndex: number;
  answers: GuestPreviewAnswers;
  onAnswer: (
    field: keyof GuestPreviewAnswers,
    value: GuestPreviewAnswers[keyof GuestPreviewAnswers]
  ) => void;
}) {
  // questionIndex is always clamped to a valid position by the caller
  // (GuestPreviewFlow's effect and answerQuestion), so this index access is
  // always in bounds — the array just isn't a fixed-length tuple TypeScript
  // can prove that from statically.
  const field = GUEST_PREVIEW_QUESTION_ORDER[questionIndex] as keyof GuestPreviewAnswers;
  const question = GUEST_WELLNESS_CHECK_QUESTIONS[field];
  const currentValue = answers[field];

  return (
    <div className="flex flex-1 flex-col">
      <Progress step={questionIndex} total={GUEST_PREVIEW_QUESTION_ORDER.length} />
      <h1 className={`${HEADING} mt-8`}>{question.prompt}</h1>
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={question.prompt}>
        {question.options.map((option) => (
          <GuestPreviewOptionTile
            key={String(option.value)}
            label={option.label}
            isSelected={currentValue === option.value}
            onSelect={() => onAnswer(field, option.value as never)}
          />
        ))}
      </div>
    </div>
  );
}

function ResultsScreen({
  insight,
  onContinue,
}: {
  insight: GuestPreviewInsight;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <h1 className={HEADING}>{insight.headline}</h1>
      <div className={BODY}>
        <p>{insight.observation}</p>
        <p>{insight.disclaimer}</p>
      </div>
      <button type="button" onClick={onContinue} className={PRIMARY_BUTTON}>
        Show me how to save this
      </button>
    </div>
  );
}

function CtaScreen() {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <h1 className={HEADING}>Save Your Wellness Snapshot</h1>
      <div className={BODY}>
        <p>
          Create your free account to save today&apos;s results, unlock deeper assessments like the
          Nutrition &amp; Lifestyle Questionnaire, and begin tracking your progress over time.
        </p>
      </div>
      <Link href="/signup" className={PRIMARY_BUTTON}>
        Create Free Account
      </Link>
      <Link href="/login" className={SECONDARY_BUTTON}>
        Log In
      </Link>
    </div>
  );
}
