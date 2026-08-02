'use client';

/**
 * The Personal Reset Plan's six-screen creation flow. Explicit Continue
 * buttons only, never auto-advance on selection (the app's own standing
 * navigation-stability rule, first fixed for the daily check-in wizard).
 * Every confirmed choice is persisted server-side the moment it's made
 * (app/actions/resetPlan.ts), so exiting mid-creation and returning
 * resumes exactly here, per the build's own duplicate-protection
 * requirement — this component's local `screen` state is just a mirror
 * of the plan's own real current_screen, not a second source of truth.
 */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { CVS_CARD, CVS_CARD_ELEVATED, CVS_DISPLAY_FONT, CVS_GOLD_DIVIDER } from '@/components/core-values-snapshot/theme';
import { IntroReveal } from '@/components/IntroReveal';
import {
  RESET_PLAN_AGREEMENT_COPY,
  RESET_PLAN_INTRO_COPY,
  RESET_PLAN_ALTERNATIVE_PROMPT,
  buildResetPlanActionCard,
  buildResetPlanMissHandlingLine,
  buildResetPlanProposal,
  buildResetPlanSuccessDefinition,
  buildResetPlanWhyItMatters,
  resetPlanProposedTier,
} from '@/lib/reset-plan/copy';
import { RESET_PLAN_FOCUS_SIGNALS, smallerTiers, type ActionTier } from '@/lib/reset-plan/constants';
import { SIGNAL_LABEL, type Signal } from '@/lib/life-signal-check/constants';
import { READINESS_PATTERN_LABEL } from '@/lib/readiness-pulse/constants';
import type { CoachingTonePreference } from '@mef/shared-types-contracts';
import type { ResetPlan } from '@/lib/reset-plan/types';
import type { ResetPlanScreen } from '@/lib/reset-plan/constants';
import {
  chooseResetPlanActionTierAction,
  chooseResetPlanFocusAction,
  completeResetPlanAction,
  getMyCoachingTonePreferenceAction,
  updateMyResetPlanScreenAction,
} from '@/app/actions/resetPlan';

function NavRow({ onContinue, disabled = false, label = 'Continue' }: { onContinue: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onContinue}
      disabled={disabled}
      className="mef-focus-ring mt-6 block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-40"
    >
      {label}
    </button>
  );
}

export function ResetPlanTaker({ initialPlan }: { initialPlan: ResetPlan }) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [screen, setScreen] = useState<ResetPlanScreen>(initialPlan.currentScreen === 'done' ? 'closing' : initialPlan.currentScreen);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [selectedTier, setSelectedTier] = useState<ActionTier>(plan.actionTier ?? resetPlanProposedTier(plan.snapshot));
  const [tonePreference, setTonePreference] = useState<CoachingTonePreference>('unclear');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const proposal = useMemo(() => buildResetPlanProposal(plan.snapshot), [plan.snapshot]);

  useEffect(() => {
    if (screen !== 'agreement') return;
    let cancelled = false;
    (async () => {
      const tone = await getMyCoachingTonePreferenceAction();
      if (!cancelled) setTonePreference(tone);
    })();
    return () => {
      cancelled = true;
    };
  }, [screen]);

  function goTo(next: ResetPlanScreen) {
    setScreen(next);
    startTransition(() => {
      updateMyResetPlanScreenAction(plan.id, next);
    });
  }

  function chooseFocus(signal: Signal) {
    setError(null);
    startTransition(async () => {
      const result = await chooseResetPlanFocusAction(plan.id, signal);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPlan(result.plan);
      setSelectedTier(resetPlanProposedTier(result.plan.snapshot));
      setScreen('why');
    });
  }

  function chooseTier(tier: ActionTier) {
    setSelectedTier(tier);
  }

  function confirmTier() {
    setError(null);
    startTransition(async () => {
      const result = await chooseResetPlanActionTierAction(plan.id, selectedTier);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPlan(result.plan);
      setScreen('agreement');
    });
  }

  function complete() {
    setError(null);
    startTransition(async () => {
      const result = await completeResetPlanAction(plan.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/dashboard');
    });
  }

  return (
    <div>
      {error && (
        <p className="mb-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {screen === 'intro' && (
        <div className={`${CVS_CARD} mef-animate-in flex min-h-[60vh] flex-col justify-center p-7`}>
          <IntroReveal
            title={RESET_PLAN_INTRO_COPY.title}
            lines={RESET_PLAN_INTRO_COPY.lines}
            titleClassName={`${CVS_DISPLAY_FONT} text-3xl leading-tight text-[#1B3A2D]`}
            storageKey={`reset-plan-intro:${plan.id}`}
            button={{
              label: RESET_PLAN_INTRO_COPY.button,
              onClick: () => goTo('proposal'),
              className:
                'mef-focus-ring mt-7 block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025]',
            }}
          />
        </div>
      )}

      {screen === 'proposal' && (
        <div className={`${CVS_CARD} mef-animate-in p-7`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Root&apos;s proposal</p>
          <p className={`${CVS_DISPLAY_FONT} mt-3 text-2xl leading-snug text-[#1B3A2D]`}>{proposal.heading}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{proposal.body}</p>

          {proposal.signal && !showAlternatives && (
            <div className="mt-6 space-y-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => chooseFocus(proposal.signal as Signal)}
                className="mef-focus-ring block w-full rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-50"
              >
                Yes, start here
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => setShowAlternatives(true)}
                className="mef-focus-ring block w-full rounded-2xl border border-[#1B3A2D]/15 px-6 py-4 text-center text-sm font-semibold text-[#1B3A2D] transition hover:bg-[#F5F0E4] disabled:opacity-50"
              >
                I want to start somewhere else
              </button>
            </div>
          )}

          {(!proposal.signal || showAlternatives) && (
            <div className="mt-6">
              {proposal.signal && <p className="text-sm font-medium text-[#1B3A2D]">{RESET_PLAN_ALTERNATIVE_PROMPT}</p>}
              <div className="mt-3 space-y-2">
                {RESET_PLAN_FOCUS_SIGNALS.filter((s) => s !== proposal.signal).map((signal) => (
                  <button
                    key={signal}
                    type="button"
                    disabled={isPending}
                    onClick={() => chooseFocus(signal)}
                    className="mef-focus-ring block w-full rounded-2xl border border-[#1B3A2D]/10 px-5 py-3 text-left text-sm font-medium text-[#1B3A2D] transition hover:border-[#C4A050]/60 hover:bg-[#FAF7F0] disabled:opacity-50"
                  >
                    {SIGNAL_LABEL[signal]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isPending && <p className="mt-4 text-center text-xs text-[#6B7A72]">Saving…</p>}
        </div>
      )}

      {screen === 'why' && plan.focusSignal && (
        <div className={`${CVS_CARD} mef-animate-in p-7`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Why it matters</p>
          <p className="mt-3 text-[15px] leading-relaxed text-[#1B3A2D]">{buildResetPlanWhyItMatters(plan.snapshot, plan.focusSignal).text}</p>
          <NavRow onContinue={() => goTo('action')} />
        </div>
      )}

      {screen === 'action' && plan.focusSignal && (
        <div className={`${CVS_CARD} mef-animate-in p-7`}>
          {(() => {
            const card = buildResetPlanActionCard(plan.focusSignal!, selectedTier);
            return (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">The action</p>
                <p className="mt-2 text-sm italic leading-relaxed text-[#6B7A72]">{card.philosophy}</p>
                <div className={`${CVS_GOLD_DIVIDER} my-4`} />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">{card.tierLabel} · Normal day</p>
                <p className="mt-1 text-[15px] leading-relaxed text-[#1B3A2D]">{card.action.normal}</p>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">Difficult day</p>
                <p className="mt-1 text-[15px] leading-relaxed text-[#1B3A2D]">{card.action.difficult}</p>
              </>
            );
          })()}

          {smallerTiers(selectedTier).length > 0 && (
            <div className="mt-5 border-t border-[#1B3A2D]/10 pt-4">
              <p className="text-xs font-medium text-[#6B7A72]">This feels like too much? Make it smaller:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {smallerTiers(selectedTier).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => chooseTier(tier)}
                    className="mef-focus-ring rounded-full border border-[#1B3A2D]/15 px-3.5 py-2 text-xs font-medium text-[#1B3A2D] transition hover:bg-[#F5F0E4]"
                  >
                    {READINESS_PATTERN_LABEL[tier]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {selectedTier !== resetPlanProposedTier(plan.snapshot) && (
            <p className="mt-3 text-xs text-[#6B7A72]">
              Shrunk to {READINESS_PATTERN_LABEL[selectedTier]}. You are never pressured to make it bigger again.
            </p>
          )}

          <NavRow onContinue={confirmTier} disabled={isPending} />
        </div>
      )}

      {screen === 'agreement' && (
        <div className={`${CVS_CARD} mef-animate-in p-7`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{RESET_PLAN_AGREEMENT_COPY.heading}</p>
          <ul className="mt-3 space-y-3 text-[15px] leading-relaxed text-[#1B3A2D]">
            <li>{RESET_PLAN_AGREEMENT_COPY.dayThreeLine}</li>
            <li>{RESET_PLAN_AGREEMENT_COPY.daySevenLine}</li>
            <li>{RESET_PLAN_AGREEMENT_COPY.difficultDayOfferLine}</li>
          </ul>
          {plan.focusSignal && (
            <p className="mt-4 text-sm leading-relaxed text-[#6B7A72]">{buildResetPlanMissHandlingLine(tonePreference, plan.focusSignal)}</p>
          )}
          <NavRow onContinue={() => goTo('closing')} />
        </div>
      )}

      {screen === 'closing' && plan.focusSignal && plan.actionTier && (
        <div className={`${CVS_CARD_ELEVATED} mef-animate-in p-8`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">Your Personal Reset Plan</p>
          <p className={`${CVS_DISPLAY_FONT} mt-2 text-2xl leading-snug text-[#1B3A2D]`}>{SIGNAL_LABEL[plan.focusSignal]}</p>

          <div className={`${CVS_GOLD_DIVIDER} my-4`} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">Why it matters</p>
          <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{buildResetPlanWhyItMatters(plan.snapshot, plan.focusSignal).text}</p>

          {(() => {
            const card = buildResetPlanActionCard(plan.focusSignal!, plan.actionTier!);
            return (
              <>
                <div className={`${CVS_GOLD_DIVIDER} my-4`} />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">The normal version</p>
                <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{card.action.normal}</p>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">The difficult-day version</p>
                <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{card.action.difficult}</p>
              </>
            );
          })()}

          <div className={`${CVS_GOLD_DIVIDER} my-4`} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">What Root will do</p>
          <ul className="mt-1 space-y-1.5 text-sm leading-relaxed text-[#1B3A2D]">
            <li>{RESET_PLAN_AGREEMENT_COPY.dayThreeLine}</li>
            <li>{RESET_PLAN_AGREEMENT_COPY.daySevenLine}</li>
            <li>{RESET_PLAN_AGREEMENT_COPY.difficultDayOfferLine}</li>
          </ul>

          <div className={`${CVS_GOLD_DIVIDER} my-4`} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7A72]">Success, honestly</p>
          <p className="mt-1 text-sm leading-relaxed text-[#1B3A2D]">{buildResetPlanSuccessDefinition(plan.actionTier)}</p>

          <button
            type="button"
            disabled={isPending}
            onClick={complete}
            className="mef-focus-ring mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#1B3A2D] px-6 py-4 text-center text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(27,58,45,0.45)] transition hover:bg-[#163025] disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Begin My Plan
          </button>
        </div>
      )}

    </div>
  );
}
