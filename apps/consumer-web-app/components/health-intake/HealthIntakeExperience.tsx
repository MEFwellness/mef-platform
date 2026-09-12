'use client';

/**
 * The Health & Lifestyle Intake, whole, on one route.
 *
 * THE COMPLETED PANEL LIVES HERE, NOT ON THE PAGE. Submitting calls a
 * Server Action, and a Server Action re-renders the route it was called
 * from. With the branch inside this component the re-render hands it a new
 * `status` prop while it stays MOUNTED, so its own step survives and her
 * three cards stand until she leaves.
 *
 * CONTINUE IS THE DELIBERATE STEP, WITH ONE EXCEPTION, AND THE EXCEPTION IS
 * NARROW. A screen carrying nothing but one binary Yes or No gate advances
 * by itself after a short settle, because the whole point of a gate is that
 * it opens or skips what follows and a Continue under it is a second tap to
 * confirm a decision already made. Everything else, every multi-select,
 * every scale, every text box and every screen a member might want to sit
 * with, waits for Continue. Do not widen this.
 *
 * A CLOSED BRANCH STOPS EXISTING, AND SHE IS TOLD WHAT IT COSTS FIRST.
 * Changing an answer that would remove something she has already entered
 * draws an inline confirmation naming exactly what goes
 * (lib/health-intake/branching.ts::previewChange), counted from her own
 * stored entries. Confirming removes them from her live answers there and
 * then, and the server re-applies the identical rule on every save and at
 * submit, so no stale answer survives on either side.
 *
 * SAVE AND RESUME. Every Continue writes the whole draft through a route
 * handler rather than a Server Action, for the reason that route's own
 * header gives. A waiting save is flushed on `pagehide` and on
 * `visibilitychange`, so a member who answers and switches to her mail app
 * has already been saved.
 *
 * IT DECIDES NO CALENDAR DAY. The one date input's ceiling arrives as a
 * prop, resolved on the server in her own timezone.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ArrowRight, X, Check } from 'lucide-react';
import { IntroReveal } from '@/components/IntroReveal';
import { QuestionBlock } from '@/components/questionnaire/QuestionBlock';
import { QuestionOptionButton } from '@/components/assessments/QuestionOptionButton';
import { useScreenTop } from '@/lib/questionnaire/useScreenTop';
import { prefersReducedMotionNow } from '@/lib/motion/useReducedMotion';
import { HLI_COPY, HLI_REASSURANCE } from '@/lib/health-intake/copy';
import { INTAKE_SECTIONS, allScreens } from '@/lib/health-intake/questions';
import {
  itemsForFollowUp,
  previewChange,
  pruneAnswers,
  readItemMap,
  readText,
} from '@/lib/health-intake/branching';
import { sanitizeAnswers } from '@/lib/health-intake/sanitize';
import {
  buildSteps,
  chapterCounter,
  completionStepIndex,
  isGateScreen,
  progressFraction,
  resumeStepIndex,
  stepIsAnswered,
  type IntakeStep,
} from '@/lib/health-intake/steps';
import { submitHealthIntakeAction } from '@/app/actions/healthIntake';
import type { MemberSummaryView } from '@/lib/health-intake/memberSummary';
import type { IntakeAnswers, IntakeAnswerValue, IntakeField } from '@/lib/health-intake/types';
import { IntakeFieldView } from './IntakeFieldView';

const PANEL =
  'relative w-full overflow-hidden rounded-[28px] bg-white p-6 shadow-[0_18px_48px_-24px_rgba(27,58,45,0.28)] sm:p-7';
const PRIMARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1B3A2D] px-6 py-3.5 text-[15px] font-semibold text-[#F5F0E4] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-[#1B3A2D]/25';
const QUIET =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl border border-[#1B3A2D]/12 bg-white px-6 py-3.5 text-[15px] font-semibold text-[#1B3A2D] transition hover:bg-[#F7FAF8]';
const DISPLAY = 'font-[family-name:var(--font-cormorant-garamond)]';

/**
 * How long a binary gate sits on screen after her tap before it moves on.
 *
 * Long enough that she sees her own answer land (the fill, the tick, the
 * weight) and short enough that it never feels like a wait. The one
 * auto-advance in this instrument.
 */
const GATE_SETTLE_MS = 400;

type Finished = { sessionId: string; view: MemberSummaryView };

type PendingChange = {
  fieldId: string;
  value: IntakeAnswerValue;
  sentence: string;
  /** True when the change came from a gate, which is what decides whether confirming also advances. */
  fromGate: boolean;
};

export function HealthIntakeExperience({
  status,
  resumeAnswers,
  resumeStepIndex: storedStepIndex,
  prefillName,
  maxDate,
  completedView,
}: {
  status: 'pending' | 'in_progress' | 'completed';
  resumeAnswers: IntakeAnswers;
  resumeStepIndex: number;
  /** Her display name, the one thing this app already knows that section one asks for. */
  prefillName: string;
  /** Today, in her own timezone, resolved on the server. */
  maxDate: string;
  completedView: MemberSummaryView | null;
}) {
  const router = useRouter();

  /*
    A STORED ANSWER THAT IS NO LONGER AN ANSWER IS DROPPED ON THE WAY IN.

    A question can change which options it offers, and a member can be
    partway through when it does. Her old tap is not an answer to the
    question now on the screen, so carrying it would put her past a question
    she has never answered while the server threw the value away at submit.
    The same function runs on the server, so the two cannot disagree.
  */
  const [answers, setAnswers] = useState<IntakeAnswers>(() => {
    const clean = sanitizeAnswers(resumeAnswers);
    // The prefill is a SUGGESTION IN AN EDITABLE BOX, not an answer. It is
    // only ever placed in a field she has not already filled in herself, so
    // returning to this screen never overwrites what she typed.
    if (prefillName.trim().length > 0 && readText(clean['full_name']).length === 0) {
      return { ...clean, full_name: prefillName.trim() };
    }
    return clean;
  });

  const steps = useMemo(() => buildSteps(answers), [answers]);
  const lastIndex = completionStepIndex(steps);

  const [stepIndex, setStepIndex] = useState(() =>
    resumeStepIndex(buildSteps(sanitizeAnswers(resumeAnswers)), sanitizeAnswers(resumeAnswers), storedStepIndex)
  );

  const hasStarted = Object.keys(resumeAnswers).length > 0;
  const [showIntro, setShowIntro] = useState(status === 'pending' && !hasStarted);
  const [showResume, setShowResume] = useState(status === 'in_progress' && hasStarted);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  const step: IntakeStep = steps[Math.min(stepIndex, lastIndex)] ?? steps[0]!;

  useScreenTop(
    showIntro
      ? 'intro'
      : showResume
        ? 'resume'
        : finished || status === 'completed'
          ? 'done'
          : `step-${stepIndex}`
  );

  // ------------------------------------------------------------------
  // Saving.
  // ------------------------------------------------------------------

  const draftRef = useRef({ answers, stepIndex });
  draftRef.current = { answers, stepIndex };
  const dirty = useRef(false);
  const gateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Writes go one at a time, in the order they were asked for. Two in
   * flight at once can land in either order, and the older one landing last
   * would store a position she has already left.
   */
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());

  function chainSave<T>(run: () => Promise<T>): Promise<T> {
    const next = saveChain.current.catch(() => undefined).then(run);
    saveChain.current = next.catch(() => undefined);
    return next;
  }

  async function postDraft(draft: { answers: IntakeAnswers; stepIndex: number }): Promise<void> {
    try {
      await fetch('/api/health-intake/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(draft),
      });
    } catch {
      // A failed save is not something to interrupt her with. The next one
      // writes the same draft, and the submit reports its own failure.
    }
  }

  /**
   * Writes the draft.
   *
   * `stepOverride` IS THE SCREEN SHE IS MOVING TO, NOT THE ONE SHE IS ON.
   * `draftRef` is refreshed while rendering, so a save fired from the same
   * tick as a `setStepIndex` still holds the OLD index, and the server
   * stored a position one screen behind her for the whole sitting. Found
   * on production, 2026-09-12: she left on a question and came back to the
   * chapter header above it. Her answers were never at risk, because
   * resume never trusts the stored index on its own, but the screen she
   * came back to was not the screen she left.
   */
  function save(stepOverride?: number) {
    dirty.current = false;
    const draft =
      stepOverride === undefined
        ? draftRef.current
        : { ...draftRef.current, stepIndex: stepOverride };
    void chainSave(() => postDraft(draft));
  }

  useEffect(() => {
    return () => {
      if (gateTimer.current) clearTimeout(gateTimer.current);
    };
  }, []);

  /*
    A WAITING SAVE IS SENT THE MOMENT THE PAGE GOES AWAY. `pagehide` covers
    a reload, a back and a closed tab, and `visibilitychange` covers
    switching apps on a phone, which is the case that never fires pagehide
    on iOS.
  */
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return;
      dirty.current = false;
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
  }, []);

  // ------------------------------------------------------------------
  // Answering.
  // ------------------------------------------------------------------

  function commit(fieldId: string, value: IntakeAnswerValue): IntakeAnswers {
    const next = pruneAnswers({ ...answers, [fieldId]: value }).kept;
    setAnswers(next);
    dirty.current = true;
    setError(null);
    return next;
  }

  /**
   * Her answer to anything that is not a gate.
   *
   * A change that would cost her something she has already entered is held
   * until she says so. Everything else lands immediately, because a
   * confirmation on a change that removes nothing is a dialog about nothing.
   */
  function change(fieldId: string, value: IntakeAnswerValue) {
    if (submitting) return;
    const preview = previewChange(answers, fieldId, value);
    if (preview.isEmpty) {
      commit(fieldId, value);
      return;
    }
    setPending({ fieldId, value, sentence: preview.sentence, fromGate: false });
  }

  /**
   * Her answer to a binary gate, which is also the advance.
   *
   * When it would close a branch she has already filled in, the
   * confirmation comes first and the advance waits for it, because moving
   * her forward and then asking whether she meant it is the wrong order.
   */
  function gate(fieldId: string, value: 'yes' | 'no') {
    if (submitting) return;
    const preview = previewChange(answers, fieldId, value);
    if (!preview.isEmpty) {
      setPending({ fieldId, value, sentence: preview.sentence, fromGate: true });
      return;
    }
    const next = commit(fieldId, value);
    advanceAfterGate(next);
  }

  function advanceAfterGate(next: IntakeAnswers) {
    if (gateTimer.current) clearTimeout(gateTimer.current);
    const wait = prefersReducedMotionNow() ? 0 : GATE_SETTLE_MS;
    gateTimer.current = setTimeout(() => {
      gateTimer.current = null;
      const rebuilt = buildSteps(next);
      const moving = Math.min(stepIndex + 1, completionStepIndex(rebuilt));
      setStepIndex(moving);
      save(moving);
    }, wait);
  }

  function confirmPending() {
    if (!pending) return;
    const next = commit(pending.fieldId, pending.value);
    const fromGate = pending.fromGate;
    setPending(null);
    if (fromGate) advanceAfterGate(next);
    else save();
  }

  // ------------------------------------------------------------------
  // Moving.
  // ------------------------------------------------------------------

  function leave() {
    if (dirty.current) save();
    router.push('/dashboard');
  }

  function goTo(next: number) {
    if (gateTimer.current) {
      clearTimeout(gateTimer.current);
      gateTimer.current = null;
    }
    setPending(null);
    setStepIndex(Math.max(0, Math.min(next, lastIndex)));
  }

  function goBack() {
    if (submitting || stepIndex === 0) return;
    setError(null);
    goTo(stepIndex - 1);
  }

  function goForward() {
    if (submitting) return;
    setPending(null);
    const next = Math.min(stepIndex + 1, lastIndex);
    save(next);
    if (next >= lastIndex) {
      setStepIndex(lastIndex);
      submit(answers);
      return;
    }
    setStepIndex(next);
  }

  /**
   * Finishes the sitting.
   *
   * IT CAN NEVER LEAVE HER ON A DEAD BUTTON. The finally is the point:
   * whatever happens, including a rejection that is what a dropped
   * connection on a phone looks like, the button comes back and she is told
   * what to do with it.
   *
   * It is also safe to press twice. Completion is write once in the
   * database, so a second submit resolves to the sitting already stored and
   * hands back the same three cards.
   */
  function submit(finalAnswers: IntakeAnswers) {
    setSubmitting(true);
    setError(null);
    startTransition(async () => {
      try {
        const result = await chainSave(() => submitHealthIntakeAction(finalAnswers));
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setFinished({ sessionId: result.sessionId, view: result.view });
      } catch {
        setError(HLI_COPY.saveError);
      } finally {
        setSubmitting(false);
      }
    });
  }

  // ------------------------------------------------------------------
  // Screens.
  // ------------------------------------------------------------------

  if (status === 'completed' && !finished) {
    return (
      <div className={PANEL}>
        <Chrome onLeave={leave} />
        <h1 className={`${DISPLAY} mt-4 text-[30px] leading-tight text-[#1B3A2D]`}>
          {HLI_COPY.alreadyDoneTitle}
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-[#3E5C46]">
          {HLI_COPY.alreadyDoneBody}
        </p>
        {completedView && <SummaryCards view={completedView} />}
        <button type="button" onClick={leave} className={`${QUIET} mt-7`}>
          {HLI_COPY.completionCta}
        </button>
      </div>
    );
  }

  if (finished) {
    return (
      <div className={PANEL}>
        <Chrome onLeave={leave} />
        <div className="mef-wbs-intro-in mt-4">
          <h1 className={`${DISPLAY} text-[32px] leading-tight text-[#1B3A2D]`}>
            {finished.view.title}
          </h1>
          <p className="mt-2 text-[16px] leading-relaxed text-[#3E5C46]">{finished.view.body}</p>
          <SummaryCards view={finished.view} />
          <button type="button" onClick={leave} className={`${PRIMARY} mt-7`}>
            {HLI_COPY.completionCta}
          </button>
        </div>
      </div>
    );
  }

  if (showIntro) {
    return (
      <div className={PANEL}>
        <Chrome onLeave={leave} />
        <div className="mt-3">
          <IntroReveal
            title={HLI_COPY.introTitle}
            titleTag="h1"
            titleClassName={`${DISPLAY} text-[30px] leading-tight text-[#1B3A2D]`}
            lines={[HLI_COPY.introBody]}
            lineClassName="text-[16px] leading-relaxed text-[#3E5C46]"
            storageKey="health-intake-intro"
            /*
              THE INTRO MOVES EVERY TIME, AND IT IS OVER IN UNDER A SECOND.
              IntroReveal's default plays once per device and hands out the
              finished state forever after, which is right for a welcome and
              wrong for the screen standing between a member and a task her
              coach asked her to do.
            */
            pace="brisk"
            replay
          />
          <ul className="mt-7 space-y-3">
            {HLI_REASSURANCE.map((line) => (
              <li key={line} className="flex items-center gap-3">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F6EFDF]"
                  aria-hidden="true"
                >
                  <Check className="h-4 w-4 text-[#B08F3E]" strokeWidth={2.5} />
                </span>
                <span className="text-[15px] text-[#1B3A2D]">{line}</span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setShowIntro(false)} className={`${PRIMARY} mt-8`}>
            {HLI_COPY.introButton}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (showResume) {
    return (
      <div className={PANEL}>
        <Chrome onLeave={leave} />
        <div className="mef-wbs-intro-in mt-4">
          <h1 className={`${DISPLAY} text-[30px] leading-tight text-[#1B3A2D]`}>
            {HLI_COPY.resumeTitle}
          </h1>
          <p className="mt-3 text-[16px] leading-relaxed text-[#3E5C46]">{HLI_COPY.resumeBody}</p>
          <button type="button" onClick={() => setShowResume(false)} className={`${PRIMARY} mt-8`}>
            {HLI_COPY.resumeCta}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (step.kind === 'completion') {
    return (
      <div className={PANEL}>
        <Chrome onLeave={leave} />
        <div className="mef-wbs-intro-in mt-6 text-center">
          <h1 className={`${DISPLAY} text-[30px] leading-tight text-[#1B3A2D]`}>
            {HLI_COPY.completionTitle}
          </h1>
          <p className="mx-auto mt-3 max-w-[22rem] text-[16px] leading-relaxed text-[#3E5C46]">
            {HLI_COPY.completionBody}
          </p>
          {error && (
            <p role="alert" className="mt-6 text-sm font-medium text-[#B4452F]">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={submitting}
            onClick={() => submit(answers)}
            className={`${PRIMARY} mt-8`}
          >
            {HLI_COPY.completionSubmitCta}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const section = INTAKE_SECTIONS.find((entry) => entry.key === step.sectionKey)!;

  if (step.kind === 'chapter') {
    return (
      <div className={PANEL}>
        <Header
          counter={chapterCounter(step.sectionNumber, step.sectionCount)}
          fraction={progressFraction(steps, stepIndex)}
          onBack={goBack}
          onLeave={leave}
          canGoBack={stepIndex > 0}
        />
        <div key={`chapter-${section.key}`} className="mef-wbs-intro-in mt-8 text-center">
          {section.transitionLine && (
            <p className="mx-auto max-w-[22rem] text-[15px] leading-relaxed text-[#4F645A]">
              {section.transitionLine}
            </p>
          )}
          <h1 className={`${DISPLAY} mt-3 text-[30px] leading-tight text-[#1B3A2D]`}>
            {section.title}
          </h1>
          <p className="mx-auto mt-3 max-w-[22rem] text-[16px] leading-relaxed text-[#3E5C46]">
            {section.framingLine}
          </p>
          <button type="button" onClick={() => goTo(stepIndex + 1)} className={`${PRIMARY} mt-9`}>
            {HLI_COPY.continueLabel}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  if (step.kind === 'followup') {
    const source = allScreens().find((entry) => entry.id === step.screenId)!;
    const field = source.fields[0] as Extract<IntakeField, { kind: 'per_item' }>;
    const all = itemsForFollowUp(field, answers);
    const stored = readItemMap(answers[field.id]);
    const ready = step.items.every((item) => (stored[item] ?? '').length > 0);

    return (
      <div className={PANEL}>
        <Header
          counter={chapterCounter(step.sectionNumber, step.sectionCount)}
          fraction={progressFraction(steps, stepIndex)}
          onBack={goBack}
          onLeave={leave}
          canGoBack={stepIndex > 0}
        />
        <div key={`followup-${step.screenId}-${step.groupNumber}`} className="mef-wbs-question-in mt-7">
          {step.groupNumber === 1 && source.title && (
            <h1 className={`${DISPLAY} text-[24px] leading-snug text-[#1B3A2D]`}>{source.title}</h1>
          )}
          <ul className={step.groupNumber === 1 && source.title ? 'mt-6' : ''}>
            {step.items.map((item, index) => {
              const promptId = `${field.id}-${item}`;
              return (
                <QuestionBlock
                  key={item}
                  tone="light"
                  position={all.indexOf(item) + 1}
                  prompt={`${optionLabelFor(field.sourceFieldId, item)}: ${field.label}`}
                  promptId={promptId}
                  withDivider={index > 0}
                >
                  {field.options.map((option) => (
                    <QuestionOptionButton
                      key={option.value}
                      tone="gold-on-light"
                      label={option.label}
                      selected={stored[item] === option.value}
                      onSelect={() =>
                        change(field.id, { ...stored, [item]: option.value })
                      }
                    />
                  ))}
                </QuestionBlock>
              );
            })}
          </ul>

          {error && (
            <p role="alert" className="mt-5 text-sm font-medium text-[#B4452F]">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!ready || submitting}
            onClick={goForward}
            className={`${PRIMARY} mt-8`}
          >
            {HLI_COPY.continueLabel}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  // A question screen.
  const screen = allScreens().find((entry) => entry.id === step.screenId)!;
  const gateOnly = isGateScreen(screen);
  const ready = stepIsAnswered(step, answers);

  return (
    <div className={PANEL}>
      <Header
        counter={chapterCounter(step.sectionNumber, step.sectionCount)}
        fraction={progressFraction(steps, stepIndex)}
        onBack={goBack}
        onLeave={leave}
        canGoBack={stepIndex > 0}
      />

      <div key={`screen-${screen.id}`} className="mef-wbs-question-in mt-7">
        {screen.title && (
          <h1 className={`${DISPLAY} text-[24px] leading-snug text-[#1B3A2D]`}>{screen.title}</h1>
        )}
        {screen.note && (
          <p className="mt-2.5 text-[14px] leading-relaxed text-[#6B7A72]">{screen.note}</p>
        )}

        <div className={screen.title || screen.note ? 'mt-7 space-y-8' : 'space-y-8'}>
          {screen.fields.map((field) => {
            if (!fieldIsVisible(field, screen.fields, answers)) return null;
            return (
              <IntakeFieldView
                key={field.id}
                field={field}
                value={answers[field.id]}
                maxDate={maxDate}
                onChange={change}
                onGate={gate}
              />
            );
          })}
        </div>

        {pending && (
          <div
            role="alertdialog"
            aria-label={HLI_COPY.confirmTitle}
            className="mef-wbs-question-in mt-7 rounded-2xl border border-[#C4A050]/45 bg-[#FBF7EC] p-5"
          >
            <p className="text-[15px] font-semibold text-[#1B3A2D]">{HLI_COPY.confirmTitle}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-[#3E5C46]">{pending.sentence}</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={confirmPending} className={PRIMARY}>
                {HLI_COPY.confirmRemove}
              </button>
              <button type="button" onClick={() => setPending(null)} className={QUIET}>
                {HLI_COPY.confirmKeep}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-5 text-sm font-medium text-[#B4452F]">
            {error}
          </p>
        )}

        {/*
          A GATE SCREEN DRAWS NO CONTINUE, because her tap is the answer and
          the advance. Every other screen does, and it is the only way
          forward from them.
        */}
        {!gateOnly && (
          <button
            type="button"
            disabled={!ready || submitting || pending !== null}
            onClick={goForward}
            className={`${PRIMARY} mt-8`}
          >
            {HLI_COPY.continueLabel}
            <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

/**
 * A short text field that only exists because an option beside it was
 * chosen.
 *
 * "Something else" opening a box is the one within-screen reveal in this
 * instrument, and it is decided here rather than by a screen condition
 * because it is a field appearing inside a screen rather than a screen
 * appearing inside the walk.
 */
function fieldIsVisible(
  field: IntakeField,
  siblings: IntakeField[],
  answers: IntakeAnswers
): boolean {
  for (const sibling of siblings) {
    if (sibling.kind !== 'multi_select') continue;
    const opener = sibling.options.find((option) => option.revealsTextFieldId === field.id);
    if (!opener) continue;
    const chosen = answers[sibling.id];
    return Array.isArray(chosen) && (chosen as string[]).includes(opener.value);
  }
  return true;
}

function optionLabelFor(fieldId: string, value: string): string {
  for (const screen of allScreens()) {
    for (const field of screen.fields) {
      if (field.id !== fieldId) continue;
      if (field.kind !== 'multi_select' && field.kind !== 'single_select') continue;
      const found = field.options.find((option) => option.value === value);
      if (found) return found.label;
    }
  }
  return value;
}

function Chrome({ onLeave }: { onLeave: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B08F3E]">
        {HLI_COPY.popupTitle}
      </p>
      <CloseButton onLeave={onLeave} />
    </div>
  );
}

function CloseButton({ onLeave }: { onLeave: () => void }) {
  return (
    <button
      type="button"
      onClick={onLeave}
      aria-label={HLI_COPY.homeLabel}
      className="mef-focus-ring mef-press -mr-1 inline-flex h-10 w-10 items-center justify-center rounded-full text-[#6B7A72] transition hover:bg-[#1B3A2D]/6 hover:text-[#1B3A2D]"
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/**
 * The chapter counter, the thin gold line and the two ways out.
 *
 * ONE LINE AND ONE COUNTER, AND EACH NAMES ITS OWN WINDOW. The counter
 * counts chapters, which is the unit she is told about. The line counts
 * screens that ask her something, chapters and the completion excluded,
 * because a line that jumped forward on a screen she only read would be
 * measuring the app rather than her. There is no percentage anywhere.
 */
function Header({
  counter,
  fraction,
  onBack,
  onLeave,
  canGoBack,
}: {
  counter: string;
  fraction: number;
  onBack: () => void;
  onLeave: () => void;
  canGoBack: boolean;
}) {
  const percent = Math.round(fraction * 100);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {canGoBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={HLI_COPY.backLabel}
              className="mef-focus-ring mef-press -ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-[#6B7A72] transition hover:bg-[#1B3A2D]/6 hover:text-[#1B3A2D]"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : (
            <span aria-hidden="true" className="h-10 w-10" />
          )}
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#B08F3E]">
            {counter}
          </p>
        </div>
        <CloseButton onLeave={onLeave} />
      </div>

      <div
        className="mt-3 h-px w-full overflow-hidden rounded-full bg-[#1B3A2D]/10"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Chapter ${counter}`}
      >
        <div
          className="h-full rounded-full bg-[#C4A050] transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** The three cards. Built by lib/health-intake/memberSummary.ts from her real answers only. */
function SummaryCards({ view }: { view: MemberSummaryView }) {
  return (
    <div className="mt-7 space-y-3">
      {view.cards.map((card, index) => {
        // A CARD WITH NOTHING IN IT IS NOT DRAWN. memberSummary.ts only
        // builds a card once it has real lines, so this is belt and braces,
        // and it is the belt that matters: a title over an empty list is a
        // heading claiming she told us something she did not.
        if (card.lines.length === 0) return null;
        return (
          <section
            key={card.title}
            className="mef-wbs-card-in rounded-[24px] border border-[#1B3A2D]/8 bg-[#F7FAF8] p-5"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#B08F3E]">
              {card.title}
            </h2>
            <ul className="mt-2.5 space-y-1.5">
              {card.lines.map((line) => (
                <li key={line} className="text-[15px] leading-relaxed text-[#1B3A2D]">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {view.safety && (
        <section className="mef-wbs-card-in rounded-[24px] border border-[#C4A050]/45 bg-[#FBF7EC] p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#B08F3E]">
            {view.safety.title}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-[#1B3A2D]">{view.safety.body}</p>
        </section>
      )}
    </div>
  );
}
