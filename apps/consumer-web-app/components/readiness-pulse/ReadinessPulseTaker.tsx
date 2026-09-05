'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2 } from 'lucide-react';
import type { UnifiedAssessmentQuestion } from '@mef/shared-types-contracts';
import type { AnswerValue, SessionAnswers } from '@/lib/assessment-runtime/types';
import {
  completeRplAssessmentAction,
  getMyRplExperimentStatusAction,
  getMyEvidenceEchoAction,
  getMyLatestCvsContextForRplAction,
  submitRplAnswerAction,
  type RplExperimentStatus,
} from '@/app/actions/readinessPulse';
import { SCREEN1_QUESTION_KEYS, SCREEN2_QUESTION_KEYS, SCREEN3_QUESTION_KEYS, Q9_KEY, type Q1Answer } from '@/lib/readiness-pulse/constants';
import { generateQ2Content } from '@/lib/readiness-pulse/q2';
import { RPL_INTRO_COPY } from '@/lib/readiness-pulse/copy';
import type { RplScoring } from '@/lib/readiness-pulse/types';
import type { EvidenceEchoContext } from '@/lib/readiness-pulse/copy';
import type { ValueArea } from '@/lib/core-values-snapshot/constants';
import { CVS_CARD, CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { SingleSelectQuestion, type CvsOption } from '@/components/core-values-snapshot/CvsQuestionCards';
import { IntroReveal } from '@/components/IntroReveal';
import { ExperienceHomeLink } from '@/components/ExperienceHomeLink';
import { WhatRootLearnedSection, ResourceSection } from './RplResultsView';
import { BackToHomeButton } from '@/components/closing-screen/BackToHomeButton';
import { RplExperimentPanel } from './RplExperimentPanel';
import { RplCloseScreen } from './RplCloseScreen';
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

function determineInitialBeat(answers: SessionAnswers): { beat: Beat; screen1Index: number; screen2Index: number; screen3Index: number } {
  const screen1Answered = SCREEN1_QUESTION_KEYS.filter((k) => answers[k] !== undefined).length;
  const screen2Answered = SCREEN2_QUESTION_KEYS.filter((k) => answers[k] !== undefined).length;

  if (answers[Q9_KEY] !== undefined) return { beat: 'finishing', screen1Index: 0, screen2Index: 0, screen3Index: 1 };
  if (screen1Answered === SCREEN1_QUESTION_KEYS.length && screen2Answered === SCREEN2_QUESTION_KEYS.length) {
    const firstUnanswered = SCREEN3_QUESTION_KEYS.findIndex((k) => answers[k] === undefined);
    return { beat: 'screen3', screen1Index: 0, screen2Index: 0, screen3Index: firstUnanswered === -1 ? 0 : firstUnanswered };
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

export function ReadinessPulseTaker({ sessionId, questions, initialAnswers, audioAvailable }: Props) {
  const router = useRouter();
  const initial = useMemo(() => determineInitialBeat(initialAnswers), [initialAnswers]);

  const [answers, setAnswers] = useState<SessionAnswers>(initialAnswers);
  const [beat, setBeat] = useState<Beat>(initial.beat);
  const [screen1Index, setScreen1Index] = useState(initial.screen1Index);
  const [screen2Index, setScreen2Index] = useState(initial.screen2Index);
  const [screen3Index, setScreen3Index] = useState(initial.screen3Index);
  const [scoring, setScoring] = useState<RplScoring | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [experimentStatus, setExperimentStatus] = useState<RplExperimentStatus | null>(null);
  const [evidenceEcho, setEvidenceEcho] = useState<EvidenceEchoContext | null>(null);
  const [topValue, setTopValue] = useState<ValueArea | null>(null);

  const q2Content = useMemo(() => generateQ2Content((answers['rpl_q1'] as Q1Answer) ?? 'first_real_try'), [answers]);

  function saveAnswer(questionKey: string, value: AnswerValue) {
    const question = questionByKey(questions, questionKey);
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [questionKey]: value }));
    setError(null);
    startTransition(async () => {
      const result = await submitRplAnswerAction(sessionId, question.id, value);
      if (!result.ok) setError(result.error);
    });
  }

  useEffect(() => {
    if (beat !== 'finishing') return;
    let cancelled = false;
    (async () => {
      const result = await completeRplAssessmentAction(sessionId);
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
    if (beat !== 'learned') return;
    let cancelled = false;
    (async () => {
      const echo = await getMyEvidenceEchoAction();
      if (!cancelled) setEvidenceEcho(echo);
    })();
    return () => {
      cancelled = true;
    };
  }, [beat]);

  useEffect(() => {
    if (beat !== 'experiment') return;
    let cancelled = false;
    (async () => {
      const status = await getMyRplExperimentStatusAction();
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
      const context = await getMyLatestCvsContextForRplAction();
      if (!cancelled) setTopValue(context?.topValue ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [beat]);

  const totalAnswered = [...SCREEN1_QUESTION_KEYS, ...SCREEN2_QUESTION_KEYS, ...SCREEN3_QUESTION_KEYS].filter((k) => answers[k] !== undefined).length;
  const showQuestionChrome = beat === 'screen1' || beat === 'screen2' || beat === 'screen3';
  const didStartExperiment = experimentStatus !== null && experimentStatus.experiment.sourceSessionId === sessionId;

  return (
    <div>
      <h1 className="sr-only">Readiness Pulse</h1>

      {(beat === 'learned' || beat === 'experiment' || beat === 'resource' || beat === 'close') && <ExperienceHomeLink />}

      {showQuestionChrome && (
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs font-medium text-[#6B7A72]">
            <span>{totalAnswered} of 9 answered</span>
            <span>Screen {beat === 'screen1' ? 1 : beat === 'screen2' ? 2 : 3} of 3</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1B3A2D]/8">
            <div
              className="h-full rounded-full bg-[#1B3A2D] transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${Math.round((totalAnswered / 9) * 100)}%` }}
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
            title={RPL_INTRO_COPY.title}
            lines={RPL_INTRO_COPY.lines}
            titleClassName={`${CVS_DISPLAY_FONT} text-3xl leading-tight text-[#1B3A2D]`}
            storageKey="rpl-intro"
            button={{
              label: RPL_INTRO_COPY.button,
              onClick: () => setBeat('screen1'),
              className:
                'mef-focus-ring mef-button-primary mt-7',
            }}
          />
        </div>
      )}

      {beat === 'screen1' && screen1Index === 0 && (
        <>
          <SingleSelectQuestion
            prompt={questionByKey(questions, 'rpl_q1')?.prompt ?? ''}
            options={parseOptions(questionByKey(questions, 'rpl_q1')?.answer_options)}
            value={answers['rpl_q1'] as string | undefined}
            onChange={(v) => saveAnswer('rpl_q1', v)}
          />
          <NavRow onBack={() => setBeat('intro')} onContinue={() => setScreen1Index(1)} continueDisabled={answers['rpl_q1'] === undefined} />
        </>
      )}

      {beat === 'screen1' && screen1Index === 1 && (
        <>
          <SingleSelectQuestion
            key={q2Content.prompt}
            prompt={q2Content.prompt}
            options={q2Content.options}
            value={answers['rpl_q2'] as string | undefined}
            onChange={(v) => saveAnswer('rpl_q2', v)}
          />
          <NavRow onBack={() => setScreen1Index(0)} onContinue={() => setScreen1Index(2)} continueDisabled={answers['rpl_q2'] === undefined} />
        </>
      )}

      {beat === 'screen1' && screen1Index === 2 && (
        <>
          <SingleSelectQuestion
            prompt={questionByKey(questions, 'rpl_q3')?.prompt ?? ''}
            options={parseOptions(questionByKey(questions, 'rpl_q3')?.answer_options)}
            value={answers['rpl_q3'] as string | undefined}
            onChange={(v) => saveAnswer('rpl_q3', v)}
          />
          <NavRow onBack={() => setScreen1Index(1)} onContinue={() => setBeat('screen2')} continueDisabled={answers['rpl_q3'] === undefined} />
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

      {beat === 'screen3' && (
        <>
          <SingleSelectQuestion
            key={SCREEN3_QUESTION_KEYS[screen3Index]}
            prompt={questionByKey(questions, SCREEN3_QUESTION_KEYS[screen3Index]!)?.prompt ?? ''}
            options={parseOptions(questionByKey(questions, SCREEN3_QUESTION_KEYS[screen3Index]!)?.answer_options)}
            value={answers[SCREEN3_QUESTION_KEYS[screen3Index]!] as string | undefined}
            onChange={(v) => saveAnswer(SCREEN3_QUESTION_KEYS[screen3Index]!, v)}
          />
          <NavRow
            onBack={screen3Index === 0 ? () => setBeat('screen2') : () => setScreen3Index(0)}
            onContinue={() => {
              if (screen3Index === 0) setScreen3Index(1);
              else setBeat('finishing');
            }}
            continueDisabled={answers[SCREEN3_QUESTION_KEYS[screen3Index]!] === undefined}
            continueLabel={screen3Index === 1 ? 'See what Root learned' : 'Continue'}
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
          <WhatRootLearnedSection scoring={scoring} evidenceEcho={evidenceEcho} />
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
          <RplExperimentPanel sessionId={sessionId} scoring={scoring} initialStatus={experimentStatus} onStatusChange={setExperimentStatus} />
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
          <RplCloseScreen
            sessionId={sessionId}
            scoring={scoring}
            didStartExperiment={didStartExperiment}
            topValue={topValue}
            evidenceEcho={evidenceEcho}
            onLater={() => router.push('/dashboard' as Route)}
          />
          {/* The way out of the closing, the one shared control every
              closing screen ends with. */}
          <BackToHomeButton />
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
