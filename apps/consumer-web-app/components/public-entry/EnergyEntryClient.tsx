'use client';

/**
 * Where Your Energy Goes: the whole experience, as one state machine.
 *
 * THE BEATS. intro, then four chapters each announced before its questions,
 * one question to a screen, then a short pause, then the result. Nine
 * questions and four transitions is what turns a form into a conversation,
 * and it is the same shape the free arc's takers already use.
 *
 * WHERE THE WRITES HAPPEN. Never in a render. The arrival is recorded from
 * a mounted effect, answers are saved as they are given, and the completion
 * is a single call made when the last question has been answered. That is
 * the standing rule about renders that write: Next prefetches a link when
 * it scrolls into view, so anything a render decides gets decided for
 * people who never arrived.
 *
 * WHY EVERY ANSWER IS SAVED AS IT IS GIVEN. So that somebody who gets
 * interrupted at question six comes back to question six, and so that the
 * funnel can tell "started and stopped" apart from "never started". The
 * result is always built on the server from what is stored, never from what
 * the browser is holding, so what she reads is what we actually have.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { IntroReveal } from '@/components/IntroReveal';
import { SingleSelectQuestion } from '@/components/core-values-snapshot/CvsQuestionCards';
import type { EnergyResult } from '@/lib/public-entry/result';
import {
  ENERGY_CHAPTERS,
  ENERGY_QUESTIONS,
  questionsForChapter,
} from '@/lib/public-entry/questions';
import { ENERGY_INTRO } from '@/lib/public-entry/copy';
import { arrive, complete, saveAnswers, signal, start } from '@/lib/public-entry/client';
import { getOrCreateVisitorToken } from '@/lib/public-entry/storage';
import { EnergyResultView } from './EnergyResultView';
import {
  ENERGY_CONTAINER,
  ENERGY_DISPLAY_FONT,
  ENERGY_SHELL,
} from './theme';

type Beat = 'loading' | 'intro' | 'chapter' | 'question' | 'reflecting' | 'result' | 'error';

/**
 * Long enough to read as somebody looking at what you said, short enough to
 * never feel like a wait. The same beat and the same reason as
 * OnboardingFlow.tsx's own reflecting stage.
 */
const REFLECTING_MIN_MS = 1200;

const TOTAL_QUESTIONS = ENERGY_QUESTIONS.length;

export function EnergyEntryClient({ sourceCode }: { sourceCode: string | null }) {
  const [beat, setBeat] = useState<Beat>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [chapter, setChapter] = useState(1);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [result, setResult] = useState<EnergyResult | null>(null);
  const arrivedRef = useRef(false);

  // The arrival. Guarded by a ref rather than by the effect's dependency
  // list so React 18 StrictMode's dev-only double mount does not send it
  // twice; the route is idempotent anyway, but a duplicate would be noise
  // in a funnel this small.
  useEffect(() => {
    if (arrivedRef.current) return;
    arrivedRef.current = true;

    const visitorToken = getOrCreateVisitorToken();
    setToken(visitorToken);
    if (!visitorToken) {
      // Storage is unavailable (private mode with everything locked down).
      // The experience still runs, it simply cannot be resumed or attached
      // to an account later, and nothing is recorded.
      setBeat('intro');
      return;
    }

    void (async () => {
      const response = await arrive({
        visitorToken,
        sourceRaw: sourceCode,
        landingPath: typeof window !== 'undefined' ? window.location.pathname : null,
        referrer: typeof document !== 'undefined' ? document.referrer || null : null,
      });
      if (response?.answers) setAnswers(response.answers);
      setBeat('intro');
    })();
  }, [sourceCode]);

  const currentQuestions = questionsForChapter(chapter);
  const currentQuestion = currentQuestions[questionIndex];
  const answeredCount = ENERGY_QUESTIONS.filter((q) => answers[q.key]).length;

  const finish = useCallback(
    async (finalAnswers: Record<string, string>) => {
      setBeat('reflecting');
      const startedAt = Date.now();
      const response = token ? await complete(token, finalAnswers) : null;
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, REFLECTING_MIN_MS - elapsed);
      window.setTimeout(() => {
        if (!response) {
          setBeat('error');
          return;
        }
        setResult(response.result);
        setBeat('result');
      }, wait);
    },
    [token]
  );

  function handleAnswer(questionKey: string, value: string) {
    const next = { ...answers, [questionKey]: value };
    setAnswers(next);

    const isLastInChapter = questionIndex === currentQuestions.length - 1;
    const isLastOverall = chapter === ENERGY_CHAPTERS.length && isLastInChapter;

    if (isLastOverall) {
      void finish(next);
      return;
    }

    if (isLastInChapter) {
      if (token) void saveAnswers(token, next, chapter);
      setChapter((c) => c + 1);
      setQuestionIndex(0);
      setBeat('chapter');
      return;
    }

    if (token) void saveAnswers(token, next);
    setQuestionIndex((i) => i + 1);
  }

  function handleBegin() {
    if (token) void start(token);
    setChapter(1);
    setQuestionIndex(0);
    setBeat('chapter');
  }

  function handleGoToSignup(target: string) {
    if (token) signal(token, 'app_clicked', target);
    // A full navigation rather than a router push: this leaves the public
    // experience for the app, and the app's own middleware and layout
    // should run from the top.
    window.location.href = target === 'login' ? '/login' : '/signup';
  }

  return (
    <div className={ENERGY_SHELL}>
      <main className={ENERGY_CONTAINER}>
        {beat === 'loading' && (
          <div role="status" className="flex min-h-[60vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#1B3A2D]" aria-hidden="true" />
            <span className="sr-only">Loading</span>
          </div>
        )}

        {beat === 'intro' && (
          <div className="flex min-h-[70vh] flex-col justify-center">
            <IntroReveal
              eyebrow={ENERGY_INTRO.eyebrow}
              title={ENERGY_INTRO.title}
              titleTag="h1"
              titleClassName={`${ENERGY_DISPLAY_FONT} text-[2.5rem] leading-tight text-[#1B3A2D]`}
              lines={[...ENERGY_INTRO.lines]}
              storageKey="energy-map-intro"
              button={{ label: ENERGY_INTRO.buttonLabel, onClick: handleBegin }}
            />
            <p className="mt-6 text-center text-[13px] leading-relaxed text-[#6B7A72]">
              {ENERGY_INTRO.reassurance}
            </p>
          </div>
        )}

        {beat === 'chapter' && <ChapterTransition chapter={chapter} onContinue={() => setBeat('question')} />}

        {beat === 'question' && currentQuestion && (
          <div>
            <div className="mb-5">
              <div className="flex items-center justify-between text-xs font-medium text-[#6B7A72]">
                <span>
                  {answeredCount} of {TOTAL_QUESTIONS} answered
                </span>
                <span>
                  {ENERGY_CHAPTERS[chapter - 1]?.title ?? ''}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1B3A2D]/8">
                <div
                  className="h-full rounded-full bg-[#1B3A2D] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.round((answeredCount / TOTAL_QUESTIONS) * 100)}%` }}
                />
              </div>
            </div>
            <div className="flex min-h-[55vh] flex-col justify-center">
              <SingleSelectQuestion
                key={currentQuestion.key}
                prompt={currentQuestion.prompt}
                options={currentQuestion.options.map((o) => ({ value: o.value, label: o.label }))}
                value={answers[currentQuestion.key]}
                onChange={(value) => handleAnswer(currentQuestion.key, value)}
              />
            </div>
          </div>
        )}

        {beat === 'reflecting' && (
          <div
            role="status"
            className="mef-animate-in flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center"
          >
            <span className="mef-pulse-dot h-3 w-3 rounded-full bg-[#1B3A2D]" aria-hidden="true" />
            <p className={`${ENERGY_DISPLAY_FONT} text-2xl text-[#1B3A2D]`}>
              Looking at what you said...
            </p>
          </div>
        )}

        {beat === 'result' && result && (
          <EnergyResultView result={result} visitorToken={token} onGoToSignup={handleGoToSignup} />
        )}

        {beat === 'error' && (
          <div className="flex min-h-[60vh] flex-col justify-center text-center">
            <h1 className={`${ENERGY_DISPLAY_FONT} text-3xl leading-tight text-[#1B3A2D]`}>
              We could not put that together
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[#4F645A]">
              Your answers are saved. Reload this page and it will pick up where you left off.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * The screen that announces a chapter. Its own component so the four of
 * them are identical by construction, and so the transition is a real beat
 * with a button rather than a heading that flashes past.
 */
function ChapterTransition({ chapter, onContinue }: { chapter: number; onContinue: () => void }) {
  const content = ENERGY_CHAPTERS[chapter - 1];
  if (!content) return null;

  return (
    <div className="flex min-h-[70vh] flex-col justify-center">
      <IntroReveal
        eyebrow={content.eyebrow}
        title={content.title}
        titleClassName={`${ENERGY_DISPLAY_FONT} text-[2.25rem] leading-tight text-[#1B3A2D]`}
        lines={[...content.lines]}
        storageKey={`energy-map-chapter-${chapter}`}
        button={{ label: 'Continue', onClick: onContinue }}
      />
    </div>
  );
}
