'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import Script from 'next/script';

const FOREST = '#1B3A2D';
const CREAM = '#F5F0E4';
const GOLD = '#C4A050';

const HEADLINE_FONT = 'font-[family-name:var(--font-cormorant-garamond)]';

declare global {
  interface Window {
    MEFLeadWidget?: { open: () => void };
  }
}

/**
 * Every CTA on this page performs the same single action — open the
 * existing widget's chat panel (public/lead-widget.js), not a second chat
 * UI. The widget script loads via next/script below and sets
 * `window.MEFLeadWidget` at the very end of its own mount; a CTA tapped in
 * the brief window before that finishes (slow connection, first paint)
 * polls briefly rather than silently doing nothing.
 */
function useOpenLeadChat() {
  const attempts = useRef(0);

  return useCallback(function open() {
    if (typeof window === 'undefined') return;
    if (window.MEFLeadWidget) {
      window.MEFLeadWidget.open();
      attempts.current = 0;
      return;
    }
    if (attempts.current >= 30) return; // ~3s at 100ms — script failed to load
    attempts.current += 1;
    setTimeout(open, 100);
  }, []);
}

function CTAButton({
  label,
  onClick,
  large,
}: {
  label: string;
  onClick: () => void;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mef-focus-ring inline-flex items-center justify-center rounded-full font-semibold transition hover:brightness-105 active:brightness-95 ${
        large ? 'px-9 py-4 text-lg' : 'px-7 py-3.5 text-base'
      }`}
      style={{ backgroundColor: GOLD, color: FOREST }}
    >
      {label}
    </button>
  );
}

function Section({
  background,
  children,
  center,
}: {
  background: 'forest' | 'cream';
  children: ReactNode;
  center?: boolean;
}) {
  const isForest = background === 'forest';
  return (
    <section
      className={`flex w-full flex-col px-6 py-20 sm:py-24 ${center ? 'items-center text-center' : ''}`}
      style={{
        backgroundColor: isForest ? FOREST : CREAM,
        color: isForest ? CREAM : FOREST,
      }}
    >
      <div className="mx-auto w-full max-w-2xl">{children}</div>
    </section>
  );
}

export function StartPageClient() {
  const openChat = useOpenLeadChat();

  return (
    <div
      className="min-h-screen w-full font-[family-name:var(--font-dm-sans)]"
      style={{ backgroundColor: CREAM }}
    >
      <Script src="/lead-widget.js" strategy="afterInteractive" />

      {/* SECTION 1 — HERO (green, full screen) */}
      <section
        className="flex min-h-screen w-full flex-col items-center justify-center px-6 py-20 text-center"
        style={{ backgroundColor: FOREST, color: CREAM }}
      >
        <div className="mx-auto w-full max-w-2xl">
          <h1
            className={`${HEADLINE_FONT} text-4xl leading-tight sm:text-5xl md:text-6xl`}
            style={{ color: CREAM }}
          >
            Your Body Has Been Trying to Tell You Something.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed opacity-90 sm:text-lg">
            The fatigue. The pain that keeps coming back. The sleep that never feels like enough.
            These aren&apos;t random — they&apos;re connected. Tell us what&apos;s going on, and get a
            real answer in the next two minutes.
          </p>
          <div className="mt-10">
            <CTAButton label="Start the Conversation →" onClick={openChat} large />
          </div>
          <p className="mt-4 text-sm opacity-70">
            Free. No appointment needed. Takes about 2 minutes.
          </p>
        </div>
      </section>

      {/* SECTION 2 — EMPATHY (cream) */}
      <Section background="cream">
        <h2 className={`${HEADLINE_FONT} text-3xl leading-tight sm:text-4xl`}>
          You&apos;ve Explained It Before. Nobody Connected the Dots.
        </h2>
        <p className="mt-6 text-[16px] leading-relaxed sm:text-[17px]">
          You&apos;ve described the symptoms. You&apos;ve been told your labs look fine, to stretch
          more, to stress less. And you walked out with the same body you walked in with. Here&apos;s
          what almost nobody does: look at how your sleep, your stress, your movement, your
          digestion, and your pain all feed each other. That&apos;s where the real answer lives — at
          the root, not the symptom. That&apos;s the only place we look.
        </p>
        <div className="mt-8">
          <CTAButton label="Tell Us What's Going On →" onClick={openChat} />
        </div>
      </Section>

      {/* SECTION 3 — HOW IT WORKS (cream, 3 steps stacked on mobile) */}
      <Section background="cream">
        <h2 className={`${HEADLINE_FONT} text-3xl leading-tight sm:text-4xl`}>
          Two Minutes. Three Steps. One Real Insight.
        </h2>
        <ol className="mt-10 space-y-8">
          {[
            {
              n: '1',
              title: "Tell us what's bothering you.",
              body: 'Pain, energy, sleep, stress, or weight — tap one and answer a few short questions. No forms. No jargon.',
            },
            {
              n: '2',
              title: 'See how it connects.',
              body: "Our guide is trained on the MEF Wellness method. It links your answers together the way a root-cause practitioner would — and shows you what's likely driving what.",
            },
            {
              n: '3',
              title: 'Get your next step.',
              body: 'Walk away with a clear direction: what to pay attention to, and exactly what to do next if you want it handled for good.',
            },
          ].map((step) => (
            <li key={step.n} className="flex gap-5">
              <span
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg font-semibold"
                style={{ backgroundColor: FOREST, color: CREAM }}
              >
                {step.n}
              </span>
              <div>
                <p className="text-lg font-semibold" style={{ color: FOREST }}>
                  Step {step.n} — {step.title}
                </p>
                <p className="mt-1.5 text-[15px] leading-relaxed">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-10">
          <CTAButton label="Start Step 1 Now →" onClick={openChat} />
        </div>
      </Section>

      {/* SECTION 4 — WHY THIS ISN'T ANOTHER CHATBOT (green) */}
      <Section background="forest" center>
        <h2 className={`${HEADLINE_FONT} text-3xl leading-tight sm:text-4xl`} style={{ color: CREAM }}>
          Generic AI Gives Generic Answers. This One Was Built by a Practitioner.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed opacity-90 sm:text-[17px]">
          Ask the internet about fatigue and you&apos;ll get a list you&apos;ve already read ten
          times. This is different. This conversation runs on the same framework used with real
          coaching clients — the Six Fundamentals to Health and the Four Doctors — built by a CHEK
          Practitioner who has spent years finding what conventional approaches miss. It won&apos;t
          diagnose you. It won&apos;t lecture you. It will listen, connect, and point you somewhere
          true.
        </p>
        <p className="mt-6 text-sm font-semibold uppercase tracking-wide" style={{ color: GOLD }}>
          CHEK Practitioner · Women&apos;s Holistic Specialist · ACE Certified Personal Trainer
        </p>
      </Section>

      {/* SECTION 5 — WHO THIS IS FOR (cream, checklist) */}
      <Section background="cream" center>
        <h2 className={`${HEADLINE_FONT} text-3xl leading-tight sm:text-4xl`}>
          If Any of This Sounds Familiar, Start Talking.
        </h2>
        <ul className="mx-auto mt-8 max-w-lg space-y-4 text-left">
          {[
            'You wake up tired no matter how long you sleep.',
            'The same pain keeps returning no matter what you try.',
            'You\'ve been told everything is "normal" — but you don\'t feel normal.',
            "You're done managing symptoms and ready to find the cause.",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-[16px] leading-relaxed">
              <span
                className="mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ backgroundColor: FOREST, color: CREAM }}
                aria-hidden="true"
              >
                ✓
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <div className="mt-10">
          <CTAButton label="Yes — That's Me →" onClick={openChat} />
        </div>
      </Section>

      {/* SECTION 6 — FINAL PUSH (green, centered) */}
      <Section background="forest" center>
        <h2
          className={`${HEADLINE_FONT} text-3xl leading-tight sm:text-4xl md:text-[2.75rem]`}
          style={{ color: CREAM }}
        >
          Two Minutes From Now, You Could Finally Have a Direction.
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed opacity-90 sm:text-[17px]">
          No cost. No commitment. No waiting room. Just the first honest conversation your body has
          been asking for.
        </p>
        <div className="mt-10">
          <CTAButton label="Start the Conversation →" onClick={openChat} large />
        </div>
      </Section>

      {/* Legal-basics footer only — no member nav, no other links */}
      <footer
        className="w-full px-6 py-8 text-center text-xs leading-relaxed opacity-70"
        style={{ backgroundColor: CREAM, color: FOREST }}
      >
        <p>© {new Date().getFullYear()} MEF Wellness. All rights reserved.</p>
        <p className="mt-1">
          This conversation is for informational purposes only and does not diagnose or treat any
          condition.
        </p>
      </footer>
    </div>
  );
}
