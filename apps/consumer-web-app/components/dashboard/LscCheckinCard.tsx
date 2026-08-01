/**
 * Root's day-3/day-7 Weekly Experiment check-ins for Life Signal Check,
 * live on the dashboard itself — exact mirror of
 * components/dashboard/CvsCheckinCard.tsx, reusing the same
 * CvsFollowUpCards.tsx components with Life Signal Check's own server
 * actions and experience="life-signal-check" passed in, not a second
 * hand-kept copy of the card markup.
 */

import { getMyLscExperimentStatusAction, submitLscDay3ResponseAction, acknowledgeLscDay7Action } from '@/app/actions/lifeSignalCheck';
import { getMyRootPopupDismissalAction } from '@/app/actions/rootPopupMessages';
import { CvsDay3FollowUp, CvsDay7FollowUp } from '@/components/core-values-snapshot/CvsFollowUpCards';
import { resolveCvsCheckinPending } from '@/lib/core-values-snapshot/experiment';
import { lscPopupMessageKey } from '@/lib/root-popup-messages/data';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export async function LscCheckinCard() {
  const status = await getMyLscExperimentStatusAction();
  if (!status) return null;

  const pending = resolveCvsCheckinPending({
    isDay3Eligible: status.isDay3Eligible,
    day3Answered: status.logs.some((l) => l.day3Response !== null),
    isDay7Eligible: status.isDay7Eligible,
    day7Acknowledged: status.experiment.day7AcknowledgedAt !== null,
  });
  if (!pending) return null;

  const dismissal = await getMyRootPopupDismissalAction(lscPopupMessageKey(pending, status.experiment.id));
  const isHighPriority = dismissal?.status === 'snoozed';

  if (pending === 'day3') {
    return (
      <CvsDay3FollowUp
        experimentId={status.experiment.id}
        topLabelText={status.experiment.title}
        cardClassName={CARD}
        isHighPriority={isHighPriority}
        experience="life-signal-check"
        onSubmit={submitLscDay3ResponseAction}
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
      experience="life-signal-check"
      onAcknowledge={acknowledgeLscDay7Action}
    />
  );
}
