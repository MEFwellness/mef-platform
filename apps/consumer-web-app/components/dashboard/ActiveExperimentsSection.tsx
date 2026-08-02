/**
 * A single, persistent "what's running and what's waiting" home for every
 * Weekly Experiment, regardless of source (Core Values Snapshot, Life
 * Signal Check, or the Recommendation Engine) — previously each
 * experience's own dashboard card (CvsCheckinCard.tsx/LscCheckinCard.tsx)
 * only ever rendered something when a day-3/day-7 follow-up was due, or
 * when no experiment existed yet at all. A member on, say, day 2 of 7 saw
 * nothing at all until day 3, and a running experiment had no persistent
 * place on the dashboard showing it was actually in progress. This section
 * always shows a card for every real active experiment (name, day
 * progress, today's real daily question) plus a calm "done for today"
 * state once answered, instead of disappearing — and any "start it later"
 * offer lives right here too, in the same place.
 *
 * Reuses every underlying system as-is: CvsExperimentPanel/
 * LscExperimentPanel already render exactly this (day progress + daily
 * prompt + done state + day-3/day-7 when due) once given a real, active
 * status — this section's only real job is deciding *whether* an
 * experience's status is worth rendering here (active, or a genuine
 * offer) instead of returning null the way the two per-experience cards
 * used to.
 */

import { getMyCvsExperimentStatusAction, getMyCvsOfferAction } from '@/app/actions/coreValuesSnapshot';
import { getMyLscExperimentStatusAction, getMyLscOfferAction } from '@/app/actions/lifeSignalCheck';
import { getMyRplExperimentStatusAction, getMyRplOfferAction } from '@/app/actions/readinessPulse';
import { getMyLifestyleExperiments } from '@/app/actions/lifestyleExperiments';
import { getMyRootPopupDismissalAction } from '@/app/actions/rootPopupMessages';
import { localDateFor } from '@/app/actions/rootMap';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { createClient } from '@/lib/supabase/server';
import { cvsPopupMessageKey, lscPopupMessageKey, rplPopupMessageKey } from '@/lib/root-popup-messages/data';
import { resolveCvsCheckinPending, daysSinceStart } from '@/lib/core-values-snapshot/experiment';
import { CvsExperimentPanel } from '@/components/core-values-snapshot/CvsExperimentPanel';
import { LscExperimentPanel } from '@/components/life-signal-check/LscExperimentPanel';
import { RplExperimentPanel } from '@/components/readiness-pulse/RplExperimentPanel';

// Same zone-heading treatment as every other dashboard section (see the
// local ZONE_LABEL constant in app/dashboard/page.tsx) — kept as a literal
// here rather than a new shared export, since one string isn't worth an
// abstraction.
const ZONE_LABEL = 'text-xs font-semibold uppercase tracking-wider text-[#1B3A2D]/40';
// Screen Layout System (Prompt 2): was a hand-rolled duplicate of
// `.mef-card` (app/globals.css) — now the one shared recipe.
const ROW_CARD = 'mef-card';

/** A Recommendation-Engine-sourced active experiment has no daily yes/no question of its own (that mechanism only exists for Core Values Snapshot/Life Signal Check's Weekly Experiment) — honestly shows name and real day progress only, with a direct link to /recommendations, the one place its reflect/close flow already lives, rather than inventing a question that was never asked. */
function RecommendationExperimentRow({
  title,
  protocol,
  dayLabel,
}: {
  title: string;
  protocol: string;
  dayLabel: string;
}) {
  return (
    <div className={`${ROW_CARD} mef-animate-in`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-[#6B7A72]">{dayLabel}</p>
      <p className="mt-2 text-lg font-semibold text-[#1B3A2D]">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-[#6B7A72]">{protocol}</p>
      <a
        href="/recommendations"
        className="mef-focus-ring mt-4 inline-flex items-center text-sm font-semibold text-[#1B3A2D] underline underline-offset-4"
      >
        Log or close this out
      </a>
    </div>
  );
}

export async function ActiveExperimentsSection() {
  const [cvsStatus, lscStatus, rplStatus, allExperiments] = await Promise.all([
    getMyCvsExperimentStatusAction(),
    getMyLscExperimentStatusAction(),
    getMyRplExperimentStatusAction(),
    getMyLifestyleExperiments(),
  ]);

  const cvsActive = cvsStatus && cvsStatus.experiment.status === 'active';
  const lscActive = lscStatus && lscStatus.experiment.status === 'active';
  const rplActive = rplStatus && rplStatus.experiment.status === 'active';

  const [cvsOffer, lscOffer, rplOffer] = await Promise.all([
    cvsActive ? Promise.resolve(null) : getMyCvsOfferAction(),
    lscActive ? Promise.resolve(null) : getMyLscOfferAction(),
    rplActive ? Promise.resolve(null) : getMyRplOfferAction(),
  ]);

  const recommendationExperiments = allExperiments.filter(
    (e) => e.status === 'active' && e.recommendationId !== null
  );

  const hasAnything =
    Boolean(cvsActive || cvsOffer || lscActive || lscOffer || rplActive || rplOffer) || recommendationExperiments.length > 0;
  if (!hasAnything) return null;

  let todayLocalDate: string | null = null;
  if (recommendationExperiments.length > 0) {
    const user = await getCachedUser();
    if (user) todayLocalDate = await localDateFor(createClient(), user.id);
  }

  let cvsHighPriority = false;
  if (cvsActive && cvsStatus) {
    const pending = resolveCvsCheckinPending({
      isDay3Eligible: cvsStatus.isDay3Eligible,
      day3Answered: cvsStatus.logs.some((l) => l.day3Response !== null),
      isDay7Eligible: cvsStatus.isDay7Eligible,
      day7Acknowledged: cvsStatus.experiment.day7AcknowledgedAt !== null,
    });
    if (pending) {
      const dismissal = await getMyRootPopupDismissalAction(cvsPopupMessageKey(pending, cvsStatus.experiment.id));
      cvsHighPriority = dismissal?.status === 'snoozed';
    }
  }

  let lscHighPriority = false;
  if (lscActive && lscStatus) {
    const pending = resolveCvsCheckinPending({
      isDay3Eligible: lscStatus.isDay3Eligible,
      day3Answered: lscStatus.logs.some((l) => l.day3Response !== null),
      isDay7Eligible: lscStatus.isDay7Eligible,
      day7Acknowledged: lscStatus.experiment.day7AcknowledgedAt !== null,
    });
    if (pending) {
      const dismissal = await getMyRootPopupDismissalAction(lscPopupMessageKey(pending, lscStatus.experiment.id));
      lscHighPriority = dismissal?.status === 'snoozed';
    }
  }

  let rplHighPriority = false;
  if (rplActive && rplStatus) {
    const pending = resolveCvsCheckinPending({
      isDay3Eligible: rplStatus.isDay3Eligible,
      day3Answered: rplStatus.logs.some((l) => l.day3Response !== null),
      isDay7Eligible: rplStatus.isDay7Eligible,
      day7Acknowledged: rplStatus.experiment.day7AcknowledgedAt !== null,
    });
    if (pending) {
      const dismissal = await getMyRootPopupDismissalAction(rplPopupMessageKey(pending, rplStatus.experiment.id));
      rplHighPriority = dismissal?.status === 'snoozed';
    }
  }

  return (
    <div>
      <p className={ZONE_LABEL}>Active Experiments</p>
      <div className="mt-4 space-y-4">
        {cvsActive && cvsStatus && (
          <CvsExperimentPanel scoring={null} initialStatus={cvsStatus} isHighPriority={cvsHighPriority} />
        )}
        {!cvsActive && cvsOffer && (
          <CvsExperimentPanel
            sessionId={cvsOffer.sessionId}
            topValue={cvsOffer.scoring.topValue}
            scoring={cvsOffer.scoring}
            initialStatus={null}
          />
        )}

        {lscActive && lscStatus && (
          <LscExperimentPanel scoring={null} initialStatus={lscStatus} isHighPriority={lscHighPriority} />
        )}
        {!lscActive && lscOffer && (
          <LscExperimentPanel
            sessionId={lscOffer.sessionId}
            chosenSignal={lscOffer.scoring.chosenSignal}
            scoring={lscOffer.scoring}
            initialStatus={null}
          />
        )}

        {rplActive && rplStatus && (
          <RplExperimentPanel scoring={null} initialStatus={rplStatus} isHighPriority={rplHighPriority} />
        )}
        {!rplActive && rplOffer && (
          <RplExperimentPanel sessionId={rplOffer.sessionId} scoring={rplOffer.scoring} initialStatus={null} />
        )}

        {recommendationExperiments.map((experiment) => (
          <RecommendationExperimentRow
            key={experiment.id}
            title={experiment.title}
            protocol={experiment.protocol}
            dayLabel={
              todayLocalDate
                ? `Day ${Math.min(daysSinceStart(experiment.startDate, todayLocalDate) + 1, experiment.durationDays)} of ${experiment.durationDays}`
                : `${experiment.durationDays}-day experiment`
            }
          />
        ))}
      </div>
    </div>
  );
}
