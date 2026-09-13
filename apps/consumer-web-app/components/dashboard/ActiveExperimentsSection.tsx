/**
 * A single, persistent "what's running and what's waiting" home for every
 * Weekly Experiment, regardless of source (Core Values Snapshot, Life
 * Signal Check, the Readiness Pulse, the three deep-dives, or the
 * Recommendation Engine) — previously each
 * experience's own dashboard card (CvsCheckinCard.tsx/LscCheckinCard.tsx)
 * only ever rendered something when a day-3/day-7 follow-up was due, or
 * when no experiment existed yet at all. A member on, say, day 2 of 7 saw
 * nothing at all until day 3, and a running experiment had no persistent
 * place on the dashboard showing it was actually in progress. This section
 * always shows every real active experiment (name, day progress, today's
 * real daily question) plus a calm "done for today" state once answered,
 * instead of disappearing, and any "start it later" offer lives right
 * here too, in the same place.
 *
 * CONDENSED, 2026-09-13. Each running experiment used to be its own
 * full-size card, stacked, so two or three of them took the whole of Home
 * and pushed everything else off the screen. They are now one card with
 * one slim row each (the question, the day, whether today is logged), and
 * a row opens onto that experiment's own panel, unchanged. See
 * components/dashboard/ActiveExperimentsCard.tsx. Nothing about an
 * experiment's data, logic or logging moved; only what is drawn before
 * she taps.
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
import { getMyOwningYourValueExperimentAction } from '@/app/actions/owningYourValue';
import { getMyWhereYourJoyLivesExperimentAction } from '@/app/actions/whereYourJoyLives';
import { getMyTheGivingLedgerExperimentAction } from '@/app/actions/theGivingLedger';
import { getMyTheWeightOfYesExperimentAction } from '@/app/actions/theWeightOfYes';
import { getMyBeingSeenExperimentAction } from '@/app/actions/beingSeen';
import { getMyWhatYouPutDownExperimentAction } from '@/app/actions/whatYouPutDown';
import { getMyYourOwnCompanyExperimentAction } from '@/app/actions/yourOwnCompany';
import { getMyTheLifeYoureBuildingExperimentAction } from '@/app/actions/theLifeYoureBuilding';
import { getMyStressLoadExperimentAction } from '@/app/actions/stressLoad';
import { getMyLifestyleExperiments } from '@/app/actions/lifestyleExperiments';
import { resolveSubjectKey, suppressDuplicateOffers } from '@/lib/lifestyle-experiments';
import { getMyRootPopupDismissalAction } from '@/app/actions/rootPopupMessages';
import { localDateFor } from '@/app/actions/rootMap';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { createClient } from '@/lib/supabase/server';
import { cvsPopupMessageKey, lscPopupMessageKey, rplPopupMessageKey } from '@/lib/root-popup-messages/data';
import { resolveCvsCheckinPending, daysSinceStart } from '@/lib/core-values-snapshot/experiment';
import { cvsDailyPromptCopy } from '@/lib/core-values-snapshot/copy';
import { lscDailyPromptCopy } from '@/lib/life-signal-check/copy';
import { SIGNAL_BY_LABEL } from '@/lib/life-signal-check/constants';
import { rplReadyDailyPromptCopy, RPL_NOTICING_QUESTION } from '@/lib/readiness-pulse/copy';
import { OYV_EXPERIMENT_DAILY_QUESTION } from '@/lib/owning-your-value/experiment';
import { WYJL_EXPERIMENT_DAILY_QUESTION } from '@/lib/where-your-joy-lives/experiment';
import { TGL_EXPERIMENT_DAILY_QUESTION } from '@/lib/the-giving-ledger/experiment';
import { TWOY_EXPERIMENT_DAILY_QUESTION } from '@/lib/the-weight-of-yes/experiment';
import { BSN_EXPERIMENT_DAILY_QUESTION } from '@/lib/being-seen/experiment';
import { WYPD_EXPERIMENT_DAILY_QUESTION } from '@/lib/what-you-put-down/experiment';
import { YOC_EXPERIMENT_DAILY_QUESTION } from '@/lib/your-own-company/experiment';
import { TLYB_EXPERIMENT_DAILY_QUESTION } from '@/lib/the-life-youre-building/experiment';
import {
  ActiveExperimentsCard,
  type ActiveExperimentRow,
} from '@/components/dashboard/ActiveExperimentsCard';
import { CvsExperimentPanel } from '@/components/core-values-snapshot/CvsExperimentPanel';
import { LscExperimentPanel } from '@/components/life-signal-check/LscExperimentPanel';
import { RplExperimentPanel } from '@/components/readiness-pulse/RplExperimentPanel';
import { OwningYourValueExperimentPanel } from '@/components/owning-your-value/OwningYourValueExperimentPanel';
import { WhereYourJoyLivesExperimentPanel } from '@/components/where-your-joy-lives/WhereYourJoyLivesExperimentPanel';
import { TheGivingLedgerExperimentPanel } from '@/components/the-giving-ledger/TheGivingLedgerExperimentPanel';
import { TheWeightOfYesExperimentPanel } from '@/components/the-weight-of-yes/TheWeightOfYesExperimentPanel';
import { BeingSeenExperimentPanel } from '@/components/being-seen/BeingSeenExperimentPanel';
import { WhatYouPutDownExperimentPanel } from '@/components/what-you-put-down/WhatYouPutDownExperimentPanel';
import { YourOwnCompanyExperimentPanel } from '@/components/your-own-company/YourOwnCompanyExperimentPanel';
import { TheLifeYoureBuildingExperimentPanel } from '@/components/the-life-youre-building/TheLifeYoureBuildingExperimentPanel';
import { StressLoadExperimentPanel } from '@/components/stress-load/StressLoadExperimentPanel';

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
        className="mef-focus-ring mef-press mt-4 inline-flex items-center text-sm font-semibold text-[#1B3A2D] underline underline-offset-4"
      >
        Log or close this out
      </a>
    </div>
  );
}

export async function ActiveExperimentsSection() {
  const [
    cvsStatus,
    lscStatus,
    rplStatus,
    oyvStatus,
    wyjlStatus,
    tglStatus,
    twoyStatus,
    bsnStatus,
    wypdStatus,
    yocStatus,
    tlybStatus,
    slStatus,
    allExperiments,
  ] = await Promise.all([
    getMyCvsExperimentStatusAction(),
    getMyLscExperimentStatusAction(),
    getMyRplExperimentStatusAction(),
    // Owning Your Value's experiment has no offer half: it is accepted or
    // declined on the closing screen itself, so there is nothing left to
    // offer here and the action returns null unless one is actually
    // running.
    getMyOwningYourValueExperimentAction(),
    // Where Your Joy Lives's experiment has no offer half either, for the
    // same reason: it is accepted or declined on the closing screen itself,
    // so the action returns null unless one is actually running.
    getMyWhereYourJoyLivesExperimentAction(),
    // The Giving Ledger's experiment has no offer half either, for the
    // same reason: it is accepted or declined on the closing screen itself,
    // so the action returns null unless one is actually running.
    getMyTheGivingLedgerExperimentAction(),
    // The Weight of Yes's experiment has no offer half either, for the
    // same reason: it is accepted or declined on the closing screen itself,
    // so the action returns null unless one is actually running.
    getMyTheWeightOfYesExperimentAction(),
    // Being Seen's experiment has no offer half either, for the same
    // reason: it is accepted or declined on the closing screen itself, so
    // the action returns null unless one is actually running.
    getMyBeingSeenExperimentAction(),
    // What You Put Down's experiment has no offer half either, for the same
    // reason: it is accepted or declined on the closing screen itself, so
    // the action returns null unless one is actually running.
    getMyWhatYouPutDownExperimentAction(),
    // Your Own Company's experiment has no offer half either, for the same
    // reason: it is accepted or declined on the closing screen itself, so
    // the action returns null unless one is actually running.
    getMyYourOwnCompanyExperimentAction(),
    // The Life You're Building's experiment has no offer half either, for
    // the same reason: it is accepted or declined on the closing screen
    // itself, so the action returns null unless one is actually running.
    getMyTheLifeYoureBuildingExperimentAction(),
    // The Stress & Load Deep-Dive's experiment has no offer half either: it
    // is accepted or declined on the closing screen itself. It was missing
    // from this section entirely until 2026-09-06, which is why an accepted
    // one ran for seven days with no card. See
    // getMyStressLoadExperimentAction's header for what it fell through.
    getMyStressLoadExperimentAction(),
    getMyLifestyleExperiments(),
  ]);

  const cvsActive = cvsStatus && cvsStatus.experiment.status === 'active';
  const lscActive = lscStatus && lscStatus.experiment.status === 'active';
  const rplActive = rplStatus && rplStatus.experiment.status === 'active';

  const [rawCvsOffer, rawLscOffer, rawRplOffer] = await Promise.all([
    cvsActive ? Promise.resolve(null) : getMyCvsOfferAction(),
    lscActive ? Promise.resolve(null) : getMyLscOfferAction(),
    rplActive ? Promise.resolve(null) : getMyRplOfferAction(),
  ]);

  // "One open offer per member per experiment", which has to be decided
  // here because an offer is not a row anywhere: it is recomputed on every
  // render from the latest completed session, so there is nothing to insert
  // and nothing a database constraint could hold. The refusal is silent by
  // construction, a card that is simply never drawn.
  //
  // The duplicate this closes: the Readiness Pulse deliberately targets the
  // Life Signal Check's own loudest signal and inherits its
  // hardest-time-of-day, so a member who finished both was shown the same
  // 5-minute break twice, once as "take a genuine 5-minute break in the
  // mornings" and once as "take a real 5-minute break in the mornings".
  // See lib/lifestyle-experiments/offerDedupe.ts for the two rules.
  const runningSubjectKeys = allExperiments
    .filter((e) => e.status === 'active')
    .map((e) => resolveSubjectKey(e));

  const survivingOffers = new Set(
    suppressDuplicateOffers(
      [
        rawCvsOffer && { key: 'cvs' as const, subjectKey: rawCvsOffer.subjectKey, sourceCompletedAt: rawCvsOffer.completedAt },
        rawLscOffer && { key: 'lsc' as const, subjectKey: rawLscOffer.subjectKey, sourceCompletedAt: rawLscOffer.completedAt },
        rawRplOffer && { key: 'rpl' as const, subjectKey: rawRplOffer.subjectKey, sourceCompletedAt: rawRplOffer.completedAt },
      ].filter((o) => o !== null),
      runningSubjectKeys
    ).map((o) => o.key)
  );

  const cvsOffer = survivingOffers.has('cvs') ? rawCvsOffer : null;
  const lscOffer = survivingOffers.has('lsc') ? rawLscOffer : null;
  const rplOffer = survivingOffers.has('rpl') ? rawRplOffer : null;

  const recommendationExperiments = allExperiments.filter(
    (e) => e.status === 'active' && e.recommendationId !== null
  );

  // Handed down to whichever offer panel renders below. Those panels need
  // the count to know whether she is already at the two-experiment cap, and
  // left to themselves they each asked the server for it from a mounted
  // effect — a Server Action, which re-renders the whole of Home on the
  // server, twice, after Home had already finished. This section has
  // already read the same rows, so it says so.
  const activeExperiments = allExperiments.filter((e) => e.status === 'active');

  /**
   * EVERY EXPERIENCE THAT CAN RUN AN EXPERIMENT IS NAMED HERE, and five of
   * them were not (2026-09-13). The Weight of Yes, Being Seen, What You
   * Put Down, Your Own Company and The Life You're Building each had their
   * status read above and their panel written below, but none of them were
   * in this list, so a member whose ONLY running experiment was one of
   * those got `null` and saw no Active Experiments section at all. Same
   * shape of omission as the Stress and Load one found on 2026-09-06,
   * which is why this list is now the same list the rows are built from
   * rather than a second, hand-kept copy of it.
   */
  const hasAnything =
    Boolean(
      cvsActive ||
        cvsOffer ||
        lscActive ||
        lscOffer ||
        rplActive ||
        rplOffer ||
        oyvStatus ||
        wyjlStatus ||
        tglStatus ||
        twoyStatus ||
        bsnStatus ||
        wypdStatus ||
        yocStatus ||
        tlybStatus ||
        slStatus
    ) ||
    recommendationExperiments.length > 0;
  if (!hasAnything) return null;

  let todayLocalDate: string | null = null;
  if (recommendationExperiments.length > 0) {
    const user = await getCachedUser();
    if (user) todayLocalDate = await localDateFor(createClient(), user.id);
  }

  // WHETHER A FOLLOW-UP IS GENUINELY WAITING, kept alongside the
  // high-priority flag it was already computed for. The condensed card
  // reads it to decide which rows open on arrival: a day 3 or day 7
  // question she has not answered must not end up folded behind a tap
  // just because the section got smaller.
  let cvsFollowUpPending = false;
  let cvsHighPriority = false;
  if (cvsActive && cvsStatus) {
    const pending = resolveCvsCheckinPending({
      isDay3Eligible: cvsStatus.isDay3Eligible,
      day3Answered: cvsStatus.logs.some((l) => l.day3Response !== null),
      isDay7Eligible: cvsStatus.isDay7Eligible,
      day7Acknowledged: cvsStatus.experiment.day7AcknowledgedAt !== null,
    });
    cvsFollowUpPending = Boolean(pending);
    if (pending) {
      const dismissal = await getMyRootPopupDismissalAction(cvsPopupMessageKey(pending, cvsStatus.experiment.id));
      cvsHighPriority = dismissal?.status === 'snoozed';
    }
  }

  let lscFollowUpPending = false;
  let lscHighPriority = false;
  if (lscActive && lscStatus) {
    const pending = resolveCvsCheckinPending({
      isDay3Eligible: lscStatus.isDay3Eligible,
      day3Answered: lscStatus.logs.some((l) => l.day3Response !== null),
      isDay7Eligible: lscStatus.isDay7Eligible,
      day7Acknowledged: lscStatus.experiment.day7AcknowledgedAt !== null,
    });
    lscFollowUpPending = Boolean(pending);
    if (pending) {
      const dismissal = await getMyRootPopupDismissalAction(lscPopupMessageKey(pending, lscStatus.experiment.id));
      lscHighPriority = dismissal?.status === 'snoozed';
    }
  }

  let rplFollowUpPending = false;
  let rplHighPriority = false;
  if (rplActive && rplStatus) {
    const pending = resolveCvsCheckinPending({
      isDay3Eligible: rplStatus.isDay3Eligible,
      day3Answered: rplStatus.logs.some((l) => l.day3Response !== null),
      isDay7Eligible: rplStatus.isDay7Eligible,
      day7Acknowledged: rplStatus.experiment.day7AcknowledgedAt !== null,
    });
    rplFollowUpPending = Boolean(pending);
    if (pending) {
      const dismissal = await getMyRootPopupDismissalAction(rplPopupMessageKey(pending, rplStatus.experiment.id));
      rplHighPriority = dismissal?.status === 'snoozed';
    }
  }

  /**
   * ONE CARD, ONE ROW PER RUNNING EXPERIMENT (2026-09-13).
   *
   * Each of these used to be a full-size card of its own, stacked, so two
   * or three running experiments took the whole of Home. The panels below
   * are byte for byte the components that were those cards, with the same
   * props: they are handed to ActiveExperimentsCard as the body of a row
   * and rendered when she opens it. Nothing about an experiment, its day
   * count, its daily question or its logging changed.
   *
   * The day count and the question are read from the same status object
   * the panel reads them from, and by the same rule, so the row and the
   * panel can never disagree about which day it is or what was asked.
   */
  const dayLabel = (daysSince: number, durationDays: number): string =>
    `Day ${Math.min(daysSince + 1, durationDays)} of ${durationDays}`;

  const rows: ActiveExperimentRow[] = [];

  if (cvsActive && cvsStatus) {
    rows.push({
      id: cvsStatus.experiment.id,
      question: cvsDailyPromptCopy(cvsStatus.experiment.title),
      dayLabel: dayLabel(cvsStatus.daysSinceStart, cvsStatus.experiment.durationDays),
      loggedToday: cvsStatus.todayCompleted,
      waitingOnHer: cvsFollowUpPending,
      panel: (
        <CvsExperimentPanel scoring={null} initialStatus={cvsStatus} isHighPriority={cvsHighPriority} />
      ),
    });
  }

  if (lscActive && lscStatus) {
    // The panel resolves the signal from the experiment's own title the
    // same way; when it cannot, the panel draws no question either, so the
    // row falls back to the experiment's own title rather than inventing
    // a prompt nobody was asked.
    const lscSignal = SIGNAL_BY_LABEL[lscStatus.experiment.title] ?? null;
    rows.push({
      id: lscStatus.experiment.id,
      question: lscSignal ? lscDailyPromptCopy(lscSignal) : lscStatus.experiment.title,
      dayLabel: dayLabel(lscStatus.daysSinceStart, lscStatus.experiment.durationDays),
      loggedToday: lscStatus.todayCompleted,
      waitingOnHer: lscFollowUpPending,
      panel: (
        <LscExperimentPanel scoring={null} initialStatus={lscStatus} isHighPriority={lscHighPriority} />
      ),
    });
  }

  if (rplActive && rplStatus) {
    const isNoticing = rplStatus.kind === 'still_deciding' || rplStatus.kind === 'not_yet';
    const rplQuestion = isNoticing
      ? RPL_NOTICING_QUESTION
      : rplStatus.targetSignal
        ? rplReadyDailyPromptCopy(rplStatus.targetSignal, rplStatus.small)
        : rplStatus.experiment.title;
    rows.push({
      id: rplStatus.experiment.id,
      question: rplQuestion,
      dayLabel: dayLabel(rplStatus.daysSinceStart, rplStatus.experiment.durationDays),
      loggedToday: rplStatus.todayCompleted,
      waitingOnHer: rplFollowUpPending,
      panel: (
        <RplExperimentPanel scoring={null} initialStatus={rplStatus} isHighPriority={rplHighPriority} />
      ),
    });
  }

  if (oyvStatus) {
    rows.push({
      id: oyvStatus.experiment.id,
      question: OYV_EXPERIMENT_DAILY_QUESTION,
      dayLabel: dayLabel(oyvStatus.daysSinceStart, oyvStatus.experiment.durationDays),
      loggedToday: oyvStatus.todayCompleted,
      panel: <OwningYourValueExperimentPanel status={oyvStatus} />,
    });
  }

  if (wyjlStatus) {
    rows.push({
      id: wyjlStatus.experiment.id,
      question: WYJL_EXPERIMENT_DAILY_QUESTION,
      dayLabel: dayLabel(wyjlStatus.daysSinceStart, wyjlStatus.experiment.durationDays),
      loggedToday: wyjlStatus.todayCompleted,
      panel: <WhereYourJoyLivesExperimentPanel status={wyjlStatus} />,
    });
  }

  if (tglStatus) {
    rows.push({
      id: tglStatus.experiment.id,
      question: TGL_EXPERIMENT_DAILY_QUESTION,
      dayLabel: dayLabel(tglStatus.daysSinceStart, tglStatus.experiment.durationDays),
      loggedToday: tglStatus.todayCompleted,
      panel: <TheGivingLedgerExperimentPanel status={tglStatus} />,
    });
  }

  if (twoyStatus) {
    rows.push({
      id: twoyStatus.experiment.id,
      question: TWOY_EXPERIMENT_DAILY_QUESTION,
      dayLabel: dayLabel(twoyStatus.daysSinceStart, twoyStatus.experiment.durationDays),
      loggedToday: twoyStatus.todayCompleted,
      panel: <TheWeightOfYesExperimentPanel status={twoyStatus} />,
    });
  }

  if (bsnStatus) {
    rows.push({
      id: bsnStatus.experiment.id,
      question: BSN_EXPERIMENT_DAILY_QUESTION,
      dayLabel: dayLabel(bsnStatus.daysSinceStart, bsnStatus.experiment.durationDays),
      loggedToday: bsnStatus.todayCompleted,
      panel: <BeingSeenExperimentPanel status={bsnStatus} />,
    });
  }

  if (wypdStatus) {
    rows.push({
      id: wypdStatus.experiment.id,
      question: WYPD_EXPERIMENT_DAILY_QUESTION,
      dayLabel: dayLabel(wypdStatus.daysSinceStart, wypdStatus.experiment.durationDays),
      loggedToday: wypdStatus.todayCompleted,
      panel: <WhatYouPutDownExperimentPanel status={wypdStatus} />,
    });
  }

  if (yocStatus) {
    rows.push({
      id: yocStatus.experiment.id,
      question: YOC_EXPERIMENT_DAILY_QUESTION,
      dayLabel: dayLabel(yocStatus.daysSinceStart, yocStatus.experiment.durationDays),
      loggedToday: yocStatus.todayCompleted,
      panel: <YourOwnCompanyExperimentPanel status={yocStatus} />,
    });
  }

  if (tlybStatus) {
    rows.push({
      id: tlybStatus.experiment.id,
      question: TLYB_EXPERIMENT_DAILY_QUESTION,
      dayLabel: dayLabel(tlybStatus.daysSinceStart, tlybStatus.experiment.durationDays),
      loggedToday: tlybStatus.todayCompleted,
      panel: <TheLifeYoureBuildingExperimentPanel status={tlybStatus} />,
    });
  }

  if (slStatus) {
    rows.push({
      id: slStatus.experiment.id,
      question: slStatus.dailyQuestion,
      dayLabel: dayLabel(slStatus.daysSinceStart, slStatus.experiment.durationDays),
      loggedToday: slStatus.todayCompleted,
      panel: <StressLoadExperimentPanel status={slStatus} />,
    });
  }

  return (
    <div>
      <p className={ZONE_LABEL}>Active Experiments</p>
      <div className="mt-4 space-y-4">
        <ActiveExperimentsCard rows={rows} />

        {/*
          A Recommendation-Engine experiment has no daily question of its
          own, so it cannot be a row that opens onto one. It keeps its own
          card, with its real day progress and the one link where its
          reflect and close flow already lives.
        */}
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

        {/*
          An OFFER is not a running experiment: it has no day count, no
          daily question and nothing logged, so there is nothing to put on
          a row. It keeps the full card it has always had, underneath the
          running ones.
        */}
        {!cvsActive && cvsOffer && (
          <CvsExperimentPanel
            sessionId={cvsOffer.sessionId}
            topValue={cvsOffer.scoring.topValue}
            scoring={cvsOffer.scoring}
            initialStatus={null}
          />
        )}

        {!lscActive && lscOffer && (
          <LscExperimentPanel
            sessionId={lscOffer.sessionId}
            chosenSignal={lscOffer.scoring.chosenSignal}
            scoring={lscOffer.scoring}
            initialStatus={null}
            activeExperiments={activeExperiments}
          />
        )}

        {!rplActive && rplOffer && (
          <RplExperimentPanel
            sessionId={rplOffer.sessionId}
            scoring={rplOffer.scoring}
            initialStatus={null}
            activeExperiments={activeExperiments}
          />
        )}
      </div>
    </div>
  );
}
