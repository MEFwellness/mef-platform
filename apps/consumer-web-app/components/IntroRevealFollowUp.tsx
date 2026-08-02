'use client';

/**
 * The Server Component half of IntroReveal.tsx's timing contract.
 * OnboardingIntro.tsx and FirstCheckInWelcome.tsx are Server Components
 * with their own follow-on content after an IntroReveal block (a journey
 * card, a caption, a CTA) — they can't hold client state (reduced motion,
 * "seen before" localStorage) themselves, and can't pass a callback across
 * the server/client boundary (only real Server Actions cross that
 * boundary, not plain functions — see IntroReveal.tsx's own header
 * comment for the exact bug that taught this codebase that lesson). This
 * tiny wrapper is the one place that boundary gets crossed correctly: the
 * server passes plain, serializable props (title, line count, a
 * storageKey matching the IntroReveal block above it), and this component
 * decides, client-side, using the exact same reduced-motion/seen-before
 * rules IntroReveal itself uses, whether to show its children instantly or
 * fade them in once the real reveal above would have finished.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { introRevealFollowUpDelayMs } from '@/lib/introRevealTiming';

export function IntroRevealFollowUp({
  title,
  lineCount,
  storageKey,
  className,
  children,
}: {
  title: string;
  lineCount: number;
  storageKey: string;
  className?: string;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seenBefore = false;
    try {
      seenBefore = window.localStorage.getItem(`mef-intro-seen:${storageKey}`) === '1';
    } catch {
      seenBefore = false;
    }
    setReady(reducedMotion || seenBefore);
  }, [storageKey]);

  if (ready) return <div className={className}>{children}</div>;

  return (
    <div className={`mef-fade-in ${className ?? ''}`} style={{ animationDelay: `${introRevealFollowUpDelayMs(title, lineCount)}ms` }}>
      {children}
    </div>
  );
}
