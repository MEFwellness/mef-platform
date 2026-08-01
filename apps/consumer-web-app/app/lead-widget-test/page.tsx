/**
 * Same-origin manual test harness for the Lead Capture Agent widget
 * (public/lead-widget.js) — lets the widget be tried against a real,
 * deployed instance of /api/lead-capture before it's ever pasted into an
 * actual Leadpages page. Not linked from anywhere in the member-facing
 * app; exempted from the auth redirect in middleware.ts the same way
 * /onboarding and /wellness-check are.
 *
 * Deliberately mimics a plain marketing landing page, not an app screen —
 * this is what the widget will actually be embedded on.
 */

import Script from 'next/script';

export default function LeadWidgetTestPage() {
  return (
    <div style={{ fontFamily: 'sans-serif', maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ color: '#1B3A2D' }}>Sample Leadpages-style Landing Page</h1>
      <p>
        This page exists only to test the MEF Wellness Lead Capture Agent widget in a realistic
        setting: a plain marketing page with its own styles, nothing to do with the member app.
        Look for the chat bubble in the bottom-right corner.
      </p>
      <p>
        Tap the bubble, pick one of the four quick replies, and walk through a full conversation to
        confirm the agent asks its follow-up questions, offers an insight, asks for your name and
        email, and finally gives you a routing link.
      </p>
      <Script src="/lead-widget.js" strategy="afterInteractive" />
    </div>
  );
}
