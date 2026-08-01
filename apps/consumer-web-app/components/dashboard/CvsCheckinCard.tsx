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
import { CvsDay3FollowUp, CvsDay7FollowUp } from '@/components/core-values-snapshot/CvsFollowUpCards';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export async function CvsCheckinCard() {
  const status = await getMyCvsExperimentStatusAction();
  if (!status) return null;

  const day3Pending = status.isDay3Eligible && !status.logs.some((l) => l.day3Response !== null);
  if (day3Pending) {
    return <CvsDay3FollowUp experimentId={status.experiment.id} topLabelText={status.experiment.title} cardClassName={CARD} />;
  }

  const day7Pending = status.isDay7Eligible && !status.experiment.day7AcknowledgedAt;
  if (day7Pending) {
    return (
      <CvsDay7FollowUp
        experimentId={status.experiment.id}
        topLabelText={status.experiment.title}
        logs={status.logs}
        durationDays={status.experiment.durationDays}
        cardClassName={CARD}
      />
    );
  }

  return null;
}
