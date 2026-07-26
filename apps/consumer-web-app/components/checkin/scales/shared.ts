import { triggerHaptic } from '@/lib/haptics';

/** Every scale/pill treatment calls this on tap instead of onChange directly, so haptic feedback is applied in exactly one place rather than once per component. */
export function selectWithFeedback<T>(onChange: (value: T) => void, value: T): void {
  triggerHaptic();
  onChange(value);
}

export const SCALE_LABEL = 'text-[13px] leading-relaxed text-[#6B7A72]';
