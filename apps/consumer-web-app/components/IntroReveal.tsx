'use client';

/**
 * Permanent app-wide design standard (2026-08-01): every intro/welcome
 * screen gets a headline that appears first, then body copy that reveals
 * one line at a time, like it's being spoken to the member, so the key
 * lines land instead of being skimmed past in one glance. Built once here
 * and applied to every existing intro screen whose body copy was
 * previously a single static paragraph (Core Values Snapshot, Life Signal
 * Check) so every future experience inherits it automatically by reusing
 * this component instead of hand-rolling another static paragraph block.
 *
 * Purely presentational — no card, no button, no layout opinion, so it
 * drops into whatever container a given screen already uses (CVS_CARD,
 * a cinematic full-bleed page, a plain section). Reuses the app's existing
 * `.mef-fade-in` keyframe (app/globals.css) with per-line `animationDelay`
 * staggering, the same idiom CheckinForm.tsx and WelcomeFlow.tsx already
 * use elsewhere — no new animation vocabulary. Reduced motion is handled
 * entirely by `.mef-fade-in`'s own existing `prefers-reduced-motion`
 * override (`animation: none !important`), which renders every line at its
 * natural, fully-visible state instantly — no separate JS detection needed
 * here.
 *
 * The line-delay math itself lives in lib/introRevealTiming.ts, a plain
 * module with no 'use client' directive — a Server Component that needs
 * to sequence its own content after this component's reveal (e.g.
 * FirstCheckInWelcome.tsx) must import introRevealFollowUpDelayMs from
 * there directly, not from this file (see that module's own header
 * comment for the real bug this avoids).
 */

import { INTRO_REVEAL_LINE_BASE_DELAY_MS, INTRO_REVEAL_LINE_STEP_MS } from '@/lib/introRevealTiming';

type IntroRevealProps = {
  eyebrow?: string;
  eyebrowClassName?: string;
  title: string;
  titleClassName?: string;
  /** Defaults to 'h2' (every existing call site already has its own sr-only or visible h1 elsewhere on the page). Pass 'h1' for a screen where this headline IS the page's main heading, so document structure stays correct. */
  titleTag?: 'h1' | 'h2';
  lines: string[];
  lineClassName?: string;
  /** ms after the headline before the first body line starts revealing. */
  lineBaseDelayMs?: number;
  /** ms between each subsequent body line. */
  lineStepMs?: number;
};

const DEFAULT_LINE_BASE_DELAY_MS = INTRO_REVEAL_LINE_BASE_DELAY_MS;
const DEFAULT_LINE_STEP_MS = INTRO_REVEAL_LINE_STEP_MS;

export function IntroReveal({
  eyebrow,
  eyebrowClassName = 'text-xs font-semibold uppercase tracking-wider text-[#6B7A72]',
  title,
  titleClassName = 'text-3xl leading-tight text-[#1B3A2D]',
  titleTag = 'h2',
  lines,
  lineClassName = 'text-[15px] leading-relaxed text-[#1B3A2D]',
  lineBaseDelayMs = DEFAULT_LINE_BASE_DELAY_MS,
  lineStepMs = DEFAULT_LINE_STEP_MS,
}: IntroRevealProps) {
  const TitleTag = titleTag;
  return (
    <>
      {eyebrow && <p className={`mef-fade-in ${eyebrowClassName}`}>{eyebrow}</p>}
      <TitleTag className={`mef-fade-in ${titleClassName}`}>{title}</TitleTag>
      <div className="mt-4 space-y-3">
        {lines.map((line, i) => (
          <p key={i} className={`mef-fade-in ${lineClassName}`} style={{ animationDelay: `${lineBaseDelayMs + i * lineStepMs}ms` }}>
            {line}
          </p>
        ))}
      </div>
    </>
  );
}
