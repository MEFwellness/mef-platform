'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2 } from 'lucide-react';
import type { UnifiedAssessmentQuestion } from '@mef/shared-types-contracts';
import type { AnswerValue, SessionAnswers } from '@/lib/assessment-runtime/types';
import { completeLscAssessmentAction, getMyLscExperimentStatusAction, submitLscAnswerAction, type LscExperimentStatus } from '@/app/actions/lifeSignalCheck';
import { getMyNarrative } from '@/app/actions/narrative';
import { SCREEN1_QUESTION_KEYS, SCREEN2_QUESTION_KEYS, Q10_KEY, Q11_KEY, SIGNAL_LABEL, type Signal } from '@/lib/life-signal-check/constants';
import { computeSignalScores } from '@/lib/life-signal-check/scoring';
import { computeLoudSignals, generateQ10Options, Q10_PROMPT_BY_FRAMING } from '@/lib/life-signal-check/q10';
import { seededShuffle } from '@/lib/core-values-snapshot/randomize';
import { LSC_INTRO_COPY } from '@/lib/life-signal-check/copy';
import type { LscScoring } from '@/lib/life-signal-check/types';
import { CVS_CARD, CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { SingleSelectQuestion, type CvsOption } from '@/components/core-values-snapshot/CvsQuestionCards';
import { IntroReveal } from '@/components/IntroReveal';
import { ExperienceHomeLink } from '@/components/ExperienceHomeLink';
import { ReturnToDashboardButton, ResourceSection, WhatRootLearnedSection } from './LscResultsView';
import { LscExperimentPanel } from './LscExperimentPanel';
import { LscCloseScreen } from './LscCloseScreen';
import { ROOT_FINISHING_LABEL } from '@/lib/reveal/copy';

type Beat = 'intro' | 'screen1' | 'screen2' | 'screen3' | 'finishing' | 'learned' | 'experiment' | 'resource' | 'close';

type Props = {
  sessionId: string;
  questions: UnifiedAssessmentQuestion[];
  initialAnswers: SessionAnswers;
  audioAvailable: boolean;
};

function questionByKey(questions: UnifiedAssessmentQuestion[], key: string): UnifiedAssessmentQuestion | undefined {
  return questions.find((q) => q.question_key === key);
}

function parseOptions(raw: unknown): CvsOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((o): o is CvsOption => typeof o === 'object' && o !== null && 'value' in o && 'label' in o);
}

function determineInitialBeat(
  answers: SessionAnswers,
  screen2Order: readonly string[]
): { beat: Beat; screen1Index: number; screen2Index: number; screen3Index: number } {
  const screen1Answered = SCREEN1_QUESTION_KEYS.filter((k) => answers[k] !== undefined).length;
  const screen2Answered = SCREEN2_QUESTION_KEYS.filter((k) => answers[k] !== undefined).length;
  const q10Answered = answers[Q10_KEY] !== undefined;
  const q11Answered = answers[Q11_KEY] !== undefined;

  if (q11Answered) return { beat: 'finishing', screen1Index: 0, screen2Index: 0, screen3Index: 1 };
  if (q10Answered) return { beat: 'screen3', screen1Index: 0, screen2Index: 0, screen3Index: 1 };
  if (screen1Answered === SCREEN1_QUESTION_KEYS.length && screen2Answered === SCREEN2_QUESTION_KEYS.length) {
    return { beat: 'screen3', screen1Index: 0, screen2Index: 0, screen3Index: 0 };
  }
  if (screen1Answered === SCREEN1_QUESTION_KEYS.length) {
    const firstUnanswered = screen2Order.findIndex((k) => answers[k] === undefined);
    return { beat: 'screen2', screen1Index: 0, screen2Index: firstUnanswered === -1 ? 0 : firstUnanswered, screen3Index: 0 };
  }
  if (screen1Answered > 0) {
    const firstUnanswered = SCREEN1_QUESTION_KEYS.findIndex((k) => answers[k] === undefined);
    return { beat: 'screen1', screen1Index: firstUnanswered === -1 ? 0 : firstUnanswered, screen2Index: 0, screen3Index: 0 };
  }
  return { beat: 'intro', screen1Index: 0, screen2Index: 0, screen3Index: 0 };
}

export function LifeSignalCheckTaker({ sessionId, questions, initialAnswers, audioAvailable }: Props) {
  const router = useRouter();

  // Six Signals' question order is shuffled per session (same seeded
  // technique Core Values Snapshot already uses for its own option order)
  // to avoid primacy bias — stable across re-renders and resumes because
  // it's seeded by the session id, not re-rolled every render.
  const screen2Order = useMemo(() => seededShuffle(SCREEN2_QUESTION_KEYS, `${sessionId}:lsc_screen2_order`), [sessionId]);
  const initial = useMemo(() => determineInitialBeat(initialAnswers, screen2Order), [initialAnswers, screen2Order]);

  const [answers, setAnswers] = useState<SessionAnswers>(initialAnswers);
  const [beat, setBeat] = useState<Beat>(initial.beat);
  const [screen1Index, setScreen1Index] = useState(initial.screen1Index);
  const [screen2Index, setScreen2Index] = useState(initial.screen2Index);
  const [screen3Index, setScreen3Index] = useState(initial.screen3Index);
  const [scoring, setScoring] = useState<LscScoring | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [experimentStatus, setExperimentStatus] = useState<LscExperimentStatus | null>(null);
  const [narrativeItems, setNarrativeItems] = useState<Awaited<ReturnType<typeof getMyNarrative>>>([]);

  // Q1/Q2 keep their natural order (per the build brief); Q3's answer order is randomized for bias control, seeded per session so it's stable across re-renders and resumes.
  const q3Options = useMemo(() => {
    const q = questionByKey(questions, 'lsc_q3');
    return seededShuffle(parseOptions(q?.answer_options), `${sessionId}:lsc_q3`);
  }, [questions, sessionId]);

  const q10 = useMemo(() => {
    const scores = computeSignalScores(answers);
    const { options, framing } = generateQ10Options(scores);
    return { options: options.map((o) => ({ value: o.value, label: o.label })), prompt: Q10_PROMPT_BY_FRAMING[framing] };
  }, [answers]);

  // Live, mid-Screen-3 read of how many signals are already loud from
  // Q4-Q9 — decides whether Question 10 has a real choice to offer
  // (design fix: skip it entirely when exactly one signal is loud) and
  // whether Question 11 needs its Quiet Body rephrase (design fix: never
  // presume something is loud when nothing is).
  const loudSignalsSoFar = useMemo(() => computeLoudSignals(computeSignalScores(answers)), [answers]);
  const singleLoudSignal: Signal | null = loudSignalsSoFar.length === 1 ? loudSignalsSoFar[0]! : null;
  const isQuietBodySoFar = loudSignalsSoFar.length === 0;

  function saveAnswer(questionKey: string, value: AnswerValue) {
    const question = questionByKey(questions, questionKey);
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
    setError(null);
    startTransition(async () => {
      const result = await submitLscAnswerAction(sessionId, question.id, value);
      if (!result.ok) setError(result.error);
    });
  }

  // Question 10 has no real choice when exactly one signal is loud — Root
  // already knows the answer, so it's recorded automatically and the
  // member sees a statement instead of a pick.
  useEffect(() => {
    if (beat !== 'screen3' || screen3Index !== 0) return;
    if (!singleLoudSignal || answers[Q10_KEY] !== undefined) return;
    saveAnswer(Q10_KEY, singleLoudSignal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat, screen3Index, singleLoudSignal, answers[Q10_KEY]]);

  useEffect(() => {
    if (beat !== 'finishing') return;
    let cancelled = false;
    (async () => {
      const result = await completeLscAssessmentAction(sessionId);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setScoring(result.scoring);
      setBeat('learned');
    })();
    return () => {
      cancelled = true;
    };
  }, [beat, sessionId]);

  useEffect(() => {
    if (beat !== 'experiment') return;
    let cancelled = false;
    (async () => {
      const status = await getMyLscExperimentStatusAction();
      if (!cancelled) setExperimentStatus(status);
    })();
    return () => {
      cancelled = true;
    };
  }, [beat]);

  useEffect(() => {
    if (beat !== 'close') return;
    let cancelled = false;
    (async () => {
      const items = await getMyNarrative();
      if (!cancelled) {
        setNarrativeItems(
          items.filter((i) => i.source_refs?.some((r) => r.note === 'core-values-snapshot' || (r.id === sessionId && r.note === 'life-signal-check')))
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [beat, sessionId]);

  const totalAnswered = [...SCREEN1_QUESTION_KEYS, ...SCREEN2_QUESTION_KEYS, Q10_KEY, Q11_KEY].filter((k) => answers[k] !== undefined).length;
  const showQuestionChrome = beat === 'screen1' || beat === 'screen2' || beat === 'screen3';
  // Whether the member actually started the Weekly Experiment tied to
  // *this* session — not just whether they have any Life Signal Check
  // experiment ever. Drives the closing screen's honest copy branch (Root
  // never claims an experiment is running when nothing started).
  const didStartExperiment = experimentStatus !== null && experimentStatus.experiment.sourceSessionId === sessionId;

  return (
    <div>
      <h1 className="sr-only">Life Signal Check</h1>

      {(beat === 'learned' || beat === 'experiment' || beat === 'resource' || beat === 'close') && <ExperienceHomeLink />}

      {showQuestionChrome && (
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B7A72]">
            <span>{totalAnswered} of 11 answered</span>
            <span>Screen {beat === 'screen1' ? 1 : beat === 'screen2' ? 2 : 3} of 3</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1B3A2D]/8">
            <div
              className="h-full rounded-full bg-[#1B3A2D] transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.round((totalAnswered / 11) * 100)}%` }}
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
        <div className={`${CVS_CARD} mef-animate-in flex min-h-[60vh] flex-col justify-center p-7`}>
          <IntroReveal
            title={LSC_INTRO_COPY.title}
            lines={LSC_INTRO_COPY.lines}
            titleClassName={`${CVS_DISPLAY_FONT} text-3xl leading-tight text-[#1B3A2D]`}
            storageKey="lsc-intro"
            button={{
              label: LSC_INTRO_COPY.button,
              onClick: () => setBeat('screen1'),
              className:
                'mef-focus-ring mef-button-primary mt-7',
            }}
          />
        </div>
      )}

      {beat === 'screen1' && (
        <>
          <SingleSelectQuestion
            key={SCREEN1_QUESTION_KEYS[screen1Index]}
            prompt={questionByKey(questions, SCREEN1_QUESTION_KEYS[screen1Index]!)?.prompt ?? ''}
            options={
              SCREEN1_QUESTION_KEYS[screen1Index] === 'lsc_q3'
                ? q3Options
                : parseOptions(questionByKey(questions, SCREEN1_QUESTION_KEYS[screen1Index]!)?.answer_options)
            }
            value={answers[SCREEN1_QUESTION_KEYS[screen1Index]!] as string | undefined}
            onChange={(v) => saveAnswer(SCREEN1_QUESTION_KEYS[screen1Index]!, v)}
          />
          <NavRow
            onBack={screen1Index === 0 ? () => setBeat('intro') : () => setScreen1Index((i) => i - 1)}
            onContinue={() => {
              if (screen1Index < SCREEN1_QUESTION_KEYS.length - 1) setScreen1Index((i) => i + 1);
              else setBeat('screen2');
            }}
            continueDisabled={answers[SCREEN1_QUESTION_KEYS[screen1Index]!] === undefined}
          />
        </>
      )}

      {beat === 'screen2' && (
        <>
          <SingleSelectQuestion
            key={screen2Order[screen2Index]}
            prompt={questionByKey(questions, screen2Order[screen2Index]!)?.prompt ?? ''}
            options={parseOptions(questionByKey(questions, screen2Order[screen2Index]!)?.answer_options)}
            value={answers[screen2Order[screen2Index]!] as string | undefined}
            onChange={(v) => saveAnswer(screen2Order[screen2Index]!, v)}
          />
          <NavRow
            onBack={screen2Index === 0 ? () => setBeat('screen1') : () => setScreen2Index((i) => i - 1)}
            onContinue={() => {
              if (screen2Index < screen2Order.length - 1) setScreen2Index((i) => i + 1);
              else setBeat('screen3');
            }}
            continueDisabled={answers[screen2Order[screen2Index]!] === undefined}
          />
        </>
      )}

      {beat === 'screen3' && screen3Index === 0 && (
        <>
          {singleLoudSignal ? (
            <div className={`${CVS_CARD} mef-animate-in p-7`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">The Call</p>
              <p className={`${CVS_DISPLAY_FONT} mt-3 text-2xl leading-snug text-[#1B3A2D]`}>
                This is the one that&apos;s been loudest: {SIGNAL_LABEL[singleLoudSignal]}.
              </p>
            </div>
          ) : (
            <SingleSelectQuestion
              prompt={q10.prompt}
              options={q10.options}
              value={answers[Q10_KEY] as string | undefined}
              onChange={(v) => saveAnswer(Q10_KEY, v)}
            />
          )}
          <NavRow onBack={() => setBeat('screen2')} onContinue={() => setScreen3Index(1)} continueDisabled={answers[Q10_KEY] === undefined} />
        </>
      )}

      {beat === 'screen3' && screen3Index === 1 && (
        <>
          <SingleSelectQuestion
            prompt={isQuietBodySoFar ? 'How long has this felt this good?' : (questionByKey(questions, Q11_KEY)?.prompt ?? '')}
            options={parseOptions(questionByKey(questions, Q11_KEY)?.answer_options)}
            value={answers[Q11_KEY] as string | undefined}
            onChange={(v) => saveAnswer(Q11_KEY, v)}
          />
          <NavRow
            onBack={() => setScreen3Index(0)}
            onContinue={() => setBeat('finishing')}
            continueDisabled={answers[Q11_KEY] === undefined}
            continueLabel="See what Root learned"
          />
        </>
      )}

      {beat === 'finishing' && (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#1B3A2D]" aria-hidden="true" />
          <p className="text-sm text-[#6B7A72]">{ROOT_FINISHING_LABEL}</p>
        </div>
      )}

      {beat === 'learned' && scoring && (
        <div className="flex min-h-[60vh] flex-col justify-center">
          <WhatRootLearnedSection scoring={scoring} />
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setBeat('experiment')}
              className="mef-focus-ring block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {beat === 'experiment' && scoring && (
        <div className="flex min-h-[60vh] flex-col justify-center">
          <LscExperimentPanel
            sessionId={sessionId}
            chosenSignal={scoring.chosenSignal}
            scoring={scoring}
            initialStatus={experimentStatus}
            onStatusChange={setExperimentStatus}
          />
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setBeat('resource')}
              className="mef-focus-ring block w-full rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {beat === 'resource' && (
        <div className="flex min-h-[60vh] flex-col justify-center">
          <ResourceSection audioAvailable={audioAvailable} />
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setBeat('close')}
              className="mef-focus-ring block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {beat === 'close' && scoring && (
        <>
          <LscCloseScreen
            sessionId={sessionId}
            scoring={scoring}
            didStartExperiment={didStartExperiment}
            narrativeItems={narrativeItems}
            onStartReadinessPulse={() => router.push('/assessments/readiness-pulse' as Route)}
            onLater={() => router.push('/dashboard' as Route)}
          />
          <ReturnToDashboardButton />
        </>
      )}

      {isPending && <span className="sr-only">Saving…</span>}
    </div>
  );
}

function NavRow({
  onBack,
  onContinue,
  continueDisabled,
  continueLabel = 'Continue',
}: {
  onBack: () => void;
  onContinue: () => void;
  continueDisabled: boolean;
  continueLabel?: string;
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
        className="mef-focus-ring rounded-2xl bg-[#1B3A2D] px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
      >
        {continueLabel}
      </button>
    </div>
  );
}
