'use client';

/**
 * The Rooted Reset Health Appraisal Questionnaire, as the member walks it:
 * the intro, two or three questions a screen through ten Parts, the body
 * map, and a calm completion.
 *
 * PRESENTATION ONLY. It reuses the answering flow the other questionnaires
 * share (lib/questionnaire/groups.ts for screen sizes, QuestionBlock and
 * QuestionOptionButton for a question and its answers, SectionTransition for
 * the beat, useScreenTop, AssessmentProgressBar) and it never sees a value,
 * a total or a colour. Every answer is a response name ("often"), saved the
 * moment she taps it; the database turns it into whatever it is worth.
 *
 * WHAT SHE ALWAYS KNOWS. The Part and the Section she is in, BY NAME, at the
 * top of every question screen ("Endocrine" over "Thyroid"), and "Part X of
 * 10" over a thin line. A Part that is one section is named once. No roman
 * numeral, and never how many questions are left.
 *
 * CONTINUE IS THE ONLY THING THAT MOVES HER. No auto advance. Back moves one
 * screen, across a section boundary too, and every earlier answer can be
 * changed until she completes.
 *
 * SAVES OVERLAP ON PURPOSE, the reason AssessmentTaker gives: a queue makes
 * round trips additive and a member who closes the tab loses answers. Each
 * one is sent with keepalive so a save already in flight survives the page
 * going away, and exit and completion wait for every save first.
 *
 * WHERE SHE PICKS UP comes from the server (lib/haq/walk.ts): the first
 * screen with an unanswered question, or the body map once all are answered.
 * The intro is shown only before an instance exists, so it is never shown
 * twice for one instance.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronLeft, Clock3, Info, Loader2 } from 'lucide-react';
import { beginHaqAction, completeHaqAction } from '@/app/actions/haq';
import { AssessmentProgressBar } from '@/components/assessments/AssessmentProgressBar';
import { QuestionOptionButton } from '@/components/assessments/QuestionOptionButton';
import { BeginAssessmentForm } from '@/components/assessments/BeginAssessmentForm';
import { QuestionBlock } from '@/components/questionnaire/QuestionBlock';
import { SectionTransition, SECTION_TRANSITION_MS } from '@/components/questionnaire/SectionTransition';
import { BackButton } from '@/components/BackButton';
import { Card, CenterStage } from '@/components/layout';
import { SuccessCheck } from '@/components/motion/SuccessCheck';
import { CVS_DISPLAY_FONT } from '@/components/core-values-snapshot/theme';
import { prefersReducedMotionNow } from '@/lib/motion/useReducedMotion';
import { useScreenTop } from '@/lib/questionnaire/useScreenTop';
import { HAQ_ESTIMATED_MINUTES, HAQ_LABEL, HAQ_RESULTS_ROUTE } from '@/lib/haq/constants';
import { HAQ_RESPONSE_OPTIONS } from '@/lib/haq/questionBank';
import {
  HAQ_BACK_LABEL,
  HAQ_BEGIN_LABEL,
  HAQ_BLOCKED_HINT,
  HAQ_BODY_MAP_SAVE_FAILED,
  HAQ_BODY_MAP_TITLE,
  HAQ_COMPLETION_COACH_LINE,
  HAQ_COMPLETION_HOME_LABEL,
  HAQ_COMPLETION_STATEMENT,
  HAQ_CONTINUE_LABEL,
  HAQ_DEFINITIONS_CONTROL_LABEL,
  HAQ_DEFINITIONS_HEADING,
  HAQ_EXIT_LABEL,
  HAQ_FINISH_FAILED,
  HAQ_FINISH_LABEL,
  HAQ_INTRO_FRAMING,
  HAQ_INTRO_REASSURANCE,
  HAQ_INTRO_SAVE_LINE,
  HAQ_SAVE_FAILED,
  HAQ_SEE_RESULTS_LABEL,
  haqNextLine,
  haqSectionCompleteHeading,
} from '@/lib/haq/copy';
import {
  buildHaqScreens,
  haqBeatNames,
  haqBodyMapIndex,
  haqProgressLabel,
  haqProgressPercent,
  haqScreenHeading,
  isHaqScreenAnswered,
  type HaqAnswers,
} from '@/lib/haq/walk';
import type { HaqBodyIssueType, HaqBodyMark, HaqBodySide } from '@/lib/haq/bodyMap';
import type { HaqResponse } from '@/lib/haq/types';
import { HaqAnswerDefinitionList, HaqAnswerDefinitionsSheet } from './HaqAnswerDefinitions';
import { HaqBodyMap } from './HaqBodyMap';

export type HaqExperienceStatus = 'pending' | 'in_progress' | 'completed';

type Beat = { heading: string; nextLine: string; to: number };

export function HaqExperience({
  status,
  initialAnswers,
  initialMarks,
  initialScreenIndex,
}: {
  status: HaqExperienceStatus;
  initialAnswers: HaqAnswers;
  initialMarks: HaqBodyMark[];
  /** Where the server says she picks up. Ignored unless she is in progress. */
  initialScreenIndex: number;
}) {
  if (status === 'pending') return <HaqIntro />;
  // A revisit, not the moment she finished: no celebration haptic. See HaqCompletion.
  if (status === 'completed') return <HaqCompletion celebrate={false} />;
  return (
    <HaqWalk initialAnswers={initialAnswers} initialMarks={initialMarks} initialScreenIndex={initialScreenIndex} />
  );
}

function HaqIntro() {
  useScreenTop('haq-intro');
  return (
    <div data-testid="haq-intro">
      <BackButton fallbackHref="/questionnaires" label="Back to Questionnaires" forceFallback />
      <Card className="mef-animate-in mt-4">
        <h1 className={`${CVS_DISPLAY_FONT} text-[34px] leading-tight text-[#1B3A2D]`}>{HAQ_LABEL}</h1>
        <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#F5F0E4] px-4 py-2.5 text-sm text-[#1B3A2D]">
          <Clock3 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          About {HAQ_ESTIMATED_MINUTES} minutes
        </div>
        <p className="mt-5 text-[16px] leading-relaxed text-[#1B3A2D]">{HAQ_INTRO_FRAMING}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-[#4F645A]">{HAQ_INTRO_REASSURANCE}</p>

        <h2 className="mt-7 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#6B7A72]">
          {HAQ_DEFINITIONS_HEADING}
        </h2>
        <div className="mt-3">
          <HaqAnswerDefinitionList />
        </div>

        <p className="mt-5 text-[13.5px] leading-relaxed text-[#6B7A72]">{HAQ_INTRO_SAVE_LINE}</p>
        <BeginAssessmentForm action={beginHaqAction} label={HAQ_BEGIN_LABEL} className="mt-6" />
      </Card>
    </div>
  );
}

/**
 * THE BUZZ BELONGS TO THE MOMENT SHE FINISHED, and to nothing else. Arriving
 * here by tapping Complete is that moment. Opening a finished sitting again
 * later is not, and a browser blocks a vibration on a page nobody has tapped
 * yet and logs an error for it, which is a real console error on a screen
 * that did nothing wrong.
 */
function HaqCompletion({ celebrate = true }: { celebrate?: boolean }) {
  useScreenTop('haq-complete');
  return (
    <CenterStage>
      <Card className="mef-animate-in text-center" data-testid="haq-completion">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#F5F0E4]">
          <SuccessCheck size={56} color="#B89340" haptic={celebrate} />
        </span>
        <p className={`${CVS_DISPLAY_FONT} mt-5 text-[28px] leading-snug text-[#1B3A2D]`}>{HAQ_COMPLETION_STATEMENT}</p>
        <p className="mt-3 text-[15px] leading-relaxed text-[#4F645A]">{HAQ_COMPLETION_COACH_LINE}</p>
        {/*
          THE COMPLETION STILL CARRIES NO RESULT. It offers the way to one,
          which is a link and not a reading: no colour, no label and no
          number appears until she chooses to open it.
        */}
        <Link
          href={HAQ_RESULTS_ROUTE as Route}
          data-testid="haq-see-results"
          className="mef-press mef-focus-ring mt-7 block w-full rounded-2xl bg-[#C4A050] px-6 py-4 text-center text-sm font-semibold text-[#173025] shadow-[0_10px_24px_-14px_rgba(176,143,62,0.9)]"
        >
          {HAQ_SEE_RESULTS_LABEL}
        </Link>
        <Link
          href={'/dashboard' as Route}
          className="mef-press mef-focus-ring mt-3 block w-full rounded-2xl border border-[#1B3A2D]/12 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D]"
        >
          {HAQ_COMPLETION_HOME_LABEL}
        </Link>
      </Card>
    </CenterStage>
  );
}

async function postOnce(url: string, body: unknown): Promise<{ ok: boolean; [key: string]: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  });
  if (!response.ok) return { ok: false };
  return (await response.json()) as { ok: boolean };
}

/**
 * ONE WRITE, AND A SECOND TRY BEFORE SHE IS TOLD IT FAILED.
 *
 * A refused or dropped request is retried once, the same discipline the
 * Turnstile submissions use, because the first request to a route can be the
 * one that pays for a cold start and a member who taps an answer or an area
 * and is handed an error would have to notice the small line and tap again.
 * Found on production, 2026-09-17: the first body map mark of a sitting was
 * not stored and the screen said so quietly. A second failure is still hers
 * to see: this retries, it never pretends.
 *
 * It is not a queue. Each tap still fires immediately and they still overlap,
 * because a queue makes the round trips additive and costs a member who
 * closes the tab her last answers (see AssessmentTaker's own note).
 */
async function postJson(url: string, body: unknown): Promise<{ ok: boolean; [key: string]: unknown }> {
  try {
    const first = await postOnce(url, body);
    if (first.ok) return first;
  } catch {
    /* a network failure is a reason to try again, not a reason to stop */
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  return postOnce(url, body);
}

function HaqWalk({
  initialAnswers,
  initialMarks,
  initialScreenIndex,
}: {
  initialAnswers: HaqAnswers;
  initialMarks: HaqBodyMark[];
  initialScreenIndex: number;
}) {
  const router = useRouter();
  const screens = useMemo(() => buildHaqScreens(), []);
  const bodyMapIndex = haqBodyMapIndex(screens);

  const [answers, setAnswers] = useState<HaqAnswers>(initialAnswers);
  const [index, setIndex] = useState(() => Math.max(0, Math.min(initialScreenIndex, bodyMapIndex)));
  const [beat, setBeat] = useState<Beat | null>(null);
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishing, startFinishing] = useTransition();

  const [marks, setMarks] = useState<HaqBodyMark[]>(initialMarks);
  const [markBusy, setMarkBusy] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  const beatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaves = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    return () => {
      if (beatTimer.current) clearTimeout(beatTimer.current);
    };
  }, []);

  const onBodyMap = index >= bodyMapIndex;
  const screen = onBodyMap ? null : screens[index]!;

  useScreenTop(completed ? 'haq-complete' : beat ? 'haq-beat' : `haq-screen-${index}`);

  function trackSave(run: Promise<unknown>) {
    const outstanding = pendingSaves.current;
    pendingSaves.current = outstanding ? Promise.all([outstanding.catch(() => undefined), run]) : run;
  }

  async function waitForSaves() {
    try {
      if (pendingSaves.current) await pendingSaves.current;
    } catch {
      // A failed save has already said so on the screen.
    }
  }

  function choose(questionKey: string, value: HaqResponse) {
    setSaveError(null);
    setAnswers((previous) => ({ ...previous, [questionKey]: value }));
    trackSave(
      postJson('/api/haq/answer', { questionKey, value })
        .then((result) => {
          if (!result.ok) setSaveError(HAQ_SAVE_FAILED);
        })
        .catch(() => setSaveError(HAQ_SAVE_FAILED))
    );
  }

  function goNext() {
    if (!screen || beat || !isHaqScreenAnswered(screen, answers)) return;
    const to = index + 1;
    // The names come from the walk, which knows whether this move leaves the
    // Part: a Part boundary is named by its Part, a move inside one by its
    // sections. Null is a move that stays in the section, and has no beat.
    const names = haqBeatNames(screens, index, to);
    if (!names || prefersReducedMotionNow()) {
      setIndex(to);
      return;
    }
    setBeat({
      heading: haqSectionCompleteHeading(names.completed),
      nextLine: haqNextLine(names.next ?? HAQ_BODY_MAP_TITLE),
      to,
    });
    beatTimer.current = setTimeout(() => {
      beatTimer.current = null;
      setIndex(to);
      setBeat(null);
    }, SECTION_TRANSITION_MS);
  }

  function goBack() {
    if (beat) return;
    setIndex((current) => Math.max(0, current - 1));
  }

  function exit() {
    setExiting(true);
    void (async () => {
      await waitForSaves();
      router.push('/questionnaires' as Route);
    })();
  }

  async function addMark(input: { location: string; side: HaqBodySide; issueType: HaqBodyIssueType }) {
    setMarkBusy(true);
    setMarkError(null);
    try {
      const result = await postJson('/api/haq/body-map', { action: 'add', ...input });
      const mark = result.ok ? (result.mark as HaqBodyMark | undefined) : undefined;
      if (!mark) {
        setMarkError(HAQ_BODY_MAP_SAVE_FAILED);
      } else {
        setMarks((current) => (current.some((m) => m.id === mark.id) ? current : [...current, mark]));
      }
    } catch {
      setMarkError(HAQ_BODY_MAP_SAVE_FAILED);
    } finally {
      setMarkBusy(false);
    }
  }

  async function removeMark(markId: string) {
    setMarkBusy(true);
    setMarkError(null);
    try {
      const result = await postJson('/api/haq/body-map', { action: 'remove', markId });
      if (!result.ok) setMarkError(HAQ_BODY_MAP_SAVE_FAILED);
      else setMarks((current) => current.filter((m) => m.id !== markId));
    } catch {
      setMarkError(HAQ_BODY_MAP_SAVE_FAILED);
    } finally {
      setMarkBusy(false);
    }
  }

  function finish() {
    setFinishError(null);
    startFinishing(async () => {
      await waitForSaves();
      try {
        const result = await completeHaqAction();
        if (result.ok) setCompleted(true);
        else setFinishError(result.error || HAQ_FINISH_FAILED);
      } catch {
        setFinishError(HAQ_FINISH_FAILED);
      }
    });
  }

  if (completed) return <HaqCompletion />;

  if (beat) {
    return (
      <Card className="mef-screen-enter mt-5">
        <SectionTransition tone="light" heading={beat.heading} nextLine={beat.nextLine} />
      </Card>
    );
  }

  const topBar = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={exit}
        disabled={exiting}
        className="mef-press mef-focus-ring inline-flex min-h-[44px] items-center gap-1 rounded-lg text-sm font-medium text-[#6B7A72] transition hover:text-[#1B3A2D] disabled:opacity-60"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {exiting ? 'Saving…' : HAQ_EXIT_LABEL}
      </button>
      <button
        type="button"
        onClick={() => setShowDefinitions(true)}
        aria-label={HAQ_DEFINITIONS_CONTROL_LABEL}
        data-testid="haq-definitions-control"
        className="mef-press mef-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full text-[#1B3A2D] transition hover:bg-[#1B3A2D]/5"
      >
        <Info className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );

  const backButton = (
    <button
      type="button"
      onClick={goBack}
      className="mef-press mef-focus-ring inline-flex min-h-[48px] shrink-0 items-center gap-1 rounded-2xl border border-[#1B3A2D]/12 px-4 text-sm font-medium text-[#1B3A2D] transition hover:bg-[#F3F6F4]"
    >
      <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      {HAQ_BACK_LABEL}
    </button>
  );

  const primaryClass =
    'mef-press mef-focus-ring inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#C4A050] px-6 text-sm font-semibold text-[#173025] shadow-[0_10px_24px_-14px_rgba(176,143,62,0.9)] transition hover:brightness-[0.97] disabled:cursor-not-allowed disabled:bg-[#1B3A2D]/10 disabled:text-[#1B3A2D]/40 disabled:shadow-none';

  if (!screen) {
    return (
      <div>
        {topBar}
        <div className="mt-3">
          <AssessmentProgressBar
            tone="gold"
            currentNumber={1}
            totalQuestions={1}
            label={haqProgressLabel(10)}
            percent={100}
          />
        </div>
        <Card key="haq-body-map" className="mef-screen-enter mt-6">
          <HaqBodyMap marks={marks} error={markError} onAdd={addMark} onRemove={removeMark} />
        </Card>
        {finishError && (
          <p className="mt-3 text-sm text-[#8A4B2A]" role="alert">
            {finishError}
          </p>
        )}
        <div className="mt-5 flex items-center gap-3">
          {backButton}
          <button type="button" onClick={finish} disabled={finishing || markBusy} className={primaryClass}>
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {HAQ_FINISH_LABEL}
          </button>
        </div>
        {showDefinitions && <HaqAnswerDefinitionsSheet onClose={() => setShowDefinitions(false)} />}
      </div>
    );
  }

  const answered = isHaqScreenAnswered(screen, answers);
  const heading = haqScreenHeading(screen);

  return (
    <div>
      {topBar}
      <div className="mt-3">
        <AssessmentProgressBar
          tone="gold"
          currentNumber={1}
          totalQuestions={1}
          label={haqProgressLabel(screen.partNumber)}
          percent={haqProgressPercent(screens, index)}
        />
      </div>

      <Card key={`haq-screen-${index}`} className="mef-screen-enter mt-6">
        <header data-testid="haq-screen-header">
          {heading.eyebrow && (
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#B89340]" data-testid="haq-part-heading">
              {heading.eyebrow}
            </p>
          )}
          <h1
            className={`${CVS_DISPLAY_FONT} ${heading.eyebrow ? 'mt-1.5' : ''} text-[28px] leading-tight text-[#1B3A2D]`}
            data-testid="haq-section-title"
          >
            {heading.title}
          </h1>
          {screen.section.intro && (
            <p className="mt-3 rounded-2xl bg-[#F5F0E4] px-4 py-3 text-[15px] leading-relaxed text-[#1B3A2D]" data-testid="haq-section-intro">
              {screen.section.intro}
            </p>
          )}
        </header>

        <ol className="mt-6 list-none">
          {screen.questions.map((question, position) => (
            <QuestionBlock
              key={question.key}
              tone="light"
              prompt={question.prompt}
              promptId={`haq-prompt-${question.key}`}
              withDivider={position > 0}
            >
              {HAQ_RESPONSE_OPTIONS[question.responseType].map((option) => (
                <QuestionOptionButton
                  key={option.value}
                  tone="gold-on-light"
                  label={option.label}
                  selected={answers[question.key] === option.value}
                  onSelect={() => choose(question.key, option.value)}
                />
              ))}
            </QuestionBlock>
          ))}
        </ol>
      </Card>

      {saveError && (
        <p className="mt-3 text-sm text-[#8A4B2A]" role="alert">
          {saveError}
        </p>
      )}

      {!answered && <p className="mt-4 text-center text-sm text-[#6B7A72]">{HAQ_BLOCKED_HINT}</p>}

      <div className="mt-5 flex items-center gap-3">
        {index > 0 && backButton}
        <button type="button" onClick={goNext} disabled={!answered} className={primaryClass}>
          {HAQ_CONTINUE_LABEL}
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-[#6B7A72]">{HAQ_INTRO_SAVE_LINE}</p>

      {showDefinitions && <HaqAnswerDefinitionsSheet onClose={() => setShowDefinitions(false)} />}
    </div>
  );
}
