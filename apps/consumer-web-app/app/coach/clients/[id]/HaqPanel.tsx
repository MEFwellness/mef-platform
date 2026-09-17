/**
 * The coach's Health Appraisal card on the client Detail page.
 *
 * A LIST, AND THE READING IS ONE TAP AWAY. Same shape as WbsaPanel and
 * BodyAssessmentPanel: every finished sitting by its own completion date,
 * newest first, with how the 21 areas read, and the full sitting behind a
 * dedicated route. Twenty one sections and two hundred and sixty answers do
 * not belong inside a card on a page that already carries fifty of them.
 *
 * NOTHING IS EVER OVERWRITTEN OR HIDDEN. A retake adds a sitting beside the
 * ones already here. An older sitting keeps its own answers, its own totals
 * and its own results forever, and this list never drops one.
 *
 * NO ASSIGN BUTTON HERE, ON PURPOSE. The Health Appraisal is already a row
 * in the Assessment Status block at the top of this same section, with a
 * working Assign and Resend, because it is in the shared assignable catalog.
 * A second button would be a second offer for one thing.
 *
 * COACH AND ADMINISTRATOR ONLY, and not because this component says so: the
 * state it renders comes from getClientHaqPanelAction, and the rows behind
 * it have no member policy at all.
 */

import Link from 'next/link';
import type { Route } from 'next';
import { ClipboardList } from 'lucide-react';
import { formatDisplayDate } from '@/lib/time/displayDate';
import { HAQ_LABEL } from '@/lib/haq/constants';
import { hasDeepDiveResults } from '@/lib/coach-detail/deepDiveResults';
import type { CoachHaqPanelState } from '@/lib/haq/coachView';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function sittingLabel(completedAt: string | null): string {
  if (!completedAt) return 'Unfinished';
  return formatDisplayDate(completedAt.slice(0, 10), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function HaqPanel({ clientId, state }: { clientId: string; state: CoachHaqPanelState }) {
  // A RESULT BLOCK, SO NOTHING TO SHOW IS NOTHING TO DRAW. Deciding to send
  // the Health Appraisal happens on its own row in the Assessment Status
  // block above, which is there whether or not she has ever finished one.
  if (!hasDeepDiveResults(state)) return null;

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#854D0E]">
        <ClipboardList className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">{HAQ_LABEL}</p>
      </div>

      <ul className="mt-2 divide-y divide-[#1B3A2D]/5" data-testid="haq-sitting-list">
        {state.sessions.map((sitting) => (
          <li key={sitting.sessionId}>
            <Link
              href={`/coach/clients/${clientId}/health-appraisal/${sitting.sessionId}` as Route}
              className="flex items-center justify-between gap-3 py-2.5 hover:bg-[#1B3A2D]/[0.02]"
            >
              <div>
                <p className="text-sm font-medium text-[#1B3A2D]">
                  {sittingLabel(sitting.completedAt)} · {sitting.haqVersion}
                </p>
                <p className="text-xs text-[#6B7A72]">
                  {sitting.hasResults
                    ? `${sitting.counts.red} High Attention · ${sitting.counts.yellow} Needs Attention · ${sitting.counts.green} Doing Well`
                    : 'The stored results for this sitting could not be read.'}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[#854D0E]">
                Open
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
