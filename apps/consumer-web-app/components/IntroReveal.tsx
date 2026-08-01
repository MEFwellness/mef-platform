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
 */

type IntroRevealProps = {
  eyebrow?: string;
  eyebrowClassName?: string;
  title: string;
  titleClassName?: string;
  lines: string[];
  lineClassName?: string;
  /** ms after the headline before the first body line starts revealing. */
  lineBaseDelayMs?: number;
  /** ms between each subsequent body line. */
  lineStepMs?: number;
};

const DEFAULT_LINE_BASE_DELAY_MS = 500;
const DEFAULT_LINE_STEP_MS = 550;

export function IntroReveal({
  eyebrow,
  eyebrowClassName = 'text-xs font-semibold uppercase tracking-wider text-[#6B7A72]',
  title,
  titleClassName = 'text-3xl leading-tight text-[#1B3A2D]',
  lines,
  lineClassName = 'text-[15px] leading-relaxed text-[#1B3A2D]',
  lineBaseDelayMs = DEFAULT_LINE_BASE_DELAY_MS,
  lineStepMs = DEFAULT_LINE_STEP_MS,
}: IntroRevealProps) {
  return (
    <>
      {eyebrow && <p className={`mef-fade-in ${eyebrowClassName}`}>{eyebrow}</p>}
      <h2 className={`mef-fade-in ${titleClassName}`}>{title}</h2>
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

/** The delay (ms) at which content following the revealed lines — typically a CTA button — should itself fade in, so it lands only once every line has landed, however many lines a given screen passed in. */
export function introRevealFollowUpDelayMs(
  lineCount: number,
  lineBaseDelayMs: number = DEFAULT_LINE_BASE_DELAY_MS,
  lineStepMs: number = DEFAULT_LINE_STEP_MS
): number {
  return lineBaseDelayMs + lineCount * lineStepMs;
}
