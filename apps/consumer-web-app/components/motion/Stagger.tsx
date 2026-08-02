/**
 * Root Motion System — generic Stagger primitive (Bible §3 "Stagger").
 * `.mef-stagger-item` (app/globals.css) is a same-keyframe alias of the
 * existing `.mef-checkin-stagger` class under the Root Motion System's
 * own generic name, so future stagger use isn't coupled to check-in's
 * own class name — check-in's own class and behavior are untouched.
 *
 * Per Bible §6: cap staggered groups at MOTION_MAX_STAGGER_ITEMS (8) —
 * beyond that, the delay tail stops reading as rhythm and starts
 * reading as a wait, so any item past the cap reuses the last item's
 * delay instead of growing it further.
 *
 * `StaggerItem` is the primitive; `StaggerGroup` is a convenience
 * wrapper that assigns each child an index automatically. Both are pure
 * functions with no hooks — reduced motion is handled by
 * `.mef-stagger-item`'s own `@media` rule in app/globals.css.
 */

import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { MOTION_MAX_STAGGER_ITEMS, MOTION_STAGGER_STEP_MS } from '@/lib/motion/tokens';

export function StaggerItem({
  index,
  stepMs = MOTION_STAGGER_STEP_MS,
  className = '',
  children,
}: {
  /** Position within the group, zero-based — not a duration, just an ordering. */
  index: number;
  stepMs?: number;
  className?: string;
  children: ReactNode;
}) {
  const cappedIndex = Math.min(index, MOTION_MAX_STAGGER_ITEMS - 1);
  return (
    <div className={`mef-stagger-item ${className}`} style={{ animationDelay: `${cappedIndex * stepMs}ms` }}>
      {children}
    </div>
  );
}

export function StaggerGroup({
  children,
  stepMs = MOTION_STAGGER_STEP_MS,
  itemClassName = '',
}: {
  children: ReactNode;
  stepMs?: number;
  itemClassName?: string;
}) {
  const items = Children.toArray(children);
  return (
    <>
      {items.map((child, index) => (
        <StaggerItem key={isValidElement(child) ? ((child as ReactElement).key ?? index) : index} index={index} stepMs={stepMs} className={itemClassName}>
          {child}
        </StaggerItem>
      ))}
    </>
  );
}
