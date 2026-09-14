'use client';

/**
 * Rooted Reset Fuel Pattern Assessment — the take flow.
 *
 * Intro, then twenty four questions one at a time, then a short reveal.
 * The runtime underneath is the shared one (lib/assessment-runtime): this
 * component holds a beat and an index, and every answer is saved the
 * moment she taps it, so closing the tab and coming back lands her on the
 * first question she has not answered.
 *
 * CONTINUE IS THE STEP, ALWAYS. Tapping an answer selects it and nothing
 * else: no auto advance, in any mode, at any point, per the standing rule
 * the check-in's own navigation fix set. She can change her mind, and she
 * moves when she says so.
 *
 * A PROGRESS LINE THAT DOES NOT SHOUT. One hairline of gold across the
 * top, filling as she goes, with the position said once in small text.
 * There is no percentage, no counter animation and no celebration at
 * milestones.
 */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { UnifiedAssessmentQuestion } from '@mef/shared-types-contracts';
import type { SessionAnswers } from '@/lib/assessment-runtime/types';
import { markClosingBeat, type RuntimePhase } from '@/lib/assessment-runtime/closing';
import {
  completeFpaAssessmentAction,
  getMyFpaRevealAction,
  submitFpaAnswerAction,
} from '@/app/actions/fuelPattern';
import { FPA_PLATE_QUESTION_KEY, FPA_QUESTION_COUNT } from '@/lib/fuel-pattern/constants';
import { FPA_INTRO_COPY } from '@/lib/fuel-pattern/copy';
import type { FuelPattern } from '@/lib/fuel-pattern/types';
import { IntroReveal } from '@/components/IntroReveal';
import { ExperienceHomeLink } from '@/components/ExperienceHomeLink';
import { ROOT_FINISHING_LABEL } from '@/lib/reveal/copy';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import {
  FuelPatternQuestionScreen,
  parseFpaOptions,
} from './FuelPatternQuestionScreen';
import { FuelPatternReveal } from './FuelPatternReveal';

type Beat = 'intro' | 'questions' | 'finishing' | 'reveal';

/**
 * The taker's own marker in the take URL. The shared closing vocabulary
 * has four beats for the experiences that end on a four beat closing;
 * this instrument's reveal is two beats and only the second one is a
 * PLACE, so it writes the last of them and reads it back to mean "the
 * pause has already been had".
 */
const REVEAL_MARKER = 'close';

type Props = {
  sessionId: string;
  questions: UnifiedAssessmentQuestion[];
  initialAnswers: SessionAnswers;
  phase: RuntimePhase;
  /** Her stored pattern, when the server already found this sitting finished. */
  initialPattern: FuelPattern | null;
  /** True when the take URL says she is already past the pause. */
  startAtPattern: boolean;
};

export function FuelPatternTaker({
  sessionId,
  questions,
  initialAnswers,
  phase,
  initialPattern,
  startAtPattern,
}: Props) {
  const ordered = useMemo(
    () => [...questions].filter((q) => q.active).sort((a, b) => a.display_order - b.display_order),
    [questions]
  );

  const firstUnanswered = useMemo(() => {
    const index = ordered.findIndex((q) => initialAnswers[q.question_key] === undefined);
    return index === -1 ? Math.max(ordered.length - 1, 0) : index;
  }, [ordered, initialAnswers]);

  const [answers, setAnswers] = useState<SessionAnswers>(initialAnswers);
  const [beat, setBeat] = useState<Beat>(() => {
    if (phase === 'closing') return 'reveal';
    // A draft she has already started resumes at her questions rather than
    // replaying the intro she has read.
    return Object.keys(initialAnswers).length > 0 ? 'questions' : 'intro';
  });
  const [index, setIndex] = useState(firstUnanswered);
  const [pattern, setPattern] = useState<FuelPattern | null>(initialPattern);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /*
    THE MARKER IS RE-ASSERTED AFTER EVERY RENDER, WITH NO DEPENDENCY
    ARRAY, on purpose. Every Server Action on this screen answers with a
    re-render of this route, and applying that patch restores the router's
    own canonical address, which does not know about a marker written
    straight to the browser. markClosingBeat is a no-op when the address
    already says this.
  */
  useEffect(() => {
    if (beat === 'reveal' && pattern) markClosingBeat(REVEAL_MARKER);
  });

  // A member who reloads on the reveal arrives with no pattern in hand,
  // because the server hands one down only when it found the row. Ask for
  // it rather than showing her nothing.
  useEffect(() => {
    if (beat !== 'reveal' || pattern) return undefined;
    let cancelled = false;
    (async () => {
      const reveal = await getMyFpaRevealAction(sessionId);
      if (!cancelled && reveal) setPattern(reveal.pattern);
    })();
    return () => {
      cancelled = true;
    };
  }, [beat, pattern, sessionId]);

  useEffect(() => {
    if (beat !== 'finishing') return undefined;
    let cancelled = false;
    (async () => {
      const result = await completeFpaAssessmentAction(sessionId);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setBeat('questions');
        return;
      }
      setPattern(result.reveal.pattern);
      setBeat('reveal');
    })();
    return () => {
      cancelled = true;
    };
  }, [beat, sessionId]);

  const current = ordered[index];
  const answeredCount = ordered.filter((q) => answers[q.question_key] !== undefined).length;
  const total = ordered.length || FPA_QUESTION_COUNT;

  function saveAnswer(question: UnifiedAssessmentQuestion, value: string) {
    setAnswers((prev) => ({ ...prev, [question.question_key]: value }));
    setError(null);
    startTransition(async () => {
      const result = await submitFpaAnswerAction(sessionId, question.id, value);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div>
      <h1 className="sr-only">Rooted Reset Fuel Pattern Assessment</h1>

      {beat === 'reveal' && <ExperienceHomeLink />}

      {beat === 'questions' && current && (
        <div className="mb-5">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.12em] text-[#6B7A72]">
            <span>
              Question {index + 1} of {total}
            </span>
            <span>{answeredCount} answered</span>
          </div>
          {/* The line itself: one hairline, gold, filling. */}
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[#1B3A2D]/8">
            <div
              className="h-full rounded-full bg-[#C4A050] transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.round(((index + 1) / total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mb-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {beat === 'intro' && (
        <div className="mef-animate-in flex min-h-[60vh] flex-col justify-center rounded-[28px] border border-[#1B3A2D]/8 bg-[#FFFDF8] p-7 shadow-[0_18px_44px_-28px_rgba(27,58,45,0.45)] sm:p-8">
          <IntroReveal
            eyebrow={FPA_INTRO_COPY.eyebrow}
            title={FPA_INTRO_COPY.title}
            lines={[...FPA_INTRO_COPY.lines]}
            titleClassName={`${CVS_DISPLAY_FONT} text-4xl leading-tight text-[#1B3A2D]`}
            /*
              THE APP WIDE DEFAULT, DELIBERATELY: the reveal plays once
              per device. The brisk-and-replay pair belongs to the three
              coach assigned instruments, whose intro stands between a
              member and a task somebody else asked her to do and which
              she opens more than once. This one is a welcome she passes
              through once per sitting, and a draft resumes straight at
              her questions rather than replaying it at all.
            */
            storageKey="fpa-intro"
            button={{
              label: FPA_INTRO_COPY.button,
              onClick: () => setBeat('questions'),
              className: 'mef-focus-ring mef-press mef-button-primary mt-7',
            }}
          />
        </div>
      )}

      {beat === 'questions' && current && (
        <>
          <FuelPatternQuestionScreen
            key={current.question_key}
            promptId={`fpa-prompt-${current.question_key}`}
            prompt={current.prompt}
            description={current.description}
            options={parseFpaOptions(current.answer_options)}
            value={answers[current.question_key] as string | undefined}
            onChange={(value) => saveAnswer(current, value)}
            asPlates={current.question_key === FPA_PLATE_QUESTION_KEY}
          />
          <NavRow
            onBack={index === 0 ? () => setBeat('intro') : () => setIndex((i) => i - 1)}
            onContinue={() => {
              if (index < ordered.length - 1) setIndex((i) => i + 1);
              else setBeat('finishing');
            }}
            continueDisabled={answers[current.question_key] === undefined}
            continueLabel={index === ordered.length - 1 ? 'See your fuel pattern' : 'Continue'}
          />
        </>
      )}

      {beat === 'finishing' && (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
          <span className="mef-fade-in h-6 w-6 animate-spin rounded-full border-2 border-[#1B3A2D]/20 border-t-[#1B3A2D] motion-reduce:animate-none" aria-hidden="true" />
          <p className="text-sm text-[#6B7A72]">{ROOT_FINISHING_LABEL}</p>
        </div>
      )}

      {beat === 'reveal' && pattern && (
        <FuelPatternReveal pattern={pattern} startAtPattern={startAtPattern} />
      )}
    </div>
  );
}

function NavRow({
  onBack,
  onContinue,
  continueDisabled,
  continueLabel,
}: {
  onBack: () => void;
  onContinue: () => void;
  continueDisabled: boolean;
  continueLabel: string;
}) {
  return (
    <div className="mt-5 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        className="mef-focus-ring inline-flex items-center gap-1 rounded-2xl px-4 py-3 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Back
      </button>
      <button
        type="button"
        onClick={onContinue}
        disabled={continueDisabled}
        className="mef-focus-ring mef-press rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
      >
        {continueLabel}
      </button>
    </div>
  );
}
