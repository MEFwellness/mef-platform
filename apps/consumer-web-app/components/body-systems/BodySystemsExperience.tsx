'use client';

/**
 * The MEF Body Systems Survey, whole, on one route.
 *
 * THE ALREADY-DONE PANEL LIVES HERE, NOT ON THE PAGE. Submitting calls a
 * Server Action, and a Server Action re-renders the route it was called
 * from. With the branch inside this component the re-render hands it a new
 * `status` prop while it stays MOUNTED, so its own step survives and her
 * results stand until she leaves. (Found live on production, 2026-08-28,
 * on the Weekly Reflection.)
 *
 * TWO OR THREE QUESTIONS PER SCREEN (2026-09-11). A section used to be one
 * screen, and a section can be ten questions long, which is a wall. A
 * section is now a short series of screens carrying two or three questions
 * each, with one Continue under each of them, and
 * `lib/questionnaire/groups.ts` owns the sizes, including the rule that
 * stops a section of ten ending on a screen with one lonely question.
 *
 * THE SECTION IS STILL THE UNIT EVERYTHING ELSE COUNTS IN. Progress counts
 * SECTIONS, "1 of 11", exactly as the specification asks, the six red flag
 * screens are still outside that count and still say so in their own
 * words, and the stored resume position is still a SECTION, so a draft
 * saved before this change resumes exactly where it always did. Which
 * screen inside that section she lands on is derived from her own stored
 * answers rather than stored a second time: the first question she has not
 * answered decides it.
 *
 * SHE ANSWERS BLIND, AND THAT IS THE POINT. While she is answering, no
 * screen names the body system its questions belong to, and that now
 * includes the beat between two sections, which says "Section complete"
 * and that another area is next, and names nothing. "Section 3 of 11" is
 * all the progress she is given, because a member who can see that she is
 * on the digestion questions answers the digestion questions differently.
 * The names are revealed on her results screen, beside the bars, where
 * they are a reading rather than a prompt. The names do not merely go
 * unrendered: `blindContent` strips them from the bundle this component is
 * handed at all (app/body-systems/page.tsx), so there is nothing in the
 * page payload to find either.
 *
 * EVERY CHANGE OF SCREEN STARTS AT THE TOP. See `useScreenTop`, which is
 * this component's own hook made shared, since the generic questionnaire
 * taker now has screens long enough to need exactly the same thing.
 *
 * TAP ONLY, EVERYWHERE. There is no text input in this component and no
 * free text anywhere in this feature. Five options on a scale question,
 * plus Does not apply to me where a question can genuinely not apply, plus
 * Yes and No on a red flag.
 *
 * SHE CAN ALWAYS LEAVE, AND LEAVING COSTS HER NOTHING. Home is on every
 * screen. Every tap autosaves the whole draft a moment later and her
 * Continue saves it outright, so closing the tab halfway through a screen
 * of three questions reopens on that screen with those answers still on it.
 *
 * A YES ON A RED FLAG ANSWERS ITSELF. The matching safety response is on
 * the screen in the same frame as her tap, from the stored row for that
 * item's level. There is no coach approval step anywhere in this path.
 *
 * NOTHING FROM THE COACH LAYER IS REACHABLE FROM HERE. This file imports
 * no association module, no pattern module and no coach copy, and
 * tests/body-systems-member-language.test.ts walks its import graph and
 * fails if that ever changes.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ArrowRight, Home } from 'lucide-react';
import { IntroReveal } from '@/components/IntroReveal';
import { QuestionBlock } from '@/components/questionnaire/QuestionBlock';
import {
  SectionTransition,
  SECTION_TRANSITION_MS,
  NEUTRAL_NEXT_LINE,
} from '@/components/questionnaire/SectionTransition';
import { AssessmentProgressBar } from '@/components/assessments/AssessmentProgressBar';
import { QuestionOptionButton } from '@/components/assessments/QuestionOptionButton';
import { memberCopy } from '@/lib/body-systems/copyKeys';
import { buildSteps, clampStepIndex, lastQuestionStepIndex } from '@/lib/body-systems/steps';
import { questionsInSection } from '@/lib/body-systems/scoring';
import { safetyResponseFor } from '@/lib/body-systems/redFlags';
import { chunkIntoGroups, groupIndexForItem, groupSizes } from '@/lib/questionnaire/groups';
import { useScreenTop } from '@/lib/questionnaire/useScreenTop';
import { prefersReducedMotionNow } from '@/lib/motion/useReducedMotion';
import {
  DNA_VALUE,
  type BodySystemsAnswers,
  type BodySystemsBranch,
  type BodySystemsQuestion,
  type BodySystemsRedFlagAnswers,
} from '@/lib/body-systems/types';
import type { AnsweringContent } from '@/lib/body-systems/contentData';
import type { MemberResultsView } from '@/lib/body-systems/memberView';
import { submitBodySystemsSurveyAction } from '@/app/actions/bodySystems';
import { BodySystemsResults } from './BodySystemsResults';

const PANEL =
  'relative w-full overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(14,31,23,0.35)]';
const PRIMARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40';
/**
 * Her Continue, and every button that moves her forward through a screen
 * of questions: muted warm gold, deep forest text, an arrow, and a
 * disabled state that reads as unavailable rather than as faded gold.
 */
const CONTINUE =
  'mef-focus-ring mef-press inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#C4A050] px-6 py-3.5 text-sm font-semibold text-[#173025] transition hover:brightness-[0.97] disabled:cursor-not-allowed disabled:bg-[#F5F0E4]/12 disabled:text-[#F5F0E4]/35';
const OPTION_BASE =
  'mef-focus-ring mef-press flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-[15px] transition';
const OPTION_OFF =
  'border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] text-[#F5F0E4] hover:bg-[#F5F0E4]/[0.12]';

/**
 * How long a tap waits before the draft is written.
 *
 * Long enough that answering three questions in a row is not three writes,
 * short enough that a member who taps and then closes the tab has already
 * been saved. Her Continue does not wait for it: it cancels the timer and
 * writes immediately.
 */
const AUTOSAVE_DELAY_MS = 900;

/** The section screen this branch answers last. Its own key, so the branch question is drawn once. */
function isBranchedSection(content: AnsweringContent, sectionKey: string): boolean {
  return content.questions.some(
    (question) => question.sectionKey === sectionKey && question.branch !== 'all'
  );
}

type Finished = { sessionId: string; view: MemberResultsView };

export function BodySystemsExperience({
  status,
  content,
  rememberedBranch,
  resumeAnswers,
  resumeRedFlagAnswers,
  resumeStepIndex,
  completedView,
}: {
  status: 'pending' | 'in_progress' | 'completed';
  content: AnsweringContent;
  /**
   * Her remembered branch, so the branch question is never re-asked.
   *
   * THE ASSIGNMENT ID IS DELIBERATELY NOT A PROP. Every write in this
   * feature resolves her own pending assignment on the server, so a client
   * holding one could only ever be a value a hand made request could
   * change. See app/actions/bodySystems.ts.
   */
  rememberedBranch: BodySystemsBranch | null;
  resumeAnswers: BodySystemsAnswers;
  resumeRedFlagAnswers: BodySystemsRedFlagAnswers;
  resumeStepIndex: number;
  /** Her stored results, when she is opening a route she has already answered. */
  completedView: MemberResultsView | null;
}) {
  const router = useRouter();
  const steps = useMemo(
    () => buildSteps(content.sections, content.redFlags),
    [content.sections, content.redFlags]
  );

  // A member who has never started sees the intro. One who is resuming
  // does not, because she has already been introduced to this.
  const [showIntro, setShowIntro] = useState(status === 'pending' && resumeStepIndex === 0);
  const [stepIndex, setStepIndex] = useState(() => clampStepIndex(steps, resumeStepIndex));
  const [branch, setBranch] = useState<BodySystemsBranch | null>(rememberedBranch);
  const [answers, setAnswers] = useState<BodySystemsAnswers>(resumeAnswers);
  const [redFlagAnswers, setRedFlagAnswers] =
    useState<BodySystemsRedFlagAnswers>(resumeRedFlagAnswers);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /** The step the section beat is on its way to, while it is playing. */
  const [transitionTo, setTransitionTo] = useState<number | null>(null);

  const step = steps[stepIndex] ?? steps[0]!;
  const lastQuestionStep = lastQuestionStepIndex(steps);

  /*
    THE TEN SHARED SECTIONS DO NOT NEED A BRANCH, and that is why this is
    not `branch` on its own.

    The branch question is the first thing on section eleven, so a member
    on section one has genuinely not answered it. Ten of the eleven
    sections ask everybody the identical questions, so filtering them by
    either branch gives the identical list. `renderBranch` is that filter
    and nothing else: it is never stored, never remembered, and never used
    to decide anything about section eleven, which draws its own question
    first and refuses to move until she has tapped one of the two.

    This was a real bug, found by driving the app rather than by any test:
    with the filter reading `branch` directly, a first-time member saw ten
    empty sections and a Continue that did nothing.
  */
  const renderBranch: BodySystemsBranch = branch ?? 'a';

  /** The questions on one section screen, in their stored order. */
  function questionsFor(sectionKey: string): BodySystemsQuestion[] {
    return questionsInSection(content.questions, sectionKey, renderBranch);
  }

  const sectionQuestions = useMemo(() => {
    if (step.kind !== 'section') return [];
    return questionsInSection(content.questions, step.sectionKey, renderBranch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, renderBranch, content.questions]);

  const sectionGroups = useMemo(() => chunkIntoGroups(sectionQuestions), [sectionQuestions]);

  /**
   * Which screen inside the resumed section she opens on.
   *
   * DERIVED, NEVER STORED. The stored resume position is a section, which
   * is what it has always been, so a draft written before screens were cut
   * this small still opens on the right section. The first question in
   * that section she has not answered decides the rest, which is both the
   * screen she was on when she left and, after a refresh in the middle of
   * one, the screen with her unfinished work on it.
   */
  const [groupIndex, setGroupIndex] = useState(() => {
    const resumeStep = steps[clampStepIndex(steps, resumeStepIndex)];
    if (!resumeStep || resumeStep.kind !== 'section') return 0;
    const questions = questionsInSection(
      content.questions,
      resumeStep.sectionKey,
      rememberedBranch ?? 'a'
    );
    const firstUnanswered = questions.findIndex(
      (question) => !resumeAnswers[question.questionRef]
    );
    if (firstUnanswered === -1) return Math.max(0, groupSizes(questions.length).length - 1);
    return groupIndexForItem(questions.length, firstUnanswered);
  });

  const safeGroupIndex = Math.min(groupIndex, Math.max(0, sectionGroups.length - 1));
  const groupQuestions = sectionGroups[safeGroupIndex] ?? [];
  const firstQuestionNumber = useMemo(() => {
    let before = 0;
    for (let index = 0; index < safeGroupIndex && index < sectionGroups.length; index += 1) {
      before += sectionGroups[index]!.length;
    }
    return before + 1;
  }, [sectionGroups, safeGroupIndex]);

  const section =
    step.kind === 'section'
      ? (content.sections.find((entry) => entry.sectionKey === step.sectionKey) ?? null)
      : null;

  const needsBranchChoice =
    step.kind === 'section' && section !== null && isBranchedSection(content, section.sectionKey) && branch === null;

  const groupAnswered =
    step.kind === 'section' &&
    !needsBranchChoice &&
    groupQuestions.length > 0 &&
    groupQuestions.every((question) => Boolean(answers[question.questionRef]));

  const flag =
    step.kind === 'red_flag'
      ? (content.redFlags.find((entry) => entry.flagKey === step.flagKey) ?? null)
      : null;
  const flagAnswered = flag ? typeof redFlagAnswers[flag.flagKey] === 'boolean' : false;
  const flagResponse =
    flag && redFlagAnswers[flag.flagKey] === true
      ? safetyResponseFor(content.safetyLevels, flag.level)
      : null;

  const canContinue =
    step.kind === 'section' ? groupAnswered : step.kind === 'red_flag' ? flagAnswered : true;

  /**
   * Back exists wherever there is something behind her, and inside a
   * section that now includes the screen before this one. Found by driving
   * it: with the old "is this the first section" test, screen two of
   * section one had no way back to screen one.
   */
  const canGoBack =
    stepIndex > 0 ||
    (step.kind === 'section' && !needsBranchChoice && safeGroupIndex > 0);

  /** True while she is on the last screen of the section she is in. */
  const isLastGroupOfSection =
    step.kind !== 'section' || safeGroupIndex >= sectionGroups.length - 1;

  useScreenTop(
    showIntro
      ? 'intro'
      : finished || status === 'completed'
        ? 'results'
        : transitionTo !== null
          ? 'section-transition'
          : needsBranchChoice
            ? `step-${stepIndex}-branch`
            : `step-${stepIndex}-group-${safeGroupIndex}`
  );

  /*
    THE AUTOSAVE, AND WHY IT IS A FETCH RATHER THAN THE SERVER ACTION.

    Every tap queues the whole draft to be written a moment later, so a
    refresh halfway through a screen of three questions costs her nothing.
    A Server Action's response is the entire re-rendered page, and this
    page reads the survey state and the whole content bundle, so a hundred
    and three taps would be a hundred and three full server renders. The
    route handler runs the same action with the same guards and returns a
    few bytes. Her Continue still uses the Server Action, because it has to
    know whether the write landed before it moves her.

    IT IS HER TAP THAT SCHEDULES IT, never a render and never an effect
    watching state, so nothing is written for a screen she only passed
    through.
  */
  const draftRef = useRef({ branch, answers, redFlagAnswers, stepIndex });
  draftRef.current = { branch, answers, redFlagAnswers, stepIndex };
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Writes go one at a time, in the order they were asked for.
   *
   * An autosave and a Continue write the same row, and the only thing that
   * differs between them is how far along she is. Two of them in flight at
   * once can land in either order, and the older one landing last would
   * store a position she has already left. Chaining them costs nothing (her
   * tap never waits on this) and makes the last write the last thing she
   * did. Same discipline, and the same reason, as the generic
   * questionnaire taker's own save chain.
   */
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

  function chainSave<T>(run: () => Promise<T>): Promise<T> {
    const next = saveChain.current.catch(() => undefined).then(run);
    saveChain.current = next.catch(() => undefined);
    return next;
  }

  /**
   * Write the whole draft, storing `storeStepIndex` as where she is.
   *
   * ONE PATH, AND IT IS THE ROUTE HANDLER, FOR HER CONTINUE AS WELL AS FOR
   * THE AUTOSAVE. It was the Server Action for Continue until 2026-09-11,
   * and measuring production is what changed that: a Continue took between
   * two and four seconds, because a Server Action's response is the whole
   * re-rendered page and /body-systems reads the survey state and the
   * entire content bundle to produce it. That was tolerable at eleven
   * Continues, one per section. It is not tolerable at forty-four, which is
   * what a section cut into screens of three costs.
   *
   * The route runs the identical action with the identical guards
   * (app/api/body-systems/progress/route.ts) and returns a few bytes, so
   * nothing about what is written or who may write it changed. Only
   * submitting still goes through a Server Action, because a completion
   * really does need the route it was called from to re-render.
   */
  async function postDraft(
    draft: {
      branch: BodySystemsBranch | null;
      answers: BodySystemsAnswers;
      redFlagAnswers: BodySystemsRedFlagAnswers;
    },
    storeStepIndex: number
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch('/api/body-systems/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          branch: draft.branch,
          answers: draft.answers,
          redFlagAnswers: draft.redFlagAnswers,
          stepIndex: storeStepIndex,
        }),
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
      // A failed autosave is not something to interrupt her with: her
      // Continue writes the same draft and reports its own failure.
      void chainSave(() => {
        const draft = draftRef.current;
        return postDraft(draft, draft.stepIndex);
      });
    }, AUTOSAVE_DELAY_MS);
  }

  useEffect(() => {
    return () => {
      // The CURRENT value is the point: whichever timer is outstanding when
      // she leaves is the one that has to be cleared, not whichever one
      // existed when this effect was set up.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, []);

  /*
    AND A WAITING AUTOSAVE IS SENT THE MOMENT THE PAGE GOES AWAY.

    The autosave waits about a second so that three taps in a row are one
    write, and that second is a window: a member who taps and reloads inside
    it had nothing sent at all. Found on production, 2026-09-11, where a
    refresh a second and a half after a tap came back with that answer gone.

    `pagehide` fires for a reload, a back, and a closed tab, and
    `visibilitychange` covers the phone case of switching apps, which on iOS
    is the one that never fires pagehide. The request carries `keepalive`,
    so one already in flight survives the page going away; this is only
    about the one that had not been sent yet.
  */
  useEffect(() => {
    const flush = () => {
      if (!autosaveTimer.current) return;
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
      const draft = draftRef.current;
      void postDraft(draft, draft.stepIndex);
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
    // `postDraft` only reads this component's props, which never change for
    // the life of a sitting, so this is set up once rather than re-bound on
    // every answer she gives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goHome() {
    router.push('/dashboard');
  }

  function chooseAnswer(questionRef: string, value: string) {
    setAnswers((previous) => ({ ...previous, [questionRef]: value }));
    queueAutosave();
  }

  /** Move to a step, landing on the screen inside it she should see. */
  function goToStep(next: number, landOn: 'first' | 'last') {
    setStepIndex(next);
    const target = steps[next];
    if (!target || target.kind !== 'section') {
      setGroupIndex(0);
      return;
    }
    if (landOn === 'first') {
      setGroupIndex(0);
      return;
    }
    const count = questionsFor(target.sectionKey).length;
    setGroupIndex(Math.max(0, groupSizes(count).length - 1));
  }

  function goBack() {
    if (isPending || transitionTo !== null) return;
    if (step.kind === 'section' && !needsBranchChoice && safeGroupIndex > 0) {
      setGroupIndex(safeGroupIndex - 1);
      return;
    }
    if (stepIndex === 0) return;
    goToStep(stepIndex - 1, 'last');
  }

  function advance() {
    if (!canContinue || transitionTo !== null) return;
    // The last screen writes a completion, and a completion always carries
    // an answered branch. Everything before it is storable without one.
    if (stepIndex >= lastQuestionStep && isLastGroupOfSection && !branch) return;
    setError(null);
    cancelAutosave();

    // Still inside this section: the screen changes, the stored position
    // does not, and the draft is written exactly as it always was.
    if (step.kind === 'section' && !isLastGroupOfSection) {
      const nextGroup = safeGroupIndex + 1;
      startTransition(async () => {
        const result = await chainSave(() =>
          postDraft({ branch, answers, redFlagAnswers }, stepIndex)
        );
        if (!result.ok) {
          setError(result.error ?? memberCopy(content.copy, 'member.save_error'));
          return;
        }
        setGroupIndex(nextGroup);
      });
      return;
    }

    if (stepIndex < lastQuestionStep) {
      const next = stepIndex + 1;
      // A beat between two sections, and only between two sections: moving
      // from one red flag to the next is not the end of anything.
      const marksSection = step.kind === 'section';
      // Reduced motion skips the beat entirely rather than playing it
      // without motion. The honest reading of the setting for a purely
      // decorative pause is not to make her wait at all.
      const withBeat = marksSection && !prefersReducedMotionNow();
      /*
        THE BEAT IS PUT ON THE SCREEN OUTSIDE THE TRANSITION, AND IT HAS TO BE.

        Found by driving the real app, 2026-09-11: a state update made inside
        `startTransition` is a LOW PRIORITY update, and React's whole point in
        keeping it low priority is that the PREVIOUS screen stays up until the
        transition finishes. So the timing was perfect and nothing was ever
        drawn: the old questions sat there for the full beat and then section
        two appeared. A jsdom test cannot see this, because `act()` flushes
        every priority together. This is an urgent update, so it paints now,
        and the save that follows it is what stays in the transition.
      */
      if (withBeat) setTransitionTo(next);
      startTransition(async () => {
        const save = chainSave(() => postDraft({ branch, answers, redFlagAnswers }, next));
        const [result] = await Promise.all([
          save,
          withBeat ? new Promise((resolve) => setTimeout(resolve, SECTION_TRANSITION_MS)) : null,
        ]);
        if (!result.ok) {
          setTransitionTo(null);
          setError(result.error ?? memberCopy(content.copy, 'member.save_error'));
          return;
        }
        setTransitionTo(null);
        goToStep(next, 'first');
      });
      return;
    }

    startTransition(async () => {
      const result = await chainSave(() =>
        submitBodySystemsSurveyAction(branch, answers, redFlagAnswers)
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFinished({ sessionId: result.sessionId, view: result.view });
      setStepIndex(steps.length - 1);
    });
  }

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
        <p className="relative mt-4 text-[16px] leading-relaxed text-[#F5F0E4]/90">
          {memberCopy(content.copy, 'member.already_done_body')}
        </p>
        {completedView ? (
          <div className="relative mt-8">
            <BodySystemsResults
              view={completedView}
              copy={content.copy}
              action={
                <button type="button" onClick={goHome} className={`${PRIMARY} mt-5`}>
                  {memberCopy(content.copy, 'member.results_done')}
                </button>
              }
            />
          </div>
        ) : (
          <button type="button" onClick={goHome} className={`${PRIMARY} relative mt-7`}>
            {memberCopy(content.copy, 'member.results_done')}
          </button>
        )}
      </div>
    );
  }

  if (showIntro) {
    return (
      <div className={PANEL}>
        <Glow />
        <Chrome onHome={goHome} copy={content.copy} />
        <div className="relative mt-3">
          <IntroReveal
            title={memberCopy(content.copy, 'member.intro_title')}
            titleTag="h1"
            titleClassName="font-[family-name:var(--font-cormorant-garamond)] text-[30px] leading-tight text-[#F5F0E4]"
            lines={[
              memberCopy(content.copy, 'member.intro_line_1'),
              memberCopy(content.copy, 'member.intro_line_2'),
              memberCopy(content.copy, 'member.intro_line_3'),
              memberCopy(content.copy, 'member.intro_line_4'),
            ]}
            lineClassName="text-[16px] leading-relaxed text-[#F5F0E4]/85"
            storageKey="body-systems-intro"
            /*
              THE INTRO MOVES, EVERY TIME, AND IT IS OVER IN UNDER A SECOND.

              Reported from a phone on 2026-09-11: this screen read as flat,
              static text. It was, for everybody who had opened the survey
              once before, because IntroReveal's default is to play its
              reveal once per device and then hand out the finished state
              forever after. That is the right default for a welcome and the
              wrong one for the screen standing between a member and a task
              she has come back to do.

              `replay` plays it on every visit and `pace="brisk"` is what
              makes that affordable: the headline types at 18ms a character
              instead of 45, the lines follow 110ms apart instead of 400,
              and Begin is on screen at about 800ms rather than about 2.9
              seconds. Nothing about the copy changed, and a member who has
              asked for reduced motion still gets the whole thing instantly
              and completely, with no animation at all.
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

  if (finished) {
    return (
      <div className={PANEL}>
        <Glow />
        <Chrome onHome={goHome} copy={content.copy} />
        <div className="relative mt-4">
          <BodySystemsResults
            view={finished.view}
            copy={content.copy}
            action={
              <button type="button" onClick={goHome} className={`${PRIMARY} mt-5`}>
                {memberCopy(content.copy, 'member.results_done')}
              </button>
            }
          />
        </div>
      </div>
    );
  }

  /*
    THE BEAT BETWEEN TWO SECTIONS NAMES NOTHING. It is handed the neutral
    line rather than anything read out of this section or the next one, so
    the survey stays blind through the one screen that would otherwise be
    the natural place to say what is coming.
  */
  if (transitionTo !== null) {
    return (
      <div className={PANEL}>
        <Glow />
        <div className="relative">
          <SectionTransition tone="forest" nextLine={NEUTRAL_NEXT_LINE} />
        </div>
      </div>
    );
  }

  return (
    <div className={PANEL}>
      <Glow />

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {canGoBack && (
            <button
              type="button"
              onClick={goBack}
              disabled={isPending}
              aria-label={memberCopy(content.copy, 'member.back')}
              className="mef-focus-ring mef-press -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#F5F0E4]/70 transition hover:bg-[#F5F0E4]/10 hover:text-[#F5F0E4] disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#C4A050]">
            {step.kind === 'section'
              ? `Section ${step.sectionNumber} of ${step.sectionCount}`
              : memberCopy(content.copy, 'member.red_flags_heading')}
          </p>
        </div>
        <HomeButton onHome={goHome} copy={content.copy} disabled={isPending} />
      </div>

      {status === 'in_progress' && resumeStepIndex > 0 && stepIndex === resumeStepIndex && (
        <p className="relative mt-3 text-[13px] text-[#F5F0E4]/55">
          {memberCopy(content.copy, 'member.resume_note')}
        </p>
      )}

      {step.kind === 'section' && section && (
        <div className="relative mt-4">
          {/*
            THE HEADING NAMES THE TASK, NEVER THE SYSTEM. It is the same
            sentence on all eleven screens, because the one thing every
            section screen has in common is what it is asking her to do.
            The body system these questions belong to is not on this screen
            and is not in this page's payload either.
          */}
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[26px] leading-tight text-[#F5F0E4]">
            {memberCopy(content.copy, 'member.section_heading')}
          </h1>
          {/* The timeframe, repeated in small text on every section screen. */}
          <p className="mt-2 text-[13px] text-[#F5F0E4]/50">
            {memberCopy(content.copy, 'member.timeframe_reminder')}
          </p>

          {needsBranchChoice ? (
            <div className="mt-6">
              <p className="text-[16px] leading-snug text-[#F5F0E4]">
                {memberCopy(content.copy, 'member.branch_question')}
              </p>
              <div className="mt-4 space-y-2">
                {(['a', 'b'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setBranch(option)}
                    aria-pressed={branch === option}
                    className={`${OPTION_BASE} ${OPTION_OFF}`}
                  >
                    <span>
                      {memberCopy(
                        content.copy,
                        option === 'a' ? 'member.branch_option_a' : 'member.branch_option_b'
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-[#F5F0E4]/55">
                {memberCopy(content.copy, 'member.branch_remembered')}
              </p>
            </div>
          ) : (
            <>
              {/*
                THE COUNTER AND THE LINE COUNT THE SAME THING, and the
                window they count in is the section named directly above
                them. Nothing here is a body system and nothing here is a
                score.
              */}
              <div className="mt-6">
                <AssessmentProgressBar
                  tone="gold-on-forest"
                  currentNumber={firstQuestionNumber}
                  throughNumber={firstQuestionNumber + groupQuestions.length - 1}
                  totalQuestions={sectionQuestions.length}
                />
              </div>

              <ol key={`group-${stepIndex}-${safeGroupIndex}`} className="mef-screen-enter mt-7 list-none">
                {groupQuestions.map((question, index) => {
                  const chosen = answers[question.questionRef];
                  return (
                    <QuestionBlock
                      key={question.questionRef}
                      tone="forest"
                      position={firstQuestionNumber + index}
                      prompt={question.prompt}
                      promptId={`bs-${question.questionRef}-prompt`}
                      withDivider={index > 0}
                    >
                      {content.scale.map((option) => (
                        <QuestionOptionButton
                          key={option.valueKey}
                          tone="gold-on-forest"
                          label={option.label}
                          selected={chosen === option.valueKey}
                          onSelect={() => chooseAnswer(question.questionRef, option.valueKey)}
                        />
                      ))}
                      {question.allowsDna && (
                        <QuestionOptionButton
                          tone="gold-on-forest"
                          label={
                            question.dnaLabel ??
                            memberCopy(content.copy, 'member.dna_default_label')
                          }
                          selected={chosen === DNA_VALUE}
                          onSelect={() => chooseAnswer(question.questionRef, DNA_VALUE)}
                        />
                      )}
                    </QuestionBlock>
                  );
                })}
              </ol>
            </>
          )}
        </div>
      )}

      {step.kind === 'red_flag' && flag && (
        <div className="relative mt-4">
          <p className="text-[12px] uppercase tracking-wider text-[#F5F0E4]/45">
            {`${step.flagNumber} of ${step.flagCount}`}
          </p>
          {step.flagNumber === 1 && (
            <p className="mt-3 text-[14px] leading-relaxed text-[#F5F0E4]/65">
              {memberCopy(content.copy, 'member.red_flags_intro')}
            </p>
          )}
          <h1 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-[24px] leading-snug text-[#F5F0E4]">
            {flag.prompt}
          </h1>

          <div className="mt-5 space-y-2">
            {([true, false] as const).map((value) => {
              const on = redFlagAnswers[flag.flagKey] === value;
              return (
                <QuestionOptionButton
                  key={String(value)}
                  tone="gold-on-forest"
                  label={memberCopy(
                    content.copy,
                    value ? 'member.red_flag_yes' : 'member.red_flag_no'
                  )}
                  selected={on}
                  onSelect={() => {
                    setRedFlagAnswers((previous) => ({ ...previous, [flag.flagKey]: value }));
                    queueAutosave();
                  }}
                />
              );
            })}
          </div>

          {/*
            IMMEDIATELY AND AUTOMATICALLY. The response for this item's own
            level, from its stored row, in the same frame as her tap. No
            approval step, no delay, no fetch.
          */}
          {flagResponse && (
            <div
              role="status"
              className="mt-5 rounded-2xl border border-[#C4A050]/50 bg-[#C4A050]/12 p-4"
            >
              <p className="text-[15px] leading-relaxed text-[#F5F0E4]">
                {flagResponse.memberResponse}
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="relative mt-4 text-sm text-[#F5B7A0]">{error}</p>}
      {!canContinue && !needsBranchChoice && (
        <p className="relative mt-5 text-[13px] text-[#F5F0E4]/55">
          {memberCopy(content.copy, 'member.blocked_reason')}
        </p>
      )}

      {!needsBranchChoice && (
        <div className="relative mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={advance}
            disabled={!canContinue || isPending}
            className={CONTINUE}
          >
            {stepIndex === lastQuestionStep && isLastGroupOfSection
              ? memberCopy(content.copy, 'member.red_flag_finish')
              : memberCopy(content.copy, 'member.continue')}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

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

/** The header on the screens with no progress counter of their own. */
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
