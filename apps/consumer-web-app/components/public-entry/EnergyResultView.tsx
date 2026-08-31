'use client';

/**
 * The result, and the two things that come after it.
 *
 * THE ORDER ON THIS SCREEN IS THE PROMISE. Everything free comes first and
 * is complete on its own: the pattern, the evidence drawn from her own
 * answers, what it often looks like, what it does not tell us, and one
 * thing worth trying. Only underneath all of that does the email step
 * appear, and only underneath that does the invitation into Rooted Reset.
 * Somebody who reads to the bottom and closes the tab has been given
 * something real and has been asked for nothing.
 *
 * WHY "WHAT THIS DOES NOT TELL US" IS NOT AT THE BOTTOM IN SMALL TYPE. It
 * is the most trustworthy thing on the page and it is the reason anybody
 * would believe the rest. It sits at full size, in sequence, before
 * anything is asked for.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { EnergyResult, ThreeDayNote } from '@/lib/public-entry/result';
import {
  EMAIL_STEP_COPY,
  INVITATION_COPY,
  RESULT_HEADINGS,
} from '@/lib/public-entry/copy';
import { captureLead, signal } from '@/lib/public-entry/client';
import { isValidEmail } from '@/lib/auth/validation';
import {
  ENERGY_CARD,
  ENERGY_CARD_ELEVATED,
  ENERGY_DISPLAY_FONT,
  ENERGY_GOLD_DIVIDER,
} from './theme';

const EYEBROW = 'text-xs font-semibold uppercase tracking-[0.14em] text-[#6B7A72]';
const BODY = 'text-[15px] leading-relaxed text-[#4F645A]';

function Section({
  heading,
  children,
  delayMs,
}: {
  heading: string;
  children: React.ReactNode;
  delayMs: number;
}) {
  return (
    <section
      className="mef-fade-in mt-7"
      style={{ animationDelay: `${delayMs}ms`, animationFillMode: 'both' }}
    >
      <p className={EYEBROW}>{heading}</p>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

export function EnergyResultView({
  result,
  visitorToken,
  onGoToSignup,
}: {
  result: EnergyResult;
  visitorToken: string | null;
  onGoToSignup: (target: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState<ThreeDayNote[] | null>(null);
  const engagedRef = useRef(false);
  const foldMarker = useRef<HTMLDivElement | null>(null);

  /**
   * "Engaged with the result" means she read past the fold of her own
   * result, not that the page loaded. A marker sits after the last free
   * section and this fires once when it becomes visible, so the funnel
   * step means something rather than counting everybody who arrived.
   */
  useEffect(() => {
    const node = foldMarker.current;
    if (!node || !visitorToken) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (engagedRef.current) return;
        engagedRef.current = true;
        signal(visitorToken, 'result_engaged');
        observer.disconnect();
      },
      { threshold: 0.4 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visitorToken]);

  async function handleEmail(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError(EMAIL_STEP_COPY.errorMessage);
      return;
    }
    setEmailError(null);
    setSubmitting(true);
    const response = visitorToken ? await captureLead(visitorToken, trimmed) : null;
    setSubmitting(false);
    if (!response) {
      setEmailError(EMAIL_STEP_COPY.failureMessage);
      return;
    }
    setNotes(response.notes);
  }

  return (
    <div>
      <h1 className="sr-only">Your result</h1>

      {/* The pattern itself, the one thing this screen is about. */}
      <section className={`${ENERGY_CARD_ELEVATED} mef-animate-in p-6 sm:p-8`}>
        <p className={EYEBROW}>{RESULT_HEADINGS.pattern}</p>
        <h2 className={`${ENERGY_DISPLAY_FONT} mt-2 text-[2rem] leading-tight text-[#1B3A2D]`}>
          {result.title}
        </h2>
        <p className="mt-3 text-[16px] leading-relaxed text-[#1B3A2D]">{result.summary}</p>
      </section>

      <Section heading={RESULT_HEADINGS.evidence} delayMs={220}>
        <ul className={`${ENERGY_CARD} space-y-3 p-5 sm:p-6`}>
          {result.evidence.map((line) => (
            <li key={line.questionKey} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C4A050]"
              />
              <span className={BODY}>{line.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section heading={RESULT_HEADINGS.looksLike} delayMs={340}>
        <p className={BODY}>{result.whatItOftenLooksLike}</p>
      </Section>

      <Section heading={RESULT_HEADINGS.limits} delayMs={460}>
        <p className={BODY}>{result.whatThisDoesNotTellUs}</p>
        <p className={`${BODY} mt-3`}>{result.universalLimits}</p>
      </Section>

      <Section heading={RESULT_HEADINGS.action} delayMs={580}>
        <div className={`${ENERGY_CARD} p-5 sm:p-6`}>
          <h3 className={`${ENERGY_DISPLAY_FONT} text-xl leading-snug text-[#1B3A2D]`}>
            {result.tryToday.title}
          </h3>
          <p className={`${BODY} mt-2`}>{result.tryToday.body}</p>
        </div>
      </Section>

      {/* Everything above this line is free, complete, and asks for nothing. */}
      <div ref={foldMarker} aria-hidden="true" className="h-px w-full" />

      <div className={`${ENERGY_GOLD_DIVIDER} mt-12`} />

      {notes ? (
        <section className="mef-animate-in mt-10">
          <p className={EYEBROW}>{RESULT_HEADINGS.notes}</p>
          <h2 className={`${ENERGY_DISPLAY_FONT} mt-2 text-2xl leading-tight text-[#1B3A2D]`}>
            {EMAIL_STEP_COPY.successTitle}
          </h2>
          <div className="mt-4 space-y-3">
            {notes.map((note) => (
              <div key={note.day} className={`${ENERGY_CARD} p-5`}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#C4A050]">
                  {note.day}
                </p>
                <p className={`${BODY} mt-1.5`}>{note.watchFor}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-10">
          <p className={EYEBROW}>{EMAIL_STEP_COPY.eyebrow}</p>
          <h2 className={`${ENERGY_DISPLAY_FONT} mt-2 text-2xl leading-tight text-[#1B3A2D]`}>
            {EMAIL_STEP_COPY.title}
          </h2>
          <p className={`${BODY} mt-2`}>{EMAIL_STEP_COPY.body}</p>
          <p className="mt-3 text-[13px] leading-relaxed text-[#6B7A72]">
            {EMAIL_STEP_COPY.honesty}
          </p>
          <form className="mt-5" onSubmit={handleEmail} noValidate>
            <label className="text-sm font-medium text-[#1B3A2D]" htmlFor="energy-email">
              {EMAIL_STEP_COPY.fieldLabel}
            </label>
            <input
              id="energy-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? 'energy-email-error' : undefined}
              className="mt-1.5 w-full rounded-2xl border border-[#1B3A2D]/12 bg-white p-3 text-base text-[#1B3A2D] focus:border-[#C4A050] focus:outline-none"
            />
            {emailError && (
              <p id="energy-email-error" role="alert" className="mt-2 text-sm text-red-600">
                {emailError}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="mef-press mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#1B3A2D] px-6 py-3.5 text-base font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {EMAIL_STEP_COPY.buttonLabel}
            </button>
          </form>
        </section>
      )}

      <div className={`${ENERGY_GOLD_DIVIDER} mt-12`} />

      <section className="mt-10 pb-4">
        <p className={EYEBROW}>{RESULT_HEADINGS.invitation}</p>
        <h2 className={`${ENERGY_DISPLAY_FONT} mt-2 text-2xl leading-tight text-[#1B3A2D]`}>
          {INVITATION_COPY.title}
        </h2>
        {INVITATION_COPY.lines.map((line, index) => (
          <p key={line} className={`${BODY} ${index === 0 ? 'mt-2' : 'mt-3'}`}>
            {line}
          </p>
        ))}
        <button
          type="button"
          onClick={() => onGoToSignup('signup')}
          className="mef-press mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#C4A050] px-6 py-3.5 text-base font-semibold text-[#1B3A2D] transition hover:brightness-105"
        >
          <Check className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
          {INVITATION_COPY.buttonLabel}
        </button>
        <button
          type="button"
          onClick={() => onGoToSignup('login')}
          className="mef-press mt-3 w-full text-center text-sm font-medium text-[#6B7A72] underline underline-offset-2"
        >
          {INVITATION_COPY.secondaryLabel}
        </button>
      </section>
    </div>
  );
}
