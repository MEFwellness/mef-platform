/**
 * Home dashboard redesign — the Root Score's "counts up on load" moment in
 * the new hero. Purely presentational: the final value always comes from
 * lib/scoring/service.ts via the snapshot prop the hero already has;
 * this only controls how that same number arrives on screen. Respects
 * prefers-reduced-motion by rendering the final value immediately.
 *
 * Micro-Interactions (Prompt 6): this is now a thin re-export of the
 * generalized `components/motion/CountUp.tsx` primitive (identical
 * implementation, moved under the Root Motion System's own namespace so
 * other real counters, e.g. the Protein Ledger's daily tally, can reuse
 * it too) — same pattern as `components/motion/Ripple.tsx` re-exporting
 * `TapBleedTile`. The dashboard hero's own import path and behavior are
 * unchanged.
 */

export { CountUp as RootScoreCountUp } from '@/components/motion/CountUp';
