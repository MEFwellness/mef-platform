/**
 * Coach Dashboard — Case View. The same member-facing case view
 * (lib/case-view/, components/case-view/), extended with exactly what a
 * coach needs and a member doesn't see in this form: observation counts,
 * span, Spearman strength, and split-window agreement per finding — so
 * a coach can see why something reached the tier it did. Same builder,
 * same data, nothing computed here.
 */

import type { CaseView } from '@/lib/case-view/types';
import { CaseViewBody } from '@/components/case-view/CaseViewBody';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export function CaseViewPanel({ caseView, localDate }: { caseView: CaseView | null; localDate: string }) {
  if (!caseView) return null;

  return (
    <section className={`${CARD} p-6`}>
      <p className="text-sm font-semibold uppercase tracking-wider text-[#3E5C46]">Case View</p>
      <p className="mt-1 text-xs text-[#6B7A72]">
        The same case view this member sees, with the underlying numbers exposed.
      </p>
      <div className="mt-4">
        <CaseViewBody caseView={caseView} localDate={localDate} coachMode />
      </div>
    </section>
  );
}
