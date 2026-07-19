/**
 * Coaching Intelligence Engine — active data source registry. This is the
 * *only* file that needs a new line when a future data source (Sleep,
 * Stress, Blood Work, Wearables, Movement Assessments — see
 * CoachingSourceId's reserved values in ../types.ts) is ready to
 * contribute: write a new file in this directory exporting a
 * CoachingDataSourceProvider, add it to ACTIVE_PROVIDERS below. No level
 * generator, no service-layer orchestration, and no migration needs to
 * change — every level generator already operates on the normalized
 * CoachingObservation[] every provider produces, regardless of how many
 * providers exist. Same "one registry file, everything else generic"
 * convention as lib/assessments/registry.ts and
 * lib/food-lens/providers/registry.ts.
 */

import type { CoachingDataSourceProvider } from '../types';
import { checkinSourceProvider } from './checkinSource';
import { nutritionSourceProvider } from './nutritionSource';
import { primalPatternSourceProvider, questionnaireSourceProvider } from './assessmentSource';
import { progressSourceProvider } from './progressSource';

const ACTIVE_PROVIDERS: CoachingDataSourceProvider[] = [
  checkinSourceProvider,
  nutritionSourceProvider,
  primalPatternSourceProvider,
  questionnaireSourceProvider,
  progressSourceProvider,
];

export function listActiveCoachingSourceProviders(): CoachingDataSourceProvider[] {
  return ACTIVE_PROVIDERS;
}
