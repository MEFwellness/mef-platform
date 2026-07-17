import { CalendarCheck } from 'lucide-react';
import {
  groupByDomain,
  formatAnswerValue,
  type BaselineAssessment,
} from '@/lib/onboarding/baseline';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

function formatDate(localDate: string): string {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year!, month! - 1, day!).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

type Props = {
  baseline: BaselineAssessment;
  /**
   * Member voice ("Your Baseline Assessment reflects...") vs coach voice
   * ("<Name>'s Baseline Assessment reflects...") — same data, same layout,
   * only the explanatory copy changes. Pass the exact required member copy
   * from the page that renders this for the member themselves.
   */
  description: string;
};

export function BaselineAssessmentView({ baseline, description }: Props) {
  const groups = groupByDomain(baseline.answers);

  return (
    <div className="space-y-5">
      <section className={`${CARD} p-6`}>
        <div className="flex items-center gap-2 text-[#6B7A72]">
          <CalendarCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Completed</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-lg font-medium text-[#1B3A2D]">{formatDate(baseline.localDate)}</p>
          <span className="rounded-full bg-[#F3F6F4] px-2.5 py-1 text-xs font-medium text-[#1B3A2D]/70">
            Original submission
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#6B7A72]">{description}</p>
      </section>

      {groups.map((group) => (
        <section key={group.domain} className={`${CARD} p-6`}>
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            {group.label}
          </p>
          <div className="mt-3 divide-y divide-[#1B3A2D]/5">
            {group.answers.map((answer) => (
              <div key={answer.questionKey} className="py-3">
                <p className="text-sm text-[#6B7A72]">{answer.promptText}</p>
                <p className="mt-1 text-base font-medium text-[#1B3A2D]">
                  {formatAnswerValue(answer)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
