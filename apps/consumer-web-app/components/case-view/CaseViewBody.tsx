import type { CaseView } from '@/lib/case-view/types';
import { CaseHeader } from './CaseHeader';
import { GoalProgressChart } from './GoalProgressChart';
import { FindingsList } from './FindingsList';
import { CaseEmptyState } from './CaseEmptyState';
import { InvestigationPanel } from './InvestigationPanel';

/**
 * Shared body for both the member's own case view and the coach's view
 * of a client's case — the same layout and copy, with `coachMode` only
 * adding the raw-numbers block inside each finding (requirement 7).
 * Order is deliberate: the header, then her goal progress as the
 * headline measure (requirement 5's "position it above the driver
 * detail, not below"), then findings or the honest empty state, then the
 * investigation panel last.
 */
export function CaseViewBody({
  caseView,
  localDate,
  coachMode = false,
  memoryCallback = null,
}: {
  caseView: CaseView;
  localDate: string;
  coachMode?: boolean;
  /** Root Presence System, requirement 4 — the member's own real check-in tenure, never passed in coach mode (Root doesn't speak to a coach in first person about "you"). */
  memoryCallback?: string | null;
}) {
  return (
    <div className="space-y-5">
      <CaseHeader header={caseView.header} memoryCallback={coachMode ? null : memoryCallback} />
      <GoalProgressChart goalProgress={caseView.goalProgress} localDate={localDate} readOnly={coachMode} />
      {caseView.emptyState ? (
        <CaseEmptyState emptyState={caseView.emptyState} />
      ) : (
        <FindingsList findings={caseView.findings} coachMode={coachMode} />
      )}
      <InvestigationPanel panel={caseView.investigation} />
    </div>
  );
}
