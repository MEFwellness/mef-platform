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
 * ONE SECTION PER SCREEN, THEN ONE RED FLAG PER SCREEN, THEN THE RESULTS.
 * Progress counts SECTIONS, "1 of 11", exactly as the specification asks.
 * The six red flag screens are outside that count and say so in their own
 * words, because they are not a twelfth body system.
 *
 * TAP ONLY, EVERYWHERE. There is no text input in this component and no
 * free text anywhere in this feature. Five options on a scale question,
 * plus Does not apply to me where a question can genuinely not apply, plus
 * Yes and No on a red flag.
 *
 * SHE CAN ALWAYS LEAVE, AND LEAVING COSTS HER NOTHING. Home is on every
 * screen. Her Continue saves the whole draft first, so closing the tab in
 * the middle of section four reopens on section four.
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

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Home } from 'lucide-react';
import { IntroReveal } from '@/components/IntroReveal';
import { memberCopy } from '@/lib/body-systems/copyKeys';
import { buildSteps, clampStepIndex, lastQuestionStepIndex } from '@/lib/body-systems/steps';
import { questionsInSection } from '@/lib/body-systems/scoring';
import { safetyResponseFor } from '@/lib/body-systems/redFlags';
import {
  DNA_VALUE,
  type BodySystemsAnswers,
  type BodySystemsBranch,
  type BodySystemsRedFlagAnswers,
} from '@/lib/body-systems/types';
import type { MemberContent } from '@/lib/body-systems/contentData';
import type { MemberResultsView } from '@/lib/body-systems/memberView';
import {
  saveBodySystemsProgressAction,
  submitBodySystemsSurveyAction,
} from '@/app/actions/bodySystems';
import { BodySystemsResults } from './BodySystemsResults';

const PANEL =
  'relative w-full overflow-hidden rounded-[28px] bg-[#1B3A2D] p-7 text-[#F5F0E4] shadow-[0_32px_80px_-16px_rgba(14,31,23,0.35)]';
const PRIMARY =
  'mef-focus-ring mef-press inline-flex w-full items-center justify-center rounded-2xl bg-[#F5F0E4] px-6 py-3.5 text-sm font-semibold text-[#1B3A2D] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40';
const OPTION_BASE =
  'mef-focus-ring mef-press flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-[15px] transition';
const OPTION_ON = 'border-[#C4A050] bg-[#C4A050] font-semibold text-[#1B3A2D]';
const OPTION_OFF =
  'border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] text-[#F5F0E4] hover:bg-[#F5F0E4]/[0.12]';

/** The section screen this branch answers last. Its own key, so the branch question is drawn once. */
function isBranchedSection(content: MemberContent, sectionKey: string): boolean {
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
  content: MemberContent;
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

  const step = steps[stepIndex] ?? steps[0]!;
  const lastQuestionStep = lastQuestionStepIndex(steps);

  function goHome() {
    router.push('/dashboard');
  }

  const sectionQuestions = useMemo(() => {
    if (step.kind !== 'section' || !branch) return [];
    return questionsInSection(content.questions, step.sectionKey, branch);
  }, [step, branch, content.questions]);

  const section =
    step.kind === 'section'
      ? (content.sections.find((entry) => entry.sectionKey === step.sectionKey) ?? null)
      : null;

  const needsBranchChoice =
    step.kind === 'section' && section !== null && isBranchedSection(content, section.sectionKey) && branch === null;

  const sectionAnswered =
    step.kind === 'section' &&
    !needsBranchChoice &&
    sectionQuestions.every((question) => Boolean(answers[question.questionRef]));

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
    step.kind === 'section' ? sectionAnswered : step.kind === 'red_flag' ? flagAnswered : true;

  function advance() {
    if (!canContinue || !branch) return;
    setError(null);

    if (stepIndex < lastQuestionStep) {
      const next = stepIndex + 1;
      startTransition(async () => {
        const result = await saveBodySystemsProgressAction(branch, answers, redFlagAnswers, next);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setStepIndex(next);
      });
      return;
    }

    startTransition(async () => {
      const result = await submitBodySystemsSurveyAction(branch, answers, redFlagAnswers);
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
        {completedView && (
          <div className="relative mt-8">
            <BodySystemsResults view={completedView} copy={content.copy} />
          </div>
        )}
        <button type="button" onClick={goHome} className={`${PRIMARY} relative mt-7`}>
          {memberCopy(content.copy, 'member.results_done')}
        </button>
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
            ]}
            lineClassName="text-[16px] leading-relaxed text-[#F5F0E4]/85"
            storageKey="body-systems-intro"
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
          <BodySystemsResults view={finished.view} copy={content.copy} />
          <button type="button" onClick={goHome} className={`${PRIMARY} mt-8`}>
            {memberCopy(content.copy, 'member.results_done')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={PANEL}>
      <Glow />

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={() => setStepIndex((previous) => Math.max(0, previous - 1))}
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
          <h1 className="font-[family-name:var(--font-cormorant-garamond)] text-[26px] leading-tight text-[#F5F0E4]">
            {section.displayName}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-[#F5F0E4]/70">
            {section.memberIntroLine}
          </p>
          {/* The timeframe, repeated in small text on every section screen. */}
          <p className="mt-1 text-[12px] text-[#F5F0E4]/45">
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
            <ol className="mt-6 space-y-6">
              {sectionQuestions.map((question) => {
                const chosen = answers[question.questionRef];
                return (
                  <li key={question.questionRef}>
                    <p className="text-[16px] leading-snug text-[#F5F0E4]">{question.prompt}</p>
                    <div className="mt-3 space-y-2">
                      {content.scale.map((option) => {
                        const on = chosen === option.valueKey;
                        return (
                          <button
                            key={option.valueKey}
                            type="button"
                            aria-pressed={on}
                            onClick={() =>
                              setAnswers((previous) => ({
                                ...previous,
                                [question.questionRef]: option.valueKey,
                              }))
                            }
                            className={`${OPTION_BASE} ${on ? OPTION_ON : OPTION_OFF}`}
                          >
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                      {question.allowsDna && (
                        <button
                          type="button"
                          aria-pressed={chosen === DNA_VALUE}
                          onClick={() =>
                            setAnswers((previous) => ({
                              ...previous,
                              [question.questionRef]: DNA_VALUE,
                            }))
                          }
                          className={`${OPTION_BASE} ${chosen === DNA_VALUE ? OPTION_ON : OPTION_OFF}`}
                        >
                          <span>
                            {question.dnaLabel ??
                              memberCopy(content.copy, 'member.dna_default_label')}
                          </span>
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
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
                <button
                  key={String(value)}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setRedFlagAnswers((previous) => ({ ...previous, [flag.flagKey]: value }))
                  }
                  className={`${OPTION_BASE} ${on ? OPTION_ON : OPTION_OFF}`}
                >
                  <span>
                    {memberCopy(
                      content.copy,
                      value ? 'member.red_flag_yes' : 'member.red_flag_no'
                    )}
                  </span>
                </button>
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
        <p className="relative mt-4 text-sm text-[#C4A050]">
          {memberCopy(content.copy, 'member.blocked_reason')}
        </p>
      )}

      {!needsBranchChoice && (
        <button
          type="button"
          onClick={advance}
          disabled={!canContinue || isPending}
          className={`${PRIMARY} relative mt-5`}
        >
          {stepIndex === lastQuestionStep
            ? memberCopy(content.copy, 'member.red_flag_finish')
            : memberCopy(content.copy, 'member.continue')}
        </button>
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
