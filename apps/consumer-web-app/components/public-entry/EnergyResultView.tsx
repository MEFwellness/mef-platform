'use client';

/**
 * The result, restructured on 2026-09-05 after a real person walked the
 * live funnel on a phone.
 *
 * WHAT WAS WRONG WITH IT. Nothing it said. The order it said it in. The
 * pattern was at the top, and then four full sections of prose stood
 * between a stranger and the one thing this screen exists to offer her, so
 * the way into an account was two scrolls down and the email field was
 * above it. On a phone that reads as a page that wants something from you
 * before it will let you leave, which is the opposite of what it is.
 *
 * WHAT THE FIRST SCREENFUL HOLDS NOW, AND WHY EXACTLY THESE FOUR THINGS.
 * The pattern name, the one line that says what it means, the honesty line
 * that says out loud this was a first impression and not a measurement, and
 * both ways forward as real buttons. That is the whole result in one look:
 * what we noticed, what it means, how much to trust it, what to do about
 * it. Nothing below the fold is needed to understand any of it.
 *
 * THE HONESTY LINE MOVED UP, IT DID NOT SHRINK. It is the same sentence it
 * always was (lib/public-entry/copy.ts's RESULT_HONESTY_LINE, split out of
 * the paragraph it has always been the first half of), and the full
 * paragraph is still rendered in "What this does not tell us" exactly as
 * before. It is now read by everybody rather than by whoever scrolled
 * furthest, which is the point of moving it.
 *
 * WHAT BECAME SECONDARY, AND WHAT DID NOT. "What this often looks like" and
 * "What this does not tell us" are collapsible: still here, still in full,
 * still one tap away, no longer walls in front of the action. The evidence
 * drawn from her own answers is NOT collapsible and never will be, because
 * it is the proof that the pattern above came from what she said rather
 * than from a guess. "One thing worth trying" stays open for the same
 * reason: it is the thing she can use tonight without an account.
 *
 * THE EMAIL STEP IS LAST, AND THAT IS A DECISION RATHER THAN A LAYOUT.
 * The result is never email gated. It now sits below her result, below both
 * ways into an account, and below the invitation, so by the time it is on
 * screen she has already been given everything and offered everything. It
 * cannot read as a toll on the way out because there is nothing left behind
 * it. Its own eyebrow still says her result above is already complete.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import type { EnergyResult, ThreeDayNote } from '@/lib/public-entry/result';
import {
  EMAIL_STEP_COPY,
  INVITATION_COPY,
  RESULT_HEADINGS,
  RESULT_HONESTY_LINE,
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

/** The gold create-account button, written once and used in both places it appears. */
const GOLD_CTA =
  'mef-focus-ring mef-press mef-button-primary flex items-center justify-center gap-2 bg-[#C4A050] text-base text-[#1B3A2D] shadow-[0_4px_16px_-4px_rgba(196,160,80,0.55)] hover:bg-[#B8944A]';

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
      className="mef-fade-in mt-6"
      style={{ animationDelay: `${delayMs}ms`, animationFillMode: 'both' }}
    >
      <p className={EYEBROW}>{heading}</p>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

/**
 * A section that is present in full and closed by default.
 *
 * Native `<details>` on purpose: it opens with no JavaScript, it is
 * keyboard reachable and screen reader announced without a single aria
 * attribute of ours, and its content is in the page for anybody reading it
 * with assistive technology or printing it. Nothing here is hidden from
 * anyone; it is folded.
 */
function Collapsible({
  heading,
  children,
  delayMs,
}: {
  heading: string;
  children: React.ReactNode;
  delayMs: number;
}) {
  return (
    <details
      className="mef-fade-in group mt-3 overflow-hidden rounded-2xl border border-[#1B3A2D]/10 bg-white/70"
      style={{ animationDelay: `${delayMs}ms`, animationFillMode: 'both' }}
    >
      <summary className="mef-focus-ring flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[14px] font-semibold text-[#1B3A2D] [&::-webkit-details-marker]:hidden">
        {heading}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-[#6B7A72] transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
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
   *
   * It stays AFTER the two collapsibles, which is still well below one
   * screenful even now the page is shorter, so the step means the same
   * thing it meant before the restructure.
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

      {/*
        THE FIRST SCREENFUL. What we noticed, what it means, how much to
        trust it, and both ways forward. Everything below this card is
        supporting material for a decision that can already be made here.
      */}
      <section className={`${ENERGY_CARD_ELEVATED} mef-animate-in p-6 sm:p-8`}>
        <p className={EYEBROW}>{RESULT_HEADINGS.pattern}</p>
        <h2 className={`${ENERGY_DISPLAY_FONT} mt-2 text-[2rem] leading-tight text-[#1B3A2D]`}>
          {result.title}
        </h2>
        <p className="mt-3 text-[16px] leading-relaxed text-[#1B3A2D]">{result.summary}</p>
        <p className="mt-3 text-[13px] leading-relaxed text-[#6B7A72]">{RESULT_HONESTY_LINE}</p>

        <div className="mt-5 space-y-2.5">
          {/*
            THE CREATE ACCOUNT BUTTON, AND THE ONE-TIME REFERENCE STILL
            RIDES IT. Same handler, same argument, same route: onGoToSignup
            appends the server-minted reference for 'signup' and never for
            'login'. See EnergyEntryClient.tsx's handleGoToSignup.
          */}
          <button type="button" onClick={() => onGoToSignup('signup')} className={GOLD_CTA}>
            <Check className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
            {INVITATION_COPY.buttonLabel}
          </button>
          <button
            type="button"
            onClick={() => onGoToSignup('login')}
            className="mef-focus-ring mef-press mef-button-secondary"
          >
            {INVITATION_COPY.secondaryLabel}
          </button>
        </div>
      </section>

      {/*
        THE PROOF, AND IT IS NEVER FOLDED. Every line is a restatement of an
        option she actually tapped, which is what makes the pattern above a
        reading of her answers rather than a claim about her.
      */}
      <Section heading={RESULT_HEADINGS.evidence} delayMs={180}>
        <ul className={`${ENERGY_CARD} space-y-2 p-5`}>
          {result.evidence.map((line) => (
            <li key={line.questionKey} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#C4A050]"
              />
              <span className="text-[14px] leading-relaxed text-[#4F645A]">{line.text}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section heading={RESULT_HEADINGS.action} delayMs={260}>
        <div className={`${ENERGY_CARD} p-5`}>
          <h3 className={`${ENERGY_DISPLAY_FONT} text-lg leading-snug text-[#1B3A2D]`}>
            {result.tryToday.title}
          </h3>
          <p className={`${BODY} mt-1.5`}>{result.tryToday.body}</p>
        </div>
      </Section>

      <div className="mt-6">
        <Collapsible heading={RESULT_HEADINGS.looksLike} delayMs={320}>
          <p className={BODY}>{result.whatItOftenLooksLike}</p>
        </Collapsible>
        <Collapsible heading={RESULT_HEADINGS.limits} delayMs={360}>
          <p className={BODY}>{result.whatThisDoesNotTellUs}</p>
          <p className={`${BODY} mt-3`}>{result.universalLimits}</p>
        </Collapsible>
      </div>

      {/* Everything above this line is free, complete, and asks for nothing. */}
      <div ref={foldMarker} aria-hidden="true" className="h-px w-full" />

      <div className={`${ENERGY_GOLD_DIVIDER} mt-10`} />

      <section className="mt-8">
        {/* No eyebrow above this one. RESULT_HEADINGS.invitation and
            INVITATION_COPY.title are the same six words, so this section
            was printing its own heading twice, once in small caps and once
            in the display face directly underneath. Seen in a phone sized
            screenshot while auditing this screen's buttons. */}
        <h2 className={`${ENERGY_DISPLAY_FONT} text-2xl leading-tight text-[#1B3A2D]`}>
          {INVITATION_COPY.title}
        </h2>
        {INVITATION_COPY.lines.map((line, index) => (
          <p key={line} className={`${BODY} ${index === 0 ? 'mt-2' : 'mt-3'}`}>
            {line}
          </p>
        ))}
        <button type="button" onClick={() => onGoToSignup('signup')} className={`${GOLD_CTA} mt-5`}>
          <Check className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
          {INVITATION_COPY.buttonLabel}
        </button>
      </section>

      <div className={`${ENERGY_GOLD_DIVIDER} mt-10`} />

      {/*
        LAST ON THE PAGE, ON PURPOSE. Her result is complete, both ways into
        an account have already been offered twice, and nothing sits behind
        this field. See this file's header.
      */}
      {notes ? (
        <section className="mef-animate-in mt-8 pb-4">
          <p className={EYEBROW}>{RESULT_HEADINGS.notes}</p>
          <h2 className={`${ENERGY_DISPLAY_FONT} mt-2 text-xl leading-tight text-[#1B3A2D]`}>
            {EMAIL_STEP_COPY.successTitle}
          </h2>
          <div className="mt-3 space-y-2.5">
            {notes.map((note) => (
              <div key={note.day} className={`${ENERGY_CARD} p-4`}>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#C4A050]">
                  {note.day}
                </p>
                <p className={`${BODY} mt-1.5`}>{note.watchFor}</p>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-8 pb-4">
          <p className={EYEBROW}>{EMAIL_STEP_COPY.eyebrow}</p>
          <h2 className={`${ENERGY_DISPLAY_FONT} mt-1.5 text-xl leading-tight text-[#1B3A2D]`}>
            {EMAIL_STEP_COPY.title}
          </h2>
          <p className={`${BODY} mt-1.5`}>{EMAIL_STEP_COPY.body}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#6B7A72]">
            {EMAIL_STEP_COPY.honesty}
          </p>
          <form className="mt-4" onSubmit={handleEmail} noValidate>
            <label className="sr-only" htmlFor="energy-email">
              {EMAIL_STEP_COPY.fieldLabel}
            </label>
            <input
              id="energy-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={EMAIL_STEP_COPY.fieldLabel}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? 'energy-email-error' : undefined}
              className="w-full rounded-2xl border border-[#1B3A2D]/12 bg-white p-3 text-base text-[#1B3A2D] focus:border-[#C4A050] focus:outline-none"
            />
            {emailError && (
              <p id="energy-email-error" role="alert" className="mt-2 text-sm text-red-600">
                {emailError}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="mef-focus-ring mef-press mef-button-secondary mt-3 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {EMAIL_STEP_COPY.buttonLabel}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
