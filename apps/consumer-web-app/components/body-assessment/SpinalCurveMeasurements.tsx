/**
 * The two silhouette spinal curve angles, listed back to the member as
 * plain measurements.
 *
 * DELIBERATELY JUST NUMBERS. No severity, no colour tied to a threshold,
 * no "good"/"needs work", no interpretation of any kind. These are the
 * degrees that were measured from the outline of the member's back in the
 * side view photos, presented the way a tape measure reading would be.
 * Judging what a given angle means is a separate concern and does not
 * belong in this file.
 *
 * An angle the measurement withheld for low confidence (see
 * lib/body-assessment/spinalCurve.ts) is simply absent here — this
 * component never fills a gap with a placeholder number, and when no
 * capture in the assessment produced an angle at all it renders nothing
 * rather than an empty shell.
 *
 * Note that MemberFindingsSummary.tsx, the sibling section on the same
 * screen, deliberately shows no raw numbers: findings are screening
 * INDICATORS a coach must interpret, so exposing their degrees to a member
 * would invite self-diagnosis. These two angles are a different kind of
 * thing, a measurement with no verdict attached, which is why they can be
 * shown plainly.
 */

import { Ruler } from 'lucide-react';
import type { BodyAssessmentCapture } from '@mef/shared-types-contracts';
import { Card } from '@/components/layout';

const VIEW_LABEL: Record<string, string> = {
  left_side: 'Left side',
  right_side: 'Right side',
};

function degrees(value: number): string {
  return `${Math.round(value)} degrees`;
}

export function SpinalCurveMeasurements({ captures }: { captures: BodyAssessmentCapture[] }) {
  const measured = captures.filter(
    (capture) => capture.thoracic_angle_degrees !== null || capture.lumbar_angle_degrees !== null
  );
  if (measured.length === 0) return null;

  return (
    <Card as="section" className="mef-animate-in">
      <p className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
        <Ruler className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Back Curve Measurements
      </p>

      <ul className="mt-3 space-y-2.5">
        {measured.map((capture) => (
          <li key={capture.id} className="rounded-2xl bg-[#FAFAF8] p-4">
            <p className="text-sm font-medium text-[#1B3A2D]">
              {VIEW_LABEL[capture.capture_type] ?? 'Side view'}
            </p>
            <dl className="mt-2 space-y-1 text-sm text-[#6B7A72]">
              {capture.thoracic_angle_degrees !== null && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Upper back curve</dt>
                  <dd className="font-medium text-[#1B3A2D]">
                    {degrees(capture.thoracic_angle_degrees)}
                  </dd>
                </div>
              )}
              {capture.lumbar_angle_degrees !== null && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Lower back curve</dt>
                  <dd className="font-medium text-[#1B3A2D]">
                    {degrees(capture.lumbar_angle_degrees)}
                  </dd>
                </div>
              )}
            </dl>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-[#9AA79F]">
        These are measured from the outline of your back in your side view photos. They describe the
        shape of your back surface, not your spine itself, and they are not a score or a diagnosis.
        Your coach reviews them with you.
      </p>
    </Card>
  );
}
