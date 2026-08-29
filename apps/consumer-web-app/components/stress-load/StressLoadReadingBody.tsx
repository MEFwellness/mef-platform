/**
 * The reading, rendered from descriptors. ONE COMPONENT, TWO READERS.
 *
 * The member sees this the moment she finishes, and her coach sees the
 * identical thing on the client screen, from the identical stored
 * descriptors. That is the whole reason the reading is stored as slugs and
 * numbers rather than as prose: there is nothing to keep in sync, and a
 * wording fix reaches every past sitting at once.
 *
 * THE TWO SIDES ARE TWO BLOCKS, ALWAYS. Load and recovery each get their
 * own heading, their own band label and their own sentence, and there is no
 * combined figure anywhere on this component. A screen that showed one
 * number would be undoing the thing the whole experience exists to hold
 * apart, so the separation lives here rather than only in the maths.
 */

import {
  LOAD_BAND_LABEL,
  RECOVERY_BAND_LABEL,
  STRESS_LOAD_COPY,
  bodySideSummary,
  buildKeyInsight,
  loadSideSummary,
  recoverySideSummary,
} from '@/lib/stress-load/copy';
import { renderCrossReference } from '@/lib/stress-load/crossReference';
import type { StressLoadInterpretation } from '@/lib/stress-load/crossReference';
import type { StressLoadAnswers } from '@/lib/stress-load/questions';

type Tone = 'dark' | 'light';

const TEXT: Record<Tone, string> = {
  dark: 'text-[#F5F0E4]',
  light: 'text-[#1B3A2D]',
};
const MUTED: Record<Tone, string> = {
  dark: 'text-[#F5F0E4]/70',
  light: 'text-[#6B7A72]',
};
const ACCENT: Record<Tone, string> = {
  dark: 'text-[#C4A050]',
  light: 'text-[#854D0E]',
};
const PANEL: Record<Tone, string> = {
  dark: 'rounded-2xl border border-[#F5F0E4]/15 bg-[#F5F0E4]/[0.06] p-4',
  light: 'rounded-2xl border border-[#1B3A2D]/10 bg-[#F3F6F4] p-4',
};

export function StressLoadReadingBody({
  interpretation,
  answers,
  tone,
}: {
  interpretation: StressLoadInterpretation;
  answers: StressLoadAnswers;
  tone: Tone;
}) {
  const insight = buildKeyInsight(interpretation, answers);

  return (
    <div>
      {insight.patternName && (
        <p className={`text-[11px] font-semibold uppercase tracking-wider ${ACCENT[tone]}`}>
          {insight.patternName}
        </p>
      )}

      <p className={`mt-2 text-[17px] font-semibold leading-snug ${TEXT[tone]}`}>
        {insight.headline}
      </p>

      <p className={`mt-3 text-[15px] leading-relaxed ${MUTED[tone]}`}>{insight.body}</p>

      {interpretation.crossReference && (
        <p className={`mt-4 text-[15px] leading-relaxed ${MUTED[tone]}`}>
          {renderCrossReference(interpretation.crossReference)}
        </p>
      )}

      {/* The two sides, separately, always. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className={PANEL[tone]}>
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${ACCENT[tone]}`}>
            {STRESS_LOAD_COPY.loadSideHeading}
          </p>
          <p className={`mt-1 text-[19px] font-semibold ${TEXT[tone]}`}>
            {LOAD_BAND_LABEL[interpretation.load.band]}
          </p>
          <p className={`mt-1 text-[14px] leading-relaxed ${MUTED[tone]}`}>
            {loadSideSummary(interpretation, answers)}
          </p>
        </div>

        <div className={PANEL[tone]}>
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${ACCENT[tone]}`}>
            {STRESS_LOAD_COPY.recoverySideHeading}
          </p>
          <p className={`mt-1 text-[19px] font-semibold ${TEXT[tone]}`}>
            {RECOVERY_BAND_LABEL[interpretation.recovery.band]}
          </p>
          <p className={`mt-1 text-[14px] leading-relaxed ${MUTED[tone]}`}>
            {recoverySideSummary(interpretation, answers)}
          </p>
        </div>
      </div>

      <p className={`mt-3 text-[13px] leading-relaxed ${MUTED[tone]}`}>
        {STRESS_LOAD_COPY.sidesNote}
      </p>

      <p className={`mt-3 text-[14px] leading-relaxed ${MUTED[tone]}`}>
        {bodySideSummary(interpretation, answers)}
      </p>
    </div>
  );
}
