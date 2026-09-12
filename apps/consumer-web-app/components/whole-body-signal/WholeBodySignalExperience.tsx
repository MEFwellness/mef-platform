'use client';

/**
 * The MEF Whole-Body Signal Assessment, whole, on one route.
 *
 * THE COMPLETED PANEL LIVES HERE, NOT ON THE PAGE. Submitting calls a
 * Server Action, and a Server Action re-renders the route it was called
 * from. With the branch inside this component the re-render hands it a new
 * `status` prop while it stays MOUNTED, so its own step survives and her
 * results stand until she leaves.
 *
 * ONE QUESTION PER SCREEN, AND THAT IS DELIBERATE. This app's other
 * questionnaires put two or three on a screen. This instrument does not:
 * the question sits in the upper middle of a phone, the five answers sit
 * in thumb reach, a normal question screen never scrolls, and the
 * transition to the next one is two tenths of a second. Do not "correct"
 * this to the app-wide pattern.
 *
 * A TAP IS THE ANSWER AND THE ADVANCE. With ninety six questions, asking
 * for a Continue under each one would be a hundred and ninety two taps for
 * ninety six answers. The correction path is Back, which keeps the answer
 * on screen so changing it is one tap rather than a restart. The screens
 * that are NOT a question, the section intro and the section beat, carry a
 * real Continue, because there is nothing on them to tap instead.
 *
 * EVERY SECTION OPENS AND CLOSES WITH ITS OWN BEAT. The intro names the
 * section, says in one line what it is about, and plays that section's own
 * abstract motion cue from its stored row. The close says the section is
 * complete and names the next one. The last section closes into the
 * completion reveal instead, because there is no next section to name.
 *
 * SAVE AND RESUME AFTER EVERY ANSWER. Each tap writes the whole draft a
 * moment later through a route handler rather than a Server Action, for
 * the reason that route's own header gives: a Server Action's response is
 * the entire re-rendered page, and ninety six of those is not affordable.
 * A waiting save is flushed on `pagehide` and on `visibilitychange`, so a
 * member who taps and switches to her mail app has already been saved.
 *
 * NOTHING FROM THE PRACTITIONER LAYER IS REACHABLE FROM HERE. This file
 * imports no Zone module, no pattern module, no coaching question module
 * and no coach copy, and the bundle it is handed carries no Zone, organ,
 * gland, coach topic, colour or percentage at all.
 * tests/whole-body-signal-member-payload.test.ts walks its import graph
 * and the built props and fails if that ever changes.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ArrowRight, Home } from 'lucide-react';
import { IntroReveal } from '@/components/IntroReveal';
import { QuestionOptionButton } from '@/components/assessments/QuestionOptionButton';
import { useScreenTop } from '@/lib/questionnaire/useScreenTop';
import { prefersReducedMotionNow } from '@/lib/motion/useReducedMotion';
import { fillToken, memberCopy } from '@/lib/whole-body-signal/copyKeys';
import { PNTA_VALUE } from '@/lib/whole-body-signal/constants';
import {
  buildSteps,
  completedSectionCount,
  completionStepIndex,
  resumeStepIndex,
  type WbsStep,
} from '@/lib/whole-body-signal/steps';
import { shownQuestions } from '@/lib/whole-body-signal/scoring';
import { submitWholeBodySignalAction } from '@/app/actions/wholeBodySignal';
import type { MemberContent } from '@/lib/whole-body-signal/contentData';
import type { MemberResultsView } from '@/lib/whole-body-signal/memberView';
import type { WbsAnswers } from '@/lib/whole-body-signal/types';
import { SectionMotion } from './SectionMotion';
import { SignalReveal } from './SignalReveal';
import { WholeBodySignalResults } from './WholeBodySignalResults';

const PANEL =
  'relative w-full overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(14,31,23,0.35)]';
const PRIMARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#C4A050] px-6 py-3.5 text-sm font-semibold text-[#173025] transition hover:brightness-[0.97] disabled:cursor-not-allowed disabled:bg-[#F5F0E4]/12 disabled:text-[#F5F0E4]/35';
const QUIET =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95';

/**
 * How long a tap waits before the draft is written, and how long the beat
 * between a tap and the next question lasts.
 *
 * The advance is at the fast end of the instrument's 150 to 250ms brief,
 * because it fires ninety six times. The save waits longer than the
 * advance on purpose: three taps in a row are one write, and her own
 * Continue on a section beat cancels the timer and writes immediately.
 */
const ADVANCE_MS = 220;
const AUTOSAVE_DELAY_MS = 700;
/** The section intro's own beat, before it moves on by itself. */
const SECTION_INTRO_AUTO_MS = 1500;

type Finished = { sessionId: string; view: MemberResultsView };

export function WholeBodySignalExperience({
  status,
  content,
  resumeAnswers,
  resumeRoutingOptionKey,
  completedView,
}: {
  status: 'pending' | 'in_progress' | 'completed';
  content: MemberContent;
  resumeAnswers: WbsAnswers;
  resumeRoutingOptionKey: string | null;
  /** Her stored results, when she is opening a route she has already answered. */
  completedView: MemberResultsView | null;
}) {
  const router = useRouter();

  const [routingOptionKey, setRoutingOptionKey] = useState<string | null>(resumeRoutingOptionKey);
  const [answers, setAnswers] = useState<WbsAnswers>(resumeAnswers);

  const steps = useMemo(
    () =>
      buildSteps({
        sections: content.sections,
        questions: content.questions,
        branchRules: content.branchRules,
        routingOptionKey,
      }),
    [content.sections, content.questions, content.branchRules, routingOptionKey]
  );

  /*
    WHERE SHE PICKS UP IS DERIVED, NEVER A STORED INDEX ALONE.

    Section 8's length depends on what she answered to its routing
    question, so an index stored yesterday can mean a different screen
    today. The first thing she has not dealt with cannot, so that is what
    decides it. A stored index is still written, because it is what a
    coach's own diagnostics read, but nothing here trusts it.
  */
  const [stepIndex, setStepIndex] = useState(() =>
    resumeStepIndex({
      steps: buildSteps({
        sections: content.sections,
        questions: content.questions,
        branchRules: content.branchRules,
        routingOptionKey: resumeRoutingOptionKey,
      }),
      answers: resumeAnswers,
      routingOptionKey: resumeRoutingOptionKey,
    })
  );

  const hasStarted = Object.keys(resumeAnswers).length > 0 || resumeRoutingOptionKey !== null;
  const [showIntro, setShowIntro] = useState(status === 'pending' && !hasStarted);
  const [showResume, setShowResume] = useState(status === 'in_progress' && hasStarted);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  const step: WbsStep = steps[Math.min(stepIndex, steps.length - 1)] ?? steps[0]!;
  const lastIndex = completionStepIndex(steps);

  const section =
    step.kind !== 'completion'
      ? (content.sections.find((entry) => entry.sectionKey === step.sectionKey) ?? null)
      : null;
  const question =
    step.kind === 'question'
      ? (content.questions.find((entry) => entry.questionRef === step.questionRef) ?? null)
      : null;

  useScreenTop(
    showIntro
      ? 'intro'
      : showResume
        ? 'resume'
        : finished || status === 'completed'
          ? 'results'
          : `step-${stepIndex}-${step.kind}`
  );

  // ------------------------------------------------------------------
  // Saving.
  // ------------------------------------------------------------------

  const draftRef = useRef({ routingOptionKey, answers, stepIndex });
  draftRef.current = { routingOptionKey, answers, stepIndex };
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Writes go one at a time, in the order they were asked for. Two in
   * flight at once can land in either order, and the older one landing
   * last would store a position she has already left.
   */
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

  function chainSave<T>(run: () => Promise<T>): Promise<T> {
    const next = saveChain.current.catch(() => undefined).then(run);
    saveChain.current = next.catch(() => undefined);
    return next;
  }

  async function postDraft(draft: {
    routingOptionKey: string | null;
    answers: WbsAnswers;
    stepIndex: number;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch('/api/whole-body-signal/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(draft),
      });
      if (!response.ok) return { ok: false, error: memberCopy(content.copy, 'member.save_error') };
      return (await response.json()) as { ok: boolean; error?: string };
    } catch {
      return { ok: false, error: memberCopy(content.copy, 'member.save_error') };
    }
  }

  function cancelAutosave() {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
  }

  function queueAutosave() {
    cancelAutosave();
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null;
      // A failed autosave is not something to interrupt her with. The next
      // one writes the same draft, and the submit reports its own failure.
      void chainSave(() => postDraft(draftRef.current));
    }, AUTOSAVE_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      // The CURRENT value is the point: whichever timer is outstanding when
      // she leaves is the one that has to be cleared.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (introTimer.current) clearTimeout(introTimer.current);
    };
  }, []);

  /*
    A WAITING SAVE IS SENT THE MOMENT THE PAGE GOES AWAY.

    The autosave waits about three quarters of a second so that a run of
    taps is one write, and that is a window: a member who taps and reloads
    inside it had nothing sent at all. `pagehide` covers a reload, a back
    and a closed tab, and `visibilitychange` covers switching apps on a
    phone, which is the case that never fires pagehide on iOS.
  */
  useEffect(() => {
    const flush = () => {
      if (!autosaveTimer.current) return;
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
      void postDraft(draftRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // postDraft only reads props that never change for the life of a
    // sitting, so this is set up once rather than re-bound on every answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------------
  // Moving.
  // ------------------------------------------------------------------

  function goHome() {
    router.push('/dashboard');
  }

  function clearAdvance() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    if (introTimer.current) {
      clearTimeout(introTimer.current);
      introTimer.current = null;
    }
  }

  function goTo(next: number) {
    clearAdvance();
    setStepIndex(Math.max(0, Math.min(next, lastIndex)));
  }

  function goBack() {
    if (submitting || stepIndex === 0) return;
    setError(null);
    goTo(stepIndex - 1);
  }

  /** Her answer to one question. It is also the advance. */
  function chooseAnswer(questionRef: string, value: string) {
    if (submitting) return;
    setError(null);
    const nextAnswers = { ...answers, [questionRef]: value };
    setAnswers(nextAnswers);
    queueAutosave();

    // The last question finishes the sitting. Her tap is what does it, so
    // the reveal plays over a submit that is genuinely in flight rather
    // than over a wait invented to fill the time.
    const isLastQuestion = stepIndex >= lastIndex - 1 && steps[stepIndex + 1]?.kind === 'completion';
    clearAdvance();
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      setStepIndex((current) => Math.min(current + 1, lastIndex));
      if (isLastQuestion) void submit(routingOptionKey, nextAnswers);
    }, ADVANCE_MS);
  }

  /**
   * Her routing answer.
   *
   * CHANGING IT DROPS THE ANSWERS IT CLOSES. A member who came back and
   * chose a different branch would otherwise be carrying answers to
   * questions she is no longer being asked, and while the server drops
   * them too, leaving them here would make the screen think a section was
   * finished when its new questions are blank.
   */
  function chooseRouting(optionKey: string) {
    if (submitting) return;
    setError(null);
    const nextSteps = buildSteps({
      sections: content.sections,
      questions: content.questions,
      branchRules: content.branchRules,
      routingOptionKey: optionKey,
    });
    const allowed = new Set(
      shownQuestions(content.questions, optionKey, content.branchRules).map(
        (entry) => entry.questionRef
      )
    );
    const pruned: WbsAnswers = {};
    for (const [ref, value] of Object.entries(answers)) {
      if (allowed.has(ref)) pruned[ref] = value;
    }

    setRoutingOptionKey(optionKey);
    setAnswers(pruned);
    queueAutosave();

    clearAdvance();
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      setStepIndex((current) => Math.min(current + 1, completionStepIndex(nextSteps)));
    }, ADVANCE_MS);
  }

  function submit(routing: string | null, finalAnswers: WbsAnswers) {
    cancelAutosave();
    setSubmitting(true);
    setError(null);
    startTransition(async () => {
      const result = await chainSave(() => submitWholeBodySignalAction(routing, finalAnswers));
      setSubmitting(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFinished({ sessionId: result.sessionId, view: result.view });
    });
  }

  /** The section intro moves on by itself, unless she has asked for less motion. */
  useEffect(() => {
    if (showIntro || showResume || finished) return;
    if (step.kind !== 'section_intro') return;
    if (prefersReducedMotionNow()) return;
    if (introTimer.current) clearTimeout(introTimer.current);
    introTimer.current = setTimeout(() => {
      introTimer.current = null;
      setStepIndex((current) => Math.min(current + 1, lastIndex));
    }, SECTION_INTRO_AUTO_MS);
    return () => {
      if (introTimer.current) clearTimeout(introTimer.current);
      introTimer.current = null;
    };
  }, [step, stepIndex, showIntro, showResume, finished, lastIndex]);

  // ------------------------------------------------------------------
  // Screens.
  // ------------------------------------------------------------------

  // A sitting she finished on an earlier visit, or one she opened again
  // from a link. She has not just submitted, so this is the honest answer
  // rather than a silent redirect.
  if (status === 'completed' && !finished) {
    return (
      <div className={PANEL}>
        <Glow />
        <Chrome onHome={goHome} copy={content.copy} />
        <h1 className="relative mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
          {memberCopy(content.copy, 'member.already_done_heading')}
        </h1>
        <p className="relative mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/85">
          {memberCopy(content.copy, 'member.already_done_body')}
        </p>
        {completedView ? (
          <div className="relative mt-8">
            <WholeBodySignalResults
              view={completedView}
              copy={content.copy}
              action={
                <button type="button" onClick={goHome} className={`${QUIET} mt-6`}>
                  {memberCopy(content.copy, 'member.results_done')}
                </button>
              }
            />
          </div>
        ) : (
          <button type="button" onClick={goHome} className={`${QUIET} relative mt-7`}>
            {memberCopy(content.copy, 'member.results_done')}
          </button>
        )}
      </div>
    );
  }

  if (finished) {
    return (
      <div className={PANEL}>
        <Glow />
        <Chrome onHome={goHome} copy={content.copy} />
        <div className="relative mt-4">
          <WholeBodySignalResults
            view={finished.view}
            copy={content.copy}
            action={
              <button type="button" onClick={goHome} className={`${QUIET} mt-6`}>
                {memberCopy(content.copy, 'member.results_done')}
              </button>
            }
          />
        </div>
      </div>
    );
  }

  if (showIntro) {
    return (
      <div className={PANEL}>
        <Glow />
        <Chrome onHome={goHome} copy={content.copy} />
        <div className="relative mt-2">
          <SignalReveal />
        </div>
        <div className="relative mt-2">
          <IntroReveal
            title={memberCopy(content.copy, 'member.intro_title')}
            titleTag="h1"
            titleClassName="font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]"
            lines={[
              memberCopy(content.copy, 'member.intro_line_1'),
              memberCopy(content.copy, 'member.intro_line_2'),
              memberCopy(content.copy, 'member.intro_line_3'),
            ]}
            lineClassName="text-[16px] leading-relaxed text-[#F5F0E4]/85"
            storageKey="whole-body-signal-intro"
            /*
              THE INTRO MOVES EVERY TIME, AND IT IS OVER IN UNDER A SECOND.
              IntroReveal's default plays once per device and hands out the
              finished state forever after, which is right for a welcome
              and wrong for the screen standing between a member and a task
              her coach asked her to do.
            */
            pace="brisk"
            replay
            button={{
              label: memberCopy(content.copy, 'member.intro_button'),
              onClick: () => setShowIntro(false),
              className: `${PRIMARY} mt-8`,
            }}
          />
        </div>
      </div>
    );
  }

  if (showResume) {
    const done = completedSectionCount({
      sections: content.sections,
      questions: content.questions,
      branchRules: content.branchRules,
      answers,
      routingOptionKey,
    });
    return (
      <div className={PANEL}>
        <Glow />
        <Chrome onHome={goHome} copy={content.copy} />
        <div className="mef-wbs-intro-in relative mt-4">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
            {memberCopy(content.copy, 'member.resume_title')}
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/85">
            {fillToken(memberCopy(content.copy, 'member.resume_body'), 'n', String(done))}
          </p>
          <button type="button" onClick={() => setShowResume(false)} className={`${PRIMARY} mt-8`}>
            {memberCopy(content.copy, 'member.resume_cta')}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (step.kind === 'completion') {
    return (
      <div className={PANEL}>
        <Glow />
        <Chrome onHome={goHome} copy={content.copy} />
        <div className="mef-wbs-intro-in relative mt-6 text-center">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[32px] leading-tight text-[#F5F0E4]">
            {memberCopy(content.copy, 'member.completion_title')}
          </h1>
          <p className="mx-auto mt-3 max-w-[24rem] text-[16px] leading-relaxed text-[#F5F0E4]/80">
            {memberCopy(content.copy, 'member.completion_body')}
          </p>
          <div className="mt-7">
            <SignalReveal />
          </div>

          {error && (
            <p role="alert" className="mt-6 text-sm text-[#F5B7A0]">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              if (finished) return;
              submit(routingOptionKey, answers);
            }}
            className={`${PRIMARY} mt-8`}
          >
            {memberCopy(content.copy, 'member.completion_cta')}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (step.kind === 'section_intro' && section) {
    return (
      <div className={PANEL}>
        <Glow />
        <div className="relative flex items-center justify-between gap-4">
          <BackControl onBack={goBack} copy={content.copy} visible={stepIndex > 0} />
          <HomeButton onHome={goHome} copy={content.copy} />
        </div>

        <div className="mef-wbs-intro-in relative mt-6 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {`Section ${step.sectionNumber} of ${step.sectionCount}`}
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]">
            {section.displayName}
          </h1>
          <p className="mx-auto mt-3 max-w-[22rem] text-[16px] leading-relaxed text-[#F5F0E4]/80">
            {section.memberTransitionLine}
          </p>

          <div className="mt-6">
            <SectionMotion cue={section.motionCue} />
          </div>

          <p className="mt-5 text-[13px] text-[#F5F0E4]/50">
            {memberCopy(content.copy, 'member.transition_micro_line')}
          </p>

          <button type="button" onClick={() => goTo(stepIndex + 1)} className={`${PRIMARY} mt-8`}>
            {memberCopy(content.copy, 'member.continue')}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (step.kind === 'section_complete' && section) {
    const next = content.sections.find((entry) => entry.sectionKey === step.nextSectionKey);
    return (
      <div className={PANEL}>
        <Glow />
        <div className="relative flex items-center justify-between gap-4">
          <BackControl onBack={goBack} copy={content.copy} visible />
          <HomeButton onHome={goHome} copy={content.copy} />
        </div>

        <div className="mef-wbs-intro-in relative mt-6 text-center">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[28px] leading-tight text-[#F5F0E4]">
            {`${section.displayName} ${memberCopy(content.copy, 'member.section_complete_suffix')}`}
          </h1>
          <p className="mx-auto mt-3 max-w-[22rem] text-[16px] leading-relaxed text-[#F5F0E4]/80">
            {memberCopy(content.copy, 'member.section_complete_line')}
          </p>

          <div className="mt-7">
            <SectionMarkers
              total={step.sectionCount}
              current={step.sectionNumber}
              completedThrough={step.sectionNumber}
              glowIndex={step.sectionNumber}
            />
          </div>

          {next && (
            <p className="mt-6 text-[13px] uppercase tracking-wider text-[#C4A050]">
              {`${memberCopy(content.copy, 'member.next_section_label')}: ${next.displayName}`}
            </p>
          )}

          <button type="button" onClick={() => goTo(stepIndex + 1)} className={`${PRIMARY} mt-6`}>
            {memberCopy(content.copy, 'member.continue')}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (step.kind === 'routing' && section) {
    return (
      <div className={PANEL}>
        <Glow />
        <Header
          step={step}
          sectionName={section.displayName}
          onBack={goBack}
          onHome={goHome}
          copy={content.copy}
          canGoBack={stepIndex > 0}
        />

        <div key={`routing-${stepIndex}`} className="mef-wbs-question-in relative mt-7">
          <p className="text-[13px] uppercase tracking-wider text-[#F5F0E4]/45">
            {memberCopy(content.copy, 'member.branch_intro')}
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[24px] leading-snug text-[#F5F0E4]">
            {memberCopy(content.copy, 'member.branch_question')}
          </h1>

          <div role="radiogroup" aria-label={memberCopy(content.copy, 'member.branch_question')} className="mt-6 space-y-2.5">
            {content.routingOptions.map((option) => (
              <QuestionOptionButton
                key={option.optionKey}
                tone="gold-on-forest"
                label={option.label}
                selected={routingOptionKey === option.optionKey}
                onSelect={() => chooseRouting(option.optionKey)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (step.kind === 'question' && question && section) {
    const chosen = answers[question.questionRef];
    return (
      <div className={PANEL}>
        <Glow />
        <Header
          step={step}
          sectionName={section.displayName}
          onBack={goBack}
          onHome={goHome}
          copy={content.copy}
          canGoBack={stepIndex > 0}
        />

        <div key={`q-${question.questionRef}`} className="mef-wbs-question-in relative mt-8">
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[24px] leading-snug text-[#F5F0E4]">
            {question.prompt}
          </h1>

          <div role="radiogroup" aria-label={question.prompt} className="mt-7 space-y-2.5">
            {content.scale.map((option) => (
              <QuestionOptionButton
                key={option.valueKey}
                tone="gold-on-forest"
                label={option.label}
                selected={chosen === option.valueKey}
                onSelect={() => chooseAnswer(question.questionRef, option.valueKey)}
              />
            ))}
            {question.allowsPnta && (
              <QuestionOptionButton
                tone="gold-on-forest"
                label={memberCopy(content.copy, 'member.pnta_label')}
                selected={chosen === PNTA_VALUE}
                onSelect={() => chooseAnswer(question.questionRef, PNTA_VALUE)}
              />
            )}
          </div>

          {error && (
            <p role="alert" className="mt-5 text-sm text-[#F5B7A0]">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Unreachable with well formed content. Rendering the way out rather
  // than nothing, because a member on a screen with no exit is stuck.
  return (
    <div className={PANEL}>
      <Glow />
      <Chrome onHome={goHome} copy={content.copy} />
      <button type="button" onClick={goHome} className={`${QUIET} relative mt-7`}>
        {memberCopy(content.copy, 'member.results_done')}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------

function Glow() {
  return (
    <div
      className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#C4A050]/16 blur-3xl"
      aria-hidden="true"
    />
  );
}

function HomeButton({
  onHome,
  copy,
  disabled,
}: {
  onHome: () => void;
  copy: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onHome}
      disabled={disabled}
      aria-label={memberCopy(copy, 'member.home_label')}
      className="mef-focus-ring mef-press -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/60 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
    >
      <Home className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

function BackControl({
  onBack,
  copy,
  visible,
}: {
  onBack: () => void;
  copy: Record<string, string>;
  visible: boolean;
}) {
  if (!visible) return <span aria-hidden="true" className="h-9 w-9" />;
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={memberCopy(copy, 'member.back')}
      className="mef-focus-ring mef-press -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/70 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4]"
    >
      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/** The header on the screens with no progress of their own. */
function Chrome({ onHome, copy }: { onHome: () => void; copy: Record<string, string> }) {
  return (
    <div className="relative flex items-center justify-between gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
        {memberCopy(copy, 'member.popup_title')}
      </p>
      <HomeButton onHome={onHome} copy={copy} />
    </div>
  );
}

/**
 * The whole-assessment progress: one marker per section, filled behind
 * her, outlined ahead.
 *
 * IT COUNTS SECTIONS, WHICH IS THE UNIT SHE IS TOLD ABOUT. The
 * question level line under it counts the section she is in. Two lines,
 * two windows, and each one is named beside it.
 */
function SectionMarkers({
  total,
  current,
  completedThrough,
  glowIndex,
}: {
  total: number;
  current: number;
  completedThrough: number;
  glowIndex?: number;
}) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => {
        const number = index + 1;
        const done = number <= completedThrough;
        const here = number === current;
        return (
          <span
            key={number}
            className={`h-[3px] flex-1 rounded-full transition-colors duration-500 motion-reduce:transition-none ${
              done ? 'bg-[#C4A050]' : here ? 'bg-[#C4A050]/45' : 'bg-[#F5F0E4]/14'
            } ${number === glowIndex ? 'mef-wbs-bar' : ''}`}
          />
        );
      })}
    </div>
  );
}

/** The question screen's header: section name, dual progress, Back, Home. */
function Header({
  step,
  sectionName,
  onBack,
  onHome,
  copy,
  canGoBack,
}: {
  step: Extract<WbsStep, { kind: 'question' } | { kind: 'routing' }>;
  sectionName: string;
  onBack: () => void;
  onHome: () => void;
  copy: Record<string, string>;
  canGoBack: boolean;
}) {
  const inSection = step.kind === 'question' ? step.indexInSection : 0;
  const countInSection = step.kind === 'question' ? step.countInSection : 1;
  const percent = countInSection > 0 ? Math.round((inSection / countInSection) * 100) : 0;

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <BackControl onBack={onBack} copy={copy} visible={canGoBack} />
          <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {sectionName}
          </p>
        </div>
        <HomeButton onHome={onHome} copy={copy} />
      </div>

      <div className="mt-4">
        <SectionMarkers
          total={step.sectionCount}
          current={step.sectionNumber}
          completedThrough={step.sectionNumber - 1}
        />
        <div
          className="mt-2 h-px w-full overflow-hidden rounded-full bg-[#F5F0E4]/10"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Section ${step.sectionNumber} of ${step.sectionCount}`}
        >
          <div
            className="h-full rounded-full bg-[#C4A050] transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
