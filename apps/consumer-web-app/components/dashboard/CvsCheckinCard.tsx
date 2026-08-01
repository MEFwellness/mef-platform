/**
 * Root's day-3/day-7 Weekly Experiment check-ins, live on the dashboard
 * itself. Previously the only way to ever see these was tapping "View
 * Result" on the Core Values Snapshot questionnaire card and landing on
 * the standalone /assessments/core-values-snapshot/experiment page — a
 * check-in Root explicitly promised the member ("I'll check in on day 3...
 * at the end of the seven days I'll tell you what I think your results
 * mean") had no reason to ever be found there. Same self-fetching,
 * "render nothing when there's nothing to say" shape as
 * components/dashboard/CoachingMessageCard.tsx and its neighbors — reuses
 * the exact same question/reflection components the experiment page
 * itself renders (CvsFollowUpCards.tsx), not a second hand-kept copy.
 */

import { getMyCvsExperimentStatusAction } from '@/app/actions/coreValuesSnapshot';
import { getMyRootPopupDismissalAction } from '@/app/actions/rootPopupMessages';
import { CvsDay3FollowUp, CvsDay7FollowUp } from '@/components/core-values-snapshot/CvsFollowUpCards';
import { resolveCvsCheckinPending } from '@/lib/core-values-snapshot/experiment';
import { cvsPopupMessageKey } from '@/lib/root-popup-messages/data';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export async function CvsCheckinCard() {
  const status = await getMyCvsExperimentStatusAction();
  if (!status) return null;

  const pending = resolveCvsCheckinPending({
    isDay3Eligible: status.isDay3Eligible,
    day3Answered: status.logs.some((l) => l.day3Response !== null),
    isDay7Eligible: status.isDay7Eligible,
    day7Acknowledged: status.experiment.day7AcknowledgedAt !== null,
  });
  if (!pending) return null;

  // "Waiting on you" badge once the member has tapped "Maybe later" on this
  // exact message's pop-up (see components/dashboard/RootMessagePopupClient.tsx)
  // — never shown for a message that's simply never been popped up yet.
  const dismissal = await getMyRootPopupDismissalAction(cvsPopupMessageKey(pending, status.experiment.id));
  const isHighPriority = dismissal?.status === 'snoozed';

  if (pending === 'day3') {
    return (
      <CvsDay3FollowUp
        experimentId={status.experiment.id}
        topLabelText={status.experiment.title}
        cardClassName={CARD}
        isHighPriority={isHighPriority}
      />
    );
  }

  return (
    <CvsDay7FollowUp
      experimentId={status.experiment.id}
      topLabelText={status.experiment.title}
      logs={status.logs}
      durationDays={status.experiment.durationDays}
      cardClassName={CARD}
      isHighPriority={isHighPriority}
    />
  );
}
