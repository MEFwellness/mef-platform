/**
 * The canonical previous-vs-current comparison vocabulary. Four existing
 * modules (lib/registry/trendStatus.ts, lib/onboarding/comparison.ts,
 * lib/body-assessment/comparison.ts, lib/assessments/comparison.ts) each
 * classify a comparison with their own, differently-named vocabulary —
 * this is the shared, assessment-type-agnostic one a future assessment
 * (built on Prompt 1's unified_assessment_questions) or a future
 * cross-assessment-type view can use instead of inventing a fifth. It does
 * not replace any of the four existing modules — see adapters.ts for
 * lossy-where-necessary translation from their real output types.
 */
export type ComparisonDirection = 'improved' | 'unchanged' | 'worsened' | 'resolved' | 'new';

export type RankedComparisonInput = {
  /** Severity/score rank on the earlier side. Null = no earlier data point exists at all. */
  previousRank: number | null;
  /** Severity/score rank on the later side. Null = not present in the later assessment (i.e. resolved/absent), distinct from "never observed." */
  currentRank: number | null;
  /** Whether a higher rank means worse (the convention used by registry severity ranks and body-assessment severity ranks) or better (the convention lib/onboarding/comparison.ts uses via its SEVERITY goodness score). Defaults to true. */
  higherIsWorse?: boolean;
};
