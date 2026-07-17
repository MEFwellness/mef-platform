/**
 * Recovery-status display styling — same {text, bg, dot, bar} shape and
 * intent as lib/wellness/status.ts's STATUS_STYLES, kept as its own small
 * map (rather than reusing MetricStatus directly) since 'rest' isn't
 * simply "poor": it's a legitimate, intentional recommendation, not a
 * problem to flag red.
 */

import type { MovementRecoveryStatus } from '@mef/shared-types-contracts';

export const RECOVERY_STATUS_LABEL: Record<MovementRecoveryStatus, string> = {
  ready: 'Ready to train',
  moderate: 'Moderate recovery',
  limited: 'Limited recovery',
  rest: 'Prioritize rest',
  unknown: 'Building your picture',
};

export const RECOVERY_STATUS_STYLES: Record<
  MovementRecoveryStatus,
  { text: string; bg: string; dot: string }
> = {
  ready: { text: 'text-green-700', bg: 'bg-green-50', dot: 'bg-green-600' },
  moderate: { text: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  limited: { text: 'text-amber-700', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  rest: { text: 'text-red-700', bg: 'bg-red-50', dot: 'bg-red-500' },
  unknown: { text: 'text-[#1B3A2D]/70', bg: 'bg-[#F3F6F4]', dot: 'bg-[#EFE9DB]' },
};
