'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2 } from 'lucide-react';
import type { UnifiedAssessmentQuestion } from '@mef/shared-types-contracts';
import type { AnswerValue, SessionAnswers } from '@/lib/assessment-runtime/types';
import { completeLscAssessmentAction, getMyLscExperimentStatusAction, submitLscAnswerAction, type LscExperimentStatus } from '@/app/actions/lifeSignalCheck';
import { getMyNarrative } from '@/app/actions/narrative';
import { SCREEN1_QUESTION_KEYS, SCREEN2_QUESTION_KEYS, Q10_KEY, Q11_KEY } from '@/lib/life-signal-check/constants';
import { computeSignalScores } from '@/lib/life-signal-check/scoring';
import { generateQ10Options, Q10_PROMPT_BY_FRAMING } from '@/lib/life-signal-check/q10';
import { seededShuffle } from '@/lib/core-values-snapshot/randomize';
import { LSC_INTRO_COPY } from '@/lib/life-signal-check/copy';
import type { LscScoring } from '@/lib/life-signal-check/types';
import { CVS_CARD, CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { SingleSelectQuestion, type CvsOption } from '@/components/core-values-snapshot/CvsQuestionCards';
import { CloseSection, ReturnToDashboardButton, ResourceSection, WhatRootLearnedSection } from './LscResultsView';
import { LscExperimentPanel } from './LscExperimentPanel';

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

function determineInitialBeat(answers: SessionAnswers): { beat: Beat; screen1Index: number; screen2Index: number; screen3Index: number } {
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
    const firstUnanswered = SCREEN2_QUESTION_KEYS.findIndex((k) => answers[k] === undefined);
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
  const initial = useMemo(() => determineInitialBeat(initialAnswers), [initialAnswers]);

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

  return (
    <div>
      <h1 className="sr-only">Life Signal Check</h1>

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
        <div className={`${CVS_CARD} mef-animate-in p-7`}>
          <h2 className={`${CVS_DISPLAY_FONT} text-3xl leading-tight text-[#1B3A2D]`}>{LSC_INTRO_COPY.title}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-[#1B3A2D]">{LSC_INTRO_COPY.body}</p>
          <button
            type="button"
            onClick={() => setBeat('screen1')}
            className="mef-focus-ring mt-7 block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]"
          >
            {LSC_INTRO_COPY.button}
          </button>
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
            key={SCREEN2_QUESTION_KEYS[screen2Index]}
            prompt={questionByKey(questions, SCREEN2_QUESTION_KEYS[screen2Index]!)?.prompt ?? ''}
            options={parseOptions(questionByKey(questions, SCREEN2_QUESTION_KEYS[screen2Index]!)?.answer_options)}
            value={answers[SCREEN2_QUESTION_KEYS[screen2Index]!] as string | undefined}
            onChange={(v) => saveAnswer(SCREEN2_QUESTION_KEYS[screen2Index]!, v)}
          />
          <NavRow
            onBack={screen2Index === 0 ? () => setBeat('screen1') : () => setScreen2Index((i) => i - 1)}
            onContinue={() => {
              if (screen2Index < SCREEN2_QUESTION_KEYS.length - 1) setScreen2Index((i) => i + 1);
              else setBeat('screen3');
            }}
            continueDisabled={answers[SCREEN2_QUESTION_KEYS[screen2Index]!] === undefined}
          />
        </>
      )}

      {beat === 'screen3' && screen3Index === 0 && (
        <>
          <SingleSelectQuestion
            prompt={q10.prompt}
            options={q10.options}
            value={answers[Q10_KEY] as string | undefined}
            onChange={(v) => saveAnswer(Q10_KEY, v)}
          />
          <NavRow onBack={() => setBeat('screen2')} onContinue={() => setScreen3Index(1)} continueDisabled={answers[Q10_KEY] === undefined} />
        </>
      )}

      {beat === 'screen3' && screen3Index === 1 && (
        <>
          <SingleSelectQuestion
            prompt={questionByKey(questions, Q11_KEY)?.prompt ?? ''}
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
          <p className="text-sm text-[#6B7A72]">One moment, Root is putting this together.</p>
        </div>
      )}

      {beat === 'learned' && scoring && (
        <>
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
        </>
      )}

      {beat === 'experiment' && scoring && (
        <>
          <LscExperimentPanel sessionId={sessionId} chosenSignal={scoring.chosenSignal} scoring={scoring} initialStatus={experimentStatus} />
          <div className="mt-5">
            <button
              type="button"
              onClick={() => setBeat('resource')}
              className="mef-focus-ring block w-full rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
            >
              Continue
            </button>
          </div>
        </>
      )}

      {beat === 'resource' && (
        <>
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
        </>
      )}

      {beat === 'close' && (
        <>
          <CloseSection onStartReadinessPulse={() => {}} onLater={() => router.push('/dashboard' as Route)} />
          {narrativeItems.length > 0 && (
            <div className={`${CVS_CARD} mef-animate-in mt-4 p-7`}>
              <p className={`${CVS_DISPLAY_FONT} text-xl text-[#1B3A2D]`}>What Root knows so far</p>
              <ul className="mt-4 space-y-4">
                {narrativeItems.map((item) => (
                  <li key={item.id}>
                    <p className="text-sm font-medium text-[#1B3A2D]">{item.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-[#6B7A72]">{item.summary}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
