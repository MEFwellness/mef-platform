import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getAssessmentComparisonAction,
  getClientBodyAssessmentDetailAction,
  getClientBodyAssessmentsAction,
} from '@/app/actions/body-assessment';
import { getAssessmentTypeConfig } from '@/lib/body-assessment/assessmentTypes';
import { FINDING_TYPE_CONFIG, SEVERITY_LABEL } from '@/lib/body-assessment/findings';
import { ComparisonSummary } from '@/app/assessment/[id]/ComparisonSummary';
import { PrintButton } from './PrintButton';

/**
 * Simplest-correct "Generate Client Report" implementation (item F of the
 * practitioner-dashboard audit): a clean, print-friendly page a coach opens
 * in a new tab and prints/saves as PDF via the browser — no PDF-generation
 * library. Deliberately shows only what's already member-appropriate:
 *
 *   - confirmed findings only (never pending_review/dismissed/superseded —
 *     a report handed to a member should reflect the coach's actual
 *     conclusion, not draft screening output), using each finding's own
 *     `narrative` (already written in plain language — see
 *     body_assessment_findings' migration docblock) rather than the
 *     practitioner-facing config label's clinical hedge language.
 *   - the coach's review OBSERVATIONS/RECOMMENDATIONS (body_assessment_
 *     coach_reviews), not the private body_assessment_notes scratchpad —
 *     that table's own migration docblock says "Coach-only; members never
 *     see this," so it stays out of a member-facing export even though the
 *     coach viewing this report already has RLS access to it.
 */

/** Strips a practitioner-facing parenthetical qualifier ("(screening indicator)", "(external estimate)") from a finding label for member-facing display — the underlying narrative text already carries the necessary hedging in plain language. */
function memberFriendlyLabel(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export default async function BodyAssessmentReportPage({
  params,
}: {
  params: { id: string; assessmentId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: clientProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', params.id)
    .single();
  if (!clientProfile) notFound();

  const detail = await getClientBodyAssessmentDetailAction(params.assessmentId);
  if (!detail || detail.assessment.member_id !== params.id) notFound();

  const { assessment, findings, coachReviews } = detail;
  const typeConfig = getAssessmentTypeConfig(assessment.assessment_type);
  const clientName = clientProfile.display_name ?? 'This client';

  const confirmedFindings = findings.filter((f) => f.status === 'confirmed');

  const history = await getClientBodyAssessmentsAction(params.id);
  const previousAssessment =
    history.find(
      (a) =>
        a.id !== assessment.id &&
        a.assessment_type === assessment.assessment_type &&
        a.started_at < assessment.started_at
    ) ?? null;
  const comparisonRows = previousAssessment
    ? await getAssessmentComparisonAction(previousAssessment.id, assessment.id)
    : [];

  // coachReviews is already ordered newest-first (listCoachReviews) — the
  // most recent entry that actually has something to say is what a report
  // should show; a bare "finalize" click with no observations/
  // recommendations filled in isn't worth printing.
  const featuredReview = coachReviews.find((r) => r.observations || r.recommendations) ?? null;
  let coachName: string | null = null;
  if (featuredReview) {
    const { data: coachProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', featuredReview.coach_id)
      .single();
    coachName = coachProfile?.display_name ?? null;
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] font-[family-name:var(--font-dm-sans)] print:bg-white">
      <PrintButton />
      <main className="mx-auto max-w-2xl px-8 py-14 print:max-w-none print:px-0 print:py-0">
        <div className="border-b border-[#1B3A2D]/10 pb-6 print:border-black/20">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#854D0E] print:text-black">
            Posture Assessment Report
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-3xl text-[#1B3A2D] print:text-black">
            {clientName}
          </h1>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-[#6B7A72] print:text-black">
            <span>
              <span className="font-medium text-[#1B3A2D] print:text-black">Assessment: </span>
              {typeConfig.label}
            </span>
            <span>
              <span className="font-medium text-[#1B3A2D] print:text-black">Date: </span>
              {new Date(assessment.started_at).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>

        <section className="mt-8 print:break-inside-avoid">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#854D0E] print:text-black">
            What we observed
          </h2>
          {confirmedFindings.length === 0 ? (
            <p className="mt-3 text-sm text-[#6B7A72] print:text-black">
              No confirmed findings yet for this assessment.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {confirmedFindings.map((finding) => {
                const config = FINDING_TYPE_CONFIG[finding.finding_type];
                return (
                  <li
                    key={finding.id}
                    className="rounded-2xl bg-white p-4 print:break-inside-avoid print:rounded-none print:border print:border-black/10 print:bg-white print:p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-[#1B3A2D] print:text-black">
                        {memberFriendlyLabel(config.label)}
                      </p>
                      <span className="shrink-0 rounded-full bg-[#1B3A2D]/[0.06] px-2.5 py-1 text-xs font-medium text-[#1B3A2D] print:bg-transparent print:text-black">
                        {SEVERITY_LABEL[finding.severity]}
                      </span>
                    </div>
                    {finding.narrative && (
                      <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72] print:text-black">
                        {finding.narrative}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {featuredReview && (
          <section className="mt-8 print:break-inside-avoid">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#854D0E] print:text-black">
              Coach notes
            </h2>
            <div className="mt-3 rounded-2xl bg-white p-4 print:rounded-none print:border print:border-black/10 print:p-3">
              {coachName && (
                <p className="text-xs font-medium text-[#9AA79F] print:text-black">{coachName}</p>
              )}
              {featuredReview.observations && (
                <p className="mt-2 text-sm leading-relaxed text-[#6B7A72] print:text-black">
                  {featuredReview.observations}
                </p>
              )}
              {featuredReview.recommendations && (
                <p className="mt-2 text-sm leading-relaxed text-[#6B7A72] print:text-black">
                  <span className="font-medium text-[#1B3A2D] print:text-black">Recommendations: </span>
                  {featuredReview.recommendations}
                </p>
              )}
            </div>
          </section>
        )}

        {previousAssessment && comparisonRows.length > 0 && (
          <section className="mt-8 print:break-inside-avoid">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#854D0E] print:text-black">
              Progress since {new Date(previousAssessment.started_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </h2>
            <div className="mt-3 print:border print:border-black/10 print:p-3">
              <ComparisonSummary rows={comparisonRows} />
            </div>
          </section>
        )}

        <p className="mt-10 text-[11px] leading-relaxed text-[#9AA79F] print:text-black">
          This report reflects screening-level observations reviewed by your coach — it is not a
          medical diagnosis. Speak with a qualified practitioner about any findings you have
          questions about.
        </p>
      </main>
    </div>
  );
}
