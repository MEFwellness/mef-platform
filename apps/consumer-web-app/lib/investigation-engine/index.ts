/**
 * Investigation Engine — public barrel. Prompt 9's foundation layer: the
 * Coaching Domain taxonomy, the Investigation Contract, the Investigation
 * Registry (metadata extension over the real Assessment Registry),
 * domain-level Confidence aggregation, and the Root Router. See
 * docs/rooted-reset-method/ for the governing architecture.
 *
 * UNLOCK EVALUATION LEFT THIS MODULE (Visibility Layer, 2026-08-17).
 * `unlockEngine.ts` and the `unlockTriggers` / `requiredPriorInvestigationKeys`
 * fields it read are retired. Its trigger vocabulary survives, generalized
 * off assessments and actually running, as `RevealRule` in lib/visibility/.
 * There is now exactly one place a visibility rule may be written.
 */

export * from './domains';
export * from './types';
export * from './registry';
export * from './confidence';
export * from './rootRouter';
export * from './routerOutcome';
