/**
 * Provider registry for Movement Intelligence — same shape as
 * lib/body-assessment/providers/registry.ts. 'internal_placeholder' is the
 * only entry with a real, working implementation (the hardcoded catalog);
 * every other entry is an UnconfiguredProvider stub. Wiring a real exercise
 * library means replacing one entry in this map with a real implementation
 * of MovementExerciseProvider and (optionally) pointing
 * MOVEMENT_EXERCISE_PROVIDER at it — nothing else in lib/movement/ or
 * app/actions/movement.ts changes.
 */

import type { MovementExercise } from '@mef/shared-types-contracts';
import { InternalPlaceholderProvider } from './internalPlaceholderProvider';
import type { MovementExerciseFilter, MovementExerciseProvider } from './types';

export const MOVEMENT_PROVIDER_NAMES = [
  'internal_placeholder',
  'exercise_com',
  'physitrack',
  'custom_video',
  'api',
] as const;

export type MovementProviderName = (typeof MOVEMENT_PROVIDER_NAMES)[number];

class UnconfiguredMovementExerciseProvider implements MovementExerciseProvider {
  constructor(public readonly name: string) {}

  async listExercises(_filter: MovementExerciseFilter): Promise<MovementExercise[]> {
    throw new Error(
      `Movement exercise provider "${this.name}" is not configured. This milestone builds the ` +
        'Movement Intelligence architecture and provider abstraction only — no third-party ' +
        'exercise library is wired to a real API yet.'
    );
  }

  async getExercise(_exerciseId: string): Promise<MovementExercise | null> {
    throw new Error(`Movement exercise provider "${this.name}" is not configured.`);
  }

  async getVariation(): Promise<MovementExercise | null> {
    throw new Error(`Movement exercise provider "${this.name}" is not configured.`);
  }
}

const PROVIDERS: Record<MovementProviderName, MovementExerciseProvider> = {
  internal_placeholder: new InternalPlaceholderProvider(),
  exercise_com: new UnconfiguredMovementExerciseProvider('exercise_com'),
  physitrack: new UnconfiguredMovementExerciseProvider('physitrack'),
  custom_video: new UnconfiguredMovementExerciseProvider('custom_video'),
  api: new UnconfiguredMovementExerciseProvider('api'),
};

export function getMovementProvider(name: MovementProviderName): MovementExerciseProvider {
  return PROVIDERS[name];
}

/** Registers or swaps a provider implementation at runtime — how a real integration (or a test double) gets wired in without touching any calling code. */
export function registerMovementProvider(
  name: MovementProviderName,
  provider: MovementExerciseProvider
): void {
  PROVIDERS[name] = provider;
}

/**
 * Which provider is actually active for this deployment. Defaults to
 * 'internal_placeholder' (the only provider with real, working content
 * today) rather than null, since — unlike the body-assessment vision
 * provider — a usable default genuinely exists. Set
 * MOVEMENT_EXERCISE_PROVIDER to switch to a real library once one is
 * integrated; no other application code changes.
 */
export function resolveConfiguredMovementProvider(): MovementProviderName {
  const configured = process.env.MOVEMENT_EXERCISE_PROVIDER;
  if (configured && (MOVEMENT_PROVIDER_NAMES as readonly string[]).includes(configured)) {
    return configured as MovementProviderName;
  }
  return 'internal_placeholder';
}

export function getActiveMovementProvider(): MovementExerciseProvider {
  return getMovementProvider(resolveConfiguredMovementProvider());
}
